import { VND_STEP } from './budget'
import { mealTypes, type DishCandidate, type MealType } from './contracts'
import { dishMatchesDiet } from './diet'

/** Plan chỉ hỗ trợ tuần/tháng; chặn input lập trình sai thay vì treo vòng lặp. */
export const PLAN_MIN_DAYS = 1
export const PLAN_MAX_DAYS = 31

/** Số lần thử lại khi cách chọn tham lam rơi vào ngõ cụt (vẫn deterministic theo seed). */
const MAX_ATTEMPTS = 8

export interface BuildPlanInput {
  days: number
  dailyBudgetVnd: number
  /** Lưu kèm plan để hiển thị/đổi chiến lược sau này; không ảnh hưởng cách chọn. */
  roleSlug: string
  dietTags: readonly string[]
  dishes: readonly DishCandidate[]
  seed: number
}

export interface PlanMeal {
  mealType: MealType
  dishId: string
  nameVi: string
  nameEn: string
  priceVnd: number
}

export interface PlanDay {
  dayIndex: number
  meals: PlanMeal[]
  totalVnd: number
}

export interface BuiltPlan {
  feasible: boolean
  days: PlanDay[]
  totalVnd: number
  dailyBudgetVnd: number
  budgetVnd: number
  /**
   * Ngân sách/ngày nhỏ nhất (bội 1.000đ) mà planner xếp được đủ `days` ngày theo
   * đúng các ràng buộc ở trên. `0` nghĩa là không phải vấn đề tiền — thiếu món
   * (hoặc thiếu món khác nhau để tránh lặp trong 2 ngày).
   */
  minimumDailyBudgetVnd: number
  seed: number
}

type DishesByMeal = Record<MealType, readonly DishCandidate[]>

/** Mỗi bữa xếp theo giá tăng dần (hoà thì theo id) — `minCostFor` dựa vào thứ tự này. */
function groupByMeal(dishes: readonly DishCandidate[]): DishesByMeal {
  const sorted = [...dishes].sort((a, b) => a.priceVnd - b.priceVnd || a.id.localeCompare(b.id))

  return {
    breakfast: sorted.filter((dish) => dish.mealTypes.includes('breakfast')),
    lunch: sorted.filter((dish) => dish.mealTypes.includes('lunch')),
    dinner: sorted.filter((dish) => dish.mealTypes.includes('dinner')),
  }
}

/**
 * Tổng giá rẻ nhất để phủ các bữa còn lại bằng các món khác nhau và không nằm
 * trong `blocked`. `null` nghĩa là không đủ món → không thể xếp bữa đó.
 *
 * Phủ `n` bữa thì mỗi bữa chỉ cần xét `n` món rẻ nhất chưa bị chặn: các bữa khác
 * dùng tối đa `n - 1` món trong số đó, nên luôn còn một món rẻ hơn hoặc bằng để
 * đổi vào. Nhờ vậy gọi hàm này cho từng ứng viên vẫn rẻ.
 */
