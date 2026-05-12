const Hyperschema = require('hyperschema');
const HyperDB = require('hyperdb/builder');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, 'spec', 'hyperschema');
const DB_DIR = path.join(__dirname, 'spec', 'hyperdb');

// --- Hyperschema structs ---
const schema = Hyperschema.from(SCHEMA_DIR);
const ns = schema.namespace('ghostdrive');

ns.register({
	name: 'session',
	fields: [
		{ name: 'id', type: 'string', required: true },
		{ name: 'name', type: 'string', required: true },
		{ name: 'icon', type: 'buffer', required: true }, // raw image bytes, rendered as base64 data URI
		{ name: 'createdAt', type: 'uint', required: true },
		{ name: 'remoteKey', type: 'string' }, // hex key of remote drive (guest sessions only)
		{ name: 'lastOpened', type: 'uint' }
	]
});

ns.register({
	name: 'registration',
	fields: [
		{ name: 'sessionId', type: 'string', required: true },
		{ name: 'target', type: 'string', required: true }, // local path or hyperdrive hex key
		{ name: 'type', type: 'string', required: true }, // 'local' | 'hyperdrive'
		{ name: 'createdAt', type: 'uint', required: true }
	]
});

ns.register({
	name: 'invite',
	fields: [
		{ name: 'sessionId', type: 'string', required: true },
		{ name: 'capKey', type: 'string', required: true }, // hex-encoded 32-byte capability key
		{ name: 'used', type: 'bool', required: true },
		{ name: 'createdAt', type: 'uint', required: true }
	]
});

ns.register({
	name: 'join',
	fields: [
		{ name: 'sessionId', type: 'string', required: true },
		{ name: 'peerKey', type: 'string', required: true }, // hex-encoded remote public key
		{ name: 'capKey', type: 'string', required: true }, // hex-encoded capability key used
		{ name: 'createdAt', type: 'uint', required: true }
	]
});

Hyperschema.toDisk(schema, { esm: true });

// --- HyperDB collections + indexes ---
const db = HyperDB.from(SCHEMA_DIR, DB_DIR);
const dbns = db.namespace('ghostdrive');

dbns.collections.register({
	name: 'sessions',
	schema: '@ghostdrive/session',
	key: ['id']
});

// Composite primary key: unique per session+target
dbns.collections.register({
	name: 'registrations',
	schema: '@ghostdrive/registration',
	key: ['sessionId', 'target']
});

// Composite primary key: unique per session+capKey
dbns.collections.register({
	name: 'invites',
	schema: '@ghostdrive/invite',
	key: ['sessionId', 'capKey']
});

// Composite primary key: unique per session+peer
dbns.collections.register({
	name: 'joins',
	schema: '@ghostdrive/join',
	key: ['sessionId', 'peerKey']
});

// Secondary indexes for querying children by sessionId
dbns.indexes.register({
	name: 'registrations-by-session',
	collection: '@ghostdrive/registrations',
	unique: false,
	key: ['sessionId']
});

dbns.indexes.register({
	name: 'invites-by-session',
	collection: '@ghostdrive/invites',
	unique: false,
	key: ['sessionId']
});

dbns.indexes.register({
	name: 'joins-by-session',
	collection: '@ghostdrive/joins',
	unique: false,
	key: ['sessionId']
});

HyperDB.toDisk(db, { esm: true });
