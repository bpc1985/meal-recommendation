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

/**
 * React attaches props to hydrated DOM nodes. Waiting for that avoids clicking a
 * form before hydration, which would fall back to a native GET submit that wipes
 * the typed email/password.
 */
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

const stamp = Date.now()
const userA = { email: `an.${stamp}@example.com`, password: 'matkhau123', name: 'An Nguyễn' }
const userB = { email: `binh.${stamp}@example.com`, password: 'matkhau456', name: 'Bình Trần' }

// 1. Guest hits a protected route → login with a redirect param.
{
  const { context, page } = await newPage()
  await page.goto(`${baseURL}/history`)
  await page.waitForURL(/\/login\?redirect=%2Fhistory/)
  const notice = await page.getByText('Đăng nhập để tiếp tục.').isVisible()
  check('guest /history → /login?redirect=/history', notice)
  await page.screenshot({ path: `${out}/auth-login.png` })

  // 2. Switch to register, the redirect target is preserved.
  await page.getByRole('link', { name: 'Chưa có tài khoản? Tạo ngay' }).click()
  await page.waitForURL(/\/register\?redirect=%2Fhistory/)
  await waitForHydration(page)
  check('login → register keeps redirect', new URL(page.url()).search === '?redirect=%2Fhistory')
  await page.screenshot({ path: `${out}/auth-register.png` })

  // 3. Register → redirected back to /history, session cookie issued.
  await page.getByLabel('Email').fill(userA.email)
  await page.getByLabel('Tên hiển thị (không bắt buộc)').fill(userA.name)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(userA.password)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await page.waitForURL(`${baseURL}/history`, { timeout: 20_000 })
  check('register → /history', new URL(page.url()).pathname === '/history')

  const session = (await context.cookies(baseURL)).find((cookie) => cookie.name === 'mam_session')
  const ttlDays = session ? Math.round((session.expires - Date.now() / 1000) / 86_400) : 0

  check(
    'session cookie HttpOnly + SameSite=Lax + 30 days',
    session?.httpOnly === true && session?.sameSite === 'Lax' && ttlDays === 30,
    `httpOnly=${session?.httpOnly} sameSite=${session?.sameSite} secure=${session?.secure} days=${ttlDays}`,
  )

  // 4. Reload keeps the session (SSR reads the cookie, not client state).
  await page.reload({ waitUntil: 'networkidle' })
  const headerVisible = await page.getByRole('button', { name: userA.email }).isVisible()
  check('reload keeps session', headerVisible)

  // 5. Settings save: display name, budget and diet tag.
  await page.goto(`${baseURL}/settings`, { waitUntil: 'networkidle' })
  await waitForHydration(page)
  await page.getByLabel('Tên hiển thị').fill('An Đổi Tên')
  await page.getByLabel('Ngân sách mỗi ngày').fill('75000')
  await page.getByRole('button', { name: 'Chỉ món chay' }).click()
  await page.screenshot({ path: `${out}/auth-settings.png` })
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await page.getByText('Đã lưu cài đặt.').waitFor({ timeout: 15_000 })

  const renamedButton = page
    .getByRole('button', { name: userA.email })
    .filter({ hasText: 'An Đổi Tên' })
  const headerUpdated = await renamedButton
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  const headerRenamed = (await page.getByRole('button', { name: userA.email }).innerText())
    .replace(/\s+/g, ' ')
    .trim()
  check('settings save updates header', headerUpdated, headerRenamed)

  // 6. Recommend form picks up the saved profile.
  await page.goto(`${baseURL}/recommend`, { waitUntil: 'networkidle' })
  const budgetValue = await page.getByLabel('Số tiền').inputValue()
  const vegetarianPressed = await page
    .getByRole('button', { name: 'Chỉ món chay' })
    .getAttribute('aria-pressed')
  check(
    'recommend prefilled from profile',
    budgetValue === '75000' && vegetarianPressed === 'true',
    `budget=${budgetValue} vegetarian=${vegetarianPressed}`,
  )

  // 7. Logout clears session and protected routes bounce back to /login.
  await page.getByRole('button', { name: userA.email }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await page.waitForURL(`${baseURL}/`)
  const loginLink = page.getByRole('link', { name: 'Đăng nhập' }).first()
  await loginLink.waitFor({ timeout: 15_000 })
  check('logout → guest header', await loginLink.isVisible())

  await page.goto(`${baseURL}/settings`)
  await page.waitForURL(/\/login\?redirect=%2Fsettings/)
  check('post-logout /settings → /login', true)

  // 8. Wrong password is rejected without revealing whether the email exists.
  await waitForHydration(page)
  await page.getByLabel('Email').fill(userA.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('saibet999')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Email hoặc mật khẩu không đúng.' })
    .waitFor({ timeout: 20_000 })
  check('wrong password → generic error', true)

  await context.close()
}

// 9. A second user gets a fresh session and none of user A's profile.
{
  const { context, page } = await newPage()
  await page.goto(`${baseURL}/register?redirect=%2Fplans`, { waitUntil: 'networkidle' })
  await waitForHydration(page)
  await page.getByLabel('Email').fill(userB.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(userB.password)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await page.waitForURL(`${baseURL}/plans`, { timeout: 20_000 })

  const bHeader = (await page.getByRole('button', { name: userB.email }).innerText())
    .replace(/\s+/g, ' ')
    .trim()
  await page.goto(`${baseURL}/settings`, { waitUntil: 'networkidle' })
  const bBudget = await page.getByLabel('Ngân sách mỗi ngày').inputValue()
  const bDisplay = await page.getByLabel('Tên hiển thị').inputValue()
  check(
    'user B sees only their own data',
    !bHeader.includes('An') && bDisplay === '' && bBudget !== '75000',
    `header="${bHeader}" display="${bDisplay}" budget=${bBudget}`,
  )

  // 10. Log B out so /register is reachable, then the duplicate email is rejected.
  await page.getByRole('button', { name: userB.email }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await page.waitForURL(`${baseURL}/`)
  await page.getByRole('link', { name: 'Đăng nhập' }).first().waitFor({ timeout: 15_000 })

  await page.goto(`${baseURL}/register`, { waitUntil: 'networkidle' })
  await waitForHydration(page)
  await page.getByLabel('Email').fill(userA.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau999')
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Email này đã được dùng' })
    .waitFor({ timeout: 20_000 })
  check('duplicate email → clear error', true)

  await context.close()
}

// 11. English + dark login page.
{
  const { context, page } = await newPage({ locale: 'en', colorScheme: 'dark' })
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
  const heading = await page.getByRole('heading', { name: 'Log in' }).isVisible()
  const submit = await page.getByRole('button', { name: 'Log in' }).isVisible()
  check('en login copy', heading && submit, `heading=${heading} submit=${submit}`)
  await page.screenshot({ path: `${out}/auth-login-en-dark.png` })
  await context.close()
}

console.log(`\nERRORS: ${errors.length}`, errors.slice(0, 10))
console.log(`FAILURES: ${failures.length}`)
await browser.close()

if (failures.length > 0 || errors.length > 0) process.exitCode = 1
