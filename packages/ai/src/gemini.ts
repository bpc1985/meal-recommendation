import type { DishCandidate } from '@mam/domain'
import { z } from 'zod'
import { applyGuards } from './guards'
import { createMockAdvisor } from './mock'
import type {
  AdvisorLocale,
  ChatRequest,
  ChatStream,
  ChatStreamEvent,
  MealAdvisor,
  PickRequest,
  PickResult,
} from './types'

const DEFAULT_MODEL = 'gemini-3.5-flash'
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_RETRY_DELAY_MS = 400
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504])

const pickResponseSchema = z.object({
  picks: z
    .array(
      z.object({
        dishId: z.string().min(1),
        reason_vi: z.string().default(''),
        reason_en: z.string().default(''),
      }),
    )
    .max(3)
    .default([]),
  tip_vi: z.string().default(''),
  tip_en: z.string().default(''),
})

// Endpoint OpenAI-compatible của Google chỉ ghi nhận structured output dạng `json_schema`.
// Schema viết tay phải khớp pickResponseSchema; Zod vẫn là chốt parse cuối.
const pickResponseJsonSchema = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          dishId: { type: 'string' },
          reason_vi: { type: 'string' },
          reason_en: { type: 'string' },
        },
        required: ['dishId', 'reason_vi', 'reason_en'],
      },
    },
    tip_vi: { type: 'string' },
    tip_en: { type: 'string' },
  },
  required: ['picks', 'tip_vi', 'tip_en'],
} as const

export interface GeminiOptions {
  apiKey: string
  model?: string
  baseUrl?: string
  /** Cho phép test bơm fetch giả; production dùng fetch toàn cục. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  retryDelayMs?: number
  fallback?: MealAdvisor
}

interface GeminiChoice {
  message?: { content?: string }
  delta?: { content?: string }
}

interface GeminiPayload {
  choices?: GeminiChoice[]
  model?: string
}

function languageName(locale: AdvisorLocale): string {
  return locale === 'vi' ? 'Vietnamese' : 'English'
}

const CANDIDATE_HEADER =
  'Candidates (id | name_vi | name_en | price | tags | fullness | prep | liked):'
const LIKED_RULE = 'Prefer dishes the user liked when they fit the meal budget.'

function candidateLines(
  candidates: readonly DishCandidate[],
  likedDishIds: ReadonlySet<string> | undefined,
): string {
  return candidates
    .map(
      (dish) =>
        `- ${dish.id} | ${dish.nameVi} | ${dish.nameEn} | ${dish.priceVnd} VND | ${dish.tags.join(',')} | fill ${dish.fillLevel}/3 | ${dish.prepMinutes} min | liked: ${likedDishIds?.has(dish.id) ? 'yes' : 'no'}`,
    )
    .join('\n')
}

function budgetLine(request: PickRequest): string {
  return `Daily budget ${request.dailyBudgetVnd} VND, budget for this meal ${request.mealBudgetVnd} VND.`
}

function buildPickMessages(
  request: PickRequest,
  candidates: readonly DishCandidate[],
): Array<{ role: 'system' | 'user'; content: string }> {
  const diet = request.dietTags.length > 0 ? request.dietTags.join(', ') : 'none'

  return [
    {
      role: 'system',
      content: [
        'You are Mam, a Vietnamese meal advisor. You must pick dishes only from the provided candidate list.',
        'Never invent dishes, prices or dish ids. The server recalculates all totals from the database, so do not compute totals.',
        `Write explanations in both Vietnamese and English. The user's locale is ${languageName(request.locale)}.`,
        'Return strict JSON matching: {"picks":[{"dishId":string,"reason_vi":string,"reason_en":string}],"tip_vi":string,"tip_en":string}.',
        'Pick between 1 and 3 dishes. Each explanation must be one short sentence, touching on price and fullness.',
        'Prefer dishes that use most of the meal budget without exceeding it, so the day’s budget is not wasted.',
        LIKED_RULE,
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Role: ${request.roleSlug}`,
        `Meal: ${request.mealType}`,
        budgetLine(request),
        `Diet tags: ${diet}`,
        '',
        CANDIDATE_HEADER,
        candidateLines(candidates, request.likedDishIds),
      ].join('\n'),
    },
  ]
}

function buildChatMessages(
  request: ChatRequest,
  candidates: readonly DishCandidate[],
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const context = request.context
  const contextLines = [
    context.roleSlug ? `Role: ${context.roleSlug}` : null,
    context.dailyBudgetVnd ? `Daily budget: ${context.dailyBudgetVnd} VND` : null,
    context.mealType ? `Meal in focus: ${context.mealType}` : null,
    context.dietTags && context.dietTags.length > 0
      ? `Diet tags: ${context.dietTags.join(', ')}`
      : null,
  ].filter((line): line is string => line !== null)

  return [
    {
      role: 'system',
      content: [
        'You are Mam, a friendly Vietnamese meal advisor.',
        // UI đã chọn ngôn ngữ, nên câu trả lời phải khớp locale để tên món và thẻ món không lệch.
        `Answer in ${languageName(request.locale)}, even if the user writes in another language.`,
        'Only recommend dishes from the candidate list below, and never invent prices. If nothing fits, say so and suggest changing the budget or diet.',
        'Prefer dishes closer to the meal budget without exceeding it, so the budget is not wasted.',
        LIKED_RULE,
        'Never suggest the same dish for two meals of the same day. If a meal has no other dish that fits, say that meal has no fitting dish instead of repeating one.',
        'Quote each price exactly as given. Never add prices together or state a combined total; the app does that from the database.',
        'Keep answers short: a one-line intro, then one line per dish with its real price.',
        contextLines.length > 0 ? `User context:\n${contextLines.join('\n')}` : '',
        CANDIDATE_HEADER,
        candidateLines(candidates, context.likedDishIds),
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    ...request.messages.slice(-10),
  ]
}

/** SSE của endpoint OpenAI-compatible (Gemini): mỗi dòng `data: {...}`, kết thúc bằng `data: [DONE]`. */
export async function* readSseText(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const parseLine = (line: string): string | null => {
    const trimmed = line.replace(/\r$/, '')
    if (!trimmed.startsWith('data:')) return null

    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return null

    try {
      const payload = JSON.parse(data) as GeminiPayload
      return payload.choices?.[0]?.delta?.content ?? null
    } catch {
      return null
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)

      const text = parseLine(line)
      if (text) yield text

      newline = buffer.indexOf('\n')
    }
  }

