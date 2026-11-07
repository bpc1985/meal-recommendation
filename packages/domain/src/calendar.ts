/** Ngày lịch dạng `YYYY-MM-DD`. Tính trên UTC để không lệ thuộc timezone của máy chạy. */

const MS_PER_DAY = 86_400_000

function toUtcMs(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)

  return Date.UTC(year!, month! - 1, day!)
}

export function addDays(isoDate: string, days: number): string {
  return new Date(toUtcMs(isoDate) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Số ngày từ `from` tới `to`; âm khi `to` đứng trước `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

/**
 * Ngày hôm nay theo giờ Việt Nam dạng `YYYY-MM-DD`.
 * Dùng `en-CA` vì locale này in đúng thứ tự năm-tháng-ngày.
 */
export function todayIsoDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}
