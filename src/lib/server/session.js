import ReadyResource from 'ready-resource';
import Localdrive from 'localdrive';
import Hyperdrive from 'hyperdrive';
import DistributedDrive from 'distributed-drive';
import path from 'path';
import b4a from 'b4a';
import fs from 'fs';

// A DriveSession represents one "Ghost Drive" — a named, isolated unit with
// its own DistributedDrive. In host mode, the drive creates a new identity.
// In guest mode, the drive joins an existing one by key.
export default class DriveSession extends ReadyResource {
	constructor({ app, id, name, icon, key }) {
		super();

		this.app = app;
		this.id = id;
		this.name = name;
		this.icon = icon;

		// If key is provided, this is a guest session joining a remote drive.
		this._remoteKey = key || null;

		this.drive = null;
		this.cache = null;
		this.driveMap = new Map();
	}

	get peerCount() {
		return this.drive ? this.drive.peers : 0;
	}

	async _open() {
		const cacheDir = path.join(this.app.dir, 'sessions', this.id, 'cache');
		this.cache = new Localdrive(cacheDir);
		await this.cache.ready();

		// Load saved local/hyper drives BEFORE creating the DistributedDrive so
		// they're available as initial drives.
		const initialDrives = [this.cache];

		const regs = await this.app.db
			.find('@ghostdrive/registrations-by-session', {
				gte: { sessionId: this.id },
				lte: { sessionId: this.id }
			})
			.toArray();

		for (const reg of regs) {
			try {
				if (reg.type === 'local') {
					const local = new Localdrive(reg.target);
					this.driveMap.set(reg.target, local);
					initialDrives.push(local);
				} else if (reg.type === 'hyperdrive') {
					const key = b4a.from(reg.target, 'hex');
					const hd = new Hyperdrive(this.app.store.session(), key);
					await hd.ready();
					this.driveMap.set(reg.target, hd);
					initialDrives.push(hd);
				}
			} catch (err) {
				console.warn(
					`session ${this.id}: failed to register ${reg.type} ${reg.target}:`,
					err.message
				);
			}
		}

		// Create the DistributedDrive. The key distinction:
		//   Host mode (no _remoteKey): generates a new identity via name
		//   Guest mode (_remoteKey set): joins the host's drive by key
		const driveOpts = {
			drives: initialDrives,
			key: '',
			name: ''
		};

		if (this._remoteKey) {
			driveOpts.key = this._remoteKey;
		} else {
			driveOpts.name = 'ghost-drive/' + this.id;
		}

		this.drive = new DistributedDrive(this.app.store.session(), driveOpts);
		await this.drive.ready();

		console.log(
			`[session ${this.id}] opened — drives: ${this.drive.drives.length}, types: [${this.drive.drives.map((d) => d.constructor?.name || 'unknown').join(', ')}], key: ${b4a.toString(this.drive.key, 'hex').slice(0, 12)}...`
		);
	}

	async _close() {
		for (const drive of this.driveMap.values()) {
			try {
				await drive.close();
			} catch {}
		}
		this.driveMap.clear();

		if (this.cache) await this.cache.close();
		if (this.drive) await this.drive.close();
	}

	// --- Drive registration ---

	async addLocalDrive(drivePath) {
		if (this.driveMap.has(drivePath)) return;

		console.log(
			`[session ${this.id}] addLocalDrive: '${drivePath}', current drives: ${this.drive?.drives.length}`
		);

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

		const local = new Localdrive(drivePath);
		this.driveMap.set(drivePath, local);
		this.drive.register(local);

		console.log(
			`[session ${this.id}] addLocalDrive: registered, drives now: ${this.drive.drives.length}, types: [${this.drive.drives.map((d) => d.constructor?.name || 'unknown').join(', ')}]`
		);
	}

	async addHyperdrive(hex) {
		if (this.driveMap.has(hex)) return;
		if (!/^[0-9a-f]{64}$/i.test(hex)) {
			throw new Error('Invalid hyperdrive key (expected 64-char hex)');
		}

		const key = b4a.from(hex, 'hex');
		const hd = new Hyperdrive(this.app.store.session(), key);
		await hd.ready();
		this.driveMap.set(hex, hd);
		this.drive.register(hd);

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

	// --- Invites (simplified: invite = drive.key hex) ---

	async createInvite() {
		// The "invite" is now just sharing the drive's key. We still store a
		// record so the UI can show "invites created" and mark them used once
		// a peer actually shows up (for UX tracking only, not auth).
		const capKeyHex = b4a.toString(this.drive.key, 'hex');

		await this.app.db.insert('@ghostdrive/invites', {
			sessionId: this.id,
			capKey: capKeyHex,
			used: false,
			createdAt: Date.now()
		});
		await this.app.db.flush();

		return { capKey: this.drive.key, capKeyHex };
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

	// --- Joins (track which remote drives we've joined) ---

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

	// --- Utility ---

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
