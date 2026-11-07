import type { MealType } from '@mam/domain'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export interface SwapCell {
  dayIndex: number
  mealType: MealType
}

const keyOf = (planId: string, cell: SwapCell) =>
  `mam_swap_anchor_v1:${planId}:${cell.dayIndex}:${cell.mealType}`

function read(storage: () => StorageLike | null, key: string): string | null {
  try {
    const value = storage()?.getItem(key)?.trim()
    return value && value.length <= 64 ? value : null
  } catch {
    return null
  }
}

/**
 * Món gốc của từng ô (món đang hiện ở lần bấm đầu), để bấm liên tiếp đi hết vòng
 * xoay theo giá gần món gốc thay vì nảy qua lại giữa hai món. Lưu cả vào
 * sessionStorage nên tải lại trang vẫn xoay tiếp; storage bị chặn thì chỉ nhớ trong trang.
 */
export function createSwapAnchors(planId: string, storage: () => StorageLike | null) {
  const memory = new Map<string, string>()

  return {
    anchorFor(cell: SwapCell, currentDishId: string): string {
      const key = keyOf(planId, cell)
      const anchor = memory.get(key) ?? read(storage, key) ?? currentDishId
      memory.set(key, anchor)
      try {
        storage()?.setItem(key, anchor)
      } catch {
        // Hết quota hoặc bị chặn: bản trong `memory` vẫn đủ cho trang hiện tại.
      }
      return anchor
    },
  }
}