function minCostFor(
  meals: readonly MealType[],
  byMeal: DishesByMeal,
  blocked: ReadonlySet<string>,
): number | null {
  const [first, ...rest] = meals
  if (!first) return 0

  let best: number | null = null

  let tried = 0

  for (const dish of byMeal[first]) {
    if (blocked.has(dish.id)) continue
    if (tried === meals.length) break
    tried += 1

    const nextBlocked = new Set(blocked)
    nextBlocked.add(dish.id)

    const restCost = minCostFor(rest, byMeal, nextBlocked)
    if (restCost === null) continue

    const total = dish.priceVnd + restCost
    if (best === null || total < best) best = total
  }

  return best
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const isVegetarian = (dish: DishCandidate): boolean => dish.tags.includes('vegetarian')

/** Điểm "chất lượng bữa": đủ no hơn cho trưa/tối, ưu tiên đạm và món nhanh. */
function mealScore(dish: DishCandidate, mealType: MealType): number {
  const fill = dish.fillLevel * (mealType === 'breakfast' ? 1 : 2)
  const protein = dish.tags.includes('high_protein') ? 1 : 0
  const quick = dish.prepMinutes <= 10 ? 1 : 0

  return fill + protein + quick
}

/**
 * `varied` ưu tiên món đủ chất và chưa dùng; `cheapest` là đường lui tất định
 * khi ngân sách quá sát sàn — không có nó, cùng một mức tiền có seed xếp được,
 * seed khác lại thất bại.
 */
type Strategy = 'varied' | 'cheapest'

function chooseDish(
  candidates: readonly DishCandidate[],
  mealType: MealType,
  usage: ReadonlyMap<string, number>,
  random: () => number,
  strategy: Strategy,
): DishCandidate {
  if (strategy === 'cheapest') {
    return [...candidates].sort((a, b) => a.priceVnd - b.priceVnd || a.id.localeCompare(b.id))[0]!
  }

  // Bốc jitter theo thứ tự id để kết quả không phụ thuộc thứ tự truy vấn DB.
  const scored = [...candidates]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((dish) => ({ dish, jitter: random(), usage: usage.get(dish.id) ?? 0 }))

  scored.sort(
    (a, b) =>
      a.usage - b.usage ||
      mealScore(b.dish, mealType) - mealScore(a.dish, mealType) ||
      a.jitter - b.jitter ||
      a.dish.id.localeCompare(b.dish.id),
  )

  return scored[0]!.dish
}

interface AttemptInput {
  days: number
  dailyBudgetVnd: number
  byMeal: DishesByMeal
  seed: number
}

type FirstDay = readonly [DishCandidate, DishCandidate, DishCandidate]

/** Số món rẻ nhất mỗi bữa cần xét khi tìm 2 ngày khác hẳn nhau (2 ngày × 3 bữa). */
const TWO_DAY_SLOTS = 6

/** Bộ sáng/trưa/tối khác nhau, mỗi bữa chỉ lấy trong `TWO_DAY_SLOTS` món rẻ nhất. */
function* firstDayOptions(byMeal: DishesByMeal): Generator<{ day: FirstDay; cost: number }> {
  const [breakfasts, lunches, dinners] = mealTypes.map((meal) =>
    byMeal[meal].slice(0, TWO_DAY_SLOTS),
  ) as [DishCandidate[], DishCandidate[], DishCandidate[]]

  for (const b of breakfasts) {
    for (const l of lunches) {
      if (l.id === b.id) continue
      for (const d of dinners) {
        if (d.id === b.id || d.id === l.id) continue
        yield { day: [b, l, d], cost: b.priceVnd + l.priceVnd + d.priceVnd }
      }
    }
  }
}

/** Chi phí rẻ nhất của một ngày không dùng lại món nào của `day`; `null` = không có. */
const nextDayCost = (day: FirstDay, byMeal: DishesByMeal) =>
  minCostFor(mealTypes, byMeal, new Set(day.map((dish) => dish.id)))

/**
 * Ngày đầu rẻ nhất mà vẫn còn một ngày khác hẳn nó, cùng ≤ ngân sách.
 *
 * Có hai ngày như vậy thì xếp được mọi số ngày: từ ngày thứ ba, bộ món của hôm
 * kia luôn khác hẳn hôm qua và vừa ngân sách, nên `pickDish` (đầy đủ trong một
 * ngày) không bao giờ bí. Chỉ ngày đầu có thể dẫn vào ngõ cụt — neo nó ở đây.
 * Mỗi bữa chỉ cần `TWO_DAY_SLOTS` món rẻ nhất: 5 suất còn lại của hai ngày dùng
 * tối đa 5 món, luôn còn một món rẻ hơn hoặc bằng để đổi vào.
 */
function findFirstDay(byMeal: DishesByMeal, dailyBudgetVnd: number): FirstDay | null {
  let best: { day: FirstDay; cost: number } | null = null

  for (const option of firstDayOptions(byMeal)) {
    if (option.cost > dailyBudgetVnd || (best && option.cost >= best.cost)) continue
    const next = nextDayCost(option.day, byMeal)
    if (next !== null && next <= dailyBudgetVnd) best = option
  }

  return best?.day ?? null
}

/**
 * Ngân sách/ngày nhỏ nhất để có lịch `days` ngày (`null` = thiếu món): 1 ngày là
 * bộ rẻ nhất; từ 2 ngày là cặp hai ngày khác hẳn nhau có ngày đắt hơn rẻ nhất.
 */
function requiredDailyBudget(days: number, byMeal: DishesByMeal): number | null {
  if (days === 1) return minCostFor(mealTypes, byMeal, new Set())

  let best: number | null = null

  for (const { day, cost } of firstDayOptions(byMeal)) {
    const next = nextDayCost(day, byMeal)
    if (next === null) continue
    const pair = Math.max(cost, next)
    if (best === null || pair < best) best = pair
  }

  return best
}

/**
 * Chạy `MAX_ATTEMPTS` cách chọn khác nhau, rồi một lượt rẻ-nhất với ngày đầu neo
 * bằng `findFirstDay`; `null` = không có lịch nào ở mức ngân sách này.
 */
function attemptBuild({ days, dailyBudgetVnd, byMeal, seed }: AttemptInput): PlanDay[] | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const random = mulberry32((seed ^ (attempt * 0x9e3779b9)) >>> 0)
    const planned = tryBuildDays({
      days,
      dailyBudgetVnd,
      byMeal,
      random,
      strategy: 'varied',
    })

    if (planned) return planned
  }

  const firstDay = days > 1 ? findFirstDay(byMeal, dailyBudgetVnd) : undefined
  if (firstDay === null) return null

  return tryBuildDays({
    days,
    dailyBudgetVnd,
    byMeal,
    random: mulberry32(seed),
    strategy: 'cheapest',
    firstDay,
  })
}

