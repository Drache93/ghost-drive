import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import Corestore from 'corestore';
import Hyperbee from 'hyperbee2';
import HyperDB from 'hyperdb';
import HyperDHTAddress from 'hyperdht-address';
import sodium from 'sodium-native';
import b4a from 'b4a';
import path from 'path';

import capabilityModule from '../../../lib/capability.js';
const { exchange, exchangeForSession } = capabilityModule;

import DriveSession from './session.js';
import def from '../../../spec/hyperdb/index.js';

// GhostDriveApp is the singleton root. It owns one Corestore + one Hyperswarm,
// and manages a Map of DriveSession instances. Incoming peer connections are
// routed to the correct session via per-session capability exchange.
export default class GhostDriveApp extends ReadyResource {
	constructor({ dir, bootstrap = null } = {}) {
		super();

		this.dir = dir;
		this.bootstrap = bootstrap;

		this.store = null;
		this.swarm = null;
		this.db = null;
		this.bee = null;

		this.key = null;
		this.sessions = new Map();
		this._topics = new Map();
	}

	async _open() {
		this.store = new Corestore(path.join(this.dir, 'corestore'));
		await this.store.ready();

		const keyPair = await this.store.createKeyPair('ghost-drive');
		this.key = keyPair.publicKey;

		this.bee = new Hyperbee(this.store, { name: 'ghost-db' });
		this.db = HyperDB.bee2(this.bee, def);
		await this.db.ready();

		this.swarm = new Hyperswarm({
			bootstrap: this.bootstrap,
			keyPair
		});
		this.swarm.on('connection', (conn) => this._handleConnection(conn));

		await this._joinTopic(this.key, true);

		const sessions = await this.db
			.find('@ghostdrive/sessions', { gte: {}, lte: {} })
			.toArray();
		for (const meta of sessions) {
			const session = new DriveSession({
				app: this,
				id: meta.id,
				name: meta.name,
				icon: meta.icon
			});
			await session.ready();
			this.sessions.set(meta.id, session);
		}
	}

	async _close() {
		for (const session of this.sessions.values()) {
			try {
				await session.close();
			} catch {}
		}
		this.sessions.clear();

		if (this.swarm) await this.swarm.destroy();
		if (this.db) await this.db.close();
		if (this.store) await this.store.close();
	}

	async _joinTopic(key, isServer = false, noWait = false, closestNodes) {
		const hex = b4a.toString(key, 'hex');
		if (this._topics.has(hex)) return;

		const discovery = this.swarm.join(key, {
			server: !!isServer,
			client: !isServer,
			closestNodes
		});
		this._topics.set(hex, discovery);

		if (noWait) {
			discovery.flushed().catch(() => {});
			return;
		}
		if (isServer) await discovery.flushed();
		else await this.swarm.flush();
	}

	async _leaveTopic(key) {
		const hex = b4a.toString(key, 'hex');
		const discovery = this._topics.get(hex);
		if (!discovery) return;
		this._topics.delete(hex);
		try {
			await discovery.destroy();
		} catch {}
	}

	async _handleConnection(conn) {
		conn.on('error', () => {});

		let routed = null;
		if (conn.isInitiator) {
			routed = await this._routeOutgoing(conn);
		} else {
			routed = await this._routeIncoming(conn);
		}

		if (!routed) {
			conn.destroy();
			return;
		}

		this.store.replicate(conn);
		routed.session.addPeerConnection(conn);

		if (!conn.isInitiator && routed.capKeyHex) {
			await routed.session.markInviteUsed(routed.capKeyHex).catch(() => {});
			const peerHex = b4a.toString(conn.remotePublicKey, 'hex');
			await routed.session.addJoin(peerHex, routed.capKeyHex).catch(() => {});
		}

		this.emit('connection', { sessionId: routed.session.id, conn });
	}

	async _routeOutgoing(conn) {
		const peerHex = b4a.toString(conn.remotePublicKey, 'hex');

		for (const session of this.sessions.values()) {
			const joins = await session.listJoins();
			const join = joins.find((j) => j.peerKey === peerHex);
			if (join) {
				const capKey = b4a.from(join.capKey, 'hex');
				const ok = await exchange(conn, capKey);
				if (ok) return { session, capKeyHex: join.capKey };
				return null;
			}
		}
		return null;
	}

