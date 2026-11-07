import AxeBuilder from '@axe-core/playwright'
import { createDb } from '@mam/db'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { uniqueEmail, waitForHydration } from './support'

const databasePath = fileURLToPath(new URL('../.e2e/mam.db', import.meta.url))

interface PreferenceRow {
  slug: string
  kind: string
}

function preferencesOf(email: string): PreferenceRow[] {
  const { sqlite } = createDb(databasePath)
  try {
    return sqlite
      .prepare(
        `select d.slug as slug, p.kind as kind from dish_preferences p
         join users u on u.id = p.user_id join dishes d on d.id = p.dish_id
         where u.email = ? order by d.slug`,
      )
      .all(email) as PreferenceRow[]
  } finally {
    sqlite.close()
  }
}

function totalPreferences(): number {
  const { sqlite } = createDb(databasePath)
  try {
    return (
      sqlite.prepare('select count(*) as value from dish_preferences').get() as {
        value: number
      }
    ).value
  } finally {
    sqlite.close()
  }
}

/** Trang `/dishes` không có `<form>`, nên chờ React gắn handler lên ô tìm món. */
async function waitForDishesHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const input = document.querySelector('#dish-search')
      return !!input && Object.keys(input).some((key) => key.startsWith('__reactProps$'))
    },
    undefined,
    { timeout: 20_000 },
  )
}

