import { describe, expect, it } from 'vitest'
import { parseSearch } from './search-params'

describe('parseSearch', () => {
  it('vẫn đọc số, chuỗi, mảng JSON như bộ đọc mặc định của router', () => {
    expect(parseSearch('?page=2&q=pho&meal=%5B%22dinner%22%5D&ok=true')).toEqual({
      page: 2,
      q: 'pho',
      meal: ['dinner'],
      ok: true,
    })
  })

  it('số viết kiểu Việt "20.000" giữ nguyên chuỗi thay vì thành 20', () => {
    expect(parseSearch('?min=20.000&max=1.50&x=1e3&y=1.5')).toEqual({
      min: '20.000',
      max: '1.50',
      x: '1e3',
      y: 1.5,
    })
  })
})
