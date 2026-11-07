import { createTranslator, formatDate, formatVnd, type Locale } from '@mam/i18n'
import { describe, expect, it } from 'vitest'
import {
  buildPlanCsv,
  buildPlanMarkdown,
  planFileName,
  planRows,
  type PlanExportInput,
  type PlanExportItem,
} from './plan-export'

const startDate = '2026-11-02'

const items: PlanExportItem[] = [
  {
    dayIndex: 0,
    mealType: 'breakfast',
    dishId: 'd1',
    nameVi: 'Bánh mì pate',
    nameEn: 'Pâté bánh mì',
    priceVnd: 18_000,
  },
  {
    dayIndex: 0,
    mealType: 'lunch',
    dishId: 'd2',
    nameVi: 'Cơm tấm',
    nameEn: 'Broken rice',
    priceVnd: 35_000,
  },
  {
    dayIndex: 0,
    mealType: 'dinner',
    dishId: 'd3',
    nameVi: 'Canh rau ngót',
    nameEn: 'Water spinach soup',
    priceVnd: 25_000,
  },
  {
    dayIndex: 1,
    mealType: 'breakfast',
    dishId: 'd1',
    nameVi: 'Bánh mì pate',
    nameEn: 'Pâté bánh mì',
    priceVnd: 18_000,
  },
]

function input(overrides: Partial<PlanExportInput> = {}): PlanExportInput {
  const locale: Locale = overrides.locale ?? 'vi'

  return {
    title: 'Thực đơn 7 ngày',
    startDate,
    days: 2,
    dailyBudgetVnd: 78_000,
    items,
    locale,
    t: createTranslator(locale),
    formatMoney: (amount) => formatVnd(amount, locale),
    formatDay: (date) => formatDate(date, locale, { day: '2-digit', month: '2-digit' }),
    ...overrides,
  }
}

function render(overrides: Partial<PlanExportInput> = {}) {
  return buildPlanMarkdown(input(overrides))
}

describe('buildPlanMarkdown', () => {
  it('có tiêu đề, khoảng ngày và tổng tiền cộng từ items', () => {
    const markdown = render()

    const day = (date: string) => formatDate(date, 'vi', { day: '2-digit', month: '2-digit' })

    expect(markdown.startsWith('# Thực đơn 7 ngày')).toBe(true)
    expect(markdown).toContain(`${day(startDate)} – ${day('2026-11-03')}`)
    expect(markdown).toContain(`**${formatVnd(96_000, 'vi')}**`)
    expect(markdown).toContain(formatVnd(78_000 * 2, 'vi'))
  })

  it('mỗi ngày một bảng đúng thứ tự bữa, kèm cộng ngày', () => {
    const markdown = render()
    const day1 = markdown.split('## Ngày 2')[0]!

    expect(markdown).toContain('## Ngày 1')
    expect(markdown).toContain('## Ngày 2')
    expect(day1.indexOf('Bữa sáng')).toBeLessThan(day1.indexOf('Bữa trưa'))
    expect(day1.indexOf('Bữa trưa')).toBeLessThan(day1.indexOf('Bữa tối'))
    expect(markdown).toContain(`**Cộng ngày:** ${formatVnd(78_000, 'vi')}`)
    expect(markdown.match(/\| --- \|/g)).toHaveLength(2)
  })

  it('gộp danh sách đi chợ theo món, kèm số lượng và thành tiền', () => {
    const markdown = render()
    const shopping = markdown.slice(markdown.indexOf('## Đi chợ'))

    expect(shopping).toContain(
      `- [ ] Bánh mì pate — 2 × ${formatVnd(18_000, 'vi')} = ${formatVnd(36_000, 'vi')}`,
    )
    expect(shopping.match(/Bánh mì pate/g)).toHaveLength(1)
    expect(shopping).toContain('Cơm tấm')
  })

  it('dùng tên tiếng Anh và nhãn tiếng Anh khi locale=en', () => {
    const markdown = render({ locale: 'en' })

    expect(markdown).toContain('# Thực đơn 7 ngày')
    expect(markdown).toContain('Pâté bánh mì')
    expect(markdown).toContain('## Day 1')
    expect(markdown).toContain('## Shopping list')
    expect(markdown).not.toContain('## Đi chợ')
  })

  it('escape dấu | trong tên món để bảng không vỡ', () => {
    const markdown = render({
      items: [{ ...items[0]!, nameVi: 'Bánh mì | đặc biệt', nameEn: 'Bánh mì | special' }],
    })

    expect(markdown).toContain('Bánh mì \\| đặc biệt')
    expect(markdown.split('\n').filter((line) => line.startsWith('|')).length).toBeGreaterThan(0)
  })

  it('kết thúc bằng disclaimer giá tham khảo', () => {
    expect(render().trimEnd().endsWith('_Giá là ước lượng tham khảo, không phải báo giá._')).toBe(
      true,
    )
  })
})

