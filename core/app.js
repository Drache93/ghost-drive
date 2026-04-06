const ReadyResource = require('ready-resource')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const { Transform } = require('streamx')
const Console = require('bare-console')
const dir = require('bare-storage')
const path = require('path')

const Localdrive = require('localdrive')
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

    const keyPair = await this.store.createKeyPair('ghost-drive')
    this.key = keyPair.publicKey

    this.drive = new DistributedDrive()

    this._drives = this.store.get({ name: 'drives', valueEncoding: 'json' })
    await this._drives.ready()

    const removed = new Set()
    for (let i = 0; i < this._drives.length; i++) {
      const entry = await this._drives.get(i)
      if (entry.removed) removed.add(entry.path)
      else removed.delete(entry.path)
    }
    for (let i = 0; i < this._drives.length; i++) {
      const entry = await this._drives.get(i)
      if (entry.removed || removed.has(entry.path)) continue
      if (entry.type === 'local') this._registerLocal(entry.path)
    }

    this.swarm.on('connection', (stream) => {
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
      })
    })

    await this._joinTopic(this.key, true)
    console.log('key:', this.key.toString('hex'))

    this._joins = this.store.get({ name: 'joins', valueEncoding: 'json' })
    await this._joins.ready()

    for (let i = 0; i < this._joins.length; i++) {
      const entry = await this._joins.get(i)
      const key = Buffer.from(entry.key, 'hex')
      this._joinTopic(key)
      console.log('rejoining:', entry.key)
    }

    this.stream.push({ ready: true })
  }

  async _joinTopic(key, server) {
    const hex = key.toString('hex')
    if (this._topics.has(hex)) return

    const discovery = this.swarm.join(key, { server: !!server, client: !server })

    if (server) {
      await discovery.flushed()
    } else {
      await this.swarm.flush()
    }

    this._topics.set(hex, true)
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

  async addDrive(drivePath) {
    if (this._driveMap.has(drivePath)) return

    // Validate path is readable
    const test = new Localdrive(drivePath)
    let valid = false
    try {
      for await (const name of test.readdir('/')) {
        valid = true
        break
      }
      if (!valid) {
        // Empty dir is still valid, check if path exists
        const fs = require('fs')
        fs.accessSync(drivePath)
        valid = true
      }
    } catch (err) {
      console.log('cannot access drive path:', drivePath, err.message)
      this.stream.push({ error: true, message: 'Cannot access: ' + drivePath })
      return
    }

    await this._drives.append({ type: 'local', path: drivePath })

    this._registerLocal(drivePath)

    this.stream.push({ drivesChanged: true })
  }

  async removeDrive(drivePath) {
    const local = this._driveMap.get(drivePath)
    if (!local) return

    this.drive.unregister(local)
    this._driveMap.delete(drivePath)
    await local.close()

    // Rebuild the drives core without this entry
    // For now just mark as removed — full compaction later with hyperdb
    await this._drives.append({ type: 'local', path: drivePath, removed: true })

    this.stream.push({ drivesChanged: true })
  }

  async listDrives() {
    return [...this._driveMap.keys()]
  }

  async preview(path) {
    if (this._serve) this._serve.server.close()
    this._serve = await serve(this.drive, path)
    const base = `http://localhost:${this._serve.port}`
    const url = base + path
    const dlUrl = base + this._serve.dlPrefix + path
    console.log('serving', url)
    this.stream.push({ serving: true, url, dlUrl, path })
  }

  async _close() {
    if (this._serve) this._serve.server.close()
    if (this._joins) await this._joins.close()
    await this.swarm.destroy()
    await this.store.close()
  }
}
