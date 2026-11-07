import type { DishCandidate, MealType, SuggestionSource } from '@mam/domain'

/** Module `ai` không phụ thuộc `@mam/i18n` để giữ ranh giới package; chỉ cần biết 2 locale này. */
export const advisorLocales = ['vi', 'en'] as const
export type AdvisorLocale = (typeof advisorLocales)[number]

export interface PickRequest {
  roleSlug: string
  mealType: MealType
  /** Ngân sách/ngày đã chuẩn hoá — dùng để giải thích, không dùng để chặn. */
  dailyBudgetVnd: number
  /** Ngân sách cho riêng bữa này. Đây là trần cứng cho mọi pick. */
  mealBudgetVnd: number
  /** Tag tích cực (`vegetarian`) hoặc loại trừ (`no-spicy`). */
  dietTags: string[]
  locale: AdvisorLocale
  /** Món user đã bấm "Thích": được cộng điểm khi vừa ngân sách. Bỏ trống nghĩa là không có. */
  likedDishIds?: ReadonlySet<string>
}

export interface RankedCandidate {
  dish: DishCandidate
  score: number
  /** Các lý do máy đọc được, ví dụ `in_budget`, `filling`. UI tự dịch. */
  reasons: string[]
}

export interface AdvisorPick {
  dishId: string
  reasonVi: string
  reasonEn: string
}

export interface PickResult {
  picks: AdvisorPick[]
  source: SuggestionSource
  /** Một câu gợi ý thêm, đã ở đúng ngôn ngữ của request. */
  tip: string
  model?: string
}

export interface ChatContext {
  roleSlug?: string
  /** Ngân sách/ngày đã chuẩn hoá. Chat dùng để lọc ứng viên, không tự tính tiền. */
  dailyBudgetVnd?: number
  /** Trần riêng cho bữa đang hỏi, khi user nói "ăn trưa 40k". */
  mealBudgetVnd?: number
  mealType?: MealType
  dietTags?: readonly string[]
  /** Như `PickRequest.likedDishIds`. */
  likedDishIds?: ReadonlySet<string>
}

export const chatRoles = ['user', 'assistant'] as const
export type ChatRole = (typeof chatRoles)[number]

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatRequest {
  messages: readonly ChatMessage[]
  context: ChatContext
  locale: AdvisorLocale
}

/**
 * Sự kiện trong một lượt chat. `dish` cho UI biết cần vẽ thẻ món — giá và tên
 * do server lấy từ DB, không lấy từ text của AI.
 */
export type ChatStreamEvent = { type: 'text'; text: string } | { type: 'dish'; dishId: string }

export interface ChatStream {
  /** `true` khi provider lỗi và đã chuyển sang câu trả lời deterministic. */
  degraded: boolean
  events: AsyncIterable<ChatStreamEvent>
}

/**
 * Món thích và món chán của một user, dạng tập để tra nhanh. Cùng dữ liệu với
 * `DishPreferences` của `@mam/db` (mảng, an toàn cho JSON) nhưng dùng khi dựng gợi ý.
 * Món chán bị lọc khỏi ứng viên trước khi advisor thấy; advisor chỉ cần món thích.
 */
export interface DishPreferenceSets {
  liked: ReadonlySet<string>
  disliked: ReadonlySet<string>
}

/** Khách và user chưa đánh dấu món nào. */
export const NO_PREFERENCES: DishPreferenceSets = { liked: new Set(), disliked: new Set() }

export interface MealAdvisor {
  readonly kind: 'gemini' | 'mock'
  pick(request: PickRequest, candidates: readonly DishCandidate[]): Promise<PickResult>
  stream(request: ChatRequest, candidates: readonly DishCandidate[]): Promise<ChatStream>
}
