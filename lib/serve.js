const http = require('http')

const CHUNK_SIZE = 1024 * 1024 // 1MB chunks

module.exports = function serve(drive, sourcePath, opts = {}) {
  const port = opts.port || 0
  const dlPrefix = '/__dl'

  const server = http.createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(req.url)

      // Download endpoint — force download headers, strip prefix
      const isDownload = path.startsWith(dlPrefix)
      if (isDownload) path = path.slice(dlPrefix.length)

      if (path !== sourcePath) {
        res.writeHead(404)
        res.end('not found')
        return
      }

      const entry = await drive.entry(path)
      if (!entry) {
        res.writeHead(404)
        res.end('not found')
        return
      }

      const size = entry.value.blob ? entry.value.blob.byteLength : null
      const mime = guessMime(path)
      const filename = path.split('/').pop()

      const range = req.headers.range
      let start = 0
      let end = size ? size - 1 : 0
      let partial = false

      if (range && size) {
        const parts = range.replace('bytes=', '').split('-')
        start = parseInt(parts[0], 10)
        end = parts[1] ? parseInt(parts[1], 10) : size - 1
        partial = true
      }

      const length = end - start + 1
      const headers = { 'Content-Type': mime }

      if (size) {
        headers['Content-Length'] = length
        headers['Accept-Ranges'] = 'bytes'
      }
      if (partial) {
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`
      }
      if (isDownload) {
        headers['Content-Disposition'] = `attachment; filename="${filename}"`
      }

      res.writeHead(partial ? 206 : 200, headers)

      // Stream in chunks to avoid loading entire file into memory
      let offset = start
      while (offset <= end) {
        const chunkEnd = Math.min(offset + CHUNK_SIZE - 1, end)
        const buf = await drive.read(path, { start: offset, end: chunkEnd })

        if (!buf || buf.length === 0) break

        const ok = res.write(buf)
        if (!ok) await new Promise((resolve) => res.once('drain', resolve))

        offset += buf.length
      }

      res.end()
    } catch (err) {
      console.error('serve error:', err.message)
      if (!res.headersSent) {
        res.writeHead(500)
      }
      res.end()
    }
  })

  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address()
      resolve({ server, port: addr.port, dlPrefix })
    })
  })
}

function guessMime(path) {
  const ext = path.split('.').pop().toLowerCase()
  const mimes = {
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    pdf: 'application/pdf',
    txt: 'text/plain',
    html: 'text/html',
    json: 'application/json'
  }
  return mimes[ext] || 'application/octet-stream'
}
