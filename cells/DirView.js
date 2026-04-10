const { Cell } = require('cellery')

const html = String.raw

module.exports = class DirView extends Cell {
  constructor(opts = {}) {
    super()

    this.drive = opts.drive || null
    this.containerId = opts.id || 'dir-view'
    this.onfile = opts.onfile || null
    this.onnavigate = opts.onnavigate || null

    this._ids = new Map()
    this._idCounter = 0
    this._cwd = '/'
    this._rendering = false

    this.sub({ event: 'click' }, (_, { data }) => {
      const hit = this._ids.get(data.id)
      if (!hit) return

      if (hit.type === 'dir') {
        this.navigate(hit.path)
      } else if (this.onfile) {
        this.onfile(hit.path, hit.name)
      }
    })
  }

  get cwd() {
    return this._cwd
  }

  async navigate(dir) {
    this._cwd = dir
    if (this.onnavigate) this.onnavigate(dir)
    await this.render()
  }

  async render() {
    if (this._rendering) return
    this._rendering = true
    this._ids.clear()
    this._idCounter = 0

    this.cellery.pub({
      event: 'render',
      content: html`${STYLE}<div id="dv-grid" class="dv-grid"></div>`,
      id: this.containerId
    })

    if (!this.drive) {
      this.cellery.pub({
        event: 'render',
        content: html`<div class="dv-empty">No drives added</div>`,
        id: 'dv-grid'
      })
      this._rendering = false
      return
    }

    const dirs = []
    const files = []

    try {
      for await (const name of this.drive.readdir(this._cwd)) {
        if (name.startsWith('.') || name === '$RECYCLE.BIN' || name === 'System Volume Information') {
          continue
        }
        const fullPath = this._cwd === '/' ? '/' + name : this._cwd + '/' + name
        if (hasExt(name)) files.push({ name, path: fullPath })
        else dirs.push({ name, path: fullPath })
      }
    } catch {
      // empty
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))

    if (dirs.length === 0 && files.length === 0) {
      this.cellery.pub({
        event: 'render',
        content: html`<div class="dv-empty">Empty folder</div>`,
        id: 'dv-grid'
      })
      this._rendering = false
      return
    }

    const all = [...dirs.map((d) => ({ ...d, type: 'dir' })), ...files.map((f) => ({ ...f, type: 'file' }))]

    let items = ''
    for (const entry of all) {
      const id = `dv-${this._idCounter++}`
      this._ids.set(id, entry)
      const iconSvg = entry.type === 'dir' ? ICONS.folder : fileIcon(entry.name)
      const cls = entry.type === 'dir' ? 'dv-item dv-item-dir' : 'dv-item dv-item-file'
      items += html`<div id="${id}" class="${cls}">
        <div class="dv-item-icon">${iconSvg}</div>
        <div class="dv-item-name">${esc(entry.name)}</div>
      </div>`
    }

    this.cellery.pub({
      event: 'render',
      content: items,
      id: 'dv-grid'
    })

    for (const id of this._ids.keys()) {
      this.cellery.pub({ event: 'register', id, targets: ['click'] })
    }

    this._rendering = false
  }

  async refresh() {
    await this.render()
  }
}

function hasExt(name) {
  const i = name.lastIndexOf('.')
  return i > 0 && i < name.length - 1
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext)) return ICONS.video
  if (['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) return ICONS.audio
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return ICONS.image
  if (['js', 'ts', 'mjs', 'cjs', 'json', 'yaml', 'yml', 'html', 'css', 'py', 'go', 'rs'].includes(ext)) return ICONS.code
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'rtf'].includes(ext)) return ICONS.doc
  return ICONS.file
}

const STYLE = html`<style>
  .dv-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 4px;
    padding: 16px;
    align-content: start;
    min-height: 100%;
  }

  .dv-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .dv-item:hover {
    background: var(--bg-hover, #22222e);
  }

  .dv-item-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dv-item-icon svg {
    width: 32px;
    height: 32px;
  }

  .dv-item-dir .dv-item-icon svg {
    color: var(--accent, #c8a84e);
    opacity: 0.8;
  }

  .dv-item-file .dv-item-icon svg {
    color: var(--text-secondary, #71717a);
    opacity: 0.6;
  }

  .dv-item-name {
    font-family: 'Rajdhani', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary, #d4d4d8);
    text-align: center;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .dv-item:hover .dv-item-name {
    color: #fff;
  }

  .dv-empty {
    grid-column: 1 / -1;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    color: var(--text-muted, #3f3f46);
    letter-spacing: 2px;
    text-transform: uppercase;
    text-align: center;
    padding: 60px 20px;
  }
</style>`

const ICONS = {
  folder: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8">
    <path d="M1 4h5l1.5 1.5H15v8H1V4z" />
    <path d="M1 5.5h14" opacity="0.3" />
  </svg>`,
  file: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8">
    <path d="M4 1h5l4 4v10H4V1z" />
    <path d="M9 1v4h4" />
  </svg>`,
  video: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8">
    <rect x="1" y="3" width="10" height="10" rx="1.5" />
    <path d="M11 6l4-2v8l-4-2" />
    <path d="M5 6v4l3-2z" fill="currentColor" opacity="0.3" />
  </svg>`,
  audio: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8">
    <path d="M6 2v12" />
    <path d="M6 2l5 2v3l-5 2" />
    <circle cx="4" cy="12" r="2" />
  </svg>`,
  image: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8">
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
    <circle cx="5" cy="5" r="1.5" />
    <path d="M1.5 11l3.5-3.5 2 2 3-3 4.5 4.5" />
  </svg>`,
  code: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8">
    <path d="M4 1h5l4 4v10H4V1z" />
    <path d="M9 1v4h4" />
    <path d="M6 8L4.5 10 6 12" stroke-width="0.7" />
    <path d="M10 8l1.5 2L10 12" stroke-width="0.7" />
  </svg>`,
  doc: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8">
    <path d="M4 1h5l4 4v10H4V1z" />
    <path d="M9 1v4h4" />
    <path d="M6 7h4M6 9h4M6 11h2" stroke-width="0.6" />
  </svg>`
}
