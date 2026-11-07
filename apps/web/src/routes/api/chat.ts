import { createTranslator } from '@mam/i18n'
import { getDb } from '@mam/db'
import { createFileRoute } from '@tanstack/react-router'
import { getAdvisor } from '@/server/advisor'
import { beginChatTurn, finishChatTurn } from '@/server/chat-thread.service'
import { chatInputSchema, runChat, type ChatEvent } from '@/server/chat.service'
import { loadSessionPreferences } from '@/server/dish-preferences.service'
import { clientKey } from '@/server/client-key'
import { getGuestChatLimiter, getRegisteredChatLimiter } from '@/server/rate-limit'
import { readSessionToken } from '@/server/session'

const NDJSON_HEADERS = {
  'content-type': 'application/x-ndjson; charset=utf-8',
  // Stream không được buffer bởi proxy/CDN.
  'cache-control': 'no-store, no-transform',
  'x-accel-buffering': 'no',
} as const

function jsonResponse(
  payload: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown

        try {
          payload = await request.json()
        } catch {
          return jsonResponse(
            { error: 'invalid_request', message: createTranslator('vi')('chat.error') },
            400,
          )
        }

        const parsed = chatInputSchema.safeParse(payload)

        if (!parsed.success) {
          const requestedLocale =
            payload !== null &&
            typeof payload === 'object' &&
            'locale' in payload &&
            payload.locale === 'en'
              ? 'en'
              : 'vi'
          const t = createTranslator(requestedLocale)

          return jsonResponse({ error: 'invalid_request', message: t('chat.error') }, 400)
        }

        const input = parsed.data
        const t = createTranslator(input.locale)
        const db = getDb()
        const { user, preferences } = loadSessionPreferences(
          db,
          readSessionToken(request.headers.get('cookie')),
        )
        // Đăng nhập: quota 200/ngày theo user; khách: 20/ngày theo IP.
        const limit = (user ? getRegisteredChatLimiter() : getGuestChatLimiter()).check(
          user ? `user:${user.id}` : clientKey(request),
        )

        if (!limit.allowed) {
          const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60))

          return jsonResponse(
            {
              error: 'rate_limited',
              retryAfter: limit.retryAfterSeconds,
              message: t('chat.rateLimited', { limit: limit.limit, minutes }),
            },
            429,
            { 'retry-after': String(limit.retryAfterSeconds) },
          )
        }

        const encoder = new TextEncoder()
        const iterator = runChat(db, { ...input, preferences }, { advisor: getAdvisor() })

        /**
         * Chỉ user đăng nhập mới ghi DB. Thread + câu hỏi được lưu *trước* khi stream
         * chạy để đóng tab giữa chừng vẫn còn lượt trong sidebar; câu trả lời lưu ở
         * cuối (kể cả khi bị Dừng, partial text vẫn giữ).
         */
        const lastUserMessage = [...input.messages]
          .reverse()
          .find((message) => message.role === 'user')

        const turn =
          user && lastUserMessage
            ? beginChatTurn(db, {
                userId: user.id,
                locale: input.locale,
                threadId: input.threadId,
                message: lastUserMessage.content,
              })
            : null

        const answer = { text: '', dishIds: [] as string[] }
        let saved = false

        const saveAnswer = () => {
          if (!turn || saved) return
          saved = true
          finishChatTurn(db, {
            threadId: turn.threadId,
            text: answer.text,
            dishIds: answer.dishIds,
          })
        }

        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: ChatEvent) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
            }

            // UI cần threadId ngay từ đầu để lượt sau nhắn tiếp đúng hội thoại.
            if (turn) send({ type: 'thread', threadId: turn.threadId })

            try {
              for await (const event of iterator) {
                if (event.type === 'text') answer.text += event.text
                if (event.type === 'dish') answer.dishIds.push(event.dishId)
                send(event)
              }
            } catch {
              // Stream đứt giữa chừng vẫn phải đóng đúng protocol để UI không treo.
              send({ type: 'meta', dishes: [], degraded: true })
              send({ type: 'done' })
            }

            saveAnswer()
            controller.close()
          },

          async cancel() {
            await iterator.return(undefined)
            saveAnswer()
          },
        })

        return new Response(body, { headers: NDJSON_HEADERS })
      },
    },
  },
})
