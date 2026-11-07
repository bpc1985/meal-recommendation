import { chromium } from 'playwright'

/**
 * Checkpoint T18 — chat của user đăng nhập phải sống qua reload/locale, khách chỉ
 * dùng localStorage. Chạy với `AI_PROVIDER=mock` để kết quả tất định:
 *   AI_PROVIDER=mock pnpm --filter @mam/web dev --port 3001
 *   BASE_URL=http://localhost:3001 node scripts/checkpoint-chat.mjs
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3001'
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
    colorScheme: 'light',
  })

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

async function ask(page, question) {
  const before = await page.locator('[data-role="assistant"]').count()

  await page.locator('#chat-input').fill(question)
  await page.getByRole('button', { name: /Gửi|Send/, exact: true }).click()

  // Chờ stream đóng hẳn: nút "Dừng" biến mất + đã có bubble mới có chữ.
  await page.waitForFunction(
    (count) => {
      const pending = [...document.querySelectorAll('button')].some((button) =>
        /^(Dừng|Stop)$/.test(button.textContent?.trim() ?? ''),
      )
      const assistants = document.querySelectorAll('[data-role="assistant"]')
      const last = assistants[assistants.length - 1]?.querySelector('[data-message-content]')

      return (
        !pending && assistants.length === count + 1 && (last?.textContent ?? '').trim().length > 20
      )
    },
    before,
    { timeout: 120_000 },
  )

  return page.locator('[data-role="assistant"] [data-message-content]').last().innerText()
}

async function register(page, user) {
  await page.goto(`${baseURL}/register?redirect=%2Fchat`)
  await waitForHydration(page)
  await page.getByLabel(/Email/).fill(user.email)
  await page.getByLabel(/Mật khẩu|Password/, { exact: true }).fill(user.password)
  await page.getByRole('button', { name: /Tạo tài khoản|Create account/ }).click()
  await page.waitForURL(`${baseURL}/chat`, { timeout: 25_000 })
  await waitForHydration(page)
}

async function threadTitles(page) {
  return page
    .locator('[data-testid^="chat-thread-item-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.threadTitle ?? ''))
}

async function messageTexts(page, role) {
  return page
    .locator(`[data-role="${role}"] [data-message-content]`)
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''))
}

const stamp = Date.now()
const userA = { email: `chat.a.${stamp}@example.com`, password: 'matkhau123' }
const userB = { email: `chat.b.${stamp}@example.com`, password: 'matkhau123' }

// 1. Khách: chỉ localStorage, không có thread server.
{
  const { context, page } = await newPage()
  await page.goto(`${baseURL}/chat`, { waitUntil: 'networkidle' })
  await waitForHydration(page)

  check('guest sees the sign-in hint', await page.getByTestId('chat-guest-note').isVisible())
  check('guest has no saved threads', (await threadTitles(page)).length === 0)

  const answer = await ask(page, 'Trưa nay 40k ăn gì?')
  check('guest gets an answer', answer.length > 20, answer.slice(0, 60))

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem('mam_chat_history_v1')
    return raw ? JSON.parse(raw) : null
  })
  check(
    'guest turn is stored in localStorage only',
    Array.isArray(stored) && stored.length === 2 && stored[0].content === 'Trưa nay 40k ăn gì?',
    `${stored?.length ?? 0} messages`,
  )
  await page.screenshot({ path: `${out}/chat-guest.png` })
  await context.close()
}

// 2. User đăng nhập: thread lưu server, reload/locale không mất.
{
  const { context, page } = await newPage()
  await page.goto(`${baseURL}/chat`, { waitUntil: 'networkidle' })
  await register(page, userA)

  check(
    'registered user starts with no threads',
    (await page.getByTestId('chat-threads-empty').count()) === 1,
  )
  check(
    'guest localStorage is not shown to the account',
    (await messageTexts(page, 'user')).length === 0,
  )

  const firstQuestion = 'Sinh viên 60k/ngày nên ăn gì?'
  const answer = await ask(page, firstQuestion)

  await page.getByTestId('chat-threads-empty').waitFor({ state: 'detached', timeout: 20_000 })
  const titles = await threadTitles(page)
  check('first turn creates a saved thread', titles.length === 1, titles.join(' | '))
  check('thread title is the first question', titles[0] === firstQuestion, titles[0])

  const dishCards = await page.getByTestId('chat-dish-card').count()
  check('answer carries DB dish cards', dishCards > 0, `${dishCards} cards`)

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-role="assistant"]').last().waitFor({ timeout: 20_000 })
  const afterReload = await messageTexts(page, 'user')
  const answerAfterReload = (await messageTexts(page, 'assistant')).at(-1) ?? ''
  check('thread survives reload', afterReload[0] === firstQuestion, afterReload[0])
  check(
    'answer text survives reload',
    answerAfterReload.slice(0, 40) === answer.slice(0, 40),
    answerAfterReload.slice(0, 40),
  )
  check(
    'dish cards survive reload',
    (await page.getByTestId('chat-dish-card').count()) === dishCards,
  )

  // 3. Đổi locale EN: thread + tin nhắn vẫn còn (không phụ thuộc locale).
  await page.getByRole('button', { name: 'Ngôn ngữ' }).click()
  await page.getByRole('menuitem', { name: 'English' }).click()
  await page.getByRole('heading', { name: 'Ask Mam' }).waitFor({ timeout: 15_000 })

  check(
    'locale switch keeps the thread list',
    (await threadTitles(page)).length === 1,
    (await threadTitles(page)).join(' | '),
  )
  check('locale switch keeps the messages', (await messageTexts(page, 'user'))[0] === firstQuestion)
  await page.screenshot({ path: `${out}/chat-en.png` })

  // 4. Thread mới + nhắn lại thread cũ.
  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('menuitem', { name: 'Tiếng Việt' }).click()
  await page.getByRole('heading', { name: 'Hỏi Măm' }).waitFor({ timeout: 15_000 })

  await page.getByTestId('chat-new-thread').click()
  check('new conversation clears the log', (await messageTexts(page, 'user')).length === 0)
  check('new conversation keeps saved threads', (await threadTitles(page)).length === 1)

  const secondQuestion = 'Bữa tối 50k, không hải sản'
  await ask(page, secondQuestion)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="chat-thread-item-"]').length === 2,
    undefined,
    { timeout: 30_000 },
  )
  const twoTitles = await threadTitles(page)
  check('second turn creates a second thread', twoTitles.length === 2, twoTitles.join(' | '))
  check('newest thread is first', twoTitles[0] === secondQuestion, twoTitles[0])

  await page.screenshot({ path: `${out}/chat-vi.png` })

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-role="assistant"]').last().waitFor({ timeout: 20_000 })
  check(
    'reload opens the newest thread',
    (await messageTexts(page, 'user'))[0] === secondQuestion,
    (await messageTexts(page, 'user'))[0],
  )

  await page
    .locator('[data-testid^="chat-thread-item-"]')
    .filter({ hasText: firstQuestion })
    .click()
  await page.waitForFunction(
    (question) =>
      [...document.querySelectorAll('[data-role="user"]')].some((node) =>
        node.textContent?.includes(question),
      ),
    firstQuestion,
    { timeout: 20_000 },
  )
  check(
    'clicking an older thread opens it',
    (await messageTexts(page, 'user'))[0] === firstQuestion,
  )

  // 5. Xoá hội thoại đang mở → mất khỏi sidebar và không quay lại sau reload.
  await page.getByTestId('chat-clear').click()
  await page.getByText('Đã xoá hội thoại khỏi tài khoản.').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="chat-thread-item-"]').length === 1,
    undefined,
    { timeout: 20_000 },
  )
  check('clear removes the thread from the sidebar', (await threadTitles(page)).length === 1)

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByTestId('chat-clear').waitFor({ timeout: 20_000 })
  const remaining = await threadTitles(page)
  check(
    'cleared thread stays gone after reload',
    remaining.length === 1 && remaining[0] === secondQuestion,
    remaining.join(' | '),
  )

  // 6. Mobile không tràn ngang.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    threads: document.querySelectorAll('[data-testid^="chat-thread-item-"]').length,
  }))
  check('mobile 390px: no horizontal scroll', mobile.overflow <= 1, JSON.stringify(mobile))
  await page.screenshot({ path: `${out}/chat-mobile.png`, fullPage: false })

  await context.close()
}

// 7. User khác không thấy hội thoại của user đầu.
{
  const { context, page } = await newPage()
  await page.goto(`${baseURL}/chat`, { waitUntil: 'networkidle' })
  await register(page, userB)

  check(
    'second user sees no threads (no leak)',
    (await threadTitles(page)).length === 0 &&
      (await page.getByTestId('chat-threads-empty').count()) === 1,
  )
  check('second user log is empty', (await messageTexts(page, 'user')).length === 0)

  await context.close()
}

console.log(`\nERRORS: ${errors.length}`, errors.slice(0, 10))
console.log(`FAILURES: ${failures.length}`)
await browser.close()

if (failures.length > 0 || errors.length > 0) process.exitCode = 1