  buffer += decoder.decode()
  const tail = parseLine(buffer)
  if (tail) yield tail
}

function extractJson(content: string): unknown {
  const trimmed = content.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  const candidate = fenced?.[1]?.trim() ?? trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('Gemini returned invalid JSON')

    return JSON.parse(candidate.slice(start, end + 1))
  }
}

/**
 * So khớp tên món trong text AI: bỏ dấu, bỏ hoa thường và gộp khoảng trắng để
 * "Cơm tấm", "com tam" hay "CƠM TẤM" đều ra cùng một thẻ món.
 */
function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function* geminiEvents(
  body: ReadableStream<Uint8Array>,
  candidates: readonly DishCandidate[],
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  let text = ''

  for await (const delta of readSseText(body)) {
    text += delta
    yield { type: 'text', text: delta }
  }

  const haystack = normalizeForMatch(text)

  for (const dish of candidates) {
    // Model có thể trả lời khác locale hoặc gõ không dấu, nên phải thử cả hai tên.
    const names = [dish.nameVi, dish.nameEn]
      .map(normalizeForMatch)
      .filter((name) => name.length >= 3)
    if (text.includes(dish.id) || names.some((name) => haystack.includes(name))) {
      yield { type: 'dish', dishId: dish.id }
    }
  }
}

/**
 * Adapter Gemini (endpoint OpenAI-compatible của Google) dùng `fetch` + SSE thuần thay vì AI SDK: chỉ cần một
 * endpoint, và nhờ vậy test bơm được fetch giả mà không cần network.
 *
 * Mọi lỗi upstream (429/5xx/timeout/JSON hỏng) đều rơi về mock deterministic.
 * `stream()` báo `degraded: true` để UI hiện banner "AI tạm không khả dụng".
 */
export function createGeminiAdvisor(options: GeminiOptions): MealAdvisor {
  if (!options.apiKey) {
    throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini')
  }

  const model = options.model || DEFAULT_MODEL
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const fallback = options.fallback ?? createMockAdvisor()

  async function send(body: unknown): Promise<Response> {
    let lastResponse: Response | undefined
    let lastError: unknown

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const signal = AbortSignal.timeout(timeoutMs)

      try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...(body as object), model }),
          signal,
        })

        if (response.ok) return response

        lastResponse = response
        if (!RETRYABLE_STATUS.has(response.status)) return response
      } catch (error) {
        lastError = error
      }

      if (attempt === 0 && retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }

    if (lastResponse) return lastResponse
    throw lastError instanceof Error ? lastError : new Error('Gemini request failed')
  }

  return {
    kind: 'gemini',

    async pick(request, candidates): Promise<PickResult> {
      try {
        const response = await send({
          messages: buildPickMessages(request, candidates),
          temperature: 0.3,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'meal_picks', schema: pickResponseJsonSchema },
          },
        })

        if (!response.ok) throw new Error(`Gemini responded ${response.status}`)

        const payload = (await response.json()) as GeminiPayload
        const content = payload.choices?.[0]?.message?.content
        if (!content) throw new Error('Gemini returned an empty completion')

        const parsed = pickResponseSchema.parse(extractJson(content))
        const proposed = parsed.picks.map((pick) => ({
          dishId: pick.dishId,
          reasonVi: pick.reason_vi,
          reasonEn: pick.reason_en,
        }))
        const { picks } = applyGuards(proposed, candidates, request.mealBudgetVnd)

        if (picks.length === 0) throw new Error('No pick survived the budget guards')

        return {
          picks,
          source: 'ai',
          tip: request.locale === 'vi' ? parsed.tip_vi : parsed.tip_en,
          model: payload.model ?? model,
        }
      } catch {
        const result = await fallback.pick(request, candidates)
        return { ...result, source: 'fallback' }
      }
    },

    async stream(request, candidates): Promise<ChatStream> {
      try {
        const response = await send({
          messages: buildChatMessages(request, candidates),
          temperature: 0.5,
          stream: true,
        })

        if (!response.ok || !response.body) {
          throw new Error(`Gemini stream responded ${response.status}`)
        }

        return {
          degraded: false,
          events: geminiEvents(response.body, candidates),
        }
      } catch {
        const result = await fallback.stream(request, candidates)
        return { degraded: true, events: result.events }
      }
    },
  }
}
