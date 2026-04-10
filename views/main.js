const { Cell } = require('cellery')
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

    // --- Cache file + drive actions ---
    this._driveIds = []
    this.sub({ event: 'click' }, (_, { data }) => {
      if (data.id === 'cache-btn') this._cacheCurrentFile()
      else if (data.id === 'clear-cache-btn') this._clearCache()
      else if (data.id?.startsWith('rm-drive-')) {
        const idx = parseInt(data.id.replace('rm-drive-', ''), 10)
        const driveId = this._driveIds[idx]
        if (driveId) this.app.removeDrive(driveId)
      }
    })

    // --- Preview ---
    this.sub({ serving: true }, (_, data) => {
      const ext = data.path?.split('.').pop().toLowerCase()

      // Move tree to sidebar on first file click
      if (!this._treeInSidebar) {
        this._treeInSidebar = true
        this.tree.containerId = 'files'
        this._renderDriveList()
      }

      this._currentPath = data.path

      const cacheBtn = html`<span id="cache-btn" class="dl-btn" title="Cache to local drive"
        >${CACHE_ICON}</span
      >`
      this.cellery.pub({
        event: 'render',
        content: html` <span class="header-path">${data.path}</span>${cacheBtn} `,
        id: 'content-header-text'
      })
      this.cellery.pub({ event: 'register', id: 'cache-btn', targets: ['click'] })

      if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) {
        this.cellery.pub({
          event: 'render',
          content: html`<video controls autoplay src="${data.url}"></video>`,
          id: 'preview'
        })
      } else if (['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) {
        this.cellery.pub({
          event: 'render',
          content: html`<audio controls autoplay src="${data.url}"></audio>`,
          id: 'preview'
        })
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        this.cellery.pub({
          event: 'render',
          content: html`<img src="${data.url}" />`,
          id: 'preview'
        })
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
        this.cellery.pub({
          event: 'render',
          content: html`<span class="preview-empty">Empty file</span>`,
          id: 'preview'
        })
        return
      }

      if (!isValidUTF8(head)) {
        this.cellery.pub({
          event: 'render',
          content: html`<span class="preview-empty">Binary file</span>`,
          id: 'preview'
        })
        return
      }

      const buf = await this.app.drive.get(data.path)
      const text = buf.toString('utf-8')
      this.cellery.pub({
        event: 'render',
        content: html`<pre class="preview-text">${esc(text)}</pre>`,
        id: 'preview'
      })
    } catch {
      this.cellery.pub({
        event: 'render',
        content: html`<span class="preview-empty">Cannot read file</span>`,
        id: 'preview'
      })
    }
  }

  async _cacheCurrentFile() {
    if (!this._currentPath) return
    try {
      await this.app.cacheFile(this._currentPath)
      this.cellery.pub({
        event: 'render',
        content: html`<span class="cache-toast">Cached</span>`,
        id: 'cache-btn'
      })
    } catch (err) {
      this.cellery.pub({
        event: 'render',
        content: html`<span class="cache-toast error">Failed</span>`,
        id: 'cache-btn'
      })
    }
  }

  async _clearCache() {
    try {
      await this.app.clearCache()
      this._renderDriveList()
    } catch (err) {
      console.log('clear cache error:', err.message)
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

    this._treeInSidebar = false
    this._currentPath = null

    this.tree = new FileTree({
      drive: this.app.drive,
      id: 'preview',
      onclick: (path, type) => {
        if (type === 'file') {
          this.cellery.pub({ event: 'render', content: LOADER, id: 'preview' })
          this.cellery.pub({ event: 'render', content: path, id: 'content-header-text' })
          this.app.preview(path)
        }
      }
    })

    this.cellery.pub({ event: 'register', id: 'clear-cache-btn', targets: ['click'] })
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
      this._driveIds = []
      const local = drives.filter((d) => !d.remote)
      const remote = drives.filter((d) => d.remote)
      let items = ''
      let rmIdx = 0

      for (const d of local) {
        this._driveIds.push(d.id)

        let label
        let iconSvg
        let tag

        switch (d.type) {
          case 'gip-remote': {
            label = d.id.replace('git+pear://', '').split('/').pop() || d.id
            iconSvg = DRIVE_ICONS.git
            tag = 'git'
            break
          }
          case 'hyperdrive': {
            label = d.id.slice(0, 8) + '...' + d.id.slice(-8)
            iconSvg = DRIVE_ICONS.hyper
            tag = 'hyper'
            break
          }
          case 'cache': {
            label = ''
            iconSvg = DRIVE_ICONS.local
            tag = 'cache'
            break
          }
          default: {
            label = d.id.split('/').pop() || d.id
            iconSvg = DRIVE_ICONS.local
            tag = 'local'
            break
          }
        }

        const labelHtml = label ? html`<span class="drive-name">${esc(label)}</span>` : ''

        const rmId = `rm-drive-${rmIdx++}`
        const removeHTml =
          tag === 'cache'
            ? ''
            : html`<span id="${rmId}" class="drive-rm" title="Remove drive">&times;</span>`

        items += html`<div class="drive-item" title="${esc(d.id)}">
          ${iconSvg} ${labelHtml}
          <span class="drive-type">${tag}</span>
          ${removeHTml}
        </div>`
      }

      if (remote.length > 0) {
        items += html`<div class="drive-divider"><span>peers</span></div>`
        for (const d of remote) {
          const label = d.id.slice(0, 8) + '...' + d.id.slice(-8)
          items += html`<div class="drive-item drive-item-remote" title="${esc(d.id)}">
            ${DRIVE_ICONS.peer}
            <span class="drive-name">${esc(label)}</span>
            <span class="drive-type">peer</span>
          </div>`
        }
      }

      this.cellery.pub({
        event: 'render',
        content: items,
        id: 'drive-list'
      })
      for (let i = 0; i < local.length; i++) {
        this.cellery.pub({ event: 'register', id: `rm-drive-${i}`, targets: ['click'] })
      }
    }

    if (this.tree) {
      const target = this.tree.containerId
      this.cellery.pub({ event: 'render', id: target, clear: true })
      this.tree.render()
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

    this._renderDriveList()
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

const CACHE_ICON = html`<svg
  class="dl-icon"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
>
  <path d="M8 2v8M4 7l4 4 4-4" />
  <path d="M2 12v2h12v-2" />
</svg>`

const LOADER = html`<div class="preview-loader"><div class="loader-spinner"></div></div>`

const DRIVE_ICONS = {
  local: html`<svg
    class="drive-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M2 4h12v8H2z" />
    <circle cx="12" cy="8" r="1" />
  </svg>`,
  hyper: html`<svg
    class="drive-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M8 2L2 8l6 6 6-6z" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>`,
  git: html`<svg
    class="drive-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <circle cx="4" cy="4" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="4" r="2" />
    <path d="M4 6v2c0 2 2 4 4 4h2" />
    <path d="M6 4h4" />
  </svg>`,
  peer: html`<svg
    class="drive-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <circle cx="8" cy="5" r="3" />
    <path d="M3 14c0-3 2-5 5-5s5 2 5 5" />
  </svg>`
}

const LAYOUT = html`
  <div id="app">
    <input type="checkbox" id="sidebar-toggle" />
    <label for="sidebar-toggle" id="sidebar-overlay"></label>

    <div id="sidebar">
      <div id="sidebar-header">
        <div id="app-title">Ghost Drive</div>
        <label for="sidebar-toggle" class="nav-btn sidebar-close">&times;</label>
      </div>

      <details id="connection">
        <summary class="conn-label">Connection</summary>
        <div class="conn-section">
          <div class="conn-sublabel">Your Key</div>
          <div id="my-key" class="conn-key">&mdash;</div>
          <div class="conn-divider"><span>or join</span></div>
          <form class="conn-input-row" id="join-input">
            <input name="key" class="conn-input" type="text" placeholder="Paste a key..." />
            <button class="conn-btn" type="submit">Join</button>
          </form>
        </div>
      </details>

      <div id="status">
        <div id="peer-count">
          <div class="status-dot"></div>
          <span>0 peers</span>
        </div>
        <div id="status-label">Waiting</div>
      </div>

      <details id="drives">
        <summary class="conn-label">Drives</summary>
        <div class="drives-section">
          <div id="drive-list"></div>
          <form id="add-drive-form" class="conn-input-row" style="padding: 8px 12px;">
            <input
              name="path"
              class="conn-input"
              type="text"
              placeholder="Path, key, or git+pear://..."
            />
            <button class="conn-btn" type="submit">Add</button>
          </form>
          <div class="cache-row">
            <span id="clear-cache-btn" class="cache-clear-btn">Clear cache</span>
          </div>
        </div>
      </details>

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
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
  }

  .conn-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-secondary);
    padding: 10px 16px;
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .conn-label::-webkit-details-marker {
    display: none;
  }

  .conn-label::before {
    content: '▶';
    font-size: 8px;
    color: var(--text-muted);
    transition: transform 0.2s;
  }

  details[open] > .conn-label::before {
    transform: rotate(90deg);
  }

  .conn-section {
    padding: 0 16px 12px;
  }

  .conn-sublabel {
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

  .drives-section {
    padding: 0 0 4px;
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

  .drive-type {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: var(--accent-dim);
    letter-spacing: 1px;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .drive-item-remote {
    opacity: 0.6;
  }

  .drive-item-remote .drive-icon {
    color: var(--success);
  }

  .drive-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0 2px;
  }

  .drive-divider::before,
  .drive-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .drive-divider span {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: var(--text-muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .drive-rm {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    opacity: 0;
    transition:
      opacity 0.15s,
      color 0.15s;
  }

  .drive-item:hover .drive-rm {
    opacity: 1;
  }

  .drive-rm:hover {
    color: #ef4444;
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
    transition:
      color 0.2s,
      background 0.2s;
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

  .cache-toast {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: var(--success);
    letter-spacing: 1px;
  }

  .cache-toast.error {
    color: #ef4444;
  }

  .cache-row {
    padding: 4px 12px 8px;
    display: flex;
    justify-content: flex-end;
  }

  .cache-clear-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 1px;
    cursor: pointer;
    transition: color 0.2s;
  }

  .cache-clear-btn:hover {
    color: #ef4444;
  }

  #preview {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    overflow: auto;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  #preview:has(#ft-root) {
    align-items: flex-start;
    justify-content: flex-start;
  }

  #preview #ft-root {
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    padding: 12px 0;
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
    padding-bottom: env(safe-area-inset-bottom, 0);
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

  .preview-loader {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .loader-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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

    .drive-rm {
      opacity: 1;
    }

    #content-header {
      gap: 10px;
    }
  }
</style>`