const ceilToStep = (value: number) => Math.ceil(value / VND_STEP) * VND_STEP

interface DayBuildInput {
  days: number
  dailyBudgetVnd: number
  byMeal: DishesByMeal
  random: () => number
  strategy: Strategy
  /** Ngày đầu chọn sẵn (xem `findFirstDay`); bỏ trống thì chọn như mọi ngày. */
  firstDay?: FirstDay
}

interface MealPick {
  mealType: MealType
  mealIndex: number
  dailyBudgetVnd: number
  spent: number
  blocked: ReadonlySet<string>
  preferVeg: boolean
}

/** Chọn món cho một bữa; `null` khi không món nào giữ được các bữa sau trong ngân sách. */
function pickDish(
  { mealType, mealIndex, dailyBudgetVnd, spent, blocked, preferVeg }: MealPick,
  { byMeal, random, strategy }: DayBuildInput,
  usage: ReadonlyMap<string, number>,
): DishCandidate | null {
  const laterMeals = mealTypes.slice(mealIndex + 1)
  const left = dailyBudgetVnd - spent

  /*
   * Reserve cho các bữa sau phải tính SAU khi đã loại chính món đang xét: nếu
   * món rẻ nhất cho bữa trưa cũng là món duy nhất còn cho bữa tối, chọn nó ở
   * bữa trưa sẽ làm bữa tối hết món dù ngân sách vẫn đủ.
   */
  const affordable = byMeal[mealType].filter((dish) => {
    if (blocked.has(dish.id) || dish.priceVnd > left) return false
    const reserve = minCostFor(laterMeals, byMeal, new Set([...blocked, dish.id]))
    return reserve !== null && dish.priceVnd + reserve <= left
  })

  if (affordable.length === 0) return null

  /*
   * Chia đều phần ngân sách còn lại cho các bữa chưa chọn để bữa sáng không
   * "ăn" hết phần dư, khiến bữa trưa hôm sau không còn món nào vừa trần giá
   * (món rẻ đã dùng hôm qua). Nếu chia đều không còn lựa chọn nào thì mới
   * dùng trọn trần còn lại.
   */
  const remainingMeals = mealTypes.length - mealIndex
  const fairShare = Math.floor(left / remainingMeals)
  const cheapest = Math.min(...affordable.map((dish) => dish.priceVnd))
  const withinShare = affordable.filter((dish) => dish.priceVnd <= Math.max(fairShare, cheapest))

  const vegOptions = preferVeg ? withinShare.filter(isVegetarian) : []

  return chooseDish(
    vegOptions.length > 0 ? vegOptions : withinShare,
    mealType,
    usage,
    random,
    strategy,
  )
}