describe('planRows', () => {
  it('một hàng mỗi bữa, theo thứ tự ngày rồi bữa, kèm ngày, thứ và nhãn đã dịch', () => {
    const shuffled = [items[3]!, items[2]!, items[0]!, items[1]!]

    expect(planRows(input({ items: shuffled }))).toEqual([
      {
        dayIndex: 0,
        date: '2026-11-02',
        weekday: 'Thứ Hai',
        meal: 'Bữa sáng',
        dishId: 'd1',
        dish: 'Bánh mì pate',
        priceVnd: 18_000,
      },
      {
        dayIndex: 0,
        date: '2026-11-02',
        weekday: 'Thứ Hai',
        meal: 'Bữa trưa',
        dishId: 'd2',
        dish: 'Cơm tấm',
        priceVnd: 35_000,
      },
      {
        dayIndex: 0,
        date: '2026-11-02',
        weekday: 'Thứ Hai',
        meal: 'Bữa tối',
        dishId: 'd3',
        dish: 'Canh rau ngót',
        priceVnd: 25_000,
      },
      {
        dayIndex: 1,
        date: '2026-11-03',
        weekday: 'Thứ Ba',
        meal: 'Bữa sáng',
        dishId: 'd1',
        dish: 'Bánh mì pate',
        priceVnd: 18_000,
      },
    ])
  })

  it('locale=en dùng tên món, thứ và nhãn bữa tiếng Anh', () => {
    const [first] = planRows(input({ locale: 'en' }))

    expect(first).toMatchObject({ weekday: 'Monday', meal: 'Breakfast', dish: 'Pâté bánh mì' })
  })
})

describe('buildPlanCsv', () => {
  it('tiêu đề cột, một dòng mỗi bữa, dòng tổng cuối; giá là số nguyên trần; CRLF', () => {
    expect(buildPlanCsv(input())).toBe(
      [
        'Ngày,Thứ,Bữa,Món,Giá (VND)',
        '2026-11-02,Thứ Hai,Bữa sáng,Bánh mì pate,18000',
        '2026-11-02,Thứ Hai,Bữa trưa,Cơm tấm,35000',
        '2026-11-02,Thứ Hai,Bữa tối,Canh rau ngót,25000',
        '2026-11-03,Thứ Ba,Bữa sáng,Bánh mì pate,18000',
        'Tổng chi,,,,96000',
        '',
      ].join('\r\n'),
    )
  })

  it('bọc ngoặc kép theo RFC 4180 khi tên món có dấu phẩy, ngoặc kép hoặc xuống dòng', () => {
    const csv = buildPlanCsv(
      input({
        days: 1,
        items: [
          { ...items[0]!, nameVi: 'Cơm gà, "xé" phay' },
          { ...items[1]!, nameVi: 'Bún\nchả' },
          { ...items[2]!, nameVi: 'Canh chua' },
        ],
      }),
    )
    const lines = csv.split('\r\n')

    expect(lines[1]).toBe('2026-11-02,Thứ Hai,Bữa sáng,"Cơm gà, ""xé"" phay",18000')
    expect(lines[2]).toBe('2026-11-02,Thứ Hai,Bữa trưa,"Bún\nchả",35000')
    expect(lines[3]).toBe('2026-11-02,Thứ Hai,Bữa tối,Canh chua,25000')
  })

  it('dòng tổng bằng tổng các dòng món', () => {
    const lines = buildPlanCsv(input()).trimEnd().split('\r\n')
    const prices = lines.slice(1, -1).map((line) => Number(line.split(',').at(-1)))
    const total = Number(lines.at(-1)!.split(',').at(-1))

    expect(prices).toEqual([18_000, 35_000, 25_000, 18_000])
    expect(total).toBe(96_000)
  })

  it('locale=en: tiêu đề cột, thứ, bữa và tên món tiếng Anh', () => {
    const lines = buildPlanCsv(input({ locale: 'en' })).split('\r\n')

    expect(lines[0]).toBe('Date,Weekday,Meal,Dish,Price (VND)')
    expect(lines[1]).toBe('2026-11-02,Monday,Breakfast,Pâté bánh mì,18000')
    expect(lines[5]).toBe('Total,,,,96000')
  })
})

describe('planFileName', () => {
  it('cắt độ dài theo ký tự, không cắt đôi emoji ở biên 60 ký tự', () => {
    expect(planFileName(`${'a'.repeat(59)}😀z`, startDate, 'md')).toBe(
      `${'a'.repeat(59)}😀-2026-11-02.md`,
    )
  })

  it('bỏ ký tự cấm và giữ ngày bắt đầu', () => {
    expect(planFileName('Thực đơn 30 ngày', startDate, 'md')).toBe('Thực-đơn-30-ngày-2026-11-02.md')
    expect(planFileName('a/b:c*?', startDate, 'md')).toBe('a-b-c-2026-11-02.md')
    expect(planFileName('   ', startDate, 'md')).toBe('meal-plan-2026-11-02.md')
  })

  it('đuôi file theo định dạng xuất', () => {
    expect(planFileName('Thực đơn 7 ngày', startDate, 'csv')).toBe('Thực-đơn-7-ngày-2026-11-02.csv')
    expect(planFileName('Thực đơn 7 ngày', startDate, 'xlsx')).toBe(
      'Thực-đơn-7-ngày-2026-11-02.xlsx',
    )
  })

  it('tên hợp lệ trên macOS và Windows dù tiêu đề có ngoặc kép, gạch chéo, ký tự điều khiển', () => {
    expect(planFileName('Tuần 1/11 "ăn chay"', startDate, 'csv')).toBe(
      'Tuần-1-11-ăn-chay-2026-11-02.csv',
    )
    expect(planFileName('Thực\tđơn\u0007', startDate, 'xlsx')).toBe('Thực-đơn-2026-11-02.xlsx')
  })
})
