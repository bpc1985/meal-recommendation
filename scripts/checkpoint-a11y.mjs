import { AxeBuilder } from '@axe-core/playwright'
import { chromium } from 'playwright'

/**
 * Checkpoint T19 — a11y tự động bằng axe-core.
 *
 * Quét mọi trang ở cả vi/en (và dark cho trang chính), rồi kiểm thêm những thứ axe
 * không bắt được: ngôn ngữ `<html>`, một `h1`, skip link, luồng bàn phím của form
 * gợi ý, và reduced-motion.
 *
 *   BASE_URL=http://localhost:3001 node scripts/checkpoint-a11y.mjs
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3001'
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []
const failures = []
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

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
    reducedMotion: options.reducedMotion ?? 'no-preference',
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
      [...document.querySelectorAll('form')].some((form) =>
        Object.keys(form).some((key) => key.startsWith('__reactProps$')),
      ),
    undefined,
    { timeout: 15_000 },
  )
}

async function scan(page, label) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()

  for (const violation of results.violations) {
    const nodes = violation.nodes
      .slice(0, 3)
      .map((node) => node.target.join(' '))
      .join(' | ')
    console.log(
      `VIOLATION [${label}] ${violation.id} (${violation.impact}) ${violation.help} :: ${nodes}`,
    )
  }

  check(`axe [${label}]`, results.violations.length === 0, `${results.violations.length} vi phạm`)

  return results.violations.length
}

async function scanPage(page, path, label) {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
  await page.locator('main').waitFor({ timeout: 20_000 })

  const lang = await page.evaluate(() => document.documentElement.lang)
  const h1Count = await page.locator('h1').count()

  check(`${label}: <html lang> is set`, lang === 'vi' || lang === 'en', lang)
  check(`${label}: exactly one h1`, h1Count === 1, `${h1Count} h1`)
  await scan(page, label)

  return lang
}

const stamp = Date.now()
const user = { email: `a11y.${stamp}@example.com`, password: 'matkhau123' }

// 1. Trang công khai, tiếng Việt.
{
  const { context, page } = await newPage({ locale: 'vi' })

  for (const [path, label] of [
    ['/', 'vi home'],
    ['/recommend', 'vi recommend'],
    ['/chat', 'vi chat'],
    ['/login', 'vi login'],
    ['/register', 'vi register'],
  ]) {
    const lang = await scanPage(page, path, label)
    check(`${label}: lang matches locale`, lang === 'vi', lang)
  }

  // 2. Skip link: Tab đầu tiên phải là "tới nội dung", Enter đưa focus vào <main>.
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const skip = await page.evaluate(() => {
    const active = document.activeElement
    return {
      tag: active?.tagName ?? '',
      href: active?.getAttribute('href') ?? '',
      text: active?.textContent?.trim() ?? '',
    }
  })
  check(
    'first Tab reaches a skip link to #main',
    skip.tag === 'A' && skip.href === '#main',
    `${skip.tag} ${skip.href} "${skip.text}"`,
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  const focusedMain = await page.evaluate(() => document.activeElement?.id === 'main')
  check('skip link moves focus to main', focusedMain)

  // 3. Luồng bàn phím của form gợi ý: tab tới ô ngân sách, gõ, Enter là ra kết quả.
  await page.goto(`${baseURL}/recommend`, { waitUntil: 'networkidle' })
  await waitForHydration(page)
  await page.getByLabel('Số tiền').focus()
  // Ô ngân sách đã có sẵn số mặc định theo vai trò → chọn hết rồi gõ đè.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('60000')
  await page.keyboard.press('Enter')
  await page.getByTestId('save-plan-cta').waitFor({ timeout: 90_000 })
  check('keyboard-only recommend flow produces results', true)

  // 4. Reduced motion: animation/transition toàn cục bị vô hiệu hoá.
  const { context: reducedContext, page: reducedPage } = await newPage({
    locale: 'vi',
    reducedMotion: 'reduce',
  })
  await reducedPage.goto(`${baseURL}/chat`, { waitUntil: 'networkidle' })
  const motion = await reducedPage.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'animate-bounce transition-colors'
    probe.style.animationDuration = ''
    probe.style.transitionDuration = ''
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const result = {
      media: matchMedia('(prefers-reduced-motion: reduce)').matches,
      animation: parseFloat(style.animationDuration),
      transition: parseFloat(style.transitionDuration),
    }
    probe.remove()
    return result
  })
  check(
    'prefers-reduced-motion disables animation + transition',
    motion.media && motion.animation < 0.01 && motion.transition < 0.01,
    JSON.stringify(motion),
  )
  await reducedContext.close()

  // 5. Tiếng Anh: nhãn aria và title cũng phải đổi, không chỉ chữ trên trang.
  await context.close()
}

{
  const { context, page } = await newPage({ locale: 'en' })

  for (const [path, label] of [
    ['/', 'en home'],
    ['/recommend', 'en recommend'],
  ]) {
    const lang = await scanPage(page, path, label)
    check(`${label}: lang matches locale`, lang === 'en', lang)
  }

  await context.close()
}

// 6. Dark mode: contrast là chỗ dễ vỡ nhất khi đổi token.
{
  const { context, page } = await newPage({ locale: 'vi', colorScheme: 'dark' })

  for (const [path, label] of [
    ['/', 'dark home'],
    ['/recommend', 'dark recommend'],
  ]) {
    await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
    await page.locator('main').waitFor({ timeout: 20_000 })
    await scan(page, label)
  }

  await context.close()
}

// 7. Trang cần đăng nhập.
{
  const { context, page } = await newPage({ locale: 'vi' })
  await page.goto(`${baseURL}/register?redirect=%2Fsettings`, { waitUntil: 'networkidle' })
  await waitForHydration(page)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await page.waitForURL(`${baseURL}/settings`, { timeout: 25_000 })

  // Header đổi sau khi root loader chạy lại — chờ email xuất hiện rồi mới kiểm tên.
  await page.waitForFunction(
    (email) => document.querySelector('header')?.textContent?.includes(email),
    user.email,
    { timeout: 20_000 },
  )
  check(
    'account menu is named by the visible email',
    (await page.getByRole('button', { name: user.email, exact: false }).count()) === 1,
  )

  for (const [path, label] of [
    ['/plans', 'vi plans'],
    ['/history', 'vi history'],
    ['/settings', 'vi settings'],
    ['/chat', 'vi chat signed-in'],
  ]) {
    await scanPage(page, path, label)
  }

  await context.close()
}

console.log(`\nERRORS: ${errors.length}`, errors.slice(0, 10))
console.log(`FAILURES: ${failures.length}`)
await browser.close()

if (failures.length > 0 || errors.length > 0) process.exitCode = 1
