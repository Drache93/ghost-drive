const test = require('brittle')
const tmp = require('test-tmp')
const createTestnet = require('hyperdht/testnet')
const b4a = require('b4a')

const GhostDriveApp = require('../src/lib/server/app.js').default

async function makeApp(t, bootstrap) {
  const dir = await tmp(t)
  const app = new GhostDriveApp({ dir, bootstrap })
  await app.ready()
  t.teardown(() => app.close())
  return app
}

// --- Session management ---

test('app: createSession persists and is retrievable', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const app = await makeApp(t, bootstrap)

  const session = await app.createSession({ name: 'Work', icon: b4a.from('icon-x') })
  t.ok(session.id)
  t.is(session.name, 'Work')
  t.is(app.getSession(session.id), session)

  const list = app.listSessions()
  t.is(list.length, 1)
  t.is(list[0].name, 'Work')
})

test('app: sessions reload across restart', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const dir = await tmp(t)

  let createdId
  {
    const app = new GhostDriveApp({ dir, bootstrap })
    await app.ready()
    const s = await app.createSession({ name: 'Persist', icon: b4a.from('p') })
    createdId = s.id
    await app.close()
  }

  const app2 = new GhostDriveApp({ dir, bootstrap })
  await app2.ready()
  t.teardown(() => app2.close())

  t.is(app2.listSessions().length, 1)
  const reloaded = app2.getSession(createdId)
  t.ok(reloaded)
  t.is(reloaded.name, 'Persist')
})

test('app: removeSession cascades cleanup', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const app = await makeApp(t, bootstrap)

  const session = await app.createSession({ name: 'Tmp', icon: b4a.from('t') })
  await session.createInvite()
  await session.addJoin('peer-a', 'cap-a')

  await app.removeSession(session.id)
  t.is(app.listSessions().length, 0)

  // No leftover records
  const invites = await app.db
    .find('@ghostdrive/invites-by-session', {
      gte: { sessionId: session.id },
      lte: { sessionId: session.id }
    })
    .toArray()
  t.is(invites.length, 0)

  const joins = await app.db
    .find('@ghostdrive/joins-by-session', {
      gte: { sessionId: session.id },
      lte: { sessionId: session.id }
    })
    .toArray()
  t.is(joins.length, 0)
})

// --- Invite encoding ---

test('app: encodeInvite + parseInvite round-trip', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const app = await makeApp(t, bootstrap)

  const session = await app.createSession({ name: 'Share', icon: b4a.from('s') })
  const { capKeyHex } = await session.createInvite()

  const url = app.encodeInvite(session, capKeyHex)
  t.ok(url.startsWith('ghostdrive://'))

  const parsed = app.parseInvite(url)
  t.is(parsed.sessionId, session.id)
  t.is(parsed.capKeyHex, capKeyHex)
  t.is(parsed.hostKeyHex.length >= 64, true, 'host key encoded')
})

test('app: parseInvite rejects bad scheme', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const app = await makeApp(t, bootstrap)
  t.exception(() => app.parseInvite('http://example.com'))
})

// --- End-to-end: two apps, invite-based pairing, connection routes to correct session ---

test('app: invite pairing routes to correct session', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const host = await makeApp(t, bootstrap)
  const guest = await makeApp(t, bootstrap)

  // Host creates a session and an invite
  const hostSession = await host.createSession({ name: 'HostSession', icon: b4a.from('h') })
  const { capKeyHex } = await hostSession.createInvite()
  const inviteUrl = host.encodeInvite(hostSession, capKeyHex)

  // Guest accepts
  const guestSession = await guest.acceptInvite(inviteUrl)
  t.ok(guestSession)

  // Host should see a peer connected to hostSession
  const connected = new Promise((resolve) =>
    host.once('connection', ({ sessionId }) => resolve(sessionId))
  )

  const matchedSessionId = await connected
  t.is(matchedSessionId, hostSession.id, 'host routed connection to the right session')

  // Wait briefly for the close hook to fire on guest side
  await new Promise((r) => setTimeout(r, 100))
  t.is(hostSession.peerCount >= 1, true, 'host session has the peer')
})

test('app: invite is single-use (marked used after pairing)', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const host = await makeApp(t, bootstrap)
  const guest = await makeApp(t, bootstrap)

  const hostSession = await host.createSession({ name: 'OneShot', icon: b4a.from('o') })
  const { capKeyHex } = await hostSession.createInvite()
  const inviteUrl = host.encodeInvite(hostSession, capKeyHex)

  await guest.acceptInvite(inviteUrl)
  await new Promise((r) => host.once('connection', r))
  // Allow markInviteUsed to flush
  await new Promise((r) => setTimeout(r, 200))

  const all = await hostSession.listInvites()
  t.is(all.length, 1)
  t.is(all[0].used, true, 'invite consumed')

  const unused = await hostSession.unusedInvites()
  t.is(unused.length, 0)
})

test('app: rejects connection with no matching invite', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const host = await makeApp(t, bootstrap)
  const guest = await makeApp(t, bootstrap)

  // Host has NO invite. Guest tries to join the host topic anyway.
  await host.createSession({ name: 'Locked', icon: b4a.from('l') })
  const HyperDHTAddress = require('hyperdht-address')
  const hostAddr = HyperDHTAddress.encode(host.key, host.swarm.server?.relayAddresses || [])
  const fakeUrl = `ghostdrive://${b4a
    .toString(b4a.from(`fake|${b4a.toString(hostAddr, 'hex')}|${'a'.repeat(64)}`), 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`

  await guest.acceptInvite(fakeUrl)

  // Wait a moment for any routing attempt
  await new Promise((r) => setTimeout(r, 1500))

  const sessions = host.listSessions()
  t.is(sessions[0].peerCount, 0, 'host session has no connected peer')
})
