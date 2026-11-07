/**
 * IP dùng làm khoá rate limit. Sau proxy/CDN, IP thật nằm ở `x-forwarded-for`;
 * dev không có header thì dùng "local".
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'local'

  return request.headers.get('x-real-ip') ?? 'local'
}
