const ReadyResource = require('ready-resource')
const Hyperswarm = require('hyperswarm')
const { Transform } = require('streamx')
const Console = require('bare-console')
const sodium = require('sodium-native')
const { homedir } = require('bare-os')

const Localdrive = require('localdrive')
const DistributedDrive = require('distributed-drive')

const serve = require('../lib/serve')

const console = new Console()

module.exports = class App extends ReadyResource {
  constructor() {
    super()

    this.dir = '/Users/odinsson/Dev/pear/ghost-drive/fixtures'
    // this.dir = homedir()
    this.swarm = new Hyperswarm()
    this.local = new Localdrive(this.dir)
    this.drive = null
    this.view = null

    this.key = randomBytes(32)
    this.peers = 0
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

    this.stream.push({ ready: true })
  }

  joinKey(hex) {
    console.log('joining swarm!')
    const key = Buffer.from(hex, 'hex')
    if (key.length !== 32) return
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
    await this.swarm.destroy()
  }
}

function randomBytes(n) {
  const buf = Buffer.allocUnsafe(n)
  sodium.randombytes_buf(buf)
  return buf
}
