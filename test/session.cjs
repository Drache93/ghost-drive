const test = require('brittle')
const tmp = require('test-tmp')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee2')
const HyperDB = require('hyperdb')
const path = require('path')
const fs = require('fs')

const def = require('../spec/hyperdb').default
const DriveSession = require('../src/lib/server/session.js').default

async function createApp(t) {
  const dir = await tmp(t)
  const store = new Corestore(path.join(dir, 'store'))
  await store.ready()
  const bee = new Hyperbee(store, { name: 'ghost-db' })
  const db = HyperDB.bee2(bee, def)
  await db.ready()

  const app = {
    dir,
    store,
    db,
    _topics: new Map(),
    async _joinTopic() {
      // no-op for tests
    }
  }

  t.teardown(async () => {
    await db.close()
    await store.close()
  })

  return app
}

async function createSession(t, app, opts = {}) {
  const session = new DriveSession({
    app,
    id: opts.id || 'sess-test',
    name: opts.name || 'Test Session',
    icon: opts.icon || Buffer.from('icon-bytes')
  })
  await session.ready()
  t.teardown(() => session.close())
  return session
}

// --- Lifecycle ---

test('session: opens with cache drive registered', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  t.ok(session.drive, 'has DistributedDrive')
  t.ok(session.cache, 'has cache')
  const drives = session.listDrives()
  t.is(drives.length, 1)
  t.is(drives[0].type, 'cache')
})

// --- Local drive registration ---

test('session: addLocalDrive persists and registers', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  // Create a real readable directory
  const drivePath = await tmp(t)
  fs.writeFileSync(path.join(drivePath, 'hello.txt'), 'hi')

  await session.addLocalDrive(drivePath)

  const drives = session.listDrives()
  t.is(drives.length, 2, 'cache + local')
  t.ok(drives.find((d) => d.target === drivePath && d.type === 'local'))

  // Persisted in db
  const regs = await app.db
    .find('@ghostdrive/registrations-by-session', {
      gte: { sessionId: session.id },
      lte: { sessionId: session.id }
    })
    .toArray()
  t.is(regs.length, 1)
  t.is(regs[0].target, drivePath)
  t.is(regs[0].type, 'local')
})

test('session: addLocalDrive rejects unreadable path', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  await t.exception(() => session.addLocalDrive('/nonexistent/path/abc'))
})

test('session: removeDrive unregisters and deletes record', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  const drivePath = await tmp(t)
  await session.addLocalDrive(drivePath)
  t.is(session.listDrives().length, 2)

  await session.removeDrive(drivePath)
  t.is(session.listDrives().length, 1)

  const regs = await app.db
    .find('@ghostdrive/registrations-by-session', {
      gte: { sessionId: session.id },
      lte: { sessionId: session.id }
    })
    .toArray()
  t.is(regs.length, 0)
})

test('session: reopens with persisted drives', async (t) => {
  const app = await createApp(t)
  const drivePath = await tmp(t)

  // First open: add a drive
  {
    const session = new DriveSession({
      app,
      id: 'persist-1',
      name: 'A',
      icon: Buffer.from('x')
    })
    await session.ready()
    await session.addLocalDrive(drivePath)
    await session.close()
  }

  // Second open: should auto-load that drive
  const session2 = new DriveSession({
    app,
    id: 'persist-1',
    name: 'A',
    icon: Buffer.from('x')
  })
  await session2.ready()
  t.teardown(() => session2.close())

  const drives = session2.listDrives()
  t.is(drives.length, 2, 'cache + persisted local drive')
  t.ok(drives.find((d) => d.target === drivePath))
})

// --- Invites ---

test('session: createInvite stores capKey unused', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  const { capKey, capKeyHex } = await session.createInvite()
  t.is(capKey.length, 32, '32-byte capability key')
  t.is(capKeyHex.length, 64, 'hex-encoded')

  const unused = await session.unusedInvites()
  t.is(unused.length, 1)
  t.is(unused[0].capKey, capKeyHex)
  t.is(unused[0].used, false)
})

test('session: markInviteUsed flips flag', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  const { capKeyHex } = await session.createInvite()
  const ok = await session.markInviteUsed(capKeyHex)
  t.ok(ok)

  const unused = await session.unusedInvites()
  t.is(unused.length, 0, 'no unused invites left')

  const all = await session.listInvites()
  t.is(all.length, 1)
  t.is(all[0].used, true)
})

test('session: markInviteUsed returns false for already-used', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  const { capKeyHex } = await session.createInvite()
  await session.markInviteUsed(capKeyHex)
  const second = await session.markInviteUsed(capKeyHex)
  t.is(second, false)
})

// --- Joins ---

test('session: addJoin and listJoins', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  await session.addJoin('peer-a', 'cap-a')
  await session.addJoin('peer-b', 'cap-b')

  const joins = await session.listJoins()
  t.is(joins.length, 2)
  t.ok(joins.find((j) => j.peerKey === 'peer-a'))
  t.ok(joins.find((j) => j.peerKey === 'peer-b'))
})

test('session: removeJoin', async (t) => {
  const app = await createApp(t)
  const session = await createSession(t, app)

  await session.addJoin('peer-x', 'cap-x')
  await session.removeJoin('peer-x')

  const joins = await session.listJoins()
  t.is(joins.length, 0)
})

// --- Peer connection lifecycle (real hyperswarm) ---

const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')

async function swarmPair(bootstrap, t) {
  const a = new Hyperswarm({ bootstrap })
  const b = new Hyperswarm({ bootstrap })
  t.teardown(() => Promise.all([a.destroy(), b.destroy()]))

  const topic = Buffer.allocUnsafe(32)
  require('sodium-native').randombytes_buf(topic)
  const connPair = new Promise((resolve) => {
    const conns = []
    const check = () => conns.length === 2 && resolve(conns)
    a.on('connection', (conn) => {
      conn.on('error', () => {})
      conns.push(conn)
      check()
    })
    b.on('connection', (conn) => {
      conn.on('error', () => {})
      conns.push(conn)
      check()
    })
  })

  a.join(topic, { server: true, client: false })
  await a.flush()
  b.join(topic, { server: false, client: true })
  await b.flush()

  const [x, y] = await connPair
  return { server: x.isInitiator ? y : x, client: x.isInitiator ? x : y }
}

test('session: addPeerConnection tracks online state', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const app = await createApp(t)
  const session = await createSession(t, app)

  const { server, client } = await swarmPair(bootstrap, t)

  let connectedHex = null
  session.on('peer-connected', (hex) => {
    connectedHex = hex
  })

  session.addPeerConnection(server)

  t.is(session.peerCount, 1)
  t.ok(connectedHex)
  t.is(connectedHex.length, 64)
  t.ok(session.isPeerOnline(connectedHex))

  const disconnected = new Promise((resolve) => session.once('peer-disconnected', resolve))
  client.destroy()
  await disconnected

  t.is(session.peerCount, 0)
  t.absent(session.isPeerOnline(connectedHex))
})

test('session: addPeerConnection is idempotent for same peer', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const app = await createApp(t)
  const session = await createSession(t, app)

  const { server } = await swarmPair(bootstrap, t)

  session.addPeerConnection(server)
  session.addPeerConnection(server)

  t.is(session.peerCount, 1)
})
