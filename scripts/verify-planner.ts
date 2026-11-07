/**
 * Kiểm chứng vét cạn có chặn cho `buildPlan` (packages/domain/src/planner.ts).
 *
 * Chạy planner THẬT trên mọi bộ món nhỏ trong phạm vi (xem `BOUNDS`), so với một
 * oracle vét cạn độc lập: "có tồn tại lịch hợp lệ không, ở ngân sách nào".
 * Thuộc tính kiểm (khớp docs/spec.md §6.2):
 *
 * - P1 an toàn: plan `feasible` có đúng `days` ngày × 3 bữa sáng→trưa→tối, món phục vụ
 *   đúng bữa, giá = giá trong `dishes`, tổng ngày ≤ `dailyBudgetVnd`, `totalVnd` = tổng
 *   các ngày, không món nào lặp trong cửa sổ 2 ngày (hôm nay + hôm qua).
 * - P2 thất bại sạch: `feasible:false` ⇒ `days:[]`, `totalVnd:0`.
 * - P3 gợi ý xếp được: `minimumDailyBudgetVnd > 0` khi infeasible ⇒ chạy lại planner ở
 *   mức đó thì `feasible`, và mức đó là bội 1.000đ.
 * - P4 "0 = thiếu món": `minimumDailyBudgetVnd = 0` khi infeasible ⇒ không có lịch hợp
 *   lệ ở bất kỳ ngân sách nào.
 * - P5 nhỏ nhất thật: `minimumDailyBudgetVnd = M > 0` ⇒ không có lịch hợp lệ nào ở
 *   `M - 1.000`. Hệ quả: planner không bao giờ đòi user tăng tiền khi ngân sách hiện tại
 *   đã đủ xếp lịch.
 * - P6 đổi món giữ P1: trên mọi plan `feasible`, lần lượt bấm "Đổi món" (`swapPlanMeal`)
 *   hai lần cho từng ô theo thứ tự ngày → bữa, giữ món gốc của ô làm mốc như UI. Sau mỗi
 *   lần đổi, plan vẫn thoả P1 và món mới khác món cũ.
 *
 * Chạy: `pnpm verify:planner` (nhanh) hoặc `VERIFY_DEEP=1 pnpm verify:planner` (rộng hơn).
 * Thoát mã 1 và in phản ví dụ nhỏ nhất của mỗi thuộc tính nếu có vi phạm.
 */
import {
  buildPlan,
  mealTypes,
  swapPlanMeal,
  type BuiltPlan,
  type DishCandidate,
} from '../packages/domain/src'

const DEEP = process.env.VERIFY_DEEP === '1'

/** Phạm vi vét cạn. Mỗi món: tập bữa (7 tập khác rỗng) × giá × có/không chay. */
const BOUNDS = DEEP
  ? { maxDishes: 6, prices: [1_000, 2_000, 3_000], veg: [false], days: [1, 2, 3], seeds: [1, 2] }
  : {
      maxDishes: Number(process.env.VERIFY_MAX_DISHES ?? 6),
      prices: [1_000, 2_000],
      veg: [false],
      days: [1, 2, 3],
      seeds: [1],
    }

const MEAL_MASKS = [1, 2, 3, 4, 5, 6, 7] as const

interface DishOption {
  mask: number
  priceVnd: number
  veg: boolean
}

const OPTIONS: DishOption[] = MEAL_MASKS.flatMap((mask) =>
  BOUNDS.prices.flatMap((priceVnd) => BOUNDS.veg.map((veg) => ({ mask, priceVnd, veg }))),
)

function toDish(option: DishOption, index: number): DishCandidate {
  return {
    id: `d${index}`,
    nameVi: `Món ${index}`,
    nameEn: `Dish ${index}`,
    priceVnd: option.priceVnd,
    mealTypes: mealTypes.filter((_, bit) => (option.mask >> bit) & 1),
    tags: option.veg ? ['vegetarian'] : [],
    fillLevel: 2,
    prepMinutes: 10,
  }
}

/** Mọi multiset kích thước `size` trên OPTIONS (thứ tự id không đổi kết quả, xem chooseDish). */
function* catalogs(size: number, start = 0, prefix: number[] = []): Generator<number[]> {
  if (prefix.length === size) {
    yield prefix
    return
  }
  for (let index = start; index < OPTIONS.length; index += 1) {
    yield* catalogs(size, index, [...prefix, index])
  }
}

interface DayChoice {
  ids: [string, string, string]
  cost: number
}

