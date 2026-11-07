import { mealTypes, splitMealBudget, sumVnd, type DishCandidate, type MealType } from '@mam/domain'
import { parseChatIntent } from './chat-intent'
import { applyGuards } from './guards'
import { rankCandidates } from './rank'
import type {
  AdvisorLocale,
  ChatRequest,
  ChatStream,
  ChatStreamEvent,
  MealAdvisor,
  PickResult,
  RankedCandidate,
} from './types'

const MEAL_LABEL: Record<AdvisorLocale, Record<MealType, string>> = {
  vi: { breakfast: 'bữa sáng', lunch: 'bữa trưa', dinner: 'bữa tối' },
  en: { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' },
}

const TIP: Record<AdvisorLocale, string> = {
  vi: 'Gợi ý từ bộ dữ liệu mẫu — giá là ước lượng, bạn có thể đổi món bất cứ lúc nào.',
  en: 'Picked from our sample catalogue — prices are estimates, swap any dish you like.',
}

const TRAITS = {
  liked: { vi: 'món bạn thích', en: 'one you like' },
  in_budget: { vi: 'vừa ngân sách', en: 'fits the budget' },
  filling: { vi: 'đủ no', en: 'filling' },
  quick: { vi: 'làm nhanh', en: 'quick to make' },
} as const

const FALLBACK_TRAIT = {
  vi: 'phù hợp nhất trong các lựa chọn còn lại',
  en: 'the best of what is left',
}

function traitLabel(candidate: RankedCandidate, locale: AdvisorLocale): string {
  const traits = candidate.reasons.filter(
    (reason): reason is keyof typeof TRAITS => reason in TRAITS,
  )

  return traits.length > 0
    ? traits.map((trait) => TRAITS[trait][locale]).join(', ')
    : FALLBACK_TRAIT[locale]
}

/** Câu giải thích cho cả hai ngôn ngữ — UI chọn theo locale, không cần gọi lại server. */
function describePick(mealType: MealType, candidate: RankedCandidate): { vi: string; en: string } {
  const render = (locale: AdvisorLocale) => {
    const meal = MEAL_LABEL[locale][mealType]

    return `${meal.charAt(0).toUpperCase()}${meal.slice(1)}: ${traitLabel(candidate, locale)}.`
  }

  return { vi: render('vi'), en: render('en') }
}

const DEFAULT_DAILY_BUDGET_VND = 60_000
const CHAT_CHUNK_SIZE = 28
const PICKS_PER_MEAL = 2

export interface MockAdvisorOptions {
  /**
   * Nghỉ giữa các chunk để UI thấy chữ hiện dần. Test để 0 cho nhanh;
   * server truyền ~18ms.
   */
  chunkDelayMs?: number
}

const CHAT_COPY = {
  vi: {
    noCandidates:
      'Mình chưa tìm thấy món nào vừa ngân sách và chế độ ăn hiện tại. Thử tăng ngân sách hoặc bỏ bớt một lựa chọn nhé.',
    intro: (budget: string, meals: string) => `Với ${budget} mỗi ngày, đây là gợi ý cho ${meals}:`,
    introMeal: (budget: string, meal: string) => `Với ${budget} cho ${meal}, đây là gợi ý:`,
    introNoBudget: (meals: string) => `Đây là gợi ý cho ${meals}:`,
    line: (name: string, price: string, trait: string) => `• ${name} — ${price} (${trait}).`,
    total: (meal: string, total: string, budget: string) =>
      `Tổng ${meal}: ${total}, nằm trong ngân sách ${budget}.`,
    noDishForMeal: (meal: string, budget: string) =>
      `Chưa có món nào cho ${meal} vừa ngân sách ${budget} mà chưa gợi ý ở bữa khác.`,
    outro: 'Giá lấy từ cơ sở dữ liệu, không phải AI tự nghĩ ra. Bạn có thể đổi món bất cứ lúc nào.',
  },
  en: {
    noCandidates:
      'I could not find a dish that fits both the budget and the current diet. Try raising the budget or removing one filter.',
    intro: (budget: string, meals: string) =>
      `With ${budget} per day, here is what I would pick for ${meals}:`,
    introMeal: (budget: string, meal: string) => `With ${budget} for ${meal}, here is my pick:`,
    introNoBudget: (meals: string) => `Here is what I would pick for ${meals}:`,
    line: (name: string, price: string, trait: string) => `• ${name} — ${price} (${trait}).`,
    total: (meal: string, total: string, budget: string) =>
      `Total for ${meal}: ${total}, within the ${budget} budget.`,
    noDishForMeal: (meal: string, budget: string) =>
      `No dish left for ${meal} within ${budget} that is not already suggested for another meal.`,
    outro: 'Prices come from our database, not from the AI. Swap any dish you like at any time.',
  },
} as const

function formatChatMoney(amountVnd: number, locale: AdvisorLocale): string {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amountVnd)
}

