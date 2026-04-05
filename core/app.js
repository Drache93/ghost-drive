const ReadyResource = require('ready-resource')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const { Transform } = require('streamx')
const Console = require('bare-console')
const dir = require('bare-storage')
const path = require('path')
const { homedir } = require('os')

const Localdrive = require('localdrive')
const DistributedDrive = require('distributed-drive')

const serve = require('../lib/serve')

const console = new Console()

module.exports = class App extends ReadyResource {
  constructor() {
    super()

    // this.dir = '/Users/odinsson/Dev/pear/ghost-drive/fixtures'
    this.dir = homedir()
    this.store = new Corestore(path.join(dir.persistent(), '.ghost-drive', 'corestore'))
    this.swarm = new Hyperswarm()
    this.local = new Localdrive(this.dir)
    this.drive = null
    this.view = null

    this.key = null
    this.peers = 0
    this._joins = null
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

    this.drive = new DistributedDrive(this.local)

    this.swarm.on('connection', (stream) => {
      this.peers++
      this.drive.addPeer(stream)
      console.log(`peer connected (${this.peers} online)`)

      if (this.view) {
        console.log('updating')
        this.view.updatePeers(this.peers)
        this.view.refreshTree()
      }

      stream.once('close', () => {
        this.peers--
        console.log(`peer disconnected (${this.peers} online)`)
        if (this.view) this.view.updatePeers(this.peers)
      })
    })

    this.swarm.join(this.key)
    console.log('key:', this.key.toString('hex'))

    this._joins = this.store.get({ name: 'joins', valueEncoding: 'json' })
    await this._joins.ready()

    for (let i = 0; i < this._joins.length; i++) {
      const entry = await this._joins.get(i)
      const key = Buffer.from(entry.key, 'hex')
      this.swarm.join(key)
      console.log('rejoining:', entry.key)
    }

    this.stream.push({ ready: true })
  }

  async joinKey(hex) {
    console.log('joining swarm!')
    const key = Buffer.from(hex, 'hex')
    if (key.length !== 32) return

    // Check if already persisted
    for (let i = 0; i < this._joins.length; i++) {
      const entry = await this._joins.get(i)
      if (entry.key === hex) {
        this.swarm.join(key)
        console.log('already joined:', hex)
        return
      }
    }

    await this._joins.append({ key: hex })
    this.swarm.join(key)
    console.log('joining:', hex)
  }

  async preview(path) {
    if (this._serve) this._serve.server.close()
    this._serve = await serve(this.drive, path)
    const url = `http://localhost:${this._serve.port}${path}`
    console.log('serving', url)
    this.stream.push({ serving: true, url, path })
  }

  async _close() {
    if (this._serve) this._serve.server.close()
    if (this._joins) await this._joins.close()
    await this.swarm.destroy()
    await this.store.close()
  }
}
