import { chromium } from 'playwright'

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'
const out = 'docs/screenshots'
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []
const failures = []

function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`)
  })
}

function check(label, passed, detail = '') {
  const line = `${passed ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!passed) failures.push(line)
}

async function newPage(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: options.colorScheme ?? 'light',
  })

  if (options.locale) {
    await context.addCookies([{ name: 'mam_locale', value: options.locale, url: baseURL }])
  }

  const page = await context.newPage()
  watch(page)
  return { context, page }
}

async function waitForHydration(page) {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('form')].length > 0 &&
      [...document.querySelectorAll('form')].every((form) =>
        Object.keys(form).some((key) => key.startsWith('__reactProps$')),
      ),
    undefined,
    { timeout: 15_000 },
  )
}

/** Vào /history với tư cách khách → login → register → quay lại /history. */
async function registerViaHistory(page, user) {
  await page.goto(`${baseURL}/history`)
  await page.waitForURL(/\/login\?redirect=%2Fhistory/)
  // Đi thẳng: link "tạo tài khoản" ở header không mang theo `redirect`.
  await page.goto(`${baseURL}/register?redirect=%2Fhistory`)
  await waitForHydration(page)
  await page.getByLabel(/Email/).fill(user.email)
  await page.getByLabel(/Mật khẩu|Password/, { exact: true }).fill(user.password)
  await page.getByRole('button', { name: /Tạo tài khoản|Create account/ }).click()
  await page.waitForURL(`${baseURL}/history`, { timeout: 25_000 })
}

async function suggest(page, amount) {
  await page.goto(`${baseURL}/recommend`, { waitUntil: 'networkidle' })
  await waitForHydration(page)
  await page.getByLabel('Số tiền').fill(String(amount))
  await page.getByRole('button', { name: 'Gợi ý 3 bữa' }).click()
  await page.getByTestId('save-plan-cta').waitFor({ timeout: 90_000 })

  return page.locator('[data-slot="card-title"]').allInnerTexts()
}