function lastUserMessage(request: ChatRequest): string {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index]
    if (message?.role === 'user') return message.content
  }

  return ''
}

/** Bữa mà câu hỏi nhắm tới: ưu tiên câu chat, rồi context, rồi mọi bữa có ứng viên. */
function targetMeals(request: ChatRequest, candidates: readonly DishCandidate[]): MealType[] {
  const intent = parseChatIntent(lastUserMessage(request))
  const explicit = intent.mealType ?? request.context.mealType
  if (explicit) return [explicit]

  const available = new Set(candidates.flatMap((candidate) => candidate.mealTypes))
  return mealTypes.filter((mealType) => available.has(mealType))
}

interface ChatSection {
  mealType: MealType
  budgetVnd: number
  ranked: RankedCandidate[]
  totalVnd: number
}

/** Giữ tối đa `limit` món nhưng tổng không vượt trần của bữa. */
function pickWithinBudget(
  ranked: readonly RankedCandidate[],
  budgetVnd: number,
  limit: number,
): RankedCandidate[] {
  const picked: RankedCandidate[] = []
  let spent = 0

  for (const candidate of ranked) {
    if (spent + candidate.dish.priceVnd > budgetVnd) continue
    picked.push(candidate)
    spent += candidate.dish.priceVnd
    if (picked.length >= limit) break
  }

  return picked
}

function buildSections(
  request: ChatRequest,
  candidates: readonly DishCandidate[],
): { sections: ChatSection[]; dailyBudgetVnd: number } {
  const intent = parseChatIntent(lastUserMessage(request))
  const dailyBudgetVnd = request.context.dailyBudgetVnd ?? DEFAULT_DAILY_BUDGET_VND
  const mealBudgets = splitMealBudget(dailyBudgetVnd)
  const dietTags = Array.from(new Set([...(request.context.dietTags ?? []), ...intent.dietTags]))

  const usedDishIds = new Set<string>()
  const sections = targetMeals(request, candidates).map((mealType) => {
    const override = request.context.mealBudgetVnd
    const mealBudgetVnd = override ?? mealBudgets[mealType]
    const unused = candidates.filter((candidate) => !usedDishIds.has(candidate.id))
    const ranked = pickWithinBudget(
      rankCandidates(
        {
          roleSlug: request.context.roleSlug ?? 'guest',
          mealType,
          dailyBudgetVnd,
          mealBudgetVnd,
          dietTags,
          locale: request.locale,
          likedDishIds: request.context.likedDishIds,
        },
        unused,
      ).filter((candidate) => candidate.dish.priceVnd <= mealBudgetVnd),
      mealBudgetVnd,
      PICKS_PER_MEAL,
    )
    for (const candidate of ranked) usedDishIds.add(candidate.dish.id)

    return {
      mealType,
      budgetVnd: mealBudgetVnd,
      ranked,
      totalVnd: sumVnd(ranked.map((candidate) => candidate.dish.priceVnd)),
    }
  })

  return { sections, dailyBudgetVnd }
}