function tryBuildDays(input: DayBuildInput): PlanDay[] | null {
  const { days, dailyBudgetVnd, firstDay } = input
  const usage = new Map<string, number>()
  const weeksWithVeg = new Set<number>()
  const out: PlanDay[] = []
  let usedYesterday = new Set<string>()

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const usedToday = new Set<string>()
    const meals: PlanMeal[] = []
    let spent = 0

    const week = Math.floor(dayIndex / 7)
    const weekStart = week * 7
    const weekEnd = Math.min(days - 1, weekStart + 6)
    const weekHasVeg = weeksWithVeg.has(week)
    const mustTryVeg =
      !weekHasVeg && (dayIndex === weekStart || dayIndex === weekEnd || dayIndex === days - 1)
    let vegPickedToday = false

    for (const [mealIndex, mealType] of mealTypes.entries()) {
      const dish =
        (dayIndex === 0 ? firstDay?.[mealIndex] : undefined) ??
        pickDish(
          {
            mealType,
            mealIndex,
            dailyBudgetVnd,
            spent,
            blocked: new Set([...usedToday, ...usedYesterday]),
            preferVeg: mustTryVeg && !vegPickedToday,
          },
          input,
          usage,
        )

      if (!dish) return null

      usedToday.add(dish.id)
      spent += dish.priceVnd
      usage.set(dish.id, (usage.get(dish.id) ?? 0) + 1)
      if (isVegetarian(dish)) vegPickedToday = true

      meals.push({
        mealType,
        dishId: dish.id,
        nameVi: dish.nameVi,
        nameEn: dish.nameEn,
        priceVnd: dish.priceVnd,
      })
    }

    if (vegPickedToday) weeksWithVeg.add(week)

    out.push({ dayIndex, meals, totalVnd: spent })
    usedYesterday = usedToday
  }

  return out
}

/**
 * Xếp lịch `days` ngày × 3 bữa từ danh sách ứng viên đã có.
 *
 * Bất biến: mỗi ngày ≤ `dailyBudgetVnd`, không món nào lặp trong cửa sổ 2 ngày,
 * mỗi tuần có ≥1 món chay khi dữ liệu có món chay, và cùng `seed` cho cùng plan.
 * Giá lấy từ `dishes` — planner không bao giờ tự nghĩ ra giá.
 */
export function buildPlan(input: BuildPlanInput): BuiltPlan {
  const { days, dailyBudgetVnd, dietTags, dishes, seed } = input

  if (!Number.isInteger(days) || days < PLAN_MIN_DAYS || days > PLAN_MAX_DAYS) {
    throw new RangeError(`days must be an integer between ${PLAN_MIN_DAYS} and ${PLAN_MAX_DAYS}`)
  }

  if (!Number.isInteger(dailyBudgetVnd) || dailyBudgetVnd <= 0) {
    throw new RangeError('dailyBudgetVnd must be a positive integer')
  }

  const byMeal = groupByMeal(dishes.filter((dish) => dishMatchesDiet(dish, dietTags)))
  const required = requiredDailyBudget(days, byMeal)

  const base = {
    dailyBudgetVnd,
    budgetVnd: dailyBudgetVnd * days,
    seed,
  }

  if (required === null) {
    return { ...base, feasible: false, days: [], totalVnd: 0, minimumDailyBudgetVnd: 0 }
  }

  const planned = attemptBuild({ days, dailyBudgetVnd, byMeal, seed })

  if (planned) {
    return {
      ...base,
      feasible: true,
      days: planned,
      totalVnd: planned.reduce((sum, day) => sum + day.totalVnd, 0),
      minimumDailyBudgetVnd: required,
    }
  }

  // Không xếp được ở mức user chọn: chỉ đề xuất con số khi planner thật sự xếp được ở mức đó.
  const minimum = ceilToStep(required)
  const solvable = attemptBuild({ days, dailyBudgetVnd: minimum, byMeal, seed }) !== null

  return {
    ...base,
    feasible: false,
    days: [],
    totalVnd: 0,
    minimumDailyBudgetVnd: solvable ? minimum : 0,
  }
}
