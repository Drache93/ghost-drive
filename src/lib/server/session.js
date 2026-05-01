import ReadyResource from 'ready-resource';
import Localdrive from 'localdrive';
import Hyperdrive from 'hyperdrive';
import DistributedDrive from 'distributed-drive';
import sodium from 'sodium-native';
import path from 'path';
import b4a from 'b4a';
import fs from 'fs';

// A DriveSession represents one "Ghost Drive" — a named, isolated unit with
// its own DistributedDrive, peer invites, and joined peers. Multiple sessions
// share the parent app's Corestore and Hyperswarm.
export default class DriveSession extends ReadyResource {
	constructor({ app, id, name, icon }) {
		super();

		this.app = app;
		this.id = id;
		this.name = name;
		this.icon = icon;

		this.drive = null;
		this.cache = null;
		this.driveMap = new Map();
		this.connectedPeers = new Map();
	}

	async _open() {
		this.drive = new DistributedDrive();
		await this.drive.ready();

		const cacheDir = path.join(this.app.dir, 'sessions', this.id, 'cache');
		this.cache = new Localdrive(cacheDir);
		await this.cache.ready();
		this.drive.register(this.cache);

		const regs = await this.app.db
			.find('@ghostdrive/registrations-by-session', {
				gte: { sessionId: this.id },
				lte: { sessionId: this.id }
			})
			.toArray();

		for (const reg of regs) {
			try {
				if (reg.type === 'local') {
					this._registerLocal(reg.target);
				} else if (reg.type === 'hyperdrive') {
					await this._registerHyperdrive(reg.target);
				}
			} catch (err) {
				console.warn(
					`session ${this.id}: failed to register ${reg.type} ${reg.target}:`,
					err.message
				);
			}
		}
	}

	async _close() {
		for (const { conn } of this.connectedPeers.values()) {
			try {
				conn.destroy();
			} catch {}
		}
		this.connectedPeers.clear();

		for (const drive of this.driveMap.values()) {
			try {
				await drive.close();
			} catch {}
		}
		this.driveMap.clear();

		if (this.cache) await this.cache.close();
		if (this.drive) await this.drive.close();
	}

	_registerLocal(drivePath) {
		if (this.driveMap.has(drivePath)) return;
		const local = new Localdrive(drivePath);
		this.driveMap.set(drivePath, local);
		this.drive.register(local);
	}

	async _registerHyperdrive(hex) {
		if (this.driveMap.has(hex)) return;
		const key = b4a.from(hex, 'hex');
		const hd = new Hyperdrive(this.app.store.session(), key);
		await hd.ready();
		this.driveMap.set(hex, hd);
		this.drive.register(hd);
		await this.app._joinTopic(hd.discoveryKey, false, true);
	}

	async addLocalDrive(drivePath) {
		if (this.driveMap.has(drivePath)) return;

		const test = new Localdrive(drivePath);
		let valid = false;
		try {
			for await (const _ of test.readdir('/')) {
				valid = true;
				break;
			}
			if (!valid) {
				fs.accessSync(drivePath);
				valid = true;
			}
		} catch (err) {
			throw new Error(`Cannot access drive path: ${drivePath} (${err.message})`);
		}

		await this.app.db.insert('@ghostdrive/registrations', {
			sessionId: this.id,
			target: drivePath,
			type: 'local',
			createdAt: Date.now()
		});
		await this.app.db.flush();

		this._registerLocal(drivePath);
	}

	async addHyperdrive(hex) {
		if (this.driveMap.has(hex)) return;
		if (!/^[0-9a-f]{64}$/i.test(hex)) {
			throw new Error('Invalid hyperdrive key (expected 64-char hex)');
		}

		await this._registerHyperdrive(hex);

		await this.app.db.insert('@ghostdrive/registrations', {
			sessionId: this.id,
			target: hex,
			type: 'hyperdrive',
			createdAt: Date.now()
		});
		await this.app.db.flush();
	}

	async removeDrive(target) {
		const drive = this.driveMap.get(target);
		if (!drive) return;

		this.drive.unregister(drive);
		await drive.close();
		this.driveMap.delete(target);

		await this.app.db.delete('@ghostdrive/registrations', {
			sessionId: this.id,
			target
		});
		await this.app.db.flush();
	}

	listDrives() {
		const list = [{ target: 'cache', type: 'cache' }];
		for (const target of this.driveMap.keys()) {
			const isHex = /^[0-9a-f]{64}$/i.test(target);
			list.push({ target, type: isHex ? 'hyperdrive' : 'local' });
		}
		return list;
	}

	async createInvite() {
		const capKey = b4a.allocUnsafe(32);
		sodium.randombytes_buf(capKey);
		const capKeyHex = b4a.toString(capKey, 'hex');

		await this.app.db.insert('@ghostdrive/invites', {
			sessionId: this.id,
			capKey: capKeyHex,
			used: false,
			createdAt: Date.now()
		});
		await this.app.db.flush();

		return { capKey, capKeyHex };
	}

	async listInvites() {
		return await this.app.db
			.find('@ghostdrive/invites-by-session', {
				gte: { sessionId: this.id },
				lte: { sessionId: this.id }
			})
			.toArray();
	}

	async unusedInvites() {
		const all = await this.listInvites();
		return all.filter((i) => !i.used);
	}

	async markInviteUsed(capKeyHex) {
		const invite = await this.app.db.get('@ghostdrive/invites', {
			sessionId: this.id,
			capKey: capKeyHex
		});
		if (!invite || invite.used) return false;

		await this.app.db.insert('@ghostdrive/invites', { ...invite, used: true });
		await this.app.db.flush();
		return true;
	}

	async addJoin(peerKeyHex, capKeyHex) {
		await this.app.db.insert('@ghostdrive/joins', {
			sessionId: this.id,
			peerKey: peerKeyHex,
			capKey: capKeyHex,
			createdAt: Date.now()
		});
		await this.app.db.flush();
	}

	async removeJoin(peerKeyHex) {
		await this.app.db.delete('@ghostdrive/joins', {
			sessionId: this.id,
			peerKey: peerKeyHex
		});
		await this.app.db.flush();
	}

	async listJoins() {
		return await this.app.db
			.find('@ghostdrive/joins-by-session', {
				gte: { sessionId: this.id },
				lte: { sessionId: this.id }
			})
			.toArray();
	}

	addPeerConnection(conn) {
		const peerHex = b4a.toString(conn.remotePublicKey, 'hex');
		if (this.connectedPeers.has(peerHex)) return;

		const peer = this.drive.addPeer(conn);
		this.connectedPeers.set(peerHex, { conn, peer });

		conn.once('close', () => {
			this.connectedPeers.delete(peerHex);
			this.emit('peer-disconnected', peerHex);
		});

		this.emit('peer-connected', peerHex);
		return peer;
	}

	isPeerOnline(peerHex) {
		return this.connectedPeers.has(peerHex);
	}

	get peerCount() {
		return this.connectedPeers.size;
	}

	async cacheFile(filePath) {
		const entry = await this.drive.entry(filePath);
		if (!entry) throw new Error('file not found: ' + filePath);
		const mirror = this.drive.mirror(this.cache, { prefix: filePath });
		await mirror.done();
	}

	async clearCache() {
		const batch = this.cache.batch();
		for await (const entry of this.cache.list('/')) {
			await batch.del(entry.key);
		}
		await batch.flush();
	}
}
