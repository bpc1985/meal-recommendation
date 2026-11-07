import type { DishPreferenceKind, DishPreferences } from '@mam/db'

export type PreferenceMap = ReadonlyMap<string, DishPreferenceKind>

/** Bấm lại nút đang bật thì bỏ chọn; bấm nút kia thì chuyển hẳn sang trạng thái đó. */
export function nextKind(
  current: DishPreferenceKind | null,
  clicked: DishPreferenceKind,
): DishPreferenceKind | null {
  return current === clicked ? null : clicked
}

export function toPreferenceMap(preferences: DishPreferences | null): PreferenceMap {
  return new Map([
    ...(preferences?.liked ?? []).map((id) => [id, 'like'] as const),
    ...(preferences?.disliked ?? []).map((id) => [id, 'dislike'] as const),
  ])
}

/**
 * Chạy tác vụ cùng khoá nối đuôi nhau. Bấm nhanh nhiều lần trên một món thì các
 * request tới server đúng thứ tự bấm, nên hàng cuối trong DB khớp trạng thái cuối trên UI.
 */
export function serialByKey() {
  const tails = new Map<string, Promise<unknown>>()

  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const result = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(task)
    tails.set(key, result)
    return result
  }
}

export type SavePreferenceError = 'unauthorized' | 'dish_not_found' | 'network'

export type SavePreferenceOutcome =
  | { status: 'saved' }
  /** Lần bấm này lỗi; UI phải về `revertTo` để khớp DB. */
  | { status: 'failed'; error: SavePreferenceError; revertTo: DishPreferenceKind | null }
  /** Lần bấm này lỗi nhưng user đã bấm tiếp trên món đó; lần bấm mới quyết trạng thái UI. */
  | { status: 'superseded'; error: SavePreferenceError }

export interface PreferenceServer {
  save: (
    dishId: string,
    kind: DishPreferenceKind | null,
  ) => Promise<{ ok: true } | { ok: false; error: 'unauthorized' | 'dish_not_found' }>
  load: () => Promise<PreferenceMap>
}

/**
 * Lưu lần bấm thích/chán. Lưu và đọc lại sau lỗi cùng đi trong chuỗi của món, nên
 * lần đọc lại không bao giờ chạy song song với lần lưu sau. Đọc lại cũng lỗi (mất mạng)
 * thì về trạng thái server xác nhận lần cuối, không giữ trạng thái chưa lưu được.
 */
export function createPreferenceSaver(initial: PreferenceMap, server: PreferenceServer) {
  const run = serialByKey()
  const confirmed = new Map(initial)
  const latest = new Map<string, number>()

  return (dishId: string, kind: DishPreferenceKind | null): Promise<SavePreferenceOutcome> => {
    const click = (latest.get(dishId) ?? 0) + 1
    latest.set(dishId, click)
    const superseded = () => latest.get(dishId) !== click
    const confirm = (value: DishPreferenceKind | null) => {
      if (value) confirmed.set(dishId, value)
      else confirmed.delete(dishId)
    }

    return run(dishId, async (): Promise<SavePreferenceOutcome> => {
      const error = await server.save(dishId, kind).then(
        (result) => (result.ok ? null : result.error),
        () => 'network' as const,
      )
      if (error === null) {
        confirm(kind)
        return { status: 'saved' }
      }
      if (superseded()) return { status: 'superseded', error }

      const actual = await server.load().then(
        (map) => map.get(dishId) ?? null,
        () => undefined,
      )
      if (actual !== undefined) confirm(actual)
      if (superseded()) return { status: 'superseded', error }
      return { status: 'failed', error, revertTo: confirmed.get(dishId) ?? null }
    })
  }
}
