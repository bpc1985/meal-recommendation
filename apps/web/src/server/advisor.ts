import { createGeminiAdvisor, createMockAdvisor, type MealAdvisor } from '@mam/ai'

type AdvisorEnv = Partial<Record<'AI_PROVIDER' | 'GEMINI_API_KEY' | 'GEMINI_MODEL', string>>

/**
 * Đọc cấu hình AI một lần khi server khởi động. Sai cấu hình phải nổ ngay,
 * không âm thầm trả mock khi người vận hành tưởng đang gọi AI thật.
 */
export function createAdvisorFromEnv(env: AdvisorEnv = process.env): MealAdvisor {
  const provider = env.AI_PROVIDER ?? 'mock'
  // Mock nghỉ giữa chunk để UI thấy chữ hiện dần như provider thật.
  const mock = () => createMockAdvisor({ chunkDelayMs: 18 })

  if (provider === 'mock') return mock()

  if (provider === 'gemini') {
    const apiKey = env.GEMINI_API_KEY

    if (!apiKey) {
      throw new Error(
        'AI_PROVIDER=gemini nhưng thiếu GEMINI_API_KEY. Đặt key hoặc chuyển AI_PROVIDER=mock.',
      )
    }

    return createGeminiAdvisor({
      apiKey,
      model: env.GEMINI_MODEL,
      fallback: mock(),
    })
  }

  throw new Error(`AI_PROVIDER không hợp lệ: "${provider}". Chỉ nhận "mock" hoặc "gemini".`)
}

const advisor = createAdvisorFromEnv()

export function getAdvisor(): MealAdvisor {
  return advisor
}