	async _routeIncoming(conn) {
		const entries = [];
		for (const session of this.sessions.values()) {
			const unused = await session.unusedInvites();
			for (const invite of unused) {
				entries.push({
					sessionId: session.id,
					capKey: b4a.from(invite.capKey, 'hex'),
					capKeyHex: invite.capKey
				});
			}
		}
		if (entries.length === 0) return null;

		const result = await exchangeForSession(conn, entries);
		if (!result) return null;

		const session = this.sessions.get(result.sessionId);
		if (!session) return null;

		const matchedHex = b4a.toString(result.capKey, 'hex');
		return { session, capKeyHex: matchedHex };
	}

	async createSession({ name, icon }) {
		const id = randomId();
		await this.db.insert('@ghostdrive/sessions', {
			id,
			name,
			icon: icon || b4a.alloc(0),
			createdAt: Date.now()
		});
		await this.db.flush();

		const session = new DriveSession({ app: this, id, name, icon });
		await session.ready();
		this.sessions.set(id, session);
		return session;
	}

	async removeSession(id) {
		const session = this.sessions.get(id);
		if (!session) return;

		const regs = await this.db
			.find('@ghostdrive/registrations-by-session', {
				gte: { sessionId: id },
				lte: { sessionId: id }
			})
			.toArray();
		for (const r of regs) {
			await this.db.delete('@ghostdrive/registrations', { sessionId: id, target: r.target });
		}
		const invites = await this.db
			.find('@ghostdrive/invites-by-session', {
				gte: { sessionId: id },
				lte: { sessionId: id }
			})
			.toArray();
		for (const i of invites) {
			await this.db.delete('@ghostdrive/invites', { sessionId: id, capKey: i.capKey });
		}
		const joins = await this.db
			.find('@ghostdrive/joins-by-session', {
				gte: { sessionId: id },
				lte: { sessionId: id }
			})
			.toArray();
		for (const j of joins) {
			await this.db.delete('@ghostdrive/joins', { sessionId: id, peerKey: j.peerKey });
		}

		await this.db.delete('@ghostdrive/sessions', { id });
		await this.db.flush();

		await session.close();
		this.sessions.delete(id);
	}

	listSessions() {
		return [...this.sessions.values()].map((s) => ({
			id: s.id,
			name: s.name,
			icon: s.icon,
			peerCount: s.peerCount
		}));
	}

	getSession(id) {
		return this.sessions.get(id) || null;
	}

	encodeInvite(session, capKeyHex) {
		const hostKey = HyperDHTAddress.encode(this.key, this.swarm.server?.relayAddresses || []);
		const payload = `${session.id}|${b4a.toString(hostKey, 'hex')}|${capKeyHex}`;
		const encoded = b4a
			.toString(b4a.from(payload), 'base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		return `ghostdrive://${encoded}`;
	}

	parseInvite(url) {
		if (!url.startsWith('ghostdrive://')) throw new Error('Invalid invite scheme');
		const encoded = url.slice('ghostdrive://'.length);
		const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
		const decoded = b4a.toString(b4a.from(padded, 'base64'));
		const parts = decoded.split('|');
		if (parts.length !== 3) throw new Error('Invalid invite payload');
		return { sessionId: parts[0], hostKeyHex: parts[1], capKeyHex: parts[2] };
	}

	async acceptInvite(url) {
		const { sessionId, hostKeyHex, capKeyHex } = this.parseInvite(url);
		const { key: hostKey, nodes } = HyperDHTAddress.decode(b4a.from(hostKeyHex, 'hex'));

		let session = this.sessions.get(sessionId);
		if (!session) {
			session = await this.createSession({ name: 'Joining…', icon: b4a.alloc(0) });
		}

		const hostHex = b4a.toString(hostKey, 'hex');
		await session.addJoin(hostHex, capKeyHex);
		await this._joinTopic(hostKey, false, true, nodes);

		return session;
	}
}

function randomId() {
	const buf = b4a.allocUnsafe(8);
	sodium.randombytes_buf(buf);
	return b4a.toString(buf, 'hex');
}
