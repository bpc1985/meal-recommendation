import { expect, test } from '@playwright/test'
import { uniqueEmail, waitForHydration } from './support'

/**
 * Lịch sử dài chia trang 10 lượt: 11 lượt gợi ý thật qua `/recommend` → trang 1
 * có 10, trang 2 có 1; trang nằm trên URL nên back/reload/chia sẻ link đều đúng.
 */
test.describe('history pagination', () => {
  test('11 lượt → 2 trang, bấm trang 2, back về trang 1, URL lạ bị kẹp', async ({ page }) => {
    await page.goto('/register?redirect=%2Frecommend')
    await waitForHydration(page)
    await page.getByLabel('Email').fill(uniqueEmail('e2e.history'))
    await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
    await expect(page).toHaveURL(/\/recommend$/)
    await waitForHydration(page)

    await page.getByLabel('Số tiền').fill('60000')
    const suggest = page.getByRole('button', { name: 'Gợi ý 3 bữa' })

    for (let round = 0; round < 11; round += 1) {
      const response = page.waitForResponse(
        (res) => res.url().includes('_serverFn') && res.request().method() === 'POST',
      )
      await suggest.click()
      expect((await response).ok(), `lượt ${round + 1}`).toBe(true)
      await expect(suggest).toBeEnabled()
    }

    await page.goto('/history')
    const batches = page.locator('[data-testid^="history-batch-"]')
    const pagination = page.getByRole('navigation', { name: 'Phân trang lịch sử' })

    await expect(batches).toHaveCount(10)
    await expect(pagination).toBeVisible()
    await expect(pagination.getByRole('link', { name: 'Trang 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByTestId('history-page-status')).toHaveText('Trang 1 / 2')
    const firstPageIds = await batches.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.testid),
    )

    await pagination.getByRole('link', { name: 'Trang 2' }).click()
    await expect(page).toHaveURL(/\/history\?page=2$/)
    await expect(batches).toHaveCount(1)
    expect(firstPageIds).not.toContain(await batches.first().getAttribute('data-testid'))
    await expect(page.getByTestId('history-page-next')).toHaveAttribute('aria-disabled', 'true')

    await page.goBack()
    await expect(page).toHaveURL(/\/history$/)
    await expect(batches).toHaveCount(10)

    await page.reload()
    await expect(batches).toHaveCount(10)

    await page.goto('/history?page=99')
    await expect(page).toHaveURL(/\/history\?page=2$/)
    await expect(batches).toHaveCount(1)
  })
})
