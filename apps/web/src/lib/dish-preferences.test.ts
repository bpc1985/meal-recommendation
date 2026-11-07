import { describe, expect, it } from 'vitest'
import type { DishPreferenceKind } from '@mam/db'
import {
  createPreferenceSaver,
  nextKind,
  serialByKey,
  toPreferenceMap,
  type PreferenceMap,
} from './dish-preferences'

describe('nextKind', () => {
  it.each([
    [null, 'like', 'like'],
    ['like', 'like', null],
    ['like', 'dislike', 'dislike'],
    ['dislike', 'like', 'like'],
    ['dislike', 'dislike', null],
  ] as const)('đang %s, bấm %s → %s', (current, clicked, expected) => {
    expect(nextKind(current, clicked)).toBe(expected)
  })
})

describe('toPreferenceMap', () => {
  it('gộp hai danh sách từ server thành trạng thái theo món; khách thì rỗng', () => {
    const map = toPreferenceMap({ liked: ['pho'], disliked: ['bun'] })

    expect(map.get('pho')).toBe('like')
    expect(map.get('bun')).toBe('dislike')
    expect(map.size).toBe(2)
    expect(toPreferenceMap(null).size).toBe(0)
  })
})

describe('serialByKey', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  /** Tác vụ chỉ xong khi test gọi `resolve`/`reject`, để dựng thứ tự trả về tuỳ ý. */
  function deferred() {
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('cùng một món: lần bấm sau chỉ gửi khi lần trước đã xong, nên DB nhận đúng thứ tự', async () => {
    const run = serialByKey()
    const started: string[] = []
    const first = deferred()
    const second = deferred()

    const a = run('pho', () => {
      started.push('like')
      return first.promise
    })
    const b = run('pho', () => {
      started.push('null')
      return second.promise
    })
    await settle()
    expect(started).toEqual(['like'])

    first.resolve()
    await a
    await settle()
    expect(started).toEqual(['like', 'null'])

    second.resolve()
    await b
  })

  it('món khác không phải chờ nhau; một lần lỗi không chặn lần sau', async () => {
    const run = serialByKey()
    const started: string[] = []
    const slow = deferred()

    const failed = run('pho', () => {
      started.push('pho-1')
      return slow.promise
    })
    void run('bun', async () => {
      started.push('bun')
    })
    await settle()
    expect(started).toEqual(['pho-1', 'bun'])

    const retry = run('pho', async () => {
      started.push('pho-2')
      return 'ok'
    })
    slow.reject(new Error('mạng lỗi'))
    await expect(failed).rejects.toThrow('mạng lỗi')
    await expect(retry).resolves.toBe('ok')
    expect(started).toEqual(['pho-1', 'bun', 'pho-2'])
  })
})

describe('createPreferenceSaver', () => {
  type SaveResult = { ok: true } | { ok: false; error: 'unauthorized' | 'dish_not_found' }

  /** Server giả: mỗi lời gọi chờ test trả lời, ghi lại thứ tự gọi. */
  function fakeServer() {
    const calls: string[] = []
    const pending: Array<{ resolve: (value: unknown) => void; reject: (error: Error) => void }> = []
    const wait = <T>(label: string) => {
      calls.push(label)
      return new Promise<T>((resolve, reject) => {
        pending.push({ resolve: resolve as (value: unknown) => void, reject })
      })
    }
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
    return {
      calls,
      save: (dishId: string, kind: DishPreferenceKind | null) =>
        wait<SaveResult>(`save ${dishId} ${kind}`),
      load: () => wait<PreferenceMap>('load'),
      /** Trả lời lời gọi đang chờ lâu nhất. */
      async reply(value: unknown) {
        await settle()
        pending.shift()?.resolve(value)
        await settle()
      },
      async fail() {
        await settle()
        pending.shift()?.reject(new Error('offline'))
        await settle()
      },
    }
  }

  it('lưu thành công thì giữ trạng thái đang hiện', async () => {
    const server = fakeServer()
    const save = createPreferenceSaver(new Map(), server)

    const outcome = save('pho', 'like')
    await server.reply({ ok: true })

    await expect(outcome).resolves.toEqual({ status: 'saved' })
    expect(server.calls).toEqual(['save pho like'])
  })

  it('lưu lỗi thì đọc lại server và về đúng trạng thái trong DB', async () => {
    const server = fakeServer()
    const save = createPreferenceSaver(new Map(), server)

    const outcome = save('pho', 'like')
    await server.reply({ ok: false, error: 'dish_not_found' })
    await server.reply(new Map([['pho', 'dislike']]))

    await expect(outcome).resolves.toEqual({
      status: 'failed',
      error: 'dish_not_found',
      revertTo: 'dislike',
    })
  })

  it('mất mạng cả lúc lưu lẫn lúc đọc lại: về trạng thái server xác nhận lần cuối', async () => {
    const server = fakeServer()
    const save = createPreferenceSaver(new Map([['pho', 'dislike']]), server)

    const liked = save('pho', 'like')
    await server.reply({ ok: true })
    await expect(liked).resolves.toEqual({ status: 'saved' })

    const cleared = save('pho', null)
    await server.fail()
    await server.fail()

    await expect(cleared).resolves.toEqual({ status: 'failed', error: 'network', revertTo: 'like' })
  })

  it('lỗi nhưng user đã bấm tiếp: không đọc lại, để lần bấm mới quyết trạng thái', async () => {
    const server = fakeServer()
    const save = createPreferenceSaver(new Map(), server)

    const liked = save('pho', 'like')
    const disliked = save('pho', 'dislike')
    await server.fail()
    await expect(liked).resolves.toEqual({ status: 'superseded', error: 'network' })

    await server.reply({ ok: true })
    await expect(disliked).resolves.toEqual({ status: 'saved' })
    expect(server.calls).toEqual(['save pho like', 'save pho dislike'])
  })

  it('bấm tiếp trong lúc đang đọc lại: bỏ kết quả đọc cũ, lần lưu mới đi sau lần đọc', async () => {
    const server = fakeServer()
    const save = createPreferenceSaver(new Map(), server)

    const liked = save('pho', 'like')
    await server.fail()
    expect(server.calls).toEqual(['save pho like', 'load'])

    const disliked = save('pho', 'dislike')
    await server.reply(new Map())
    await expect(liked).resolves.toEqual({ status: 'superseded', error: 'network' })
    expect(server.calls).toEqual(['save pho like', 'load', 'save pho dislike'])

    await server.reply({ ok: true })
    await expect(disliked).resolves.toEqual({ status: 'saved' })
  })
})
