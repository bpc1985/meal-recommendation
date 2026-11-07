import { chromium } from 'playwright'

/**
 * Checkpoint T19 — đo hiệu năng thật trên **bản build production**.
 *
 * Dev server của Vite chèn HMR client + module không bundle nên LCP ở đó không
 * đại diện cho người dùng. Script này cần một server chạy `dist/`:
 *
 *   pnpm --filter @mam/web build
 *   node scripts/serve-build.mjs          # http://localhost:3002
 *   BASE_URL=http://localhost:3002 node scripts/checkpoint-perf.mjs
 *
 * Mỗi trang đo 3 lần trên Slow 4G + CPU 4x, lấy trung vị, và ghi lại LCP/CLS.
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3002'
const RUNS = Number(process.env.RUNS ?? 3)
// Ngân sách theo Core Web Vitals "good" (web.dev): LCP ≤ 2500ms, CLS ≤ 0.1.
const LCP_BUDGET_MS = Number(process.env.LCP_BUDGET_MS ?? 2500)
const CLS_BUDGET = Number(process.env.CLS_BUDGET ?? 0.1)

const browser = await chromium.launch({ channel: 'chrome' })
const failures = []

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function check(label, passed, detail = '') {
  const line = `${passed ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!passed) failures.push(line)
}

async function measure(path) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    colorScheme: 'light',
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)

  const network = { requests: 0, bytes: 0, hosts: new Set() }
  page.on('request', (request) => {
    network.requests += 1
    network.hosts.add(new URL(request.url()).host)
  })
  page.on('response', async (response) => {
    const length = Number(response.headers()['content-length'] ?? 0)
    network.bytes += Number.isFinite(length) ? length : 0
  })

  await page.addInitScript(() => {
    const state = { lcp: 0, cls: 0, fcp: 0 }
    window.__perf = state

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') state.fcp = entry.startTime
      }
    }).observe({ type: 'paint', buffered: true })

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcp = entry.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) state.cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

  // Giả lập 4G chậm + CPU yếu: điều kiện mà font/CLS thường lộ vấn đề.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.goto(`${baseURL}${path}`, { waitUntil: 'load', timeout: 60_000 })
  // LCP/CLS chỉ chốt sau khi trang ổn định (font swap, ảnh, layout muộn).
  await page.waitForTimeout(3_000)

  const result = await page.evaluate(() => ({
    lcp: window.__perf?.lcp ?? 0,
    cls: window.__perf?.cls ?? 0,
    fcp: window.__perf?.fcp ?? 0,
    fontStatus: document.fonts.status,
    fontCount: [...document.fonts].filter((face) => face.status === 'loaded').length,
    hosts: [
      ...new Set(performance.getEntriesByType('resource').map((entry) => new URL(entry.name).host)),
    ],
  }))

  await context.close()

  return { ...result, requests: network.requests }
}

const pages = [
  ['/', 'home'],
  ['/recommend', 'recommend'],
]

for (const [path, label] of pages) {
  const runs = []
  for (let index = 0; index < RUNS; index += 1) runs.push(await measure(path))

  const lcp = median(runs.map((run) => run.lcp))
  const cls = median(runs.map((run) => run.cls))
  const fcp = median(runs.map((run) => run.fcp))
  const requests = median(runs.map((run) => run.requests))
  const hosts = [...new Set(runs.flatMap((run) => run.hosts))]
  const detail = `LCP ${Math.round(lcp)}ms, FCP ${Math.round(fcp)}ms, CLS ${cls.toFixed(4)} (${runs
    .map((run) => `${Math.round(run.lcp)}/${run.cls.toFixed(3)}`)
    .join(', ')})`

  check(`${label}: LCP ≤ ${LCP_BUDGET_MS}ms`, lcp <= LCP_BUDGET_MS, detail)
  check(`${label}: CLS ≤ ${CLS_BUDGET}`, cls <= CLS_BUDGET, detail)
  console.log(
    `METRIC ${label} lcp_ms=${Math.round(lcp)} fcp_ms=${Math.round(fcp)} cls=${cls.toFixed(
      4,
    )} requests=${requests} fonts_loaded=${runs[0].fontCount} hosts=${hosts.join(',')}`,
  )
  check(`${label}: no third-party origins`, hosts.length === 1, hosts.join(', '))
}

console.log(`\nFAILURES: ${failures.length}`)
await browser.close()

if (failures.length > 0) process.exitCode = 1