/** Oracle: mọi bộ 3 món khác nhau phục vụ đúng sáng/trưa/tối. */
function dayChoices(dishes: readonly DishCandidate[]): DayChoice[] {
  const serving = mealTypes.map((meal) => dishes.filter((dish) => dish.mealTypes.includes(meal)))
  const out: DayChoice[] = []

  for (const b of serving[0]!) {
    for (const l of serving[1]!) {
      if (l.id === b.id) continue
      for (const d of serving[2]!) {
        if (d.id === b.id || d.id === l.id) continue
        out.push({ ids: [b.id, l.id, d.id], cost: b.priceVnd + l.priceVnd + d.priceVnd })
      }
    }
  }

  return out
}

const disjoint = (a: DayChoice, b: DayChoice) => a.ids.every((id) => !b.ids.includes(id))

/** Oracle: có lịch `days` ngày, mỗi ngày ≤ budget, hai ngày liền không chung món? */
function planExists(choices: readonly DayChoice[], days: number, budget: number): boolean {
  let reachable = choices.filter((choice) => choice.cost <= budget)

  for (let day = 1; day < days && reachable.length > 0; day += 1) {
    const previous = reachable
    reachable = reachable.filter((choice) => previous.some((prev) => disjoint(prev, choice)))
  }

  return reachable.length > 0
}

interface Violation {
  property: string
  detail: string
  catalog: DishCandidate[]
  days: number
  dailyBudgetVnd: number
  seed: number
}

function checkSafety(
  plan: BuiltPlan,
  dishes: readonly DishCandidate[],
  days: number,
): string | null {
  const byId = new Map(dishes.map((dish) => [dish.id, dish]))

  if (plan.days.length !== days) return `có ${plan.days.length} ngày, cần ${days}`

  let sum = 0
  for (const [index, day] of plan.days.entries()) {
    const order = day.meals.map((meal) => meal.mealType).join(',')
    if (order !== mealTypes.join(',')) return `ngày ${index}: thứ tự bữa ${order}`

    let dayTotal = 0
    for (const meal of day.meals) {
      const dish = byId.get(meal.dishId)
      if (!dish) return `ngày ${index}: món lạ ${meal.dishId}`
      if (!dish.mealTypes.includes(meal.mealType))
        return `ngày ${index}: ${dish.id} không phục vụ ${meal.mealType}`
      if (meal.priceVnd !== dish.priceVnd)
        return `ngày ${index}: giá ${meal.priceVnd} ≠ giá DB ${dish.priceVnd}`
      dayTotal += dish.priceVnd
    }

    if (day.totalVnd !== dayTotal) return `ngày ${index}: totalVnd ${day.totalVnd} ≠ ${dayTotal}`
    if (dayTotal > plan.dailyBudgetVnd)
      return `ngày ${index}: ${dayTotal} > ngân sách ${plan.dailyBudgetVnd}`

    const window = new Set(
      [...(plan.days[index - 1]?.meals ?? []), ...day.meals].map((meal) => meal.dishId),
    )
    const count = (plan.days[index - 1]?.meals.length ?? 0) + day.meals.length
    if (window.size !== count) return `ngày ${index}: lặp món trong cửa sổ 2 ngày`

    sum += dayTotal
  }

  if (plan.totalVnd !== sum) return `totalVnd ${plan.totalVnd} ≠ tổng ngày ${sum}`
  return null
}

/** Thay món của một ô, tính lại tổng ngày và tổng plan như khi đọc lại từ DB. */
function withMeal(plan: BuiltPlan, dayIndex: number, mealIndex: number, dish: DishCandidate) {
  const days = plan.days.map((day, index) => {
    if (index !== dayIndex) return day
    const meals = day.meals.map((meal, position) =>
      position === mealIndex
        ? {
            ...meal,
            dishId: dish.id,
            nameVi: dish.nameVi,
            nameEn: dish.nameEn,
            priceVnd: dish.priceVnd,
          }
        : meal,
    )
    return { ...day, meals, totalVnd: meals.reduce((sum, meal) => sum + meal.priceVnd, 0) }
  })

  return { ...plan, days, totalVnd: days.reduce((sum, day) => sum + day.totalVnd, 0) }
}

/** P6: bấm đổi món 2 lần ở từng ô, kiểm lại P1 sau mỗi lần. Trả lỗi đầu tiên hoặc `null`. */
function checkSwaps(
  start: BuiltPlan,
  dishes: readonly DishCandidate[],
  days: number,
): string | null {
  let plan = start

  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
    for (const [mealIndex, mealType] of mealTypes.entries()) {
      const anchorDishId = plan.days[dayIndex]!.meals[mealIndex]!.dishId

      for (let press = 1; press <= 2; press += 1) {
        const current = plan.days[dayIndex]!.meals[mealIndex]!.dishId
        const next = swapPlanMeal(
          { ...plan, dietTags: [] },
          { dayIndex, mealType, anchorDishId },
          dishes,
        )
        if (!next) break
        const where = `đổi ngày ${dayIndex} ${mealType} lần ${press} (${current} → ${next.id})`
        if (next.id === current) return `${where}: trả lại đúng món cũ`

        plan = withMeal(plan, dayIndex, mealIndex, next)
        swaps += 1
        const problem = checkSafety(plan, dishes, days)
        if (problem) return `${where}: ${problem}`
      }
    }
  }

  return null
}

