import AxeBuilder from '@axe-core/playwright'
import { createDb } from '@mam/db'
import { addDays, todayIsoDate } from '@mam/domain'
import { formatVnd } from '@mam/i18n'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { uniqueEmail, waitForHydration } from './support'

const databasePath = fileURLToPath(new URL('../.e2e/mam.db', import.meta.url))
const money = (amount: number) => formatVnd(amount, 'vi')

/** Dời ngày bắt đầu của thực đơn để giả lập thực đơn đã chạy được vài ngày. */
function setStartDate(planId: string, startDate: string): void {
  const { sqlite } = createDb(databasePath)
  try {
    sqlite.prepare('update plans set start_date = ? where id = ?').run(startDate, planId)
  } finally {
    sqlite.close()
  }
}

function spentBefore(planId: string, dayIndex: number): number {
  const { sqlite } = createDb(databasePath)
  try {
    return (
      sqlite
        .prepare(
          'select coalesce(sum(price_vnd), 0) as value from plan_items where plan_id = ? and day_index < ?',
        )
        .get(planId, dayIndex) as { value: number }
    ).value
  } finally {
    sqlite.close()
  }
}

/** Đẩy giá một bữa trong thực đơn lên để giả lập các ngày đã qua chi vượt. */
function setDayPrice(planId: string, dayIndex: number, priceVnd: number): void {
  const { sqlite } = createDb(databasePath)
  try {
    sqlite
      .prepare(
        "update plan_items set price_vnd = ? where plan_id = ? and day_index = ? and meal_type = 'lunch'",
      )
      .run(priceVnd, planId, dayIndex)
  } finally {
    sqlite.close()
  }
}

async function createWeekPlan(page: Page): Promise<string> {
  await page.goto('/register?redirect=%2Fplans')
  await waitForHydration(page)
  await page.getByLabel('Email').fill(uniqueEmail('remaining'))
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await waitForHydration(page)

  await page.getByTestId('plan-budget').fill('100000')
  await page.getByTestId('plan-submit').click()
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+$/)

  return new URL(page.url()).pathname.split('/').at(-1)!
}

