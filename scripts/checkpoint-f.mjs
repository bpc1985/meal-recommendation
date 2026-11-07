import { readFile } from 'node:fs/promises'
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
    acceptDownloads: true,
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

async function pickUnit(page, label) {
  await page.getByTestId('plan-unit').click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

/** Dropdown của Radix đôi khi cần một nhịp để đóng hẳn sau lần chọn trước. */
async function openExportMenu(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.getByTestId('plan-export-menu').click()
    const ready = await page
      .getByTestId('plan-export-copy')
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false)

    if (ready) return
    await page.waitForTimeout(300)
  }

  throw new Error('export menu did not open')
}

const stamp = Date.now()
const user = { email: `plan.${stamp}@example.com`, password: 'matkhau123' }
let detailUrl = ''

// 1. Guests cannot open /plans, and are sent back after registering.
{
  const { context, page } = await newPage()
  await page.goto(`${baseURL}/plans`)
  await page.waitForURL(/\/login\?redirect=%2Fplans/)
  check('guest /plans → login with redirect', true)

  await page.getByRole('link', { name: 'Chưa có tài khoản? Tạo ngay' }).click()
  await page.waitForURL(/\/register\?redirect=%2Fplans/)
  await waitForHydration(page)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await page.waitForURL(`${baseURL}/plans`, { timeout: 25_000 })
  check('register → /plans', new URL(page.url()).pathname === '/plans')

  // 2. Too little money: explicit error with a real minimum, nothing saved.
  await waitForHydration(page)
  await page.getByTestId('plan-days-7').click()
  await page.getByTestId('plan-budget').fill('30000')
  await page.getByTestId('plan-submit').click()
  const alert = page.getByRole('alert')
  await alert.waitFor({ timeout: 25_000 })
  const alertText = (await alert.innerText()).replace(/\s+/g, ' ').trim()
  check(
    '30k/day → infeasible with minimum hint',
    /ngân sách tối thiểu|Không đủ món/.test(alertText),
    alertText,
  )
  check(
    'infeasible attempt saves nothing',
    (await page.locator('[data-testid^="plan-card-"]').count()) === 0,
  )

  // 3. 30 days on a 2.5m monthly budget (83k/day after conversion).
  await page.getByTestId('plan-days-30').click()
  await page.getByTestId('plan-budget').fill('2500000')
  await pickUnit(page, 'Mỗi tháng')
  // Đóng dropdown trước khi chụp để ảnh không bị menu che mất phần preview ngân sách.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/plans-create.png` })
  await page.getByTestId('plan-submit').click()
  await page.waitForURL(/\/plans\/[^/]+$/, { timeout: 60_000 })
  detailUrl = page.url()
  await page.getByTestId('plan-detail-table').waitFor({ timeout: 20_000 })

  const totalText = await page.getByTestId('plan-detail-total').innerText()
  const totalVnd = Number(totalText.replace(/\D/g, ''))
  check('30-day plan total ≤ 2,500,000', totalVnd > 0 && totalVnd <= 2_500_000, totalText)

  const schedule = await page.evaluate(() =>
    [...document.querySelectorAll('table tbody[data-testid^="plan-day-"]')].map((body) => {
      const rows = [...body.querySelectorAll('tr[data-dish-id]')]

      return {
        day: Number(body.dataset.testid.replace('plan-day-', '')),
        total: Number(body.dataset.totalVnd),
        dishes: rows.map((row) => row.dataset.dishId),
        meals: rows.map((row) => row.dataset.mealType),
      }
    }),
  )

  check('30 days rendered', schedule.length === 30, `days=${schedule.length}`)
  check(
    '3 meals per day in order',
    schedule.every(
      (day) =>
        day.dishes.length === 3 &&
        day.meals.join(',') === 'breakfast,lunch,dinner' &&
        new Set(day.dishes).size === 3,
    ),
  )
  check(
    'no dish repeats within a 2-day window',
    schedule.every((day, index) => {
      if (index === 0) return true
      const previous = new Set(schedule[index - 1].dishes)
      return day.dishes.every((dishId) => !previous.has(dishId))
    }),
  )
  check(
    'day totals add up and stay under the budget',
    schedule.reduce((sum, day) => sum + day.total, 0) === totalVnd &&
      schedule.every((day) => day.total <= 83_000),
  )
  await page.screenshot({ path: `${out}/plans-detail-vi.png`, fullPage: false })

  // 4. Export menu: copy, print hook, downloadable markdown.
  await openExportMenu(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('plan-export-download').click(),
  ])
  const filePath = await download.path()
  const markdown = await readFile(filePath, 'utf8')

  check('download filename ends with .md', download.suggestedFilename().endsWith('.md'))
  check('export has UTF-8 BOM', markdown.charCodeAt(0) === 0xfeff)
  check(
    'markdown has title, 30 day tables, shopping list and totals',
    markdown.includes('# ') &&
      (markdown.match(/^## Ngày /gm) ?? []).length === 30 &&
      markdown.includes('## Đi chợ') &&
      markdown.includes('| Bữa | Món | Giá |') &&
      markdown.includes('Cộng ngày'),
  )

  await openExportMenu(page)
  await page.getByTestId('plan-export-copy').click()
  const copied = await page
    .getByText('Đã sao chép thực đơn.')
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  check('copy action shows toast', copied)

  await page.evaluate(() => {
    window.__printed = false
    window.print = () => {
      window.__printed = true
    }
  })
  await openExportMenu(page)
  await page.getByTestId('plan-export-print').click()
  check('print action calls window.print', await page.evaluate(() => window.__printed === true))

  const printStyles = await page.evaluate(() => {
    const hasPageRule = [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((rule) => rule.cssText.startsWith('@page'))
      } catch {
        return false
      }
    })
    const hiddenWhenPrinting = [...document.querySelectorAll('[data-testid="plan-export-menu"]')]
      .map((node) => node.parentElement?.className ?? '')
      .some((className) => className.includes('print:hidden'))

    return { hasPageRule, hiddenWhenPrinting }
  })
  check(
    'print stylesheet present',
    printStyles.hasPageRule && printStyles.hiddenWhenPrinting,
    JSON.stringify(printStyles),
  )

  // 5. Mobile layout uses the <details> accordion, not the wide table.
  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await page.evaluate(() => ({
    accordions: document.querySelectorAll('[data-testid^="plan-day-mobile-"]').length,
    tableHidden:
      getComputedStyle(
        document.querySelector('table[data-testid="plan-detail-table"]').parentElement,
      ).display === 'none',
  }))
  check(
    'mobile: 30 accordion days, table hidden',
    mobile.accordions === 30 && mobile.tableHidden,
    JSON.stringify(mobile),
  )
  await page.getByTestId('plan-day-mobile-0').click()
  const firstDayOpen = await page.getByTestId('plan-day-mobile-0').evaluate((node) => node.open)
  check('mobile day expands', firstDayOpen)
  await page.screenshot({ path: `${out}/plans-detail-mobile.png` })
  await page.setViewportSize({ width: 1280, height: 1000 })

  // 6. Recommend CTA turns the current suggestion into a 7-day plan.
  await page.goto(`${baseURL}/recommend`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Gợi ý 3 bữa' }).click()
  await page.getByTestId('save-plan-cta').waitFor({ timeout: 90_000 })
  await page.getByTestId('save-plan-cta').click()
  await page.waitForURL(/\/plans\/[^/]+$/, { timeout: 30_000 })
  const savedCta =
    (await page.locator('[data-testid="plan-detail-table"]').getAttribute('data-days')) === '7'
  check('recommend CTA saves a 7-day plan', savedCta, page.url())

  // 7. Plans list shows both plans, delete is a two-step confirm.
  await page.goto(`${baseURL}/plans`, { waitUntil: 'networkidle' })
  const planId = detailUrl.split('/').pop()
  const cards = page.locator('[data-testid^="plan-card-"]')
  check('list shows both plans', (await cards.count()) === 2, `count=${await cards.count()}`)

  await page.getByTestId(`plan-delete-${planId}`).click()
  await page.getByTestId(`plan-delete-confirm-${planId}`).click()
  await page.getByText('Đã xoá thực đơn.').waitFor({ timeout: 15_000 })
  check('delete removes the plan', (await cards.count()) === 1)

  await page.goto(detailUrl, { waitUntil: 'networkidle' })
  const gone = await page.getByText('Không tìm thấy thực đơn.').isVisible()
  check('deleted plan URL shows not-found', gone)

  // 8. English copy on the plan detail page.
  await context.addCookies([{ name: 'mam_locale', value: 'en', url: baseURL }])
  await page.goto(`${baseURL}/plans`, { waitUntil: 'networkidle' })
  const enHeading = await page.getByRole('heading', { name: 'Your meal plans' }).isVisible()
  const enSubmit = await page.getByRole('button', { name: 'Build the plan' }).isVisible()
  check('en plans page copy', enHeading && enSubmit)
  await page.screenshot({ path: `${out}/plans-list-en.png` })

  await context.close()
}

console.log(`\nERRORS: ${errors.length}`, errors.slice(0, 10))
console.log(`FAILURES: ${failures.length}`)
await browser.close()

if (failures.length > 0 || errors.length > 0) process.exitCode = 1
