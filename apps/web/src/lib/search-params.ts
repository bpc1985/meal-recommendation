import { parseSearchWith } from '@tanstack/react-router'

/**
 * Bộ đọc search mặc định của router (JSON.parse từng giá trị), trừ số mà JSON
 * đọc mất chữ: `?min=20.000` phải giữ là chuỗi "20.000" (giá kiểu Việt) chứ
 * không thành 20.
 */
export const parseSearch = parseSearchWith((value) => {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed === 'number' && String(parsed) !== value) throw new Error('số mất chữ')
  return parsed
})
