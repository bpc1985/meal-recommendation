import { chromium } from 'playwright'

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'
const out = 'docs/screenshots'
const browser = await chromium.launch({ channel: 'chrome' })

const errors = []

async function open({ width = 1280, height = 1000, locale = 'vi', theme = 'light' } = {}) {
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

async function run(label, options) {
  const { context, page } = await open(options)
  await page.goto(`${baseURL}/recommend`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${out}/${label}-form.png` })

  const submitName = options.locale === 'en' ? 'Suggest 3 meals' : 'Gợi ý 3 bữa'
  await page.getByRole('button', { name: submitName }).click()
  await page.waitForSelector('#recommend-results-heading', { timeout: 15_000 })
  await page.waitForTimeout(1_000)

  const summary = await page.evaluate(() => {
    const section = document.querySelector('#recommend-results-heading')?.closest('section')
    return section?.innerText ?? ''
  })

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )

  await page.locator('#recommend-results-heading').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/${label}-results.png` })
  console.log(`--- ${label} overflow=${overflow}`)
  console.log(summary)
  await context.close()
}

await run('recommend-light', {})
await run('recommend-dark', { theme: 'dark' })
await run('recommend-mobile', { width: 390, height: 844, theme: 'dark' })
await run('recommend-en', { width: 1280, height: 1000, locale: 'en' })

// Locale switch after results must translate names + reasons without refetch.
{
  const { context, page } = await open()
  await page.goto(`${baseURL}/recommend`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Gợi ý 3 bữa' }).click()
  await page.waitForSelector('#recommend-results-heading')
  const before = await page.evaluate(
    () => document.querySelector('#recommend-results-heading')?.closest('section')?.innerText ?? '',
  )
  await page.getByRole('button', { name: 'Ngôn ngữ' }).click()
  await page.getByRole('menuitem', { name: /English/ }).click()
  await page.waitForTimeout(600)
  const after = await page.evaluate(
    () => document.querySelector('#recommend-results-heading')?.closest('section')?.innerText ?? '',
  )
  console.log('--- locale switch')
  console.log('before:', before.split('\n').slice(0, 4).join(' | '))
  console.log('after :', after.split('\n').slice(0, 4).join(' | '))
  await context.close()
}

// Lowest valid budget: expect fallback + missing cards, not a crash.
{
  const { context, page } = await open()
  await page.goto(`${baseURL}/recommend`, { waitUntil: 'networkidle' })
  const input = page.getByLabel('Số tiền')
  await input.fill('1000')
  await page.getByRole('button', { name: 'Gợi ý 3 bữa' }).click()
  await page.waitForSelector('#recommend-results-heading')
  const text = await page.evaluate(
    () => document.querySelector('#recommend-results-heading')?.closest('section')?.innerText ?? '',
  )
  console.log('--- low budget')
  console.log(text.split('\n').slice(0, 8).join(' | '))
  await context.close()
}

console.log('\nERRORS:', errors.length, errors.slice(0, 10))
await browser.close()
