const { Cell } = require('cellery')
const { Readable } = require('streamx')
const FileTree = require('../cells/FileTree')

const html = String.raw

module.exports = class MainView extends Cell {
  constructor(opts = {}) {
    super()

    this.app = opts.app
    this.tree = null

    // --- Join button ---
    this.sub({ event: 'submit' }, (_, { data }) => {
      console.log('data!', data)
      if (data.id === 'join-input') {
        const { key } = data.value
        console.log(key, key?.length)
        if (key && key.length === 64) this.app.joinKey(key)
      }
    })

    // --- Preview ---
    this.sub({ serving: true }, (_, data) => {
      const ext = data.path?.split('.').pop().toLowerCase()

      this.cellery.pub({ event: 'render', content: data.path, id: 'content-header' })

      if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) {
        this.cellery.pub({ event: 'render', content: html`<video controls autoplay src="${data.url}"></video>`, id: 'preview' })
      } else if (['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) {
        this.cellery.pub({ event: 'render', content: html`<audio controls autoplay src="${data.url}"></audio>`, id: 'preview' })
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        this.cellery.pub({ event: 'render', content: html`<img src="${data.url}" />`, id: 'preview' })
      } else {
        this._previewText(data)
      }
    })

    // --- Ready ---
    this.sub({ ready: true }, () => {
      console.log('READY')
      this.render()
      this.setup()
    })
  }

  render() {
    this.cellery.pub({
      event: 'render',
      content: html`${STYLE}${LAYOUT}`,
      id: 'root'
    })
  }

  async _previewText(data) {
    try {
      const head = await collectStream(this.app.drive.createReadStream(data.path, { length: 8192 }))

      if (!head || head.length === 0) {
        this.cellery.pub({ event: 'render', content: html`<span class="preview-empty">Empty file</span>`, id: 'preview' })
        return
      }

      if (!isValidUTF8(head)) {
        this.cellery.pub({ event: 'render', content: html`<span class="preview-empty">Binary file</span>`, id: 'preview' })
        return
      }

      const buf = await this.app.drive.get(data.path)
      const text = buf.toString('utf-8')
      this.cellery.pub({ event: 'render', content: html`<pre class="preview-text">${esc(text)}</pre>`, id: 'preview' })
    } catch {
      this.cellery.pub({ event: 'render', content: html`<span class="preview-empty">Cannot read file</span>`, id: 'preview' })
    }
  }

  setup() {
    this.cellery.pub({
      event: 'render',
      content: this.app.key.toString('hex'),
      id: 'my-key'
    })

    this.cellery.pub({
      event: 'register',
      id: 'join-btn',
      targets: ['click']
    })

    this.cellery.pub({
      event: 'register',
      id: 'join-input',
      targets: ['submit']
    })

    this.tree = new FileTree({
      drive: this.app.drive,
      onclick: (path, type) => {
        if (type === 'file') this.app.preview(path)
      }
    })
    this.tree.render({ id: 'files' })
  }

  updatePeers(count) {
    const dot =
      count > 0 ? '<div class="status-dot online"></div>' : '<div class="status-dot"></div>'

    this.cellery.pub({
      event: 'render',
      content: `${dot}<span>${count} peer${count !== 1 ? 's' : ''}</span>`,
      id: 'peer-count'
    })

    this.cellery.pub({
      event: 'render',
      content: count > 0 ? 'Connected' : 'Waiting',
      id: 'status-label'
    })
  }

  async refreshTree() {
    if (this.tree) await this.tree.refresh()
  }
}

async function collectStream(rs) {
  const chunks = []
  for await (const chunk of rs) chunks.push(chunk)
  return chunks.length === 0 ? null : Buffer.concat(chunks)
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isValidUTF8(buf) {
  // Check first 8KB for null bytes or invalid UTF-8 sequences
  const check = buf.subarray(0, 8192)
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return false
  }
  try {
    const str = buf.toString('utf-8')
    // If decoding produces replacement chars for a clean buffer, it's not valid
    return !str.includes('\ufffd')
  } catch {
    return false
  }
}

