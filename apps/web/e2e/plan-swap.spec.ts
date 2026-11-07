import AxeBuilder from '@axe-core/playwright'
import { createDb, insertUser } from '@mam/db'
import { addDays, todayIsoDate, type MealType } from '@mam/domain'
import { formatVnd } from '@mam/i18n'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../src/server/password'
import { uniqueEmail, waitForHydration } from './support'

const databasePath = fileURLToPath(new URL('../.e2e/mam.db', import.meta.url))
const DAILY_BUDGET = 100_000

interface Row {
  dayIndex: number
  mealType: MealType
  dishId: string
  priceVnd: number
}

interface DishRow {
  id: string
  nameVi: string
  priceVnd: number
  mealTypes: MealType[]
}

function query<T>(run: (sqlite: ReturnType<typeof createDb>['sqlite']) => T): T {
  const { sqlite } = createDb(databasePath)
  try {
    return run(sqlite)
  } finally {
    sqlite.close()
  }
}

const planRows = (planId: string) =>
  query(
    (sqlite) =>
      sqlite
        .prepare(
          'select day_index as dayIndex, meal_type as mealType, dish_id as dishId, price_vnd as priceVnd from plan_items where plan_id = ? order by day_index, meal_type',
        )
        .all(planId) as Row[],
  )

const dishMap = () =>
  new Map(
    query(
      (sqlite) =>
        sqlite
          .prepare(
            'select id, name_vi as nameVi, price_vnd as priceVnd, meal_types as mealTypes from dishes',
          )
          .all() as Array<Omit<DishRow, 'mealTypes'> & { mealTypes: string }>,
    ).map((dish) => [dish.id, { ...dish, mealTypes: JSON.parse(dish.mealTypes) as MealType[] }]),
  )

const cellOf = (planId: string, dayIndex: number, mealType: MealType) =>
  planRows(planId).find((row) => row.dayIndex === dayIndex && row.mealType === mealType)!

/** Bất biến sau mỗi lần đổi: giá từ `dishes`, đúng bữa, ngày ≤ ngân sách, không lặp 2 ngày liền. */
function expectPlanInvariants(planId: string): void {
  const dishes = dishMap()
  const rows = planRows(planId)
  const days = new Map<number, Row[]>()
  for (const row of rows) days.set(row.dayIndex, [...(days.get(row.dayIndex) ?? []), row])

  for (const [dayIndex, items] of days) {
    for (const item of items) {
      expect(item.priceVnd).toBe(dishes.get(item.dishId)!.priceVnd)
      expect(dishes.get(item.dishId)!.mealTypes).toContain(item.mealType)
    }
    expect(items.reduce((sum, item) => sum + item.priceVnd, 0)).toBeLessThanOrEqual(DAILY_BUDGET)
    const window = [...(days.get(dayIndex - 1) ?? []), ...items].map((item) => item.dishId)
    expect(new Set(window).size).toBe(window.length)
  }
}

const spentBefore = (planId: string, dayIndex: number) =>
  planRows(planId)
    .filter((row) => row.dayIndex < dayIndex)
    .reduce((sum, row) => sum + row.priceVnd, 0)

function setStartDate(planId: string, startDate: string): void {
  query((sqlite) =>
    sqlite.prepare('update plans set start_date = ? where id = ?').run(startDate, planId),
  )
}

/** Trang chi tiết không có form; chờ React gắn handler lên nút đổi món. */
async function waitForButtons(page: Page, button: Locator): Promise<void> {
  await expect(button).toBeVisible()
  await button.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const check = () =>
          Object.keys(element).some((key) => key.startsWith('__reactProps$'))
            ? resolve()
            : setTimeout(check, 50)
        check()
      }),
  )
}

/** Hàng của ô trong bảng desktop, mang `data-dish-id` của món đang hiện. */
const rowOf = (page: Page, dayIndex: number, mealType: MealType) =>
  page.getByTestId(`plan-day-${dayIndex}`).locator(`tr[data-meal-type="${mealType}"]`)

/** Yêu cầu POST tới server function, tức các lần gọi `swapPlanMeal` (tải lại dữ liệu là GET). */
const swapRequests = (page: Page) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('_serverFn')) {
      requests.push(request.url())
    }
  })
  return requests
}

const backgroundOf = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor)

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/**
 * Tạo tài khoản thẳng trong DB rồi đăng nhập: giới hạn đăng ký theo IP dùng chung cho
 * cả bộ e2e và các spec khác đã dùng hết.
 */
async function createWeekPlan(page: Page): Promise<string> {
  const email = uniqueEmail('swap')
  const passwordHash = await hashPassword('matkhau123')
  const { db, sqlite } = createDb(databasePath)
  try {
    insertUser(db, { email, passwordHash })
  } finally {
    sqlite.close()
  }

  await page.goto('/login?redirect=%2Fplans')
  await waitForHydration(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
  await page.getByRole('main').getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await waitForHydration(page)

  await page.getByTestId('plan-budget').fill(String(DAILY_BUDGET))
  await page.getByTestId('plan-submit').click()
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+$/)

  return new URL(page.url()).pathname.split('/').at(-1)!
}

