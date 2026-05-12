import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import Corestore from 'corestore';
import Hyperbee from 'hyperbee2';
import HyperDB from 'hyperdb';
import sodium from 'sodium-native';
import b4a from 'b4a';
import path from 'path';

import DriveSession from './session.js';
import def from '../../../spec/hyperdb/index.js';

// GhostDriveApp is the singleton root. It owns one Corestore + one Hyperswarm,
// and manages a Map of DriveSession instances. Each session's DistributedDrive
// handles its own swarm connections via topic-based routing — no manual
// connection routing needed here.
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

		// Replicate corestore on every connection — each DistributedDrive's
		// topic-matching addPeer handles the RPC scoping internally.
		this.swarm.on('connection', (conn) => {
			conn.on('error', () => {});
			this.store.replicate(conn);
		});

		// Restore saved sessions.
		const sessions = await this.db
			.find('@ghostdrive/sessions', { gte: {}, lte: {} })
			.toArray();
		for (const meta of sessions) {
			const session = new DriveSession({
				app: this,
				id: meta.id,
				name: meta.name,
				icon: meta.icon,
				key: meta.remoteKey ? b4a.from(meta.remoteKey, 'hex') : null
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

	// --- Session CRUD ---

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

		// Cascade-delete related records.
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

	// --- Invites (simplified: key + name) ---

	encodeInvite(session) {
		const payload = JSON.stringify({
			key: b4a.toString(session.drive.key, 'hex'),
			name: session.name
		});
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
		const obj = JSON.parse(decoded);
		if (!obj.key || obj.key.length !== 64) throw new Error('Invalid invite payload');
		return {
			keyHex: obj.key,
			name: obj.name || null
		};
	}

	async acceptInvite(url) {
		const { keyHex, name } = this.parseInvite(url);
		const key = b4a.from(keyHex, 'hex');

		// Check if we already have a session for this drive key.
		for (const session of this.sessions.values()) {
			if (session.drive && session.drive.key && session.drive.key.equals(key)) {
				return session;
			}
		}

		const id = randomId();
		const sessionName = name || 'Shared Drive';

		await this.db.insert('@ghostdrive/sessions', {
			id,
			name: sessionName,
			icon: b4a.alloc(0),
			createdAt: Date.now(),
			remoteKey: keyHex
		});
		await this.db.flush();

		const session = new DriveSession({
			app: this,
			id,
			name: sessionName,
			icon: b4a.alloc(0),
			key
		});
		await session.ready();
		this.sessions.set(id, session);
		return session;
	}
}

function randomId() {
	const buf = b4a.allocUnsafe(8);
	sodium.randombytes_buf(buf);
	return b4a.toString(buf, 'hex');
}