function renderChatText(
  request: ChatRequest,
  sections: readonly ChatSection[],
  dailyBudgetVnd: number,
): string {
  const copy = CHAT_COPY[request.locale]
  const filled = sections.filter((section) => section.ranked.length > 0)

  if (filled.length === 0) return copy.noCandidates

  const meals = filled.map((section) => MEAL_LABEL[request.locale][section.mealType]).join(', ')
  const mealBudgetVnd = request.context.mealBudgetVnd
  const singleMeal = filled.length === 1 ? filled[0] : undefined
  const intro =
    mealBudgetVnd && singleMeal
      ? copy.introMeal(
          formatChatMoney(mealBudgetVnd, request.locale),
          MEAL_LABEL[request.locale][singleMeal.mealType],
        )
      : dailyBudgetVnd > 0
        ? copy.intro(formatChatMoney(dailyBudgetVnd, request.locale), meals)
        : copy.introNoBudget(meals)
  const lines = [intro, '']

  for (const section of sections) {
    const mealLabel = MEAL_LABEL[request.locale][section.mealType]

    if (section.ranked.length === 0) {
      lines.push(
        copy.noDishForMeal(mealLabel, formatChatMoney(section.budgetVnd, request.locale)),
        '',
      )
      continue
    }

    for (const candidate of section.ranked) {
      const dish = candidate.dish
      lines.push(
        copy.line(
          request.locale === 'vi' ? dish.nameVi : dish.nameEn,
          formatChatMoney(dish.priceVnd, request.locale),
          traitLabel(candidate, request.locale),
        ),
      )
    }

    lines.push(
      copy.total(
        mealLabel,
        formatChatMoney(section.totalVnd, request.locale),
        formatChatMoney(section.budgetVnd, request.locale),
      ),
    )
    lines.push('')
  }

  lines.push(copy.outro)

  return lines.join('\n')
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = []

  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size))
  }

  return chunks
}

/**
 * Advisor không gọi mạng. Dùng ranker nội bộ rồi cho guards kiểm tra lại, nên
 * mọi test và bản demo chạy offline vẫn có kết quả ổn định.
 */
export function createMockAdvisor(options: MockAdvisorOptions = {}): MealAdvisor {
  const chunkDelayMs = options.chunkDelayMs ?? 0

  return {
    kind: 'mock',

    async pick(request, candidates): Promise<PickResult> {
      const ranked = rankCandidates(request, candidates)

      if (ranked.length === 0) {
        return { picks: [], source: 'fallback', tip: TIP[request.locale] }
      }

      const proposed = ranked.slice(0, 2).map((candidate) => {
        const reason = describePick(request.mealType, candidate)
        return { dishId: candidate.dish.id, reasonVi: reason.vi, reasonEn: reason.en }
      })

      const { picks } = applyGuards(proposed, candidates, request.mealBudgetVnd)

      if (picks.length === 0) {
        return { picks: [], source: 'fallback', tip: TIP[request.locale] }
      }

      return { picks, source: 'mock', tip: TIP[request.locale] }
    },

    async stream(request, candidates): Promise<ChatStream> {
      const { sections, dailyBudgetVnd } = buildSections(request, candidates)
      const text = renderChatText(request, sections, dailyBudgetVnd)

      async function* events(): AsyncGenerator<ChatStreamEvent> {
        for (const chunk of chunkText(text, CHAT_CHUNK_SIZE)) {
          yield { type: 'text', text: chunk }
          if (chunkDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, chunkDelayMs))
          }
        }

        for (const section of sections) {
          for (const candidate of section.ranked) {
            yield { type: 'dish', dishId: candidate.dish.id }
          }
        }
      }

      return { degraded: false, events: events() }
    },
  }
}