test.describe('đổi một món trong thực đơn', () => {
  test('đổi bữa trưa ngày 3, bấm tiếp xoay vòng, hết món thì báo, mobile đổi bằng bàn phím', async ({
    page,
  }) => {
    const planId = await createWeekPlan(page)
    const dishes = dishMap()
    const cell = page.getByTestId('plan-swap-2-lunch')
    const row = rowOf(page, 2, 'lunch')
    const status = page.getByTestId('plan-swap-status')
    const original = cellOf(planId, 2, 'lunch')

    await waitForButtons(page, cell)
    await expect(page.getByTestId('plan-diet-none')).toBeVisible()
    await expect(row).toHaveAttribute('data-dish-id', original.dishId)
    await expect(cell).toHaveAccessibleName(
      `Đổi món bữa trưa ngày 3, đang là ${dishes.get(original.dishId)!.nameVi}`,
    )

    const shown: Row[] = []
    for (let press = 0; press < 3; press += 1) {
      const before = await row.getAttribute('data-dish-id')
      await cell.click()
      await expect(row).not.toHaveAttribute('data-dish-id', before!)

      const now = cellOf(planId, 2, 'lunch')
      await expect(row).toHaveAttribute('data-dish-id', now.dishId)
      await expect(status).toHaveText(
        `Đã đổi bữa trưa ngày 3 sang ${dishes.get(now.dishId)!.nameVi}.`,
      )
      const dayTotal = planRows(planId)
        .filter((row) => row.dayIndex === 2)
        .reduce((sum, row) => sum + row.priceVnd, 0)
      await expect(page.getByTestId('plan-day-2')).toHaveAttribute(
        'data-total-vnd',
        String(dayTotal),
      )
      expectPlanInvariants(planId)
      shown.push(now)
    }

    expect(new Set(shown.map((row) => row.dishId)).size).toBe(3)
    expect(shown.map((row) => row.dishId)).not.toContain(original.dishId)
    const distances = shown.map((row) => Math.abs(row.priceVnd - original.priceVnd))
    expect(distances).toEqual([...distances].sort((a, b) => a - b))

    // Thẻ ngân sách còn lại cập nhật theo giá món mới của ngày đã qua.
    setStartDate(planId, addDays(todayIsoDate(), -3))
    await page.reload()
    const breakfast = page.getByTestId('plan-swap-0-breakfast')
    const breakfastRow = rowOf(page, 0, 'breakfast')
    await waitForButtons(page, breakfast)
    const spentBeforeSwap = spentBefore(planId, 3)
    await expect(page.getByTestId('plan-remaining-spent')).toHaveText(
      formatVnd(spentBeforeSwap, 'vi'),
    )
    // Món gần giá nhất có thể cùng giá; bấm tiếp tới khi giá đổi.
    for (let press = 0; press < 5 && spentBefore(planId, 3) === spentBeforeSwap; press += 1) {
      const oldBreakfast = await breakfastRow.getAttribute('data-dish-id')
      await breakfast.click()
      await expect(breakfastRow).not.toHaveAttribute('data-dish-id', oldBreakfast!)
    }
    expect(spentBefore(planId, 3)).not.toBe(spentBeforeSwap)
    await expect(page.getByTestId('plan-remaining-spent')).toHaveText(
      formatVnd(spentBefore(planId, 3), 'vi'),
    )
    await expect(page.getByTestId('plan-detail-total')).toHaveText(
      formatVnd(
        planRows(planId).reduce((sum, row) => sum + row.priceVnd, 0),
        'vi',
      ),
    )

    // Chán mọi món trưa khác → không còn món thay thế, DB giữ nguyên.
    const current = cellOf(planId, 2, 'lunch')
    query((sqlite) => {
      const userId = (
        sqlite.prepare('select user_id as id from plans where id = ?').get(planId) as { id: string }
      ).id
      const insert = sqlite.prepare(
        "insert into dish_preferences (user_id, dish_id, kind, created_at) values (?, ?, 'dislike', ?)",
      )
      for (const dish of dishes.values()) {
        if (dish.mealTypes.includes('lunch') && dish.id !== current.dishId) {
          insert.run(userId, dish.id, Date.now())
        }
      }
    })
    const before = planRows(planId)
    await cell.click()
    await expect(status).toHaveText('Không còn món nào khác hợp lệ cho bữa trưa ngày 3.')
    await expect(row).toHaveAttribute('data-dish-id', current.dishId)
    expect(planRows(planId)).toEqual(before)

    // Mobile 390px, chỉ bàn phím: mở accordion ngày 3, Tab tới ô bữa tối, Enter để đổi.
    query((sqlite) => sqlite.prepare('delete from dish_preferences').run())
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    const mobileDinner = page.getByTestId('plan-swap-mobile-2-dinner')
    const summary = page.getByTestId('plan-day-mobile-2').locator('summary')
    await waitForButtons(page, summary)
    const oldDinner = cellOf(planId, 2, 'dinner')

    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(mobileDinner).toBeVisible()
    await waitForButtons(page, mobileDinner)
    for (let tab = 0; tab < 3; tab += 1) await page.keyboard.press('Tab')
    await expect(mobileDinner).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(mobileDinner).not.toHaveText(dishes.get(oldDinner.dishId)!.nameVi)
    await expect(mobileDinner).toHaveText(dishes.get(cellOf(planId, 2, 'dinner').dishId)!.nameVi)
    await expect(mobileDinner).toBeFocused()
    expectPlanInvariants(planId)

    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze()
    expect(
      violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      })),
    ).toEqual([])
  })

  test('tải lại trang vẫn xoay tiếp từ món gốc, ô vừa đổi sáng lên rồi tắt, bấm đúp chỉ gửi một yêu cầu', async ({
    page,
  }) => {
    const planId = await createWeekPlan(page)
    const cell = page.getByTestId('plan-swap-2-lunch')
    const row = rowOf(page, 2, 'lunch')
    const original = cellOf(planId, 2, 'lunch')
    const requests = swapRequests(page)

    const shown: Row[] = []
    for (let press = 0; press < 3; press += 1) {
      await waitForButtons(page, cell)
      const before = await row.getAttribute('data-dish-id')
      await cell.click()
      await expect(row).not.toHaveAttribute('data-dish-id', before!)
      shown.push(cellOf(planId, 2, 'lunch'))
      await page.reload()
    }
    expect(new Set(shown.map((item) => item.dishId)).size).toBe(3)
    expect(shown.map((item) => item.dishId)).not.toContain(original.dishId)
    const distances = shown.map((item) => Math.abs(item.priceVnd - original.priceVnd))
    expect(distances).toEqual([...distances].sort((a, b) => a - b))

    // Ô vừa đổi sáng lên ~1,5 giây rồi trở lại bình thường (bàn phím, chuột để ngoài ô).
    const dinner = page.getByTestId('plan-swap-4-dinner')
    await waitForButtons(page, dinner)
    await page.mouse.move(0, 0)
    expect(await backgroundOf(dinner)).toBe(TRANSPARENT)
    await dinner.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => backgroundOf(dinner)).not.toBe(TRANSPARENT)
    await expect.poll(() => backgroundOf(dinner), { timeout: 4_000 }).toBe(TRANSPARENT)

    // Giảm chuyển động: vẫn có dấu hiệu nhưng không chạy animation.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.keyboard.press('Enter')
    await expect.poll(() => backgroundOf(dinner)).not.toBe(TRANSPARENT)
    expect(await dinner.evaluate((element) => element.getAnimations().length)).toBe(0)
    await expect.poll(() => backgroundOf(dinner), { timeout: 4_000 }).toBe(TRANSPARENT)

    // Hai cú bấm liền nhau trước khi React kịp render lại: chỉ một yêu cầu đổi món.
    const breakfast = page.getByTestId('plan-swap-5-breakfast')
    const breakfastRow = rowOf(page, 5, 'breakfast')
    const oldBreakfast = await breakfastRow.getAttribute('data-dish-id')
    requests.length = 0
    await breakfast.evaluate((element: HTMLElement) => {
      element.click()
      element.click()
    })
    await expect(breakfastRow).not.toHaveAttribute('data-dish-id', oldBreakfast!)
    await page.waitForLoadState('networkidle')
    expect(requests).toHaveLength(1)
  })

  test('accordion mobile chỉ vẽ món của ngày đang mở, kể cả ngày mở trước khi trang hydrate xong', async ({
    page,
  }) => {
    const planId = await createWeekPlan(page)
    const dishes = dishMap()

    // HTML server trả về: đủ 21 nút của bảng desktop, không có nút nào trong 7 ngày đang đóng.
    const html = await (await page.request.get(`/plans/${planId}`)).text()
    expect(html.match(/data-testid="plan-swap-\d+-/g)).toHaveLength(21)
    expect(html).not.toContain('data-testid="plan-swap-mobile-')

    // Script bị giữ lại: mở ngày 4 khi React chưa chạy, rồi mới cho trang hydrate.
    let releaseScripts = () => {}
    const scriptsHeld = new Promise<void>((resolve) => (releaseScripts = resolve))
    await page.route(
      () => true,
      async (route) => {
        if (route.request().resourceType() === 'script') await scriptsHeld
        await route.continue()
      },
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/plans/${planId}`, { waitUntil: 'commit' })
    const day = page.getByTestId('plan-day-mobile-3')
    await day.locator('summary').click()
    await expect(day).toHaveJSProperty('open', true)
    releaseScripts()

    const breakfast = page.getByTestId('plan-swap-mobile-3-breakfast')
    await waitForButtons(page, breakfast)
    await expect(breakfast).toHaveText(dishes.get(cellOf(planId, 3, 'breakfast').dishId)!.nameVi)
    await expect(page.getByTestId('plan-swap-mobile-2-breakfast')).toHaveCount(0)

    // Đóng lại thì danh sách món của ngày đó cũng rời khỏi trang.
    await day.locator('summary').click()
    await expect(breakfast).toHaveCount(0)
  })
})
