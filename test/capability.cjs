const test = require('brittle');
const createTestnet = require('hyperdht/testnet');
const Hyperswarm = require('hyperswarm');
const sodium = require('sodium-native');
const { exchange, exchangeAny, exchangeForSession } = require('../lib/capability.js');


function randomKey() {
	const key = Buffer.allocUnsafe(32);
	sodium.randombytes_buf(key);
	return key;
}

async function swarmPair(bootstrap, t) {
	const a = new Hyperswarm({ bootstrap });
	const b = new Hyperswarm({ bootstrap });
	t.teardown(() => Promise.all([a.destroy(), b.destroy()]));

	const topic = randomKey();

	const connPair = new Promise((resolve) => {
		const conns = [];
		function check() {
			if (conns.length === 2) resolve(conns);
		}
		a.on('connection', (conn) => {
			conn.on('error', () => {});
			conns.push({ conn, swarm: a });
			check();
		});
		b.on('connection', (conn) => {
			conn.on('error', () => {});
			conns.push({ conn, swarm: b });
			check();
		});
	});

	a.join(topic, { server: true, client: false });
	await a.flush();
	b.join(topic, { server: false, client: true });
	await b.flush();

	const [x, y] = await connPair;
	const server = x.conn.isInitiator ? y.conn : x.conn;
	const client = x.conn.isInitiator ? x.conn : y.conn;
	return { server, client };
}

test('exchange - matching key, both sides pass', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server, client } = await swarmPair(bootstrap, t);

	const capKey = randomKey();

	const [serverResult, clientResult] = await Promise.all([
		exchange(server, capKey),
		exchange(client, capKey)
	]);

	t.ok(serverResult, 'server verified');
	t.ok(clientResult, 'client verified');
});

test('exchange - wrong key on client, both fail', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server, client } = await swarmPair(bootstrap, t);

	const capKey = randomKey();
	const wrongKey = randomKey();

	const [serverResult, clientResult] = await Promise.all([
		exchange(server, capKey),
		exchange(client, wrongKey)
	]);

	t.absent(serverResult, 'server rejects');
	t.absent(clientResult, 'client rejects');
});

test('exchangeAny - correct key among multiple, matches', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server, client } = await swarmPair(bootstrap, t);

	const capKey = randomKey();
	const otherKey = randomKey();
	const anotherKey = randomKey();

	const [serverResult, clientResult] = await Promise.all([
		exchangeAny(server, [otherKey, capKey, anotherKey]),
		exchange(client, capKey)
	]);

	t.ok(clientResult, 'client verified');
	t.alike(serverResult, capKey, 'server matched correct key');
});

test('exchangeAny - no matching key, both reject', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server, client } = await swarmPair(bootstrap, t);

	const serverKey = randomKey();
	const clientKey = randomKey();

	const [serverResult, clientResult] = await Promise.all([
		exchangeAny(server, [serverKey]),
		exchange(client, clientKey)
	]);

	t.is(serverResult, false, 'server rejects wrong cap');
	t.absent(clientResult, 'client rejects bad response');
});

test('exchangeAny - empty key list, rejects', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server } = await swarmPair(bootstrap, t);

	// Empty list short-circuits; no need to engage the client at all.
	const serverResult = await exchangeAny(server, []);

	t.is(serverResult, false, 'empty key list rejects');
});

test(
	'exchangeAny - peer never sends cap (strict), rejects after timeout',
	async (t) => {
		const { bootstrap } = await createTestnet(3, t.teardown);
		const { server } = await swarmPair(bootstrap, t);

		const capKey = randomKey();

		// Server waits, client never engages cap protocol
		const serverResult = await exchangeAny(server, [capKey]);

		t.is(serverResult, false, 'strict: no cap sent means rejected');
	},
	{ timeout: 15000 }
);

test('exchange - connection remains usable after successful cap', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server, client } = await swarmPair(bootstrap, t);

	const capKey = randomKey();

	const [serverResult, clientResult] = await Promise.all([
		exchange(server, capKey),
		exchange(client, capKey)
	]);

	t.ok(serverResult);
	t.ok(clientResult);
	t.absent(client.destroyed, 'client conn still open');
	t.absent(server.destroyed, 'server conn still open');
});

test('exchangeForSession - matches and returns sessionId + capKey', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server, client } = await swarmPair(bootstrap, t);

	const cap1 = randomKey();
	const cap2 = randomKey();
	const cap3 = randomKey();

	const entries = [
		{ sessionId: 'sess-A', capKey: cap1 },
		{ sessionId: 'sess-B', capKey: cap2 },
		{ sessionId: 'sess-C', capKey: cap3 }
	];

	const [serverResult, clientResult] = await Promise.all([
		exchangeForSession(server, entries),
		exchange(client, cap2)
	]);

	t.ok(clientResult, 'client verified');
	t.ok(serverResult, 'server matched');
	t.is(serverResult.sessionId, 'sess-B', 'matched correct session');
	t.alike(serverResult.capKey, cap2, 'returned matching capKey');
});

test('exchangeForSession - no match rejects', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server, client } = await swarmPair(bootstrap, t);

	const serverCap = randomKey();
	const clientCap = randomKey();

	const [serverResult, clientResult] = await Promise.all([
		exchangeForSession(server, [{ sessionId: 'sess-X', capKey: serverCap }]),
		exchange(client, clientCap)
	]);

	t.is(serverResult, false, 'server rejects');
	t.absent(clientResult, 'client rejects bad response');
});

test('exchangeForSession - empty entries rejects', async (t) => {
	const { bootstrap } = await createTestnet(3, t.teardown);
	const { server } = await swarmPair(bootstrap, t);

	const serverResult = await exchangeForSession(server, []);
	t.is(serverResult, false, 'empty entries rejects');
});