test.describe('ngân sách còn lại của thực đơn', () => {
  test('thẻ tính đúng theo ngày bắt đầu, nút gợi ý điền sẵn ngân sách mới, chi vượt có bước tiếp theo', async ({
    page,
  }) => {
    const planId = await createWeekPlan(page)
    const card = page.getByTestId('plan-remaining')
    const summary = page.getByTestId('plan-remaining-summary')
    const spentFigure = page.getByTestId('plan-remaining-spent')
    const leftFigure = page.getByTestId('plan-remaining-left')
    const daysFigure = page.getByTestId('plan-remaining-days')
    const dailyFigure = page.getByTestId('plan-remaining-daily')
    const note = page.getByTestId('plan-remaining-note')
    const today = todayIsoDate()

    await expect(card).toHaveAttribute('data-kind', 'inProgress')
    await expect(card.getByText('Chi theo thực đơn đến hôm qua')).toBeVisible()
    await expect(card.getByText('Ngân sách mới mỗi ngày')).toBeVisible()
    await expect(spentFigure).toHaveText(money(0))
    await expect(leftFigure).toHaveText(money(700_000))
    await expect(daysFigure).toHaveText('cho 7 ngày')
    await expect(dailyFigure).toHaveText(money(100_000))
    await expect(note).toBeVisible()
    await expect(summary).toHaveCount(0)
    await expect(page.getByTestId('plan-export-menu')).toBeVisible()

    setStartDate(planId, addDays(today, -3))
    await page.reload()

    const spent = spentBefore(planId, 3)
    const remaining = 700_000 - spent
    const newDaily = Math.floor(remaining / 4 / 1_000) * 1_000

    expect(spent).toBeGreaterThan(0)
    await expect(spentFigure).toHaveText(money(spent))
    await expect(leftFigure).toHaveText(money(remaining))
    await expect(daysFigure).toHaveText('cho 4 ngày')
    await expect(dailyFigure).toHaveText(money(newDaily))
    await expect(page.getByTestId('plan-remaining-overspent')).toHaveCount(0)

    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze()
    expect(violations.map((violation) => violation.id)).toEqual([])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('plan-remaining-recommend').click()
    await expect(page).toHaveURL(new RegExp(`/recommend\\?unit=day&amount=${newDaily}$`))
    await waitForHydration(page)
    const amountField = page.getByLabel('Số tiền')
    await expect(amountField).toHaveValue(String(newDaily))
    await expect(page.getByLabel('Tính theo')).toHaveText('Mỗi ngày')
    await expect(page.getByTestId('recommend-prefill-notice')).toHaveText(
      'Ngân sách lấy từ thực đơn của bạn.',
    )
    await expect(amountField).toBeFocused()
    await expect(amountField).toBeInViewport()
    await expect(page.getByText(/^Gợi ý .* mỗi ngày$/)).toHaveCount(0)

    await amountField.fill('90000')
    await expect(page.getByTestId('recommend-prefill-notice')).toHaveCount(0)
    await expect(page.getByText(/^Gợi ý .* mỗi ngày$/).first()).toBeVisible()

    setStartDate(planId, addDays(today, 1))
    await page.goto(`/plans/${planId}`)
    await expect(card).toHaveAttribute('data-kind', 'notStarted')
    await expect(summary).toContainText('Thực đơn chưa bắt đầu.')
    await expect(note).toHaveCount(0)
    await expect(page.getByTestId('plan-remaining-recommend')).toHaveCount(0)

    setStartDate(planId, addDays(today, -7))
    await page.reload()
    await expect(card).toHaveAttribute('data-kind', 'finished')
    await expect(summary).toHaveText(
      `Thực đơn đã xong. Tổng theo thực đơn ${money(spentBefore(planId, 7))} trên ngân sách ${money(700_000)}.`,
    )
    await expect(note).toHaveCount(0)
    await expect(page.getByTestId('plan-remaining-recommend')).toHaveCount(0)

    // Cùng tài khoản: mỗi IP chỉ được đăng ký vài lần, cả bộ e2e dùng chung hạn mức đó.
    setStartDate(planId, addDays(today, -3))
    setDayPrice(planId, 0, 800_000)
    await page.reload()

    const overspentVnd = spentBefore(planId, 3) - 700_000
    expect(overspentVnd).toBeGreaterThan(0)
    await expect(page.getByTestId('plan-remaining')).toHaveAttribute('data-kind', 'inProgress')
    await expect(page.getByTestId('plan-remaining-overspent')).toHaveText(
      `Thực đơn đã vượt ngân sách ${money(overspentVnd)}.`,
    )
    await expect(page.getByTestId('plan-remaining-overspent-hint')).toHaveText(
      'Thử bớt món đắt ở các ngày còn lại.',
    )
    await expect(page.getByTestId('plan-remaining-daily')).toHaveText(money(0))
    await expect(page.getByTestId('plan-remaining-recommend')).toHaveCount(0)
  })

  test('/recommend điền sẵn từ URL hợp lệ, bỏ giá trị rác và giữ mặc định', async ({ page }) => {
    await page.goto('/recommend')
    await waitForHydration(page)
    const defaultAmount = await page.getByLabel('Số tiền').inputValue()
    expect(defaultAmount).not.toBe('')

    await expect(page.getByTestId('recommend-prefill-notice')).toHaveCount(0)
    await expect(page.getByLabel('Số tiền')).not.toBeFocused()

    await page.goto('/recommend?unit=month&amount=3000000')
    await waitForHydration(page)
    await expect(page.getByTestId('recommend-prefill-notice')).toBeVisible()
    await expect(page.getByLabel('Số tiền')).toHaveValue('3000000')
    await expect(page.getByLabel('Tính theo')).toHaveText('Mỗi tháng')

    await page.goto('/recommend?unit=day&amount=-5')
    await waitForHydration(page)
    await expect(page.getByLabel('Số tiền')).toHaveValue(defaultAmount)
    await expect(page.getByLabel('Tính theo')).toHaveText('Mỗi ngày')

    await expect(page.getByTestId('recommend-prefill-notice')).toHaveCount(0)

    await page.goto('/recommend?unit=week&amount=abc')
    await waitForHydration(page)
    await expect(page.getByTestId('recommend-prefill-notice')).toHaveCount(0)
    await expect(page.getByLabel('Số tiền')).toHaveValue(defaultAmount)
    await expect(page.getByLabel('Tính theo')).toHaveText('Mỗi ngày')
  })
})