async function registerOnDishes(page: Page, email: string): Promise<void> {
  await page.goto('/register?redirect=%2Fdishes')
  await waitForHydration(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await expect(page).toHaveURL(/\/dishes$/)
  await waitForDishesHydration(page)
}

/** Bấm một nút thích/chán và chờ server trả lời, để đọc DB ngay sau đó. */
async function press(page: Page, slug: string, kind: 'like' | 'dislike'): Promise<void> {
  const response = page.waitForResponse(
    (res) => res.url().includes('_serverFn') && res.request().method() === 'POST',
  )
  await page.getByTestId(`dish-card-${slug}`).getByTestId(`dish-pref-${kind}`).click()
  expect((await response).ok()).toBe(true)
}

function button(page: Page, slug: string, kind: 'like' | 'dislike') {
  return page.getByTestId(`dish-card-${slug}`).getByTestId(`dish-pref-${kind}`)
}

test.describe('món thích và món chán trên /dishes', () => {
  // Test sau đăng nhập lại user của test trước: rate limit chỉ cho 5 lượt đăng ký mỗi IP.
  test.describe.configure({ mode: 'serial' })
  let firstEmail = ''
  let secondEmail = ''

  test('khách bấm thích: mời đăng nhập, không ghi DB, không ghi localStorage', async ({ page }) => {
    await page.goto('/dishes')
    await waitForDishesHydration(page)
    const storageBefore = await page.evaluate(() => Object.keys(localStorage).sort())
    const rowsBefore = totalPreferences()

    await expect(page.getByTestId('dish-liked-only')).toHaveCount(0)
    await button(page, 'pho-bo', 'like').click()

    await expect(page.getByText('Đăng nhập để lưu món thích và món chán.')).toBeVisible()
    await expect(button(page, 'pho-bo', 'like')).toHaveAttribute('aria-pressed', 'false')
    expect(totalPreferences()).toBe(rowsBefore)
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(storageBefore)

    await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdishes$/)
  })

  test('thích, reload, đổi sang chán, bỏ chọn, bấm nhanh, lọc chỉ món thích', async ({ page }) => {
    const email = uniqueEmail('e2e.prefs')
    firstEmail = email
    await registerOnDishes(page, email)

    await press(page, 'pho-bo', 'like')
    await expect(button(page, 'pho-bo', 'like')).toHaveAttribute('aria-pressed', 'true')
    expect(preferencesOf(email)).toEqual([{ slug: 'pho-bo', kind: 'like' }])

    await page.reload()
    await expect(button(page, 'pho-bo', 'like')).toHaveAttribute('aria-pressed', 'true')
    await waitForDishesHydration(page)

    // Đi trang khác rồi quay lại trong cùng phiên: không lấy bản cũ trong cache router.
    await press(page, 'bun-cha', 'like')
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
    await nav.getByRole('link', { name: 'Gợi ý bữa ăn' }).click()
    await expect(page).toHaveURL(/\/recommend$/)
    await nav.getByRole('link', { name: 'Món ăn' }).click()
    await expect(page).toHaveURL(/\/dishes$/)
    await expect(button(page, 'bun-cha', 'like')).toHaveAttribute('aria-pressed', 'true')
    await press(page, 'bun-cha', 'like')

    await press(page, 'pho-bo', 'dislike')
    await expect(button(page, 'pho-bo', 'like')).toHaveAttribute('aria-pressed', 'false')
    await expect(button(page, 'pho-bo', 'dislike')).toHaveAttribute('aria-pressed', 'true')
    expect(preferencesOf(email)).toEqual([{ slug: 'pho-bo', kind: 'dislike' }])

    await press(page, 'pho-bo', 'dislike')
    await expect(button(page, 'pho-bo', 'dislike')).toHaveAttribute('aria-pressed', 'false')
    expect(preferencesOf(email)).toEqual([])

    const rapid = button(page, 'com-tam', 'like')
    for (let click = 0; click < 5; click += 1) await rapid.click()
    await expect(rapid).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => preferencesOf(email)).toEqual([{ slug: 'com-tam', kind: 'like' }])
    await expect(page.getByText('Không lưu được lựa chọn. Thử lại giúp mình nhé.')).toHaveCount(0)

    const keyboard = button(page, 'banh-mi-pate', 'like')
    await keyboard.focus()
    await page.keyboard.press('Space')
    await expect(keyboard).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(() => preferencesOf(email))
      .toEqual([
        { slug: 'banh-mi-pate', kind: 'like' },
        { slug: 'com-tam', kind: 'like' },
      ])

    const cards = page.locator('[data-testid^="dish-card-"]')
    await page.getByTestId('dish-liked-only').click()
    await expect(page).toHaveURL(/\/dishes\?liked=true$/)
    await expect(cards).toHaveCount(2)
    await expect(page.getByTestId('dish-count')).toHaveText('2 món')

    await page.reload()
    await expect(cards).toHaveCount(2)
    await expect(page.getByTestId('dish-liked-only')).toHaveAttribute('aria-pressed', 'true')
    await waitForDishesHydration(page)

    await page.getByRole('button', { name: 'Xoá bộ lọc' }).click()
    await expect(page).toHaveURL(/\/dishes$/)
    await expect(cards).toHaveCount(100)
  })

  test('user khác không thấy lựa chọn của user trước; trang vẫn 0 lỗi axe', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/login?redirect=%2Fdishes')
    await waitForHydration(page)
    await page.getByLabel('Email').fill(firstEmail)
    await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
    await page.getByRole('main').getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(/\/dishes$/)
    await waitForDishesHydration(page)
    await expect(button(page, 'com-tam', 'like')).toHaveAttribute('aria-pressed', 'true')
    await press(page, 'bun-cha', 'dislike')

    for (const theme of ['light', 'dark']) {
      await context.addCookies([{ name: 'mam_theme', value: theme, url: baseURL ?? '' }])
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze()
      expect(
        violations.map((violation) => `${violation.id}: ${violation.help}`),
        theme,
      ).toEqual([])
    }

    await context.clearCookies()
    const second = uniqueEmail('e2e.prefs.b')
    secondEmail = second
    await registerOnDishes(page, second)
    await expect(button(page, 'com-tam', 'like')).toHaveAttribute('aria-pressed', 'false')
    await expect(button(page, 'bun-cha', 'dislike')).toHaveAttribute('aria-pressed', 'false')

    await page.getByTestId('dish-liked-only').click()
    await expect(page.getByTestId('dish-empty').getByRole('heading')).toHaveText(
      'Chưa có món thích',
    )
    await expect(page.getByTestId('dish-empty')).toContainText('Bạn chưa thích món nào.')
    await expect(page.getByTestId('dish-empty').getByRole('button')).toHaveText('Xoá bộ lọc')
    expect(preferencesOf(second)).toEqual([])
    expect(preferencesOf(firstEmail)).toEqual([
      { slug: 'banh-mi-pate', kind: 'like' },
      { slug: 'bun-cha', kind: 'dislike' },
      { slug: 'com-tam', kind: 'like' },
    ])
  })

  test('lọc chỉ món thích: thẻ biến mất thì focus sang thẻ kế, mất mạng thì nút về như DB', async ({
    page,
    context,
  }) => {
    await page.goto('/login?redirect=%2Fdishes')
    await waitForHydration(page)
    await page.getByLabel('Email').fill(secondEmail)
    await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
    await page.getByRole('main').getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(/\/dishes$/)
    await waitForDishesHydration(page)

    for (const slug of ['pho-bo', 'bun-cha', 'com-tam']) await press(page, slug, 'like')
    await page.getByTestId('dish-liked-only').click()
    const cards = page.locator('[data-testid^="dish-card-"]')
    await expect(cards).toHaveCount(3)
    const [first, middle, last] = (await cards.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')!.replace('dish-card-', '')),
    )) as [string, string, string]

    /** Bấm Space trên nút đang focus và chờ server lưu xong. */
    const pressSpace = async (slug: string, kind: 'like' | 'dislike') => {
      await button(page, slug, kind).focus()
      const response = page.waitForResponse(
        (res) => res.url().includes('_serverFn') && res.request().method() === 'POST',
      )
      await page.keyboard.press('Space')
      expect((await response).ok()).toBe(true)
    }

    await pressSpace(first, 'like')
    await expect(cards).toHaveCount(2)
    await expect(button(page, middle, 'like')).toBeFocused()

    await pressSpace(last, 'dislike')
    await expect(cards).toHaveCount(1)
    await expect(button(page, middle, 'like')).toBeFocused()

    await pressSpace(middle, 'like')
    await expect(page.getByTestId('dish-empty')).toBeVisible()
    await expect(page.getByTestId('dish-count')).toBeFocused()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
    expect(preferencesOf(secondEmail)).toEqual([{ slug: last, kind: 'dislike' }])

    await page.getByTestId('dish-empty').getByRole('button', { name: 'Xoá bộ lọc' }).click()
    await expect(cards).toHaveCount(100)

    await context.setOffline(true)
    try {
      await button(page, 'pho-bo', 'like').click()
      await expect(page.getByText('Không lưu được lựa chọn. Thử lại giúp mình nhé.')).toBeVisible()
      await expect(button(page, 'pho-bo', 'like')).toHaveAttribute('aria-pressed', 'false')
      await expect(button(page, last, 'dislike')).toHaveAttribute('aria-pressed', 'true')
    } finally {
      await context.setOffline(false)
    }
    expect(preferencesOf(secondEmail)).toEqual([{ slug: last, kind: 'dislike' }])
  })
})
