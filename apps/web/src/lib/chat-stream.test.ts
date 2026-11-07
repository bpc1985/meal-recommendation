import { describe, expect, it } from 'vitest'
import { readChatStream } from './chat-stream'
import type { ChatWireEvent } from './chat-types'

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= parts.length) {
        controller.close()
        return
      }

      controller.enqueue(encoder.encode(parts[index]))
      index += 1
    },
  })
}

async function collect(parts: string[]): Promise<ChatWireEvent[]> {
  const events: ChatWireEvent[] = []
  await readChatStream(streamOf(parts), (event) => events.push(event))
  return events
}

describe('readChatStream', () => {
  it('ghép NDJSON bị chia nhỏ giữa các chunk', async () => {
    const events = await collect([
      '{"type":"text","text":"Xin "}\n{"type":"te',
      'xt","text":"chào"}\n{"type":"meta","dishes":[],"degraded":false}\n',
      '{"type":"done"}\n',
    ])

    expect(events).toEqual([
      { type: 'text', text: 'Xin ' },
      { type: 'text', text: 'chào' },
      { type: 'meta', dishes: [], degraded: false },
      { type: 'done' },
    ])
  })

  it('đọc được dòng cuối không có newline', async () => {
    const events = await collect(['{"type":"done"}'])

    expect(events).toEqual([{ type: 'done' }])
  })

  it('bỏ qua dòng trống và JSON hỏng, không làm đứt stream', async () => {
    const events = await collect(['\n', 'not json\n', '{"type":"text","text":"ok"}\n', '\n'])

    expect(events).toEqual([{ type: 'text', text: 'ok' }])
  })
})
