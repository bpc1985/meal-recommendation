import type { Locale } from './translate'

const INTL_LOCALE: Record<Locale, string> = {
  vi: 'vi-VN',
  en: 'en-US',
}

const TIME_ZONE = 'Asia/Ho_Chi_Minh'

export function formatVnd(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value)
}

export function formatDate(
  date: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: '2-digit' },
): string {
  const value = date instanceof Date ? date : new Date(date)

  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: TIME_ZONE }).format(
    value,
  )
}

/** Ngày trước, giờ sau — `vi` mặc định đặt giờ lên trước nên phải ghép thủ công. */
export function formatDateTime(date: Date | string | number, locale: Locale): string {
  const day = formatDate(date, locale, { day: '2-digit', month: '2-digit' })
  const time = formatDate(date, locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return `${day} ${time}`
}