async function batchIds(page) {
  return page
    .locator('[data-testid^="history-batch-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.testid.replace('history-batch-', '')))
}

async function mealTypesOf(page, batchId) {
  return page
    .locator(`[data-testid^="history-meal-${batchId}-"]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.testid.slice(node.dataset.testid.lastIndexOf('-') + 1)),
    )
}

const money = (text) => Number(text.replace(/\D/g, ''))
const stamp = Date.now()
const userA = { email: `hist.a.${stamp}@example.com`, password: 'matkhau123' }
const userB = { email: `hist.b.${stamp}@example.com`, password: 'matkhau123' }

// 1. Guests are sent to login; registration returns to /history with an empty state.
{
  const { context, page } = await newPage()
  await page.goto(`${baseURL}/history`)
  await page.waitForURL(/\/login\?redirect=%2Fhistory/)
  check('guest /history → login with redirect', true)

  await page.getByRole('link', { name: 'Chưa có tài khoản? Tạo ngay' }).click()
  await page.waitForURL(/\/register\?redirect=%2Fhistory/)
  await waitForHydration(page)
  await page.getByLabel('Email').fill(userA.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(userA.password)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await page.waitForURL(`${baseURL}/history`, { timeout: 25_000 })

  const empty = page.getByTestId('history-empty')
  await empty.waitFor({ timeout: 20_000 })
  check(
    'new user sees empty history with CTA',
    await page.getByTestId('history-empty-cta').isVisible(),
  )

  await page.getByTestId('history-empty-cta').click()
  await page.waitForURL(`${baseURL}/recommend`)
  check('empty state CTA → /recommend', true)

  // 2. One suggestion is persisted as a batch of 3 meals.
  const resultNames = await suggest(page, 60_000)
  check('suggestion rendered 3 dish cards', resultNames.length === 3, resultNames.join(' | '))

  await page.goto(`${baseURL}/history`, { waitUntil: 'networkidle' })
  const ids = await batchIds(page)
  check('history has exactly 1 batch', ids.length === 1, `ids=${ids.length}`)
  const firstBatch = ids[0]
  check(
    'batch has breakfast → lunch → dinner in order',
    (await mealTypesOf(page, firstBatch)).join(',') === 'breakfast,lunch,dinner',
  )

  const historyNames = await page
    .locator(`[data-testid^="history-meal-${firstBatch}-"]`)
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.dishName))
  check(
    'history dish names match the suggestion',
    JSON.stringify(historyNames) === JSON.stringify(resultNames),
    `${historyNames.join(' | ')} vs ${resultNames.join(' | ')}`,
  )

  const totalText = await page.getByTestId(`history-total-${firstBatch}`).innerText()
  const total = money(totalText)
  check('batch total is a positive amount', total >= 3_000, totalText)

  const details = page.locator(`[data-testid="history-batch-${firstBatch}"] details`).first()
  check('rationale is available on demand', (await details.count()) > 0)
  await details.locator('summary').click()
  const reasonText = (await details.innerText()).replace(/\s+/g, ' ').trim()
  check('rationale explains the picks', reasonText.length > 40, reasonText.slice(0, 80))

  // 3. Persisted across reloads, filterable by meal.
  await page.reload({ waitUntil: 'networkidle' })
  check('history survives a reload', (await batchIds(page)).length === 1)

  await page.getByTestId('history-filter-lunch').click()
  await page.waitForFunction(
    (id) => document.querySelectorAll(`[data-testid^="history-meal-${id}-"]`).length === 1,
    firstBatch,
    { timeout: 20_000 },
  )
  const lunchTypes = await mealTypesOf(page, firstBatch)
  const lunchTotal = money(await page.getByTestId(`history-total-${firstBatch}`).innerText())
  const lunchPrice = await page
    .locator(`[data-testid="history-meal-${firstBatch}-lunch"]`)
    .evaluate((node) => Number(node.dataset.priceVnd))
  check('lunch filter keeps only lunch', lunchTypes.join(',') === 'lunch', lunchTypes.join(','))
  check(
    'filtered total equals the lunch price',
    lunchTotal === lunchPrice,
    `${totalText} → ${lunchTotal}`,
  )

  await page.getByTestId('history-filter-all').click()
  await page.waitForFunction(
    (id) => document.querySelectorAll(`[data-testid^="history-meal-${id}-"]`).length === 3,
    firstBatch,
    { timeout: 20_000 },
  )
  check('all filter restores 3 meals', (await mealTypesOf(page, firstBatch)).length === 3)

  // 4. A second suggestion lands on top (newest first).
  await suggest(page, 80_000)
  await page.goto(`${baseURL}/history`, { waitUntil: 'networkidle' })
  const twoIds = await batchIds(page)
  check('second suggestion adds a batch', twoIds.length === 2, `ids=${twoIds.length}`)
  check('newest batch is first', twoIds[0] !== firstBatch, `first=${twoIds[0]}`)
  await page.screenshot({ path: `${out}/history-vi.png` })

  // 5. Mobile: single column, no horizontal scrolling.
  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    cards: document.querySelectorAll('[data-testid^="history-batch-"]').length,
  }))
  check(
    'mobile 390px: cards stack without horizontal scroll',
    mobile.overflow <= 1 && mobile.cards === 2,
    JSON.stringify(mobile),
  )
  await page.screenshot({ path: `${out}/history-mobile.png` })
  await page.setViewportSize({ width: 1280, height: 1000 })

  // 6. Delete is a two-step confirm and persists.
  const newest = twoIds[0]
  await page.getByTestId(`history-delete-${newest}`).click()
  await page.getByTestId(`history-delete-confirm-${newest}`).click()
  await page.getByText('Đã xoá lượt gợi ý.').waitFor({ timeout: 15_000 })
  check('delete removes the batch', (await batchIds(page)).length === 1)

  await page.reload({ waitUntil: 'networkidle' })
  const afterReload = await batchIds(page)
  check(
    'deleted batch stays gone after reload',
    afterReload.length === 1 && afterReload[0] === firstBatch,
    `ids=${afterReload.length}`,
  )

  // 7. Empty state returns when the last batch is deleted.
  await page.getByTestId(`history-delete-${firstBatch}`).click()
  await page.getByTestId(`history-delete-confirm-${firstBatch}`).click()
  await page.getByTestId('history-empty').waitFor({ timeout: 15_000 })
  await page.screenshot({ path: `${out}/history-empty.png` })
  check('empty state returns after deleting everything', true)

  await context.close()
}

// 8. Another account sees none of the first account's history.
{
  const { context, page } = await newPage({ locale: 'en' })
  await registerViaHistory(page, userB)
  await page.getByTestId('history-empty').waitFor({ timeout: 20_000 })
  check('second user sees an empty history (no leak)', (await batchIds(page)).length === 0)

  const heading = await page.getByRole('heading', { name: 'Recommendation history' }).isVisible()
  const cta = await page.getByTestId('history-empty-cta').innerText()
  check('en history copy', heading && cta === 'Get meal ideas', cta)
  await page.screenshot({ path: `${out}/history-en.png` })

  await context.close()
}

console.log(`\nERRORS: ${errors.length}`, errors.slice(0, 10))
console.log(`FAILURES: ${failures.length}`)
await browser.close()

if (failures.length > 0 || errors.length > 0) process.exitCode = 1
