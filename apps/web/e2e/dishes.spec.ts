import { createDb } from '@mam/db'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const databasePath = fileURLToPath(new URL('../.e2e/mam.db', import.meta.url))

function countFromDb(sql: string): number {
  const { sqlite } = createDb(databasePath)
  try {
    return (sqlite.prepare(sql).get() as { value: number }).value
  } finally {
    sqlite.close()
  }
}

/** Trang không có `<form>`, nên chờ React gắn handler lên chính ô tìm món. */
async function waitForSearchHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const input = document.querySelector('#dish-search')
      return !!input && Object.keys(input).some((key) => key.startsWith('__reactProps$'))
    },
    undefined,
    { timeout: 20_000 },
  )
}

/**
 * Duyệt 100 món: tìm không dấu, lọc bữa + tag, filter sống trên URL nên reload
 * và back đều khôi phục đúng, số thẻ luôn khớp SQL trên chính DB của server.
 */
test.describe('duyệt món /dishes', () => {
  test('tìm, lọc, reload và back giữ đúng filter', async ({ page }) => {
    const cards = page.locator('[data-testid^="dish-card-"]')
    const search = page.getByLabel('Tìm món')

    await page.goto('/dishes')
    await expect(cards).toHaveCount(100)
    await waitForSearchHydration(page)

    await search.fill('com tam')
    await expect(page.getByTestId('dish-card-com-tam')).toBeVisible()
    await expect(page).toHaveURL(/\/dishes\?q=com(\+|%20)tam$/)

    await search.fill('pho')
    const phoCount = countFromDb(
      "select count(*) as value from dishes where name_vi like '%Phở%' or name_en like '%phở%'",
    )
    await expect(cards).toHaveCount(phoCount)
    for (const name of await cards.getByTestId('dish-name').allTextContents()) {
      expect(name).toMatch(/Phở/)
    }

    await search.fill('')
    await expect(cards).toHaveCount(100)

    await page.getByTestId('dish-meal-breakfast').click()
    await expect(page).toHaveURL(/\/dishes\?meal=breakfast$/)
    await page.getByTestId('dish-tag-vegetarian').click()
    await expect(page).toHaveURL(/\/dishes\?meal=breakfast&tag=vegetarian$/)

    const expected = countFromDb(
      `select count(*) as value from dishes
       where meal_types like '%"breakfast"%' and tags like '%"vegetarian"%'`,
    )
    expect(expected).toBeGreaterThan(0)
    await expect(cards).toHaveCount(expected)
    await expect(page.getByTestId('dish-count')).toHaveText(`${expected} món`)

    await page.reload()
    await expect(cards).toHaveCount(expected)
    await expect(page.getByTestId('dish-meal-breakfast')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('dish-tag-vegetarian')).toHaveAttribute('aria-pressed', 'true')
    await waitForSearchHydration(page)

    await page.goBack()
    await expect(page).toHaveURL(/\/dishes\?meal=breakfast$/)
    await expect(page.getByTestId('dish-tag-vegetarian')).toHaveAttribute('aria-pressed', 'false')
    await expect(cards).toHaveCount(
      countFromDb(`select count(*) as value from dishes where meal_types like '%"breakfast"%'`),
    )
  })

  test('không món nào khớp → trạng thái rỗng, nút xoá bộ lọc về đủ 100 món', async ({ page }) => {
    await page.goto('/dishes?q=zzzz')
    await expect(page.getByTestId('dish-empty')).toBeVisible()
    await waitForSearchHydration(page)

    await page.getByTestId('dish-empty').getByRole('button', { name: 'Xoá bộ lọc' }).click()
    await expect(page).toHaveURL(/\/dishes$/)
    await expect(page.locator('[data-testid^="dish-card-"]')).toHaveCount(100)
    await expect(page.getByLabel('Tìm món')).toHaveValue('')
    await expect(page.getByLabel('Tìm món')).toBeFocused()
  })

  test('nút xoá bộ lọc cạnh số kết quả đưa focus về ô tìm', async ({ page }) => {
    await page.goto('/dishes?meal=lunch')
    await waitForSearchHydration(page)

    await page.getByRole('button', { name: 'Xoá bộ lọc' }).click()
    await expect(page).toHaveURL(/\/dishes$/)
    await expect(page.getByLabel('Tìm món')).toBeFocused()
  })

  test('URL có tham số rác: không vỡ trang, bỏ tham số rác, đủ 100 món', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const cards = page.locator('[data-testid^="dish-card-"]')

    for (const query of [
      'q=123',
      'q=%7B%7D',
      'q=%20%20',
      'tag=5',
      'tag=true',
      'tag=VEG',
      'tag=foo',
      'meal=brunch',
      'meal=%5B%22dinner%22%5D',
      'meal=lunch&meal=dinner',
      'min=abc',
      'max=abc',
      'min=-5',
      'max=20000.5',
    ]) {
      const response = await page.goto(`/dishes?${query}`)
      expect(response?.status(), query).toBe(200)
      await expect(cards, query).toHaveCount(100)
      await waitForSearchHydration(page)
      await expect(cards, `${query} sau hydrate`).toHaveCount(100)
      await expect(page.getByLabel('Tìm món'), query).toHaveValue('')
      await expect(page.getByLabel('Giá từ (đ)'), query).toHaveValue('')
      await expect(page.getByLabel('Giá đến (đ)'), query).toHaveValue('')
    }
    expect(errors).toEqual([])
  })

  test('giá trên URL "20.000" là 20 nghìn; ô giá quá trần không bị xoá', async ({ page }) => {
    const cards = page.locator('[data-testid^="dish-card-"]')

    await page.goto('/dishes?min=20.000')
    await expect(cards).toHaveCount(
      countFromDb('select count(*) as value from dishes where price_vnd >= 20000'),
    )
    await expect(page.getByLabel('Giá từ (đ)')).toHaveValue('20.000')
    await waitForSearchHydration(page)

    const max = page.getByLabel('Giá đến (đ)')
    await max.fill('99999999')
    await page.waitForTimeout(600)
    await expect(max).toHaveValue('99999999')
    await expect(max).toHaveAttribute('aria-invalid', 'true')
  })

  test('back sau khi gõ về đúng filter trước lúc gõ', async ({ page }) => {
    await page.goto('/dishes?meal=lunch')
    await waitForSearchHydration(page)

    const search = page.getByLabel('Tìm món')
    await search.pressSequentially('com', { delay: 40 })
    await expect(page).toHaveURL(/\/dishes\?q=com&meal=lunch$/)
    await search.pressSequentially(' tam', { delay: 40 })
    await expect(page).toHaveURL(/\/dishes\?q=com(\+|%20)tam&meal=lunch$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/dishes\?meal=lunch$/)
    await expect(search).toHaveValue('')
  })

  test('tiếng Anh: đếm số ít "1 dish"', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'mam_locale', value: 'en', url: baseURL ?? '' }])
    await page.goto('/dishes?q=pate')
    await expect(page.locator('[data-testid^="dish-card-"]')).toHaveCount(1)
    await expect(page.getByTestId('dish-count')).toHaveText('1 dish')
  })

  test('mobile: chip tag đang chọn nằm đầu thanh cuộn, nhìn thấy được', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dishes?tag=duck')

    const chip = page.getByTestId('dish-tag-duck')
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chip).toBeInViewport()
  })

  for (const [locale, menuLabel, navLabel] of [
    ['vi', 'Mở menu', 'Điều hướng chính'],
    ['en', 'Open menu', 'Main navigation'],
  ] as const) {
    test(`header ${locale}: menu gọn ở 768/900, thanh điều hướng một dòng ở 1024`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([{ name: 'mam_locale', value: locale, url: baseURL ?? '' }])

      for (const width of [768, 900]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/dishes')
        await expect(page.getByRole('navigation', { name: navLabel })).toBeHidden()
        await expect(page.getByRole('button', { name: menuLabel })).toBeVisible()
        expect((await page.locator('header').boundingBox())?.height, `${width}px`).toBe(65)
      }

      await page.setViewportSize({ width: 1024, height: 800 })
      await page.goto('/dishes')
      const nav = page.getByRole('navigation', { name: navLabel })
      await expect(nav).toBeVisible()
      await expect(page.getByRole('button', { name: menuLabel })).toBeHidden()
      expect((await page.locator('header').boundingBox())?.height).toBe(65)
      for (const link of await nav.getByRole('link').all()) {
        expect(
          (await link.boundingBox())?.height,
          (await link.textContent()) ?? '',
        ).toBeLessThanOrEqual(40)
      }
    })
  }
})
