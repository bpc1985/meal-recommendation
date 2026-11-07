export type PaginationItem = number | 'ellipsis'

/** Hiện hết khi số trang không quá mức này; nhiều hơn thì rút gọn bằng dấu …. */
const SHOW_ALL_UP_TO = 7

/**
 * Các ô của thanh phân trang: trang đầu, trang cuối, trang hiện tại ±1. Khoảng
 * trống nhiều trang thành `'ellipsis'`; khoảng trống đúng một trang thì hiện luôn
 * số đó, vì dấu … chiếm chỗ bằng một nút mà lại giấu mất trang.
 */
export function paginationItems(page: number, pageCount: number): PaginationItem[] {
  if (pageCount <= SHOW_ALL_UP_TO) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const shown = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b)

  const items: PaginationItem[] = []

  for (const value of shown) {
    const previous = items.at(-1)

    if (typeof previous === 'number') {
      if (value - previous === 2) items.push(previous + 1)
      else if (value - previous > 2) items.push('ellipsis')
    }

    items.push(value)
  }

  return items
}
