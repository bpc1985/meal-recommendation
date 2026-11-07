import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Cổng a11y (spec S9): 0 vi phạm axe-core trên các trang chính, cả vi/en và dark.
 * Chỉ chạy headless nên nhét vừa CI; phần kiểm thủ công sâu hơn (bàn phím, skip
 * link, reduced-motion) nằm ở `scripts/checkpoint-a11y.mjs`.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

async function scan(page: Page, path: string, locale: 'vi' | 'en', label: string) {
  await page
    .context()
    .addCookies([{ name: 'mam_locale', value: locale, domain: 'localhost', path: '/' }])
  await page.goto(path)
  await page.locator('main').waitFor()
  // Font tự host đổi metric khi tải xong → chờ cả network lẫn font trước khi quét.
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)

  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()

  expect(
    violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help} :: ${violation.nodes
          .map((node) => node.target.join(' '))
          .join(' | ')}`,
    ),
    `axe violations on ${label}`,
  ).toEqual([])
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.locator('h1')).toHaveCount(1)
}

test.describe('a11y', () => {
  test('vi: trang chủ, gợi ý và chat không có vi phạm', async ({ page }) => {
    for (const path of ['/', '/recommend', '/chat']) {
      await scan(page, path, 'vi', `vi ${path}`)
    }
  })

  test('en: trang chủ không có vi phạm và đổi ngôn ngữ tài liệu', async ({ page }) => {
    await scan(page, '/', 'en', 'en /')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/What|eat|budget/i)
  })
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('dark: trang chủ và gợi ý không có vi phạm contrast', async ({ page }) => {
    for (const path of ['/', '/recommend']) {
      await scan(page, path, 'vi', `dark ${path}`)
    }
  })
})
