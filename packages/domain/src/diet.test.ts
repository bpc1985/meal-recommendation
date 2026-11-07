import { describe, expect, it } from 'vitest'
import { dishMatchesDiet } from './diet'

const dish = (tags: string[]) => ({ tags })

describe('dishMatchesDiet', () => {
  it('không có tag nào → mọi món đều hợp lệ', () => {
    expect(dishMatchesDiet(dish(['pork', 'spicy']), [])).toBe(true)
  })

  it('tag thường là bắt buộc', () => {
    expect(dishMatchesDiet(dish(['vegetarian', 'quick']), ['vegetarian'])).toBe(true)
    expect(dishMatchesDiet(dish(['pork']), ['vegetarian'])).toBe(false)
  })

  it('no-x loại món mang tag x, kể cả khi món có tag khác', () => {
    expect(dishMatchesDiet(dish(['seafood', 'soup']), ['no-seafood'])).toBe(false)
    expect(dishMatchesDiet(dish(['vegetarian', 'soup']), ['no-seafood'])).toBe(true)
  })

  it('kết hợp nhiều tag', () => {
    expect(dishMatchesDiet(dish(['vegetarian', 'egg']), ['vegetarian', 'no-seafood'])).toBe(true)
    expect(dishMatchesDiet(dish(['vegetarian', 'seafood']), ['vegetarian', 'no-seafood'])).toBe(
      false,
    )
  })
})
