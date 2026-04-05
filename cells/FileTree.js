const { Cell } = require('cellery')

const html = String.raw

module.exports = class FileTree extends Cell {
  constructor(opts = {}) {
    super()

    this.drive = opts.drive || null
    this.root = opts.root || '/'
    this.containerId = opts.id || 'files'
    this.onclick = opts.onclick || null

    this._paths = new Map()
    this._idCounter = 0

    this.sub({ event: 'click' }, (_, { data }) => {
      const hit = this._paths.get(data.id)
      if (!hit) return

      if (hit.type === 'dir') {
        this._toggleDir(hit, data.id)
      } else if (this.onclick) {
        this.onclick(hit.path, hit.type, data)
      }
    })
  }

  async render() {
    this._paths.clear()
    this._idCounter = 0

    this.cellery.pub({
      event: 'render',
      content: html`${STYLE}
        <div id="ft-root"></div>`,
      id: this.containerId
    })

    if (!this.drive) return

    await this._loadDir(this.root, 'ft-root')
  }

  async _loadDir(prefix, parentElId) {
    const dirs = []
    const files = []

    for await (const name of this.drive.readdir(prefix)) {
      if (name.startsWith('.') || name === '$RECYCLE.BIN' || name === 'System Volume Information')
        continue

      const path = prefix === '/' ? '/' + name : prefix + '/' + name
      const isDir = !hasExt(name)

      if (isDir) dirs.push({ name, path })
      else files.push({ name, path })
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))

    for (const { name, path } of dirs) {
      const id = `ft-${this._idCounter++}`
      const childrenId = `ft-ch-${id}`

      this._paths.set(id, { path, type: 'dir', loaded: false })

      this.cellery.pub({
        event: 'render',
        content: html`
          <details class="ft-dir">
            <summary id="${id}" class="ft-row">
              ${ICONS.folder}
              <span class="ft-name">${esc(name)}</span>
            </summary>
            <div id="${childrenId}" class="ft-children"></div>
          </details>
        `,
        id: parentElId,
        insert: 'beforeend'
      })

      this.cellery.pub({ event: 'register', id, targets: ['click'] })
    }

    for (const { name, path } of files) {
      const id = `ft-${this._idCounter++}`

      this._paths.set(id, { path, type: 'file' })

      this.cellery.pub({
        event: 'render',
        content: html`
          <div id="${id}" class="ft-row ft-file">
            ${icon(name)}
            <span class="ft-name">${esc(name)}</span>
          </div>
        `,
        id: parentElId,
        insert: 'beforeend'
      })

      this.cellery.pub({ event: 'register', id, targets: ['click'] })
    }
  }

  async _toggleDir(hit, id) {
    if (hit.loaded) return

    hit.loaded = true
    const childrenId = `ft-ch-${id}`
    await this._loadDir(hit.path, childrenId)
  }

  async refresh() {
    await this.render()
  }
}

function hasExt(name) {
  const i = name.lastIndexOf('.')
  return i > 0 && i < name.length - 1
}

const STYLE = html`<style>
  .ft-row {
    font-family: 'Rajdhani', sans-serif;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-primary, #d4d4d8);
    padding: 4px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition:
      background 0.1s,
      color 0.1s;
    border-left: 2px solid transparent;
  }

  .ft-row:hover {
    background: var(--bg-hover, #22222e);
    color: #fff;
  }

  .ft-active {
    background: var(--accent-glow, rgba(200, 168, 78, 0.15));
    border-left-color: var(--accent, #c8a84e);
    color: var(--accent, #c8a84e);
  }

  .ft-active .ft-icon {
    color: var(--accent, #c8a84e);
    opacity: 1;
  }

  .ft-dir > summary {
    list-style: none;
  }

  .ft-dir > summary::before {
    content: '▸';
    display: inline-block;
    width: 10px;
    font-size: 10px;
    text-align: center;
    color: var(--text-muted, #3f3f46);
    transition: transform 0.15s;
  }

  .ft-dir[open] > summary::before {
    transform: rotate(90deg);
    color: var(--accent-dim, #8a7235);
  }

  .ft-children {
    padding-left: 12px;
    margin-left: 8px;
    border-left: 1px solid var(--border, #27272e);
  }

  .ft-file {
    padding-left: 30px;
  }

  .ft-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--text-secondary, #71717a);
    opacity: 0.7;
  }

  .ft-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
</style>`

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function icon(name) {
  const ext = name.split('.').pop().toLowerCase()

  if (['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext)) return ICONS.video
  if (['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) return ICONS.audio
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return ICONS.image
  if (
    ['js', 'ts', 'mjs', 'cjs', 'json', 'yaml', 'yml', 'html', 'css', 'py', 'go', 'rs'].includes(ext)
  )
    return ICONS.code
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'rtf'].includes(ext)) return ICONS.doc

  return ICONS.file
}

const ICONS = {
  folder: html`<svg
    class="ft-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M2 4h4l2 2h6v7H2V4z" />
  </svg>`,
  file: html`<svg
    class="ft-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M4 2h5l3 3v9H4V2z" />
    <path d="M9 2v3h3" />
  </svg>`,
  video: html`<svg
    class="ft-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <rect x="1" y="3" width="10" height="10" rx="1" />
    <path d="M11 6l4-2v8l-4-2" />
  </svg>`,
  audio: html`<svg
    class="ft-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M6 3v10l5-3V6L6 3z" />
    <path d="M11 6.5c1 .5 1 2.5 0 3" />
  </svg>`,
  image: html`<svg
    class="ft-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <rect x="2" y="2" width="12" height="12" rx="1" />
    <circle cx="5.5" cy="5.5" r="1.5" />
    <path d="M2 11l3-3 2 2 3-3 4 4" />
  </svg>`,
  code: html`<svg
    class="ft-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M5 4L2 8l3 4" />
    <path d="M11 4l3 4-3 4" />
  </svg>`,
  doc: html`<svg
    class="ft-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
  >
    <path d="M4 2h5l3 3v9H4V2z" />
    <path d="M9 2v3h3" />
    <path d="M6 7h4M6 9h4M6 11h2" />
  </svg>`
}
