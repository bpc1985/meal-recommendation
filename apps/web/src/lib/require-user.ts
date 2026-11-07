import { redirect } from '@tanstack/react-router'
import { fetchSessionUser } from '@/server/auth.functions'

/**
 * Dùng trong `beforeLoad` của route cần đăng nhập: chưa có session thì đá về
 * `/login?redirect=...` để quay lại đúng chỗ sau khi đăng nhập.
 */
export async function requireUser(locationHref: string) {
  const user = await fetchSessionUser()

  if (!user) {
    throw redirect({ to: '/login', search: { redirect: locationHref } })
  }

  return { user }
}
