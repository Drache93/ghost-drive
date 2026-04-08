const ReadyResource = require('ready-resource')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const { Transform } = require('streamx')
const Console = require('bare-console')
const dir = require('bare-storage')
const path = require('path')

const Localdrive = require('localdrive')
const Hyperdrive = require('hyperdrive')
const { Remote } = require('gip-remote')
const DistributedDrive = require('distributed-drive')

const serve = require('../lib/serve')

const console = new Console()

module.exports = class App extends ReadyResource {
  constructor() {
    super()

    this.store = new Corestore(path.join(dir.persistent(), '.ghost-drive', 'corestore'))
    this.swarm = new Hyperswarm()
    this.drive = null
    this.view = null

    this.key = null
    this.peers = 0
    this._joins = null
    this._topics = new Map()
    this._drives = null
    this._driveMap = new Map()
    this._serve = null

    this.stream = new Transform({
      async transform(msg, cb) {
        const { event, data } = JSON.parse(msg)
        console.log('transform', event, data)
        if (event === 'click' || event === 'submit' || event === 'value') {
          this.push({ event, data })
        }
        cb()
      }
    })
  }

  async _open() {
    await this.store.ready()

    this.swarm.on('connection', (conn) => {
      this.store.replicate(conn)
    })

    const keyPair = await this.store.createKeyPair('ghost-drive')
    this.key = keyPair.publicKey

    this.drive = new DistributedDrive()

    // Personal cache hyperdrive — always first drive
    this.cache = new Hyperdrive(this.store.namespace('cache'))
    await this.cache.ready()
    this.drive.register(this.cache)
    console.log('cache drive:', this.cache.key.toString('hex'))

    this._drives = this.store.get({ name: 'drives', valueEncoding: 'json' })
    await this._drives.ready()

    const removed = new Set()
    for (let i = 0; i < this._drives.length; i++) {
      const entry = await this._drives.get(i)
      const id = entry.path || entry.key || entry.url
      if (entry.removed) removed.add(id)
      else removed.delete(id)
    }
    for (let i = 0; i < this._drives.length; i++) {
      const entry = await this._drives.get(i)
      const id = entry.path || entry.key || entry.url
      if (entry.removed || removed.has(id)) continue
      if (entry.type === 'local') this._registerLocal(entry.path)
      else if (entry.type === 'hyperdrive') await this._registerHyperdrive(entry.key, true)
      else if (entry.type === 'gip-remote') await this._registerGipRemote(entry.url, true)
    }

    this.swarm.on('connection', (stream) => {
      stream.on('error', (err) => console.log('stream error:', err.message))
      this.peers++
      const peer = this.drive.addPeer(stream)
      console.log(`peer connected (${this.peers} online)`)

      if (this.view) this.view.updatePeers(this.peers)

      const onRpcOpen = () => {
        console.log('rpc open, refreshing tree')
        if (this.view) this.view.refreshTree()
      }

      if (peer.rpc.opened) onRpcOpen()
      else peer.rpc.on('open', onRpcOpen)

      stream.once('close', () => {
        this.peers--
        console.log(`peer disconnected (${this.peers} online)`)
        if (this.view) this.view.updatePeers(this.peers)
        if (this.view) this.view.refreshTree()
      })
    })

    await this._joinTopic(this.key, true)
    console.log('key:', this.key.toString('hex'))

    this._joins = this.store.get({ name: 'joins', valueEncoding: 'json' })
    await this._joins.ready()

    for (let i = 0; i < this._joins.length; i++) {
      const entry = await this._joins.get(i)
      const key = Buffer.from(entry.key, 'hex')
      this._joinTopic(key, false, true)
      console.log('rejoining:', entry.key)
    }

    this.stream.push({ ready: true })
  }

  async _joinTopic(key, server, noWait) {
    const hex = key.toString('hex')
    if (this._topics.has(hex)) return

    const discovery = this.swarm.join(key, { server: !!server, client: !server })
    this._topics.set(hex, true)

    if (noWait) {
      discovery.flushed().catch((err) => console.log('discovery flush error:', err.message))
      return
    }

    if (server) {
      await discovery.flushed()
    } else {
      await this.swarm.flush()
    }
  }

  async joinKey(hex) {
    const key = Buffer.from(hex, 'hex')
    if (key.length !== 32) return

    if (this._topics.has(hex)) {
      console.log('already joined:', hex)
      return
    }

    await this._joins.append({ key: hex })
    await this._joinTopic(key)
    console.log('joined:', hex)
  }

  _registerLocal(drivePath) {
    if (this._driveMap.has(drivePath)) return
    const local = new Localdrive(drivePath)
    this._driveMap.set(drivePath, local)
    this.drive.register(local)
    console.log('registered drive:', drivePath)
  }

  async _registerHyperdrive(hex, noWait) {
    if (this._driveMap.has(hex)) return
    const key = Buffer.from(hex, 'hex')
    const hd = new Hyperdrive(this.store, key)
    await hd.ready()
    this._driveMap.set(hex, hd)
    this.drive.register(hd)
    await this._joinTopic(hd.discoveryKey, false, noWait)
    console.log('registered hyperdrive:', hex)
  }

  async _registerGipRemote(url, noWait) {
    if (this._driveMap.has(url)) return
    const remote = new Remote(this.store, url)
    await remote.ready()

    // Join swarm + wait for peers before reading data
    await this._joinTopic(remote.discoveryKey, false, noWait)
    if (!noWait) {
      await remote.update()
    }

    const rd = await remote.toDrive('main')
    if (!rd) throw new Error('no main branch found')
    await rd.ready()
    this._driveMap.set(url, { remote, drive: rd })
    this.drive.register(rd)
    console.log('registered gip-remote:', url)
  }

  async addDrive(input) {
    input = input.trim()
    const isGipRemote = input.startsWith('git+pear://')
    const isKey = !isGipRemote && /^[0-9a-f]{64}$/i.test(input) && !input.includes('/')

    if (isGipRemote) {
      if (this._driveMap.has(input)) return

      try {
        await this._registerGipRemote(input)
      } catch (err) {
        console.log('cannot add gip-remote:', input, err.message)
        this.stream.push({ error: true, message: 'Cannot add gip-remote: ' + err.message })
        return
      }

      await this._drives.append({ type: 'gip-remote', url: input })
      this.stream.push({ drivesChanged: true })
      return
    }

    if (isKey) {
      if (this._driveMap.has(input)) return

      try {
        await this._registerHyperdrive(input)
      } catch (err) {
        console.log('cannot add hyperdrive:', input, err.message)
        this.stream.push({ error: true, message: 'Cannot add hyperdrive: ' + err.message })
        return
      }

      await this._drives.append({ type: 'hyperdrive', key: input })
      this.stream.push({ drivesChanged: true })
      return
    }

    if (this._driveMap.has(input)) return

    // Validate local path is readable
    const test = new Localdrive(input)
    let valid = false
    try {
      for await (const _ of test.readdir('/')) {
        valid = true
        break
      }
      if (!valid) {
        const fs = require('fs')
        fs.accessSync(input)
        valid = true
      }
    } catch (err) {
      console.log('cannot access drive path:', input, err.message)
      this.stream.push({ error: true, message: 'Cannot access: ' + input })
      return
    }

    await this._drives.append({ type: 'local', path: input })
    this._registerLocal(input)
    this.stream.push({ drivesChanged: true })
  }

  async removeDrive(id) {
    const entry = this._driveMap.get(id)
    if (!entry) return

    const isGip = id.startsWith('git+pear://')
    if (isGip) {
      this.drive.unregister(entry.drive)
      await entry.remote.close()
    } else {
      this.drive.unregister(entry)
      await entry.close()
    }
    this._driveMap.delete(id)

    const isKey = !isGip && /^[0-9a-f]{64}$/i.test(id)
    const removal = isGip
      ? { type: 'gip-remote', url: id, removed: true }
      : isKey
        ? { type: 'hyperdrive', key: id, removed: true }
        : { type: 'local', path: id, removed: true }

    await this._drives.append(removal)
    this.stream.push({ drivesChanged: true })
  }

  async listDrives() {
    const list = []
    for (const [id, drv] of this._driveMap) {
      const isGip = id.startsWith('git+pear://')
      const isKey = !isGip && /^[0-9a-f]{64}$/i.test(id)
      const type = isGip ? 'gip-remote' : isKey ? 'hyperdrive' : 'local'
      list.push({ id, type })
    }
    return list
  }

  async cacheFile(filePath) {
    const exists = await this.cache.get(filePath)
    if (exists) {
      console.log('already cached:', filePath)
      return
    }

    const buf = await this.drive.get(filePath)
    if (!buf) throw new Error('file not found: ' + filePath)

    await this.cache.put(filePath, buf)
    console.log('cached:', filePath)
  }

  async clearCache() {
    const batch = this.cache.batch()
    for await (const entry of this.cache.list('/')) {
      await batch.del(entry.key)
    }
    await batch.flush()
    console.log('cache cleared')
  }

  async preview(path) {
    if (this._serve) this._serve.server.close()
    this._serve = await serve(this.drive, path)
    const base = `http://localhost:${this._serve.port}`
    const url = base + path
    console.log('serving', url)
    this.stream.push({ serving: true, url, path })
  }

  async _close() {
    if (this._serve) this._serve.server.close()
    if (this._joins) await this._joins.close()
    if (this.cache) await this.cache.close()
    await this.swarm.destroy()
    await this.store.close()
  }
}
