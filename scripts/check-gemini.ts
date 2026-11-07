/**
 * Gọi Gemini thật một lần cho pick và một lần cho chat, in status HTTP và lỗi upstream.
 *
 * Adapter nuốt mọi lỗi để rơi về mock, nên sai key/model/tham số chỉ hiện ra như "AI trả
 * lời nhạt". Script này bỏ lớp che đó: thoát mã 1 nếu một trong hai lượt không đến từ AI.
 *
 * Chạy: `pnpm ai:check` (đọc `GEMINI_API_KEY`, `GEMINI_MODEL` từ `.env` gốc).
 */
import { createGeminiAdvisor, createMockAdvisor } from '../packages/ai/src'
import type { DishCandidate } from '../packages/domain/src'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Thiếu GEMINI_API_KEY trong .env')
  process.exit(1)
}

const upstream: string[] = []

const advisor = createGeminiAdvisor({
  apiKey,
  model: process.env.GEMINI_MODEL,
  fallback: createMockAdvisor(),
  fetchImpl: async (input, init) => {
    const startedAt = Date.now()
    const response = await fetch(input, init)
    const note = `HTTP ${response.status} sau ${Date.now() - startedAt}ms`
    upstream.push(response.ok ? note : `${note}: ${(await response.clone().text()).slice(0, 400)}`)
    return response
  },
})

const dish = (id: string, nameVi: string, nameEn: string, priceVnd: number): DishCandidate => ({
  id,
  nameVi,
  nameEn,
  priceVnd,
  mealTypes: ['lunch'],
  tags: [],
  fillLevel: 3,
  prepMinutes: 10,
})

const candidates = [
  dish('com-tam', 'Cơm tấm', 'Broken rice', 35_000),
  dish('bun-bo', 'Bún bò', 'Beef noodle soup', 45_000),
  dish('banh-mi', 'Bánh mì', 'Banh mi', 20_000),
]

const pick = await advisor.pick(
  {
    roleSlug: 'student',
    mealType: 'lunch',
    dailyBudgetVnd: 120_000,
    mealBudgetVnd: 48_000,
    dietTags: [],
    locale: 'vi',
  },
  candidates,
)
console.log(
  `pick: source=${pick.source} model=${pick.model ?? '-'} picks=${pick.picks.map((p) => p.dishId).join(',')}`,
)
console.log(`  ${upstream.splice(0).join('\n  ')}`)

const chat = await advisor.stream(
  {
    messages: [{ role: 'user', content: 'Trưa nay 45k ăn gì?' }],
    context: { dailyBudgetVnd: 120_000 },
    locale: 'vi',
  },
  candidates,
)
let text = ''
for await (const event of chat.events) if (event.type === 'text') text += event.text
console.log(
  `chat: degraded=${chat.degraded} ${text.length} ký tự: ${text.slice(0, 120).replace(/\s+/g, ' ')}`,
)
console.log(`  ${upstream.splice(0).join('\n  ')}`)

if (pick.source !== 'ai' || chat.degraded) process.exit(1)
console.log('OK: Gemini trả lời thật cho cả pick và chat.')
