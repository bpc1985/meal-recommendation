import { z } from 'zod'
import {
  chatRoles,
  createMockAdvisor,
  parseChatIntent,
  type ChatContext,
  type ChatMessage,
  type ChatStreamEvent,
  type DishPreferenceSets,
  type MealAdvisor,
} from '@mam/ai'
import { findDishCandidates, type Db } from '@mam/db'
import {
  DIET_TAGS,
  mealTypes,
  splitMealBudget,
  type DietTag,
  type DishCandidate,
  type MealType,
} from '@mam/domain'
import type { ChatDish } from '../lib/chat-types'

export const chatInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(chatRoles),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(20),
  context: z
    .object({
      roleSlug: z.string().trim().max(60).optional(),
      dailyBudgetVnd: z.number().int().min(1_000).max(100_000_000).optional(),
      mealType: z.enum(mealTypes).optional(),
      dietTags: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length).default([]),
    })
    .default({ dietTags: [] }),
  locale: z.enum(['vi', 'en']).default('vi'),
  /** Thread đã lưu để nhắn tiếp; bỏ trống thì server tạo thread mới (user đăng nhập). */
  threadId: z.string().trim().min(1).max(80).optional(),
})

export type ChatInputData = z.infer<typeof chatInputSchema>

/** Đầu vào đã chuẩn hoá cho service — route truyền kết quả `chatInputSchema.parse`. */
export interface ChatRuntimeInput {
  messages: readonly ChatMessage[]
  context: ChatContext
  locale: 'vi' | 'en'
  /** Món chán bị loại khỏi ứng viên; món thích được ưu tiên khi vừa ngân sách. */
  preferences: DishPreferenceSets
}

export type ChatEvent =
  | ChatStreamEvent
  | { type: 'thread'; threadId: string }
  | { type: 'meta'; dishes: ChatDish[]; degraded: boolean }
  | { type: 'done' }

export interface ChatRuntimeOptions {
  advisor?: MealAdvisor
}

const DEFAULT_DAILY_BUDGET_VND = 60_000
const CANDIDATE_LIMIT = 20
const CANDIDATES_PER_MEAL = 7

function lastUserMessage(messages: readonly ChatMessage[], fallback: string): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') return message.content
  }

  return fallback
}

function toChatDish(dish: DishCandidate): ChatDish {
  return {
    id: dish.id,
    nameVi: dish.nameVi,
    nameEn: dish.nameEn,
    priceVnd: dish.priceVnd,
    mealTypes: dish.mealTypes,
  }
}

/**
 * Lấy tối đa 20 ứng viên quanh ngữ cảnh chat. Khi câu hỏi không nêu bữa, chia
 * đều cho 3 bữa để AI không chỉ thấy mỗi bữa trưa.
 */
function collectCandidates(
  db: Db,
  request: {
    dailyBudgetVnd: number
    dietTags: readonly string[]
    mealType?: MealType
    mealBudgetVnd?: number
    preferences: DishPreferenceSets
  },
): DishCandidate[] {
  const mealBudgets = splitMealBudget(request.dailyBudgetVnd)
  const targets = request.mealType ? [request.mealType] : [...mealTypes]
  const limit = request.mealType ? CANDIDATE_LIMIT : CANDIDATES_PER_MEAL
  const seen = new Set<string>()
  const candidates: DishCandidate[] = []
  const excludeDishIds = [...request.preferences.disliked]
  const preferDishIds = [...request.preferences.liked]

  for (const mealType of targets) {
    const maxPriceVnd =
      request.mealType === mealType && request.mealBudgetVnd !== undefined
        ? request.mealBudgetVnd
        : mealBudgets[mealType]

    const found = findDishCandidates(db, {
      mealType,
      maxPriceVnd,
      dietTags: request.dietTags,
      limit,
      excludeDishIds,
      preferDishIds,
    })

    for (const dish of found) {
      if (seen.has(dish.id)) continue
      seen.add(dish.id)
      candidates.push(dish)
      if (candidates.length >= CANDIDATE_LIMIT) return candidates
    }
  }

  return candidates
}

function mergeDietTags(context: ChatContext, fromMessage: readonly DietTag[]): DietTag[] {
  const merged = new Set<string>(context.dietTags ?? [])
  for (const tag of fromMessage) merged.add(tag)

  return DIET_TAGS.filter((tag) => merged.has(tag))
}

/**
 * Ghép ngữ cảnh chat → ứng viên trong DB → advisor stream → meta.
 *
 * Bất biến: thẻ món trong `meta` luôn lấy tên/giá từ DB; AI chỉ được nêu `dishId`.
 * Mọi lỗi provider đều biến thành câu trả lời mock + `degraded: true`, để stream
 * không bao giờ đứt giữa chừng.
 */
export async function* runChat(
  db: Db,
  input: ChatRuntimeInput,
  options: ChatRuntimeOptions = {},
): AsyncGenerator<ChatEvent, void, unknown> {
  const advisor = options.advisor ?? createMockAdvisor()
  const intent = parseChatIntent(lastUserMessage(input.messages, ''))
  const mealType = intent.mealType ?? input.context.mealType
  // "ăn trưa 40k" nghĩa là 40k cho bữa trưa, không phải 40k/ngày.
  const mealBudgetVnd = intent.budgetVnd !== null && mealType ? intent.budgetVnd : undefined
  const dailyBudgetVnd =
    intent.budgetVnd !== null && !mealType
      ? intent.budgetVnd
      : (input.context.dailyBudgetVnd ?? DEFAULT_DAILY_BUDGET_VND)
  const dietTags = mergeDietTags(input.context, intent.dietTags)

  const candidates = collectCandidates(db, {
    dailyBudgetVnd,
    dietTags,
    mealType,
    mealBudgetVnd,
    preferences: input.preferences,
  })
  const request = {
    messages: input.messages,
    context: {
      ...input.context,
      dailyBudgetVnd,
      mealBudgetVnd,
      mealType,
      dietTags,
      likedDishIds: input.preferences.liked,
    },
    locale: input.locale,
  }

  const candidateIds = new Set(candidates.map((dish) => dish.id))
  const dishIds = new Set<string>()
  let degraded: boolean

  const relay = async function* (events: AsyncIterable<ChatStreamEvent>) {
    for await (const event of events) {
      if (event.type === 'dish') {
        if (!candidateIds.has(event.dishId) || dishIds.has(event.dishId)) continue
        dishIds.add(event.dishId)
      }

      yield event
    }
  }

  try {
    const stream = await advisor.stream(request, candidates)
    degraded = stream.degraded
    yield* relay(stream.events)
  } catch {
    degraded = true
    const fallback = await createMockAdvisor().stream(request, candidates)
    yield* relay(fallback.events)
  }

  yield {
    type: 'meta',
    dishes: candidates.filter((dish) => dishIds.has(dish.id)).map(toChatDish),
    degraded,
  }
  yield { type: 'done' }
}
