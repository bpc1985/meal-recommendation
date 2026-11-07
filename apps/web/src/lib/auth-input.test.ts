import { describe, expect, it } from 'vitest'
import { loginInputSchema, registerInputSchema, toFieldErrors } from './auth-input'

describe('auth input schemas', () => {
  it('email hợp lệ + mật khẩu 8 ký tự đi qua', () => {
    expect(
      loginInputSchema.safeParse({ email: 'an@example.com', password: '12345678' }).success,
    ).toBe(true)
  })

  it('mật khẩu 7 ký tự và email sai bị từ chối, map đúng field', () => {
    const parsed = loginInputSchema.safeParse({ email: 'khong-phai-email', password: '1234567' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return

    expect(toFieldErrors(parsed.error)).toEqual({
      email: 'auth.error.email',
      password: 'auth.error.password',
    })
  })

  it('register cho phép thiếu displayName nhưng không cho rỗng sau trim', () => {
    expect(
      registerInputSchema.safeParse({ email: 'an@example.com', password: '12345678' }).success,
    ).toBe(true)

    const blank = registerInputSchema.safeParse({
      email: 'an@example.com',
      password: '12345678',
      displayName: '   ',
    })

    expect(blank.success).toBe(true)
    if (blank.success) expect(blank.data.displayName).toBe('')
  })
})
