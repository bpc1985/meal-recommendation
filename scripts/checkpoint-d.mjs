import { chromium } from 'playwright'

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'
const out = 'docs/screenshots'
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []

async function open({ width = 1280, height = 960, locale = 'vi', theme = 'light' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme,
  })
  await context.addCookies([
    { name: 'mam_locale', value: locale, url: baseURL },
    { name: 'mam_theme', value: theme, url: baseURL },
  ])
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`)
  })
  return { context, page }
}

const SAMPLE = {
  vi: 'Sinh viên 60k/ngày nên ăn gì?',
  en: 'What should a student eat on 60k a day?',
}

const CLEAR = { vi: 'Xoá hội thoại', en: 'Clear chat' }

async function run(label, options) {
  const { context, page } = await open(options)
  await page.goto(`${baseURL}/chat`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${out}/${label}-empty.png` })

  const started = Date.now()
  await page
    .getByRole('button', { name: SAMPLE[options.locale ?? 'vi'] })
    .first()
    .click()

  await page.waitForFunction(
    () => (document.querySelector('[role="log"]')?.innerText.length ?? 0) > 30,
    undefined,
    { timeout: 20_000 },
  )
  console.log(`--- ${label}: first text after ${Date.now() - started}ms`)
  await page.screenshot({ path: `${out}/${label}-streaming.png` })

  await page.waitForSelector('[role="log"] a[href="/recommend"]', { timeout: 20_000 })
  await page.waitForTimeout(400)
  console.log(`--- ${label}: full answer after ${Date.now() - started}ms`)

  const summary = await page.evaluate(() => {
    const log = document.querySelector('[role="log"]')
    const cards = log?.querySelectorAll('a[href="/recommend"]').length ?? 0
    return { text: log?.innerText ?? '', cards }
  })
  console.log(
    `cards=${summary.cards} overflow=${await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )}`,
  )
  console.log(summary.text.split('\n').slice(0, 8).join(' | '))
  await page.screenshot({ path: `${out}/${label}-final.png` })

  // Guest history survives a reload.
  const before = await page.locator('[role="log"]').innerText()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(
    () => (document.querySelector('[role="log"]')?.innerText.length ?? 0) > 30,
    undefined,
    { timeout: 10_000 },
  )
  const after = await page.locator('[role="log"]').innerText()
  console.log(`history restored: ${after.includes(before.split('\n')[0])}`)

  // Clearing removes both the UI and the localStorage entry.
  await page.getByRole('button', { name: CLEAR[options.locale ?? 'vi'] }).click()
  await page.waitForFunction(() => !document.querySelector('[role="log"] li'))
  await page.waitForFunction(() => localStorage.getItem('mam_chat_history_v1') === null)
  const stored = await page.evaluate(() => localStorage.getItem('mam_chat_history_v1'))
  console.log(`cleared: ${stored === null}`)
  await page.screenshot({ path: `${out}/${label}-cleared.png` })

  await context.close()
}

// Streaming must not be buffered: first byte well before the last one.
{
  const started = Date.now()
  const response = await fetch(`${baseURL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Sinh viên 60k/ngày nên ăn gì?' }],
      context: {},
      locale: 'vi',
    }),
  })
  const reader = response.body.getReader()
  let chunks = 0
  let firstChunkMs = -1
  let bytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (firstChunkMs < 0) firstChunkMs = Date.now() - started
    chunks += 1
    bytes += value.byteLength
  }

  console.log(
    `--- stream timing: status=${response.status} firstChunk=${firstChunkMs}ms total=${
      Date.now() - started
    }ms chunks=${chunks} bytes=${bytes}`,
  )
}

await run('chat-light', {})
await run('chat-dark', { theme: 'dark' })
await run('chat-en', { locale: 'en' })
await run('chat-mobile', { width: 390, height: 844, theme: 'dark' })

console.log('\nERRORS:', errors.length, errors.slice(0, 10))
await browser.close()
