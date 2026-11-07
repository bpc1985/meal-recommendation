import type { ChatWireEvent } from './chat-types'

/**
 * Đọc NDJSON từ `/api/chat`. Dòng hỏng bị bỏ qua thay vì làm sập cả stream —
 * một lỗi parse không nên xoá mất câu trả lời đã hiện.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatWireEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flush = (line: string) => {
    if (!line.trim()) return

    try {
      onEvent(JSON.parse(line) as ChatWireEvent)
    } catch {
      // Bỏ qua dòng không hợp lệ.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      flush(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  }

  buffer += decoder.decode()
  flush(buffer)
}
