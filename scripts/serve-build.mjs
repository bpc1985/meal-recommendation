import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Chạy bản build production (`apps/web/dist`) bằng Node thuần — dùng cho đo hiệu
 * năng và cho Docker image. Vite dev mang theo HMR client nên mọi số đo LCP ở đó
 * đều sai; script này phục vụ đúng thứ người dùng tải.
 *
 *   pnpm --filter @mam/web build
 *   PORT=3002 node scripts/serve-build.mjs
 *
 * File tĩnh trong `dist/client` được trả trực tiếp; mọi request còn lại (SSR, server
 * function, /api/*) đi qua `fetch` handler của TanStack Start.
 */
const PORT = Number(process.env.PORT ?? 3002)
const HOST = process.env.HOST ?? '127.0.0.1'
const clientDir = fileURLToPath(new URL('../apps/web/dist/client/', import.meta.url))

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const { default: serverEntry } = await import('../apps/web/dist/server/server.js')

async function readStatic(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
  const full = join(clientDir, relative)

  // Chặn `..` thoát khỏi thư mục build.
  if (full !== clientDir.replace(/[/\\]$/, '') && !full.startsWith(clientDir)) return null

  try {
    const info = await stat(full)
    if (!info.isFile()) return null

    return {
      body: await readFile(full),
      type: CONTENT_TYPES[extname(full)] ?? 'application/octet-stream',
      // Tên file có hash nội dung → cache vĩnh viễn; favicon thì ngắn hạn.
      cache: relative.startsWith('assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
    }
  } catch {
    return null
  }
}

async function readBody(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${PORT}`}`)

  try {
    const file = await readStatic(url.pathname)

    if (file) {
      res.writeHead(200, {
        'content-type': file.type,
        'cache-control': file.cache,
        'content-length': file.body.byteLength,
      })
      res.end(req.method === 'HEAD' ? undefined : file.body)
      return
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...(hasBody ? { body: await readBody(req) } : {}),
    })

    const response = await serverEntry.fetch(request)
    const headers = Object.fromEntries(response.headers)
    res.writeHead(response.status, headers)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error('request failed', req.method, req.url, error)
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Internal Server Error')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`serving apps/web/dist on http://${HOST}:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
