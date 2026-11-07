const FALLBACK = '/plans'

/**
 * Chỉ chấp nhận đường dẫn nội bộ, tránh open redirect qua `?redirect=https://evil`.
 * Trả về `fallback` khi giá trị thiếu hoặc không an toàn.
 */
export function safeRedirect(value: unknown, fallback = FALLBACK): string {
  if (typeof value !== 'string') return fallback

  if (!value.startsWith('/') || value.startsWith('//')) return fallback

  // '/login?...' sau khi đăng nhập sẽ lặp vô hạn.
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/register')) {
    return fallback
  }

  return value
}