const firstByProperty = new Map<string, Violation>()
const countByProperty = new Map<string, number>()
let runs = 0
let swaps = 0
const startedAt = Date.now()

function report(violation: Violation) {
  countByProperty.set(violation.property, (countByProperty.get(violation.property) ?? 0) + 1)
  if (!firstByProperty.has(violation.property)) firstByProperty.set(violation.property, violation)
}

const maxBudget = 3 * Math.max(...BOUNDS.prices)
const budgets: number[] = []
for (let budget = 3 * Math.min(...BOUNDS.prices); budget <= maxBudget; budget += 1_000)
  budgets.push(budget)

for (let size = 3; size <= BOUNDS.maxDishes; size += 1) {
  for (const picked of catalogs(size)) {
    const dishes = picked.map((option, index) => toDish(OPTIONS[option]!, index))
    const choices = dayChoices(dishes)

    for (const days of BOUNDS.days) {
      const existsAt = (budget: number) => planExists(choices, days, budget)
      const existsAtAll = existsAt(Number.POSITIVE_INFINITY)

      for (const dailyBudgetVnd of budgets) {
        for (const seed of BOUNDS.seeds) {
          const input = { days, dailyBudgetVnd, roleSlug: 'student', dietTags: [], dishes, seed }
          const plan = buildPlan(input)
          const context = { catalog: dishes, days, dailyBudgetVnd, seed }
          runs += 1

          if (plan.feasible) {
            const problem = checkSafety(plan, dishes, days)
            if (problem) report({ property: 'P1 an toàn', detail: problem, ...context })
            const swapProblem = problem ? null : checkSwaps(plan, dishes, days)
            if (swapProblem)
              report({ property: 'P6 đổi món giữ P1', detail: swapProblem, ...context })
            continue
          }

          if (plan.days.length !== 0 || plan.totalVnd !== 0) {
            report({
              property: 'P2 thất bại sạch',
              detail: 'infeasible nhưng còn ngày/tiền',
              ...context,
            })
          }

          const minimum = plan.minimumDailyBudgetVnd

          if (minimum === 0) {
            if (existsAtAll) {
              report({
                property: 'P4 0 = thiếu món',
                detail: 'báo thiếu món nhưng tăng tiền thì có lịch',
                ...context,
              })
            }
            continue
          }

          if (minimum % 1_000 !== 0) {
            report({
              property: 'P3 gợi ý xếp được',
              detail: `mức gợi ý ${minimum} không là bội 1.000đ`,
              ...context,
            })
          } else if (!buildPlan({ ...input, dailyBudgetVnd: minimum }).feasible) {
            report({
              property: 'P3 gợi ý xếp được',
              detail: `planner vẫn infeasible ở mức gợi ý ${minimum}`,
              ...context,
            })
          }

          if (existsAt(minimum - 1_000)) {
            report({
              property: 'P5 nhỏ nhất thật',
              detail: `gợi ý ${minimum} nhưng đã có lịch hợp lệ ở ${minimum - 1_000}${existsAt(dailyBudgetVnd) ? ' (và ở chính ngân sách user)' : ''}`,
              ...context,
            })
          }
        }
      }
    }
  }
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
console.log(
  `verify-planner: ${runs} lần chạy buildPlan, ${swaps} lần đổi món trong ${seconds}s (${DEEP ? 'deep' : 'nhanh'})`,
)
console.log(
  `phạm vi: ≤${BOUNDS.maxDishes} món, giá ${BOUNDS.prices.join('/')}, chay ${BOUNDS.veg.join('/')}, days ${BOUNDS.days.join('/')}, seed ${BOUNDS.seeds.join('/')}`,
)

if (firstByProperty.size === 0) {
  console.log('OK: P1–P6 đúng trên toàn bộ phạm vi.')
} else {
  for (const [property, violation] of firstByProperty) {
    console.log(
      `\nVI PHẠM ${property} (${countByProperty.get(property)} trường hợp). Ví dụ đầu tiên:`,
    )
    console.log(`  ${violation.detail}`)
    console.log(
      `  days=${violation.days} dailyBudgetVnd=${violation.dailyBudgetVnd} seed=${violation.seed}`,
    )
    for (const dish of violation.catalog) {
      console.log(
        `  ${dish.id}: ${dish.mealTypes.join('+')} ${dish.priceVnd}đ${dish.tags.length ? ` [${dish.tags.join(',')}]` : ''}`,
      )
    }
  }
  process.exit(1)
}
