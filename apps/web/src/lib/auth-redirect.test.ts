import { describe, expect, it } from 'vitest'
import { safeRedirect } from './auth-redirect'

describe('safeRedirect', () => {
  it('giữ đường dẫn nội bộ', () => {
    expect(safeRedirect('/history')).toBe('/history')
    expect(safeRedirect('/plans?tab=week')).toBe('/plans?tab=week')
  })

  it('chặn URL ngoài, scheme-relative và vòng lặp login', () => {
    expect(safeRedirect('https://evil.example')).toBe('/plans')
    expect(safeRedirect('//evil.example')).toBe('/plans')
    expect(safeRedirect('/login?redirect=/plans')).toBe('/plans')
    expect(safeRedirect('/register')).toBe('/plans')
    expect(safeRedirect(undefined)).toBe('/plans')
    expect(safeRedirect(42)).toBe('/plans')
  })
})
