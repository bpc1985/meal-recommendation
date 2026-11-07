import { chromium } from 'playwright'

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'
const browser = await chromium.launch({ channel: 'chrome' })

async function capture(name, { width, height, locale, theme, path = '/' }) {
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
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`)
  })

  await page.goto(baseURL + path, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `/tmp/${name}.png`, fullPage: false })

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )

  console.log(
    `${name}: errors=${errors.length} horizontalOverflow=${overflow}`,
    errors.length ? errors.slice(0, 5) : '',
  )
  await context.close()
}

await capture('mam-light', { width: 1280, height: 900, locale: 'vi', theme: 'light' })
await capture('mam-dark', { width: 1280, height: 900, locale: 'vi', theme: 'dark' })
await capture('mam-en', { width: 1280, height: 900, locale: 'en', theme: 'light' })
await capture('mam-mobile', {
  width: 390,
  height: 844,
  locale: 'vi',
  theme: 'dark',
  deviceScaleFactor: 3,
})

await browser.close()
