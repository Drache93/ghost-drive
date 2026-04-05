const http = require('http')

module.exports = function serve(drive, sourcePath, opts = {}) {
  const port = opts.port || 0

  const server = http.createServer(async (req, res) => {
    const path = decodeURIComponent(req.url)
    console.log('SOURCE', sourcePath, path)
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
    const range = req.headers.range

    if (range && size) {
      const parts = range.replace('bytes=', '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1
      const length = end - start + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': length,
        'Content-Type': mime
      })

      const buf = await drive.read(path, { start, end })
      if (buf) {
        res.end(buf)
      } else {
        res.end()
      }
    } else {
      const headers = { 'Content-Type': mime }
      if (size) {
        headers['Content-Length'] = size
        headers['Accept-Ranges'] = 'bytes'
      }

      res.writeHead(200, headers)

      const buf = await drive.get(path)
      if (buf) {
        res.end(buf)
      } else {
        res.writeHead(500)
        res.end()
      }
    }
  })

  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address()
      resolve({ server, port: addr.port })
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
