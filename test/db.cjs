const test = require('brittle')
const tmp = require('test-tmp')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee2')
const HyperDB = require('hyperdb')
const def = require('../spec/hyperdb').default

async function createDB(t) {
  const dir = await tmp(t)
  const store = new Corestore(dir + '/store')
  const bee = new Hyperbee(store, { name: 'ghost-db' })
  const db = HyperDB.bee2(bee, def)
  await db.ready()
  t.teardown(() => db.close())
  return db
}

// --- Sessions ---

test('session: insert and get by id', async (t) => {
  const db = await createDB(t)
  const icon = Buffer.from('fake-png-bytes')

  await db.insert('@ghostdrive/sessions', {
    id: 'sess-1',
    name: 'Work Files',
    icon,
    createdAt: Date.now()
  })
  await db.flush()

  const session = await db.get('@ghostdrive/sessions', { id: 'sess-1' })
  t.is(session.name, 'Work Files')
  t.ok(Buffer.isBuffer(session.icon))
  t.alike(session.icon, icon)
})

test('session: list all sessions', async (t) => {
  const db = await createDB(t)
  const icon = Buffer.from('x')

  await db.insert('@ghostdrive/sessions', { id: 'a', name: 'Drive A', icon, createdAt: 1 })
  await db.insert('@ghostdrive/sessions', { id: 'b', name: 'Drive B', icon, createdAt: 2 })
  await db.flush()

  const all = await db.find('@ghostdrive/sessions', { gte: {}, lte: {} }).toArray()
  t.is(all.length, 2)
})

test('session: delete', async (t) => {
  const db = await createDB(t)
  const icon = Buffer.from('x')

  await db.insert('@ghostdrive/sessions', { id: 'del-1', name: 'Temp', icon, createdAt: 1 })
  await db.flush()

  await db.delete('@ghostdrive/sessions', { id: 'del-1' })
  await db.flush()

  const session = await db.get('@ghostdrive/sessions', { id: 'del-1' })
  t.is(session, null)
})

// --- Registrations ---

test('registration: insert and list by session', async (t) => {
  const db = await createDB(t)

  await db.insert('@ghostdrive/registrations', {
    sessionId: 'sess-1',
    target: '/Users/me/work',
    type: 'local',
    createdAt: Date.now()
  })
  await db.insert('@ghostdrive/registrations', {
    sessionId: 'sess-1',
    target: 'aabbcc' + '0'.repeat(58),
    type: 'hyperdrive',
    createdAt: Date.now()
  })
  await db.insert('@ghostdrive/registrations', {
    sessionId: 'sess-2',
    target: '/other',
    type: 'local',
    createdAt: Date.now()
  })
  await db.flush()

  const regs = await db
    .find('@ghostdrive/registrations-by-session', {
      gte: { sessionId: 'sess-1' },
      lte: { sessionId: 'sess-1' }
    })
    .toArray()

  t.is(regs.length, 2)
  t.ok(regs.every((r) => r.sessionId === 'sess-1'))
})

test('registration: delete', async (t) => {
  const db = await createDB(t)

  await db.insert('@ghostdrive/registrations', {
    sessionId: 'sess-1',
    target: '/tmp/drive',
    type: 'local',
    createdAt: Date.now()
  })
  await db.flush()

  await db.delete('@ghostdrive/registrations', { sessionId: 'sess-1', target: '/tmp/drive' })
  await db.flush()

  const regs = await db
    .find('@ghostdrive/registrations-by-session', {
      gte: { sessionId: 'sess-1' },
      lte: { sessionId: 'sess-1' }
    })
    .toArray()
  t.is(regs.length, 0)
})

// --- Invites ---

test('invite: insert and list by session, filter unused', async (t) => {
  const db = await createDB(t)

  await db.insert('@ghostdrive/invites', {
    sessionId: 'sess-1',
    capKey: 'aaa',
    used: false,
    createdAt: Date.now()
  })
  await db.insert('@ghostdrive/invites', {
    sessionId: 'sess-1',
    capKey: 'bbb',
    used: true,
    createdAt: Date.now()
  })
  await db.flush()

  const all = await db
    .find('@ghostdrive/invites-by-session', {
      gte: { sessionId: 'sess-1' },
      lte: { sessionId: 'sess-1' }
    })
    .toArray()
  t.is(all.length, 2)

  const unused = all.filter((i) => !i.used)
  t.is(unused.length, 1)
  t.is(unused[0].capKey, 'aaa')
})

test('invite: mark as used', async (t) => {
  const db = await createDB(t)

  await db.insert('@ghostdrive/invites', {
    sessionId: 'sess-1',
    capKey: 'ccc',
    used: false,
    createdAt: Date.now()
  })
  await db.flush()

  const invite = await db.get('@ghostdrive/invites', { sessionId: 'sess-1', capKey: 'ccc' })
  await db.insert('@ghostdrive/invites', { ...invite, used: true })
  await db.flush()

  const updated = await db.get('@ghostdrive/invites', { sessionId: 'sess-1', capKey: 'ccc' })
  t.is(updated.used, true)
})

// --- Joins ---

test('join: insert and list by session', async (t) => {
  const db = await createDB(t)

  await db.insert('@ghostdrive/joins', {
    sessionId: 'sess-1',
    peerKey: 'peer-aaa',
    capKey: 'cap-aaa',
    createdAt: Date.now()
  })
  await db.insert('@ghostdrive/joins', {
    sessionId: 'sess-2',
    peerKey: 'peer-bbb',
    capKey: 'cap-bbb',
    createdAt: Date.now()
  })
  await db.flush()

  const joins = await db
    .find('@ghostdrive/joins-by-session', {
      gte: { sessionId: 'sess-1' },
      lte: { sessionId: 'sess-1' }
    })
    .toArray()
  t.is(joins.length, 1)
  t.is(joins[0].peerKey, 'peer-aaa')
})

test('join: remove peer', async (t) => {
  const db = await createDB(t)

  await db.insert('@ghostdrive/joins', {
    sessionId: 'sess-1',
    peerKey: 'peer-del',
    capKey: 'cap-del',
    createdAt: Date.now()
  })
  await db.flush()

  await db.delete('@ghostdrive/joins', { sessionId: 'sess-1', peerKey: 'peer-del' })
  await db.flush()

  const joins = await db
    .find('@ghostdrive/joins-by-session', {
      gte: { sessionId: 'sess-1' },
      lte: { sessionId: 'sess-1' }
    })
    .toArray()
  t.is(joins.length, 0)
})
