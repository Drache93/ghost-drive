const { Cell } = require('cellery')
const HyperDHTAddress = require('hyperdht-address')

const DirView = require('../cells/DirView')

const html = String.raw

module.exports = class MainView extends Cell {
  constructor(opts = {}) {
    super()

    this.app = opts.app
    this.pear = opts.pear
    this.dir = null
    this._driveIds = []
    this._currentPath = null
    this._previewing = false
    this._driveListTimer = null

    this.pear.updater.on('updating', (e) => {
      console.log('updating!', e)
    })
    this.pear.updater.on('updated', (e) => {
      console.log('updated!', e)
    })

    // --- Forms ---
    this.sub({ event: 'submit' }, (_, { data }) => {
      if (data.id === 'join-input') {
        const { key } = data.value
        if (key && key.length >= 64) this.app.joinKey(key)
      } else if (data.id === 'add-drive-form') {
        const drivePath = data.value?.path?.trim()
        if (drivePath) this.app.addDrive(drivePath)
      }
    })

    // --- Drives changed ---
    this.sub({ drivesChanged: true }, () => {
      this._renderDriveList()
    })

    // --- Actions ---
    this.sub({ event: 'click' }, (_, { data }) => {
      if (data.id === 'cache-btn') this._cacheCurrentFile()
      else if (data.id === 'clear-cache-btn') this._clearCache()
      else if (data.id === 'back-btn') this._closePreview()
      else if (data.id === 'copy-key-btn') this._copyKey()
      else if (data.id?.startsWith('bc-')) this._onBreadcrumb(data.id)
      else if (data.id?.startsWith('rm-drive-')) {
        const idx = parseInt(data.id.replace('rm-drive-', ''), 10)
        const driveId = this._driveIds[idx]
        if (driveId) this.app.removeDrive(driveId)
      } else if (data.id?.startsWith('rm-peer-')) {
        const idx = parseInt(data.id.replace('rm-peer-', ''), 10)
        const peerId = this._peerIds[idx]
        if (peerId) this.app.removePeer(peerId)
      }
    })

    // --- Preview ---
    this.sub({ serving: true }, async (_, data) => {
      this._previewing = true
      this._currentPath = data.path
      const ext = data.path?.split('.').pop().toLowerCase()

      const isCached = !!(await this.app.cache.get(data.path))

      // Header: back + path + cache
      const cacheBtn = isCached
        ? html`<span class="toolbar-badge cached">cached</span>`
        : html`<span id="cache-btn" class="toolbar-btn" title="Cache to local drive"
            >${CACHE_ICON}</span
          >`
      const backBtn = html`<span id="back-btn" class="toolbar-btn" title="Back">${BACK_ICON}</span>`
      this.cellery.pub({
        event: 'render',
        content: html`${backBtn}<span class="header-path">${esc(data.path)}</span>${cacheBtn}`,
        id: 'toolbar-content'
      })
      if (!isCached) this.cellery.pub({ event: 'register', id: 'cache-btn', targets: ['click'] })
      this.cellery.pub({ event: 'register', id: 'back-btn', targets: ['click'] })

      // Show preview panel
      this.cellery.pub({
        event: 'render',
        content: '',
        id: 'main-pane'
      })

      if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) {
        this.cellery.pub({
          event: 'render',
          content: html`<div id="preview" class="preview-media">
            <video controls autoplay allowfullscreen src="${data.url}"></video>
          </div>`,
          id: 'main-pane'
        })
      } else if (['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) {
        this.cellery.pub({
          event: 'render',
          content: html`<div id="preview" class="preview-media">
            <audio controls autoplay src="${data.url}"></audio>
          </div>`,
          id: 'main-pane'
        })
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        this.cellery.pub({
          event: 'render',
          content: html`<div id="preview" class="preview-media"><img src="${data.url}" /></div>`,
          id: 'main-pane'
        })
      } else {
        this.cellery.pub({
          event: 'render',
          content: html`<div id="preview" class="preview-media">${LOADER}</div>`,
          id: 'main-pane'
        })
        this._previewText(data)
      }
    })

    // --- Status messages ---
    this.sub({ status: true }, (_, data) => {
      this.cellery.pub({
        event: 'render',
        content: html`<span class="sb-status-msg">${data.status}</span>`,
        id: 'status-msg'
      })
    })

    // --- Errors ---
    this.sub({ error: true }, (_, data) => {
      this.cellery.pub({
        event: 'render',
        content: html`<span class="drives-error">${data.message}</span>`,
        id: 'status-msg'
      })
    })

    // --- Ready ---
    this.sub({ ready: true }, () => {
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

  setup() {
    const topic = HyperDHTAddress.encode(this.app.key, this.app.swarm.server.relayAddresses)
    const hex = topic.toString('hex')

    this.cellery.pub({
      event: 'render',
      content: html`<span
        onclick="navigator.clipboard.writeText('${hex}').then(()=>{var s=document.getElementById('copy-key-btn');s.textContent='Copied!';setTimeout(()=>{s.textContent='Copy'},1500)})"
        >${hex}</span
      >`,
      id: 'my-key'
    })
    this.cellery.pub({ event: 'register', id: 'join-input', targets: ['submit'] })
    this.cellery.pub({ event: 'register', id: 'add-drive-form', targets: ['submit'] })
    this.cellery.pub({ event: 'register', id: 'clear-cache-btn', targets: ['click'] })
    this.cellery.pub({ event: 'register', id: 'copy-key-btn', targets: ['click'] })

    this.dir = new DirView({
      drive: this.app.drive,
      cache: this.app.cache,
      id: 'main-pane',
      onfile: (path, name) => {
        this.cellery.pub({
          event: 'render',
          content: html`<script>
              document.getElementById('sidebar-toggle').checked = false
            </script>
            <div id="preview" class="preview-media">${LOADER}</div>`,
          id: 'main-pane'
        })
        this.app.preview(path)
      },
      onnavigate: (dir) => {
        this._previewing = false
        this._renderBreadcrumbs(dir)
      }
    })

    this._renderBreadcrumbs('/')
    this._renderDriveList()
  }

  _renderBreadcrumbs(dir) {
    const parts = dir === '/' ? [] : dir.split('/').filter(Boolean)
    let crumbs = html`<span id="bc-root" class="bc-item bc-link">Ghost Drive</span>`

    let path = ''
    for (let i = 0; i < parts.length; i++) {
      path += '/' + parts[i]
      const id = `bc-${i}`
      const isLast = i === parts.length - 1
      crumbs += html`<span class="bc-sep">/</span>`
      if (isLast) {
        crumbs += html`<span class="bc-item bc-current">${esc(parts[i])}</span>`
      } else {
        crumbs += html`<span id="${id}" class="bc-item bc-link">${esc(parts[i])}</span>`
      }
    }

    this.cellery.pub({ event: 'render', content: crumbs, id: 'toolbar-content' })
    this.cellery.pub({ event: 'register', id: 'bc-root', targets: ['click'] })
    for (let i = 0; i < parts.length - 1; i++) {
      this.cellery.pub({ event: 'register', id: `bc-${i}`, targets: ['click'] })
    }

    // Store parts for click resolution
    this._bcParts = parts
  }

  _onBreadcrumb(id) {
    if (id === 'bc-root') {
      this.dir.navigate('/')
      return
    }
    const idx = parseInt(id.replace('bc-', ''), 10)
    const parts = this._bcParts.slice(0, idx + 1)
    this.dir.navigate('/' + parts.join('/'))
  }

  _closePreview() {
    this._previewing = false
    this._currentPath = null
    this._renderBreadcrumbs(this.dir.cwd)
    this.dir.render()
  }

  async _previewText(data) {
    try {
      const head = await collectStream(this.app.drive.createReadStream(data.path, { length: 8192 }))

      if (!head || head.length === 0) {
        this.cellery.pub({
          event: 'render',
          content: html`<div id="preview" class="preview-media">
            <span class="preview-empty">Empty file</span>
          </div>`,
          id: 'main-pane'
        })
        return
      }

      if (!isValidUTF8(head)) {
        this.cellery.pub({
          event: 'render',
          content: html`<div id="preview" class="preview-media">
            <span class="preview-empty">Binary file</span>
          </div>`,
          id: 'main-pane'
        })
        return
      }

      const buf = await this.app.drive.get(data.path)
      const text = buf.toString('utf-8')
      this.cellery.pub({
        event: 'render',
        content: html`<pre class="preview-text">${esc(text)}</pre>`,
        id: 'main-pane'
      })
    } catch {
      this.cellery.pub({
        event: 'render',
        content: html`<div id="preview" class="preview-media">
          <span class="preview-empty">Cannot read file</span>
        </div>`,
        id: 'main-pane'
      })
    }
  }

  async _cacheCurrentFile() {
    if (!this._currentPath) return
    try {
      await this.app.cacheFile(this._currentPath)
      this.cellery.pub({
        event: 'render',
        content: html`<span class="toolbar-badge cached">cached</span>`,
        id: 'cache-btn'
      })
    } catch (e) {
      console.log('failed to cache:', e)
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

  _copyKey() {
    // Handled by inline onclick on #my-key — this is a fallback
    const hex = this.app.key.toString('hex')
    this.cellery.pub({
      event: 'render',
      content: 'Copied!',
      id: 'copy-key-btn'
    })
  }

  _renderDriveList() {
    clearTimeout(this._driveListTimer)
    this._driveListTimer = setTimeout(() => this._renderDriveListNow(), 150)
  }

  async _renderDriveListNow() {
    const drives = await this.app.listDrives()

    let cacheCount = 0
    try {
      for await (const _ of this.app.cache.list('/')) cacheCount++
    } catch {}

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
        let label, iconSvg, tag

        switch (d.type) {
          case 'cache': {
            label = cacheCount > 0 ? `${cacheCount} file${cacheCount !== 1 ? 's' : ''}` : ''
            iconSvg = SIDEBAR_ICONS.local
            tag = 'cache'
            break
          }
          case 'gip-remote': {
            label = d.id.replace('git+pear://', '').split('/').pop() || d.id
            iconSvg = SIDEBAR_ICONS.git
            tag = 'git'
            break
          }
          case 'hyperdrive': {
            label = d.id.slice(0, 6) + '..' + d.id.slice(-4)
            iconSvg = SIDEBAR_ICONS.hyper
            tag = 'hyper'
            break
          }
          default: {
            label = d.id.split('/').pop() || d.id
            iconSvg = SIDEBAR_ICONS.local
            tag = 'local'
            break
          }
        }

        const labelHtml = label ? html`<span class="sb-drive-name">${esc(label)}</span>` : ''
        const rmId = `rm-drive-${rmIdx++}`
        const rmHtml =
          d.type === 'cache'
            ? cacheCount > 0
              ? html`<span id="clear-cache-btn" class="sb-drive-rm" title="Clear cache"
                  >&times;</span
                >`
              : ''
            : html`<span id="${rmId}" class="sb-drive-rm">&times;</span>`

        items += html`<div class="sb-drive" title="${esc(d.id)}">
          ${iconSvg} ${labelHtml}
          <span class="sb-drive-tag">${tag}</span>
          ${rmHtml}
        </div>`
      }

      this._peerIds = []
      let peerIdx = 0
      if (remote.length > 0) {
        items += html`<div class="sb-divider"><span>peers</span></div>`
        for (const d of remote) {
          const label = d.id.slice(0, 6) + '..' + d.id.slice(-4)
          const statusCls = d.online ? 'sb-drive-online' : 'sb-drive-offline'
          const statusTag = d.online ? 'online' : 'offline'
          const tagCls = d.online ? 'sb-drive-tag-online' : 'sb-drive-tag-offline'
          let peerRmHtml = ''
          if (d.saved) {
            this._peerIds.push(d.id)
            const rmId = `rm-peer-${peerIdx++}`
            peerRmHtml = html`<span id="${rmId}" class="sb-drive-rm">&times;</span>`
          }
          items += html`<div class="sb-drive sb-drive-peer ${statusCls}" title="${esc(d.id)}">
            ${SIDEBAR_ICONS.peer}
            <span class="sb-drive-name">${esc(label)}</span>
            <span class="sb-drive-tag ${tagCls}">${statusTag}</span>
            ${peerRmHtml}
          </div>`
        }
      }

      this.cellery.pub({ event: 'render', content: items, id: 'drive-list' })
      if (cacheCount > 0) {
        this.cellery.pub({ event: 'register', id: 'clear-cache-btn', targets: ['click'] })
      }
      for (let i = 0; i < local.length; i++) {
        this.cellery.pub({ event: 'register', id: `rm-drive-${i}`, targets: ['click'] })
      }
      for (let i = 0; i < peerIdx; i++) {
        this.cellery.pub({ event: 'register', id: `rm-peer-${i}`, targets: ['click'] })
      }
    }

    // Refresh directory grid
    if (this.dir && !this._previewing) this.dir.render()
  }

  updatePeers(count) {
    const dot =
      count > 0 ? '<div class="status-dot online"></div>' : '<div class="status-dot"></div>'

    this.cellery.pub({
      event: 'render',
      content: `${dot}<span>${count} peer${count !== 1 ? 's' : ''}</span>`,
      id: 'peer-count'
    })

    // Clear status message on peer change
    this.cellery.pub({ event: 'render', content: '', id: 'status-msg' })

    // Warn if previewing and all peers disconnected
    if (this._previewing && count === 0) {
      this.cellery.pub({
        event: 'render',
        content: html`<span class="sb-status-msg" style="color:#ef4444">Peer disconnected</span>`,
        id: 'status-msg'
      })
    }

    this._renderDriveList()
  }

  async refreshTree() {
    if (this.dir && !this._previewing) await this.dir.refresh()
  }
}

// --- Helpers ---

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
  const check = buf.subarray(0, 8192)
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return false
  }
  try {
    const str = buf.toString('utf-8')
    return !str.includes('\ufffd')
  } catch {
    return false
  }
}

// --- Icons ---

const BACK_ICON = html`<svg
  class="toolbar-icon"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
>
  <path d="M10 2L4 8l6 6" />
</svg>`

const CACHE_ICON = html`<svg
  class="toolbar-icon"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
>
  <path d="M8 2v8M4 7l4 4 4-4" />
  <path d="M2 12v2h12v-2" />
</svg>`

const LOADER = html`<div class="preview-loader"><div class="loader-spinner"></div></div>`

const SIDEBAR_ICONS = {
  local: html`<svg
    class="sb-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M2 4h12v8H2z" />
    <circle cx="12" cy="8" r="1" />
  </svg>`,
  hyper: html`<svg
    class="sb-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M8 2L2 8l6 6 6-6z" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>`,
  git: html`<svg
    class="sb-icon"
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
    class="sb-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <circle cx="8" cy="5" r="3" />
    <path d="M3 14c0-3 2-5 5-5s5 2 5 5" />
  </svg>`
}

// --- Layout ---

const LAYOUT = html`
  <div id="app">
    <input type="checkbox" id="sidebar-toggle" />
    <label for="sidebar-toggle" id="sidebar-overlay"></label>

    <div id="sidebar">
      <div id="sidebar-header">
        <div id="app-title">Ghost Drive</div>
        <label for="sidebar-toggle" class="nav-btn sidebar-close">&times;</label>
      </div>

      <div id="sb-status">
        <div id="peer-count">
          <div class="status-dot"></div>
          <span>0 peers</span>
        </div>
        <div id="status-msg"></div>
      </div>

      <div id="sb-drives">
        <div class="sb-section-label">Drives</div>
        <div id="drive-list"></div>
        <form id="add-drive-form" class="sb-input-row">
          <input
            name="path"
            class="sb-input"
            type="text"
            placeholder="Path, key, or git+pear://..."
          />
          <button class="sb-btn" type="submit">+</button>
        </form>
        <div class="sb-cache-row">
          <span id="clear-cache-btn" class="sb-cache-clear">Clear cache</span>
        </div>
      </div>

      <div class="sb-section-divider"></div>

      <details id="sb-connection">
        <summary class="sb-section-label sb-toggle">Connection</summary>
        <div class="sb-conn-body">
          <div class="sb-conn-sublabel">Your Key</div>
          <div class="sb-conn-key-row">
            <div id="my-key" class="sb-conn-key">&mdash;</div>
            <span id="copy-key-btn" class="sb-copy-btn">Copy</span>
          </div>
          <div class="sb-conn-divider"><span>join peer</span></div>
          <form class="sb-input-row" id="join-input">
            <input name="key" class="sb-input" type="text" placeholder="Paste a key..." />
            <button class="sb-btn" type="submit">Go</button>
          </form>
        </div>
      </details>
    </div>

    <div id="main">
      <div id="toolbar">
        <label for="sidebar-toggle" class="nav-btn sidebar-open">&#9776;</label>
        <div id="toolbar-content"></div>
      </div>
      <div id="main-pane"></div>
    </div>
  </div>
`

// --- Styles ---

const STYLE = html`<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');

  :root {
    --bg-primary: #0a0a0c;
    --bg-secondary: #111116;
    --bg-tertiary: #1a1a22;
    --bg-hover: #22222e;
    --accent: #c8a84e;
    --accent-dim: #a68c42;
    --accent-glow: rgba(200, 168, 78, 0.15);
    --text-primary: #e4e4e8;
    --text-secondary: #9a9aa4;
    --text-muted: #5a5a66;
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
  }

  /* ===== Sidebar ===== */

  #sidebar {
    width: 240px;
    min-width: 240px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    padding-left: env(safe-area-inset-left, 0px);
  }

  #sidebar::-webkit-scrollbar {
    width: 3px;
  }
  #sidebar::-webkit-scrollbar-track {
    background: transparent;
  }
  #sidebar::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 2px;
  }

  #sidebar-header {
    padding: 16px 14px 12px;
    padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  #app-title {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 4px;
    color: var(--accent);
  }

  /* --- Status --- */

  #sb-status {
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    flex-shrink: 0;
    gap: 8px;
  }

  #status-msg {
    flex-shrink: 1;
    min-width: 0;
    text-align: right;
  }

  .sb-status-msg {
    color: var(--accent-dim);
    font-size: 9px;
  }

  .drives-error {
    color: #ef4444;
    font-size: 9px;
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

  /* --- Drives section --- */

  #sb-drives {
    padding: 8px 0;
    flex-shrink: 0;
  }

  .sb-section-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-muted);
    padding: 4px 14px;
  }

  .sb-section-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 14px;
  }

  #drive-list {
    padding: 2px 6px;
  }

  .sb-drive {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 4px;
    cursor: default;
    transition: background 0.1s;
  }

  .sb-drive:hover {
    background: var(--bg-hover);
  }

  .sb-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--accent-dim);
  }

  .sb-drive-name {
    font-family: 'Rajdhani', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .sb-drive-tag {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    color: var(--text-muted);
    letter-spacing: 1px;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .sb-drive-tag-online {
    color: var(--success);
  }

  .sb-drive-tag-offline {
    color: #ef4444;
  }

  .sb-drive-online .sb-icon {
    color: var(--success);
    opacity: 0.7;
  }

  .sb-drive-offline .sb-icon {
    color: #ef4444;
    opacity: 0.4;
  }

  .sb-drive-online .sb-drive-name {
    color: var(--text-secondary);
  }

  .sb-drive-offline .sb-drive-name {
    color: var(--text-muted);
  }

  .sb-drive-rm {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    opacity: 0;
    transition:
      opacity 0.1s,
      color 0.1s;
  }

  .sb-drive:hover .sb-drive-rm {
    opacity: 1;
  }
  .sb-drive-rm:hover {
    color: #ef4444;
  }

  .sb-divider {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 8px;
  }

  .sb-divider::before,
  .sb-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .sb-divider span {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    color: var(--text-muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .sb-input-row {
    display: flex;
    gap: 6px;
    padding: 6px 8px;
  }

  .sb-input {
    flex: 1;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 6px 8px;
    outline: none;
    min-width: 0;
  }

  .sb-input:focus {
    border-color: var(--accent-dim);
  }
  .sb-input::placeholder {
    color: var(--text-muted);
  }

  .sb-btn {
    font-family: 'Rajdhani', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: var(--bg-primary);
    background: var(--accent);
    border: none;
    border-radius: 3px;
    padding: 6px 10px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .sb-btn:hover {
    background: #d4b45c;
  }

  .sb-cache-row {
    padding: 2px 8px 4px;
    display: flex;
    justify-content: flex-end;
  }

  .sb-cache-clear {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: var(--text-muted);
    letter-spacing: 1px;
    cursor: pointer;
    transition: color 0.15s;
  }

  .sb-cache-clear:hover {
    color: #ef4444;
  }

  /* --- Connection --- */

  #sb-connection {
    padding: 0;
    flex-shrink: 0;
  }

  .sb-toggle {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .sb-toggle::-webkit-details-marker {
    display: none;
  }

  .sb-toggle::before {
    content: '▶';
    font-size: 7px;
    color: var(--text-muted);
    transition: transform 0.15s;
  }

  details[open] > .sb-toggle::before {
    transform: rotate(90deg);
  }

  .sb-conn-body {
    padding: 4px 14px 12px;
  }

  .sb-conn-sublabel {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .sb-conn-key-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .sb-conn-key {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: var(--accent);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 6px 8px;
    word-break: break-all;
    line-height: 1.5;
    flex: 1;
  }

  .sb-copy-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: var(--text-muted);
    letter-spacing: 1px;
    cursor: pointer;
    padding: 6px 4px;
    flex-shrink: 0;
    transition: color 0.15s;
  }

  .sb-copy-btn:hover {
    color: var(--accent);
  }

  .sb-conn-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
  }

  .sb-conn-divider::before,
  .sb-conn-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .sb-conn-divider span {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: var(--text-muted);
    letter-spacing: 1px;
  }

  .drives-empty {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: var(--text-muted);
    letter-spacing: 1px;
    padding: 4px 8px;
  }

  /* ===== Main pane ===== */

  #main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  #toolbar {
    padding: 0 16px;
    padding-top: env(safe-area-inset-top, 0px);
    border-bottom: 1px solid var(--border);
    height: calc(env(safe-area-inset-top, 0px) + 44px);
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  #toolbar-content {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .toolbar-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      color 0.15s,
      background 0.15s;
  }

  .toolbar-btn:hover {
    color: var(--accent);
    background: var(--bg-hover);
  }

  .toolbar-badge.cached {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--accent);
    background: rgba(200, 168, 78, 0.12);
    padding: 2px 8px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .toolbar-icon {
    width: 14px;
    height: 14px;
  }

  /* Breadcrumbs */

  .bc-item {
    white-space: nowrap;
  }

  .bc-link {
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.12s;
  }

  .bc-link:hover {
    color: var(--accent);
  }

  .bc-current {
    color: var(--text-primary);
  }

  .bc-sep {
    color: var(--text-muted);
    padding: 0 2px;
  }

  .header-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
  }

  /* Main pane content */

  #main-pane {
    flex: 1;
    overflow: auto;
    padding-right: env(safe-area-inset-right, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  #main-pane::-webkit-scrollbar {
    width: 5px;
  }
  #main-pane::-webkit-scrollbar-track {
    background: transparent;
  }
  #main-pane::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  /* Preview */

  .preview-media {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    overflow: hidden;
  }

  .preview-media video,
  .preview-media img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .preview-media video {
    background: #000;
  }

  .preview-media audio {
    max-width: 100%;
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
    background: var(--bg-primary) !important;
    padding: 20px;
    margin: 0;
    width: 100%;
    min-height: 100%;
    overflow: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    tab-size: 4;
  }

  .preview-text::-webkit-scrollbar {
    width: 5px;
  }
  .preview-text::-webkit-scrollbar-track {
    background: transparent;
  }
  .preview-text::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
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

  /* ===== Sidebar toggle (mobile) ===== */

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
    font-size: 16px;
    cursor: pointer;
    padding: 4px 6px;
    line-height: 1;
    transition: color 0.15s;
  }

  .nav-btn:hover {
    color: var(--accent);
  }

  .sidebar-close,
  .sidebar-open {
    display: none;
  }

  @media (max-width: 768px), (max-height: 500px) {
    #sidebar {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 100;
      width: 85vw;
      max-width: 280px;
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

    .sb-drive-rm {
      opacity: 1;
    }
  }
</style>`