const LAYOUT = html`
  <div id="app">
    <div id="sidebar">
      <div id="sidebar-header">
        <div id="app-title">Ghost Drive</div>
      </div>

      <div id="connection">
        <div class="conn-label">Your Key</div>
        <div id="my-key" class="conn-key">&mdash;</div>
        <div class="conn-divider"><span>or join</span></div>
        <form class="conn-input-row" id="join-input">
          <input name="key" class="conn-input" type="text" placeholder="Paste a key..." />
          <button class="conn-btn" type="submit">Join</button>
        </form>
      </div>

      <div id="status">
        <div id="peer-count">
          <div class="status-dot"></div>
          <span>0 peers</span>
        </div>
        <div id="status-label">Waiting</div>
      </div>

      <div id="files"></div>
    </div>

    <div id="content">
      <div id="content-header"></div>
      <div id="preview">
        <span class="preview-empty">Select a file</span>
      </div>
    </div>
  </div>
`

const STYLE = html`<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');

  :root {
    --bg-primary: #0a0a0c;
    --bg-secondary: #111116;
    --bg-tertiary: #1a1a22;
    --bg-hover: #22222e;
    --accent: #c8a84e;
    --accent-dim: #8a7235;
    --accent-glow: rgba(200, 168, 78, 0.15);
    --text-primary: #d4d4d8;
    --text-secondary: #71717a;
    --text-muted: #3f3f46;
    --border: #27272e;
    --border-accent: #3d3520;
    --success: #22c55e;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Rajdhani', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    height: 100vh;
    overflow: hidden;
  }

  #app {
    display: flex;
    height: 100vh;
    width: 100vw;
    flex-flow: row nowrap;
    max-width: none !important;
  }

  /* --- Sidebar --- */

  #sidebar {
    width: 320px;
    min-width: 320px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #sidebar-header {
    padding: 20px 16px 16px;
    border-bottom: 1px solid var(--border);
    height: 56px;
  }

  #app-title {
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 4px;
    color: var(--accent);
  }

  /* --- Connection --- */

  #connection {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
  }

  .conn-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  .conn-key {
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    color: var(--accent);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-accent);
    border-radius: 2px;
    padding: 8px 10px;
    word-break: break-all;
    line-height: 1.5;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .conn-key:hover {
    border-color: var(--accent-dim);
  }

  .conn-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;
  }

  .conn-divider::before,
  .conn-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .conn-divider span {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 2px;
  }

  .conn-input-row {
    display: flex;
    gap: 8px;
  }

  .conn-input {
    flex: 1;
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.2s;
  }

  .conn-input:focus {
    border-color: var(--accent-dim);
  }
  .conn-input::placeholder {
    color: var(--text-muted);
  }

  .conn-btn {
    font-family: 'Rajdhani', sans-serif;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--bg-primary);
    background: var(--accent);
    border: none;
    border-radius: 2px;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .conn-btn:hover {
    background: #d4b45c;
  }
  .conn-btn:active {
    background: var(--accent-dim);
  }

  /* --- Status --- */

  #status {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  #peer-count {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .status-dot.online {
    background: var(--success);
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  }

  #status-label {
    color: var(--text-muted);
  }

  /* --- Files --- */

  #files {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  #files::-webkit-scrollbar {
    width: 4px;
  }
  #files::-webkit-scrollbar-track {
    background: transparent;
  }
  #files::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 2px;
  }

  /* --- Content --- */

  #content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #content-header {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    color: var(--text-secondary);
    letter-spacing: 1px;
    background: var(--bg-secondary);
    height: 56px;
    display: flex;
    align-items: center;
    width: 100%;
  }

  #preview {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    overflow: hidden;
  }

  #preview video,
  #preview audio,
  #preview img {
    max-width: 100%;
    max-height: 100%;
  }

  #preview video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  #preview img {
    object-fit: contain;
  }

  .preview-empty {
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    color: var(--text-muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .preview-text {
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-primary);
    background: var(--bg-primary);
    padding: 20px;
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    tab-size: 4;
  }

  .preview-text::-webkit-scrollbar {
    width: 6px;
  }
  .preview-text::-webkit-scrollbar-track {
    background: transparent;
  }
  .preview-text::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
</style>`
