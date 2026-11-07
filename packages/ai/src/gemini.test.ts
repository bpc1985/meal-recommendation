import type { DishCandidate, MealType } from '@mam/domain'
import { describe, expect, it } from 'vitest'
import { createGeminiAdvisor } from './gemini'
import type { ChatRequest, ChatStreamEvent, PickRequest } from './types'

function dish(overrides: Partial<DishCandidate> & { id: string }): DishCandidate {
  return {
    nameVi: `Món ${overrides.id}`,
    nameEn: `Dish ${overrides.id}`,
    priceVnd: 22_000,
    mealTypes: ['lunch'] as MealType[],
    tags: [],
    fillLevel: 3,
    prepMinutes: 10,
    ...overrides,
  }
}

const candidates: DishCandidate[] = [
  dish({ id: 'com-tam', nameVi: 'Cơm tấm', nameEn: 'Broken rice' }),
  dish({ id: 'bun-bo', nameVi: 'Bún bò', nameEn: 'Beef noodle soup', priceVnd: 24_000 }),
]

const pickRequest: PickRequest = {
  roleSlug: 'student',
  mealType: 'lunch',
  dailyBudgetVnd: 60_000,
  mealBudgetVnd: 24_000,
  dietTags: [],
  locale: 'vi',
}

const chatRequest: ChatRequest = {
  messages: [{ role: 'user', content: 'Ăn trưa 40k giúp mình' }],
  context: { dailyBudgetVnd: 60_000 },
  locale: 'vi',
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function completion(content: string) {
  return { choices: [{ message: { content } }], model: 'test/model' }
}

function sseResponse(parts: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function collect(events: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const collected: ChatStreamEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

const validPayload = {
  picks: [{ dishId: 'com-tam', reason_vi: 'Vừa ngân sách, đủ no.', reason_en: 'Fits budget.' }],
  tip_vi: 'Thêm canh cho đủ chất.',
  tip_en: 'Add soup for balance.',
}

describe('createGeminiAdvisor', () => {
  it('thiếu API key → throw ngay khi khởi tạo', () => {
    expect(() => createGeminiAdvisor({ apiKey: '' })).toThrow(/GEMINI_API_KEY/)
    expect(() => createGeminiAdvisor({ apiKey: '' })).toThrow(/AI_PROVIDER=gemini/)
  })

  it('gọi endpoint OpenAI-compatible của Google với Bearer key và model mặc định gemini-3.5-flash', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init })
        return jsonResponse(completion(JSON.stringify(validPayload)))
      },
    })

    await advisor.pick(pickRequest, candidates)

    expect(advisor.kind).toBe('gemini')
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    )
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer test-key')
    expect(JSON.parse(String(calls[0]?.init?.body)).model).toBe('gemini-3.5-flash')
  })

  it('tôn trọng model truyền vào thay cho model mặc định', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return sseResponse(['data: [DONE]\n\n'])
      },
    })

    await advisor.stream(chatRequest, candidates)

    expect(JSON.parse(bodies[0] ?? '{}').model).toBe('gemini-3.6-flash')
  })

  it('model rỗng (dòng `GEMINI_MODEL=` trong .env) → dùng model mặc định', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      model: '',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return sseResponse(['data: [DONE]\n\n'])
      },
    })

    await advisor.stream(chatRequest, candidates)

    expect(JSON.parse(bodies[0] ?? '{}').model).toBe('gemini-3.5-flash')
  })

  it('pick: yêu cầu structured output bằng json_schema khớp shape picks/tip', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return jsonResponse(completion(JSON.stringify(validPayload)))
      },
    })

    await advisor.pick(pickRequest, candidates)

    const format = JSON.parse(bodies[0] ?? '{}').response_format
    expect(format.type).toBe('json_schema')
    expect(format.json_schema.schema.required).toEqual(['picks', 'tip_vi', 'tip_en'])
    expect(format.json_schema.schema.properties.picks.maxItems).toBe(3)
  })

  it('pick: gửi ứng viên trong prompt và map JSON của AI', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      model: 'test/model',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return jsonResponse(completion(JSON.stringify(validPayload)))
      },
    })

    const result = await advisor.pick(pickRequest, candidates)

    expect(result.source).toBe('ai')
    expect(result.model).toBe('test/model')
    expect(result.picks).toEqual([
      { dishId: 'com-tam', reasonVi: 'Vừa ngân sách, đủ no.', reasonEn: 'Fits budget.' },
    ])
    expect(result.tip).toBe('Thêm canh cho đủ chất.')
    expect(bodies[0]).toContain('com-tam')
    expect(bodies[0]).toContain('Cơm tấm')
  })

  it('pick: prompt đánh dấu món thích bằng cột liked và dặn ưu tiên khi vừa ngân sách', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return jsonResponse(completion(JSON.stringify(validPayload)))
      },
    })

    await advisor.pick({ ...pickRequest, likedDishIds: new Set(['bun-bo']) }, candidates)
    const prompt = JSON.parse(String(bodies[0]))
      .messages.map((message: { content: string }) => message.content)
      .join('\n')

    expect(prompt).toContain('| liked)')
    expect(prompt).toMatch(/- bun-bo \|[^\n]*\| liked: yes/)
    expect(prompt).toMatch(/- com-tam \|[^\n]*\| liked: no/)
    expect(prompt).toContain('Prefer dishes the user liked when they fit the meal budget')
  })

  it('stream: prompt chat cũng đánh dấu món thích', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return sseResponse(['data: [DONE]\n\n'])
      },
    })

    await advisor.stream(
      { ...chatRequest, context: { ...chatRequest.context, likedDishIds: new Set(['com-tam']) } },
      candidates,
    )
    const prompt = JSON.parse(String(bodies[0])).messages[0].content as string

    expect(prompt).toMatch(/- com-tam \|[^\n]*\| liked: yes/)
    expect(prompt).toContain('Prefer dishes the user liked when they fit the meal budget')
  })

  it('pick: Gemini lỗi → mock fallback vẫn ưu tiên món thích', async () => {
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async () => jsonResponse({ error: 'boom' }, 500),
    })

    const result = await advisor.pick({ ...pickRequest, likedDishIds: new Set(['bun-bo']) }, [
      dish({ id: 'com-tam', priceVnd: 23_000, fillLevel: 3 }),
      dish({ id: 'bun-bo', priceVnd: 12_000, fillLevel: 1 }),
    ])

    expect(result.source).toBe('fallback')
    expect(result.picks[0]?.dishId).toBe('bun-bo')
  })

  it('pick: AI bịa dishId → guards loại, fallback deterministic', async () => {
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async () =>
        jsonResponse(
          completion(
            JSON.stringify({
              picks: [{ dishId: 'ghost-dish', reason_vi: '', reason_en: '' }],
              tip_vi: '',
              tip_en: '',
            }),
          ),
        ),
    })

    const result = await advisor.pick(pickRequest, candidates)

    expect(result.picks.map((pick) => pick.dishId)).not.toContain('ghost-dish')
    expect(result.picks.length).toBeGreaterThan(0)
    expect(result.source).toBe('fallback')
  })

  it('pick: 5xx được thử lại 1 lần rồi mới fallback', async () => {
    let attempts = 0
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async () => {
        attempts += 1
        return new Response('upstream down', { status: 502 })
      },
    })

    const result = await advisor.pick(pickRequest, candidates)

    expect(attempts).toBe(2)
    expect(result.source).toBe('fallback')
    expect(result.picks.length).toBeGreaterThan(0)
  })

  it('pick: 429 rồi thành công → dùng kết quả AI', async () => {
    let attempts = 0
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async () => {
        attempts += 1
        if (attempts === 1) return new Response('slow down', { status: 429 })
        return jsonResponse(completion(JSON.stringify(validPayload)))
      },
    })

    const result = await advisor.pick(pickRequest, candidates)

    expect(attempts).toBe(2)
    expect(result.source).toBe('ai')
  })

  it('stream: ghép delta SSE bị chia nhỏ và phát thẻ món khi text nhắc tên món', async () => {
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Xin chào, thử "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Cơm tấm nhé"}}]}\n',
          '\ndata: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n',
        ]),
    })

    const stream = await advisor.stream(chatRequest, candidates)
    const events = await collect(stream.events)

    expect(stream.degraded).toBe(false)
    expect(
      events
        .filter((event) => event.type === 'text')
        .map((event) => (event.type === 'text' ? event.text : ''))
        .join(''),
    ).toBe('Xin chào, thử Cơm tấm nhé')
    expect(events.filter((event) => event.type === 'dish')).toEqual([
      { type: 'dish', dishId: 'com-tam' },
    ])
  })

  it('stream: text nhắc tên EN hoặc không dấu vẫn phát thẻ món đúng', async () => {
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Thu "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Beef noodle soup"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" hoặc com tam nhe"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
    })

    const stream = await advisor.stream(chatRequest, candidates)
    const events = await collect(stream.events)

    expect(events.filter((event) => event.type === 'dish')).toEqual([
      { type: 'dish', dishId: 'com-tam' },
      { type: 'dish', dishId: 'bun-bo' },
    ])
  })

  it('stream: prompt khoá ngôn ngữ theo locale và cấm AI tự cộng giá', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return sseResponse(['data: [DONE]\n\n'])
      },
    })

    await advisor.stream({ ...chatRequest, locale: 'en' }, candidates)

    expect(bodies[0]).toContain('Answer in English')
    expect(bodies[0]).toContain('Never add prices together')
    expect(bodies[0]).toContain('com-tam')
  })

  it('stream: prompt chat dặn ba bữa trong ngày không trùng món', async () => {
    const bodies: string[] = []
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body))
        return sseResponse(['data: [DONE]\n\n'])
      },
    })

    await advisor.stream(
      { ...chatRequest, messages: [{ role: 'user', content: 'Gợi ý ăn cả ngày 45k' }] },
      candidates,
    )
    const prompt = JSON.parse(String(bodies[0])).messages[0].content as string

    expect(prompt).toContain('Never suggest the same dish for two meals of the same day')
  })

  it('stream: upstream lỗi → degraded + câu trả lời mock', async () => {
    let attempts = 0
    const advisor = createGeminiAdvisor({
      apiKey: 'test-key',
      retryDelayMs: 0,
      fetchImpl: async () => {
        attempts += 1
        return new Response('nope', { status: 503 })
      },
    })

    const stream = await advisor.stream(chatRequest, candidates)
    const events = await collect(stream.events)

    expect(attempts).toBe(2)
    expect(stream.degraded).toBe(true)
    expect(
      events
        .filter((event) => event.type === 'text')
        .map((event) => (event.type === 'text' ? event.text : ''))
        .join(''),
    ).toContain('Bún bò')
  })
})
