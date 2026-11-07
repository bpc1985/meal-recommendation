import { describe, expect, it } from 'vitest'
import { createSwapAnchors } from './swap-anchor'

function fakeStorage() {
  const entries = new Map<string, string>()

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    entries,
  }
}

const brokenStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

const lunchDay3 = { dayIndex: 2, mealType: 'lunch' } as const

describe('mốc đổi món', () => {
  it('lần bấm đầu lấy món đang hiện làm mốc, các lần sau giữ mốc đó dù món đã đổi', () => {
    const anchors = createSwapAnchors('plan-1', () => fakeStorage())

    expect(anchors.anchorFor(lunchDay3, 'goc')).toBe('goc')
    expect(anchors.anchorFor(lunchDay3, 'mon-thu-1')).toBe('goc')
    expect(anchors.anchorFor(lunchDay3, 'mon-thu-2')).toBe('goc')
  })

  it('tải lại trang vẫn nhớ mốc cũ của ô', () => {
    const storage = fakeStorage()
    createSwapAnchors('plan-1', () => storage).anchorFor(lunchDay3, 'goc')

    const afterReload = createSwapAnchors('plan-1', () => storage)

    expect(afterReload.anchorFor(lunchDay3, 'mon-thu-1')).toBe('goc')
  })

  it('mỗi ô của mỗi thực đơn có mốc riêng', () => {
    const storage = fakeStorage()
    const plan1 = createSwapAnchors('plan-1', () => storage)
    plan1.anchorFor(lunchDay3, 'goc')

    expect(plan1.anchorFor({ dayIndex: 2, mealType: 'dinner' }, 'toi')).toBe('toi')
    expect(plan1.anchorFor({ dayIndex: 3, mealType: 'lunch' }, 'trua-4')).toBe('trua-4')
    expect(createSwapAnchors('plan-2', () => storage).anchorFor(lunchDay3, 'khac')).toBe('khac')
  })

  it('giá trị hỏng trong storage bị bỏ qua, món đang hiện thành mốc', () => {
    const storage = fakeStorage()
    const anchors = createSwapAnchors('plan-1', () => storage)
    anchors.anchorFor(lunchDay3, 'goc')
    for (const key of storage.entries.keys()) storage.entries.set(key, '   ')

    expect(createSwapAnchors('plan-1', () => storage).anchorFor(lunchDay3, 'moi')).toBe('moi')
  })

  it('storage bị chặn hoặc không có (SSR) thì vẫn nhớ mốc trong trang, không ném lỗi', () => {
    for (const storage of [brokenStorage, null]) {
      const anchors = createSwapAnchors('plan-1', () => storage)

      expect(anchors.anchorFor(lunchDay3, 'goc')).toBe('goc')
      expect(anchors.anchorFor(lunchDay3, 'mon-thu-1')).toBe('goc')
    }
  })
})
