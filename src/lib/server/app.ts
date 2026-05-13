import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import Corestore from 'corestore';
import Hyperbee from 'hyperbee2';
import HyperDB from 'hyperdb';
import { randombytes_buf } from 'sodium-native';
import b4a from 'b4a';
import path from 'path';

import DriveSession from './session.js';
import def from '../../../spec/hyperdb/index.js';

interface GhostDriveAppOptions {
	dir?: string;
	bootstrap?: unknown;
}

export interface SessionInfo {
	id: string;
	name: string;
	icon: Buffer | Uint8Array;
	peerCount: number;
}

export interface ParsedInvite {
	keyHex: string;
	name: string | null;
}

export default class GhostDriveApp extends ReadyResource {
	dir: string;
	bootstrap: unknown;
	store: Corestore | null;
	swarm: Hyperswarm | null;
	db: ReturnType<typeof HyperDB.bee2> | null;
	bee: Hyperbee | null;
	key: Buffer | null;
	sessions: Map<string, DriveSession>;

	constructor({ dir = '', bootstrap = null }: GhostDriveAppOptions = {}) {
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

	protected async _open(): Promise<void> {
		this.store = new Corestore(path.join(this.dir, 'corestore'));
		await this.store.ready();

		const keyPair = await this.store.createKeyPair('ghost-drive');
		this.key = keyPair.publicKey;

		this.bee = new Hyperbee(this.store, { name: 'ghost-db' });
		this.db = HyperDB.bee2(this.bee, def);
		await this.db!.ready();

		this.swarm = new Hyperswarm({ bootstrap: this.bootstrap, keyPair });

		this.swarm.on('connection', (conn) => {
			conn.on('error', () => {});
			this.store!.replicate(conn);
		});

		const sessions = (await this.db!.find('@ghostdrive/sessions', {
			gte: {},
			lte: {}
		}).toArray()) as any[];

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

	protected async _close(): Promise<void> {
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

	async createSession({ name, icon }: { name: string; icon?: Buffer }): Promise<DriveSession> {
		const id = randomId();
		await this.db!.insert('@ghostdrive/sessions', {
			id,
			name,
			icon: icon || b4a.alloc(0),
			createdAt: Date.now()
		});
		await this.db!.flush();

		const session = new DriveSession({ app: this, id, name, icon });
		await session.ready();
		this.sessions.set(id, session);
		return session;
	}

	async updateSession(id: string): Promise<void> {
		await this.db!.update('@ghostdrive/sessions', { id, lastOpened: Date.now() });
		await this.db!.flush();
	}

	async removeSession(id: string): Promise<void> {
		const session = this.sessions.get(id);
		if (!session) return;

		const regs = (await this.db!.find('@ghostdrive/registrations-by-session', {
			gte: { sessionId: id },
			lte: { sessionId: id }
		}).toArray()) as any[];
		for (const r of regs) {
			await this.db!.delete('@ghostdrive/registrations', { sessionId: id, target: r.target });
		}

		const invites = (await this.db!.find('@ghostdrive/invites-by-session', {
			gte: { sessionId: id },
			lte: { sessionId: id }
		}).toArray()) as any[];
		for (const i of invites) {
			await this.db!.delete('@ghostdrive/invites', { sessionId: id, capKey: i.capKey });
		}

		const joins = (await this.db!.find('@ghostdrive/joins-by-session', {
			gte: { sessionId: id },
			lte: { sessionId: id }
		}).toArray()) as any[];
		for (const j of joins) {
			await this.db!.delete('@ghostdrive/joins', { sessionId: id, peerKey: j.peerKey });
		}

		await this.db!.delete('@ghostdrive/sessions', { id });
		await this.db!.flush();
		await session.close();
		this.sessions.delete(id);
	}

	listSessions(): SessionInfo[] {
		return [...this.sessions.values()].map((s) => ({
			id: s.id,
			name: s.name,
			icon: s.icon as Buffer,
			peerCount: s.peerCount
		}));
	}

	getSession(id: string): DriveSession | null {
		return this.sessions.get(id) ?? null;
	}

	// --- Invites ---

	encodeInvite(session: DriveSession): string {
		const payload = JSON.stringify({
			key: b4a.toString(session.drive!.key, 'hex'),
			name: session.name
		});
		return (
			'ghostdrive://' +
			b4a
				.toString(b4a.from(payload), 'base64')
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=+$/, '')
		);
	}

	parseInvite(url: string): ParsedInvite {
		if (!url.startsWith('ghostdrive://')) throw new Error('Invalid invite scheme');
		const encoded = url.slice('ghostdrive://'.length);
		const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
		const obj = JSON.parse(b4a.toString(b4a.from(padded, 'base64')));
		if (!obj.key || obj.key.length !== 64) throw new Error('Invalid invite payload');
		return { keyHex: obj.key, name: obj.name ?? null };
	}

	async acceptInvite(url: string): Promise<DriveSession> {
		const { keyHex, name } = this.parseInvite(url);
		const key = b4a.from(keyHex, 'hex');

		for (const session of this.sessions.values()) {
			if (session.drive?.key && b4a.equals(session.drive.key, key)) return session;
		}

		const id = randomId();
		const sessionName = name ?? 'Shared Drive';

		await this.db!.insert('@ghostdrive/sessions', {
			id,
			name: sessionName,
			icon: b4a.alloc(0),
			createdAt: Date.now(),
			remoteKey: keyHex,
			lastOpened: Date.now()
		});
		await this.db!.flush();

		const session = new DriveSession({ app: this, id, name: sessionName, key });
		await session.ready();
		this.sessions.set(id, session);
		return session;
	}
}

function randomId(): string {
	const buf = b4a.allocUnsafe(8);
	randombytes_buf(buf);
	return b4a.toString(buf, 'hex');
}
