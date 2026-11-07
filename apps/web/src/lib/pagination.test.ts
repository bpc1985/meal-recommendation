import { describe, expect, it } from 'vitest'
import { paginationItems } from './pagination'

describe('paginationItems', () => {
  it('một trang thì chỉ có trang 1', () => {
    expect(paginationItems(1, 1)).toEqual([1])
  })

  it('từ 7 trang trở xuống thì hiện đủ mọi số', () => {
    expect(paginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(paginationItems(1, 3)).toEqual([1, 2, 3])
  })

  it('trang giữa: trang đầu, trang cuối, trang hiện tại ±1, khoảng trống thành dấu …', () => {
    expect(paginationItems(5, 12)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 12])
  })

  it('gần đầu thì chỉ có một dấu … phía sau', () => {
    expect(paginationItems(1, 12)).toEqual([1, 2, 'ellipsis', 12])
    expect(paginationItems(3, 12)).toEqual([1, 2, 3, 4, 'ellipsis', 12])
  })

  it('gần cuối thì chỉ có một dấu … phía trước', () => {
    expect(paginationItems(12, 12)).toEqual([1, 'ellipsis', 11, 12])
    expect(paginationItems(10, 12)).toEqual([1, 'ellipsis', 9, 10, 11, 12])
  })

  it('khoảng trống chỉ một trang thì hiện số đó thay vì dấu …', () => {
    expect(paginationItems(4, 12)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 12])
  })
})
