const { Cell } = require('cellery')
const { Readable } = require('streamx')
const FileTree = require('../cells/FileTree')

const html = String.raw

module.exports = class MainView extends Cell {
  constructor(opts = {}) {
    super()

    this.app = opts.app
    this.tree = null

    // --- Forms ---
    this.sub({ event: 'submit' }, (_, { data }) => {
      if (data.id === 'join-input') {
        const { key } = data.value
        if (key && key.length === 64) this.app.joinKey(key)
      } else if (data.id === 'add-drive-form') {
        const drivePath = data.value?.path?.trim()
        if (drivePath) this.app.addDrive(drivePath)
      }
    })

    // --- Drives changed ---
    this.sub({ drivesChanged: true }, () => {
      this._renderDriveList()
    })

    // --- Preview ---
    this.sub({ serving: true }, (_, data) => {
      const ext = data.path?.split('.').pop().toLowerCase()
      const filename = data.path.split('/').pop()

      const dlLink = html`<a href="${data.dlUrl}" download="${filename}" target="_blank" class="dl-btn" title="Download">${DOWNLOAD_ICON}</a>`
      this.cellery.pub({ event: 'render', content: html`
        <span class="header-path">${data.path}</span>${dlLink}
      `, id: 'content-header-text' })

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

    // --- Errors ---
    this.sub({ error: true }, (_, data) => {
      this.cellery.pub({
        event: 'render',
        content: html`<span class="drives-error">${data.message}</span>`,
        id: 'drive-list'
      })
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

    this.cellery.pub({
      event: 'register',
      id: 'add-drive-form',
      targets: ['submit']
    })

    this.tree = new FileTree({
      drive: this.app.drive,
      onclick: (path, type) => {
        if (type === 'file') this.app.preview(path)
      }
    })

    this._renderDriveList()
  }

  async _renderDriveList() {
    const drives = await this.app.listDrives()

    if (drives.length === 0) {
      this.cellery.pub({
        event: 'render',
        content: html`<span class="drives-empty">No drives added</span>`,
        id: 'drive-list'
      })
    } else {
      let items = ''
      for (const d of drives) {
        const name = d.split('/').pop() || d
        items += html`<div class="drive-item" title="${esc(d)}">
          <svg class="drive-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 4h12v8H2z"/><circle cx="12" cy="8" r="1"/></svg>
          <span class="drive-name">${esc(name)}</span>
          <span class="drive-path">${esc(d)}</span>
        </div>`
      }
      this.cellery.pub({
        event: 'render',
        content: items,
        id: 'drive-list'
      })
    }

    if (this.tree) {
      this.cellery.pub({ event: 'render', id: 'files', clear: true })
      this.tree.render({ id: 'files' })
    }
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

const DOWNLOAD_ICON = html`<svg class="dl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2v8M4 7l4 4 4-4"/><path d="M2 12v2h12v-2"/></svg>`

const LAYOUT = html`
  <div id="app">
    <input type="checkbox" id="sidebar-toggle" />
    <label for="sidebar-toggle" id="sidebar-overlay"></label>

    <div id="sidebar">
      <div id="sidebar-header">
        <div id="app-title">Ghost Drive</div>
        <label for="sidebar-toggle" class="nav-btn sidebar-close">&times;</label>
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

      <div id="drives">
        <div class="drives-header">
          <span class="conn-label">Drives</span>
        </div>
        <div id="drive-list"></div>
        <form id="add-drive-form" class="conn-input-row" style="padding: 8px 12px;">
          <input name="path" class="conn-input" type="text" placeholder="/path/to/folder" />
          <button class="conn-btn" type="submit">Add</button>
        </form>
      </div>

      <div id="files"></div>
    </div>

    <div id="content">
      <div id="content-header">
        <label for="sidebar-toggle" class="nav-btn sidebar-open">&#9776;</label>
        <span id="content-header-text"></span>
      </div>
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
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  /* --- Drives --- */

  #drives {
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
  }

  .drives-header {
    padding: 10px 12px 0;
  }

  #drive-list {
    padding: 4px 12px;
  }

  .drives-empty {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 1px;
  }

  .drives-error {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: #ef4444;
    letter-spacing: 1px;
  }

  .drive-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .drive-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--accent-dim);
  }

  .drive-name {
    font-family: 'Rajdhani', sans-serif;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .drive-path {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
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
    gap: 10px;
  }

  #content-header-text {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .header-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dl-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    color: var(--text-secondary);
    transition: color 0.2s, background 0.2s;
    text-decoration: none;
  }

  .dl-btn:hover {
    color: var(--accent);
    background: var(--bg-hover);
  }

  .dl-icon {
    width: 16px;
    height: 16px;
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

  /* --- Sidebar toggle --- */

  #sidebar-toggle {
    display: none;
  }

  #sidebar-overlay {
    display: none;
  }

  .nav-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
    transition: color 0.2s;
  }

  .nav-btn:hover {
    color: var(--accent);
  }

  .sidebar-close,
  .sidebar-open {
    display: none;
  }

  @media (max-width: 768px) {
    #sidebar {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 100;
      width: 85vw;
      max-width: 320px;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
    }

    #sidebar-toggle:checked ~ #sidebar {
      transform: translateX(0);
    }

    #sidebar-overlay {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 99;
      background: rgba(0, 0, 0, 0.6);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }

    #sidebar-toggle:checked ~ #sidebar-overlay {
      opacity: 1;
      pointer-events: auto;
    }

    .sidebar-close,
    .sidebar-open {
      display: block;
    }

    #content-header {
      gap: 10px;
    }
  }
</style>`
