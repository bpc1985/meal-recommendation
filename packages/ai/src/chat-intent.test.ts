import { describe, expect, it } from 'vitest'
import { parseChatIntent } from './chat-intent'

describe('parseChatIntent', () => {
  it('đọc bữa trưa, ngân sách và món chay từ câu tiếng Việt', () => {
    expect(parseChatIntent('Ăn trưa 40k món chay giúp mình')).toEqual({
      mealType: 'lunch',
      budgetVnd: 40_000,
      dietTags: ['vegetarian'],
    })
  })

  it('đọc bữa sáng và ngân sách viết bằng "nghìn"', () => {
    expect(parseChatIntent('Bữa sáng khoảng 25 nghìn thôi')).toEqual({
      mealType: 'breakfast',
      budgetVnd: 25_000,
      dietTags: [],
    })
  })

  it('đọc số tiền viết tay có dấu chấm và đơn vị đ', () => {
    expect(parseChatIntent('Tối nay 45.000đ, không cay')).toEqual({
      mealType: 'dinner',
      budgetVnd: 45_000,
      dietTags: ['no-spicy'],
    })
  })

  it('quy đổi "triệu" và số lẻ', () => {
    expect(parseChatIntent('Ngân sách 1,5 triệu cho cả ngày').budgetVnd).toBe(1_500_000)
    expect(parseChatIntent('mình có 2tr').budgetVnd).toBe(2_000_000)
  })

  it('hiểu câu tiếng Anh', () => {
    expect(parseChatIntent('Breakfast under 30,000 vnd, no spicy please')).toEqual({
      mealType: 'breakfast',
      budgetVnd: 30_000,
      dietTags: ['no-spicy'],
    })
  })

  it('nhận diện bữa tối bằng cụm từ, không nhầm với "tôi"', () => {
    expect(parseChatIntent('Tôi muốn ăn tối').mealType).toBe('dinner')
    expect(parseChatIntent('Tôi là sinh viên').mealType).toBeNull()
  })

  it('không coi "3 bữa" là ngân sách 3 đồng', () => {
    expect(parseChatIntent('Chia 3 bữa trong ngày giúp mình').budgetVnd).toBeNull()
  })

  it('số trần không có đơn vị nhưng có từ khoá ngân sách thì hiểu là nghìn', () => {
    expect(parseChatIntent('Ngân sách 30 cho bữa trưa').budgetVnd).toBe(30_000)
  })

  it('gom nhiều chế độ ăn theo thứ tự allowlist', () => {
    expect(parseChatIntent('Món chay, không cay, không hải sản').dietTags).toEqual([
      'vegetarian',
      'no-spicy',
      'no-seafood',
    ])
  })

  it('không thêm loại trừ khi người dùng chỉ nhắc tên món', () => {
    expect(parseChatIntent('Mình thích hải sản').dietTags).toEqual([])
  })

  it('câu không có tín hiệu gì → null hết', () => {
    expect(parseChatIntent('Hôm nay trời đẹp quá')).toEqual({
      mealType: null,
      budgetVnd: null,
      dietTags: [],
    })
  })
})
