import { createTranslator, formatDate, formatVnd, type Locale } from '@mam/i18n'
import { describe, expect, it } from 'vitest'
import { readZipEntry } from '../../e2e/read-zip'
import type { PlanExportInput, PlanExportItem } from './plan-export'
import { buildPlanXlsx } from './plan-xlsx'

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
    nameVi: 'Cơm tấm sườn bì chả trứng ốp la',
    nameEn: 'Broken rice with pork chop',
    priceVnd: 45_000,
  },
  {
    dayIndex: 0,
    mealType: 'dinner',
    dishId: 'd3',
    nameVi: 'Canh rau ngót',
    nameEn: 'Water spinach soup',
    priceVnd: 25_000,
  },
]

function input(locale: Locale = 'vi'): PlanExportInput {
  return {
    title: 'Thực đơn 1 ngày',
    startDate: '2026-11-02',
    days: 1,
    dailyBudgetVnd: 100_000,
    items,
    locale,
    t: createTranslator(locale),
    formatMoney: (amount) => formatVnd(amount, locale),
    formatDay: (date) => formatDate(date, locale),
  }
}

async function unzip(locale: Locale = 'vi') {
  const blob = await buildPlanXlsx(input(locale))
  const zip = Buffer.from(await blob.arrayBuffer())
  const read = (name: string) => {
    const content = readZipEntry(zip, name)

    if (content === undefined) throw new Error(`thiếu ${name} trong .xlsx`)

    return content
  }

  return { blob, read }
}

/** Ô theo địa chỉ, ví dụ `E2` → `<c r="E2" ...>...</c>`. */
function cellXml(sheet: string, ref: string): string {
  const match = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>.*?</c>)`).exec(sheet)

  if (!match) throw new Error(`không thấy ô ${ref}`)

  return match[0]
}

describe('buildPlanXlsx', () => {
  it('trả file .xlsx đúng MIME, sheet tên "Thực đơn"', async () => {
    const { blob, read } = await unzip()

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(read('[Content_Types].xml')).toContain('spreadsheetml')
    expect(read('xl/workbook.xml')).toContain('name="Thực đơn"')
  })

  it('giữ nguyên tiêu đề cột và tên món tiếng Việt', async () => {
    const strings = (await unzip()).read('xl/sharedStrings.xml')

    for (const text of ['Ngày', 'Thứ', 'Món', 'Giá (VND)', 'Thứ Hai', 'Bữa trưa', 'Tổng chi']) {
      expect(strings).toContain(text)
    }
    expect(strings).toContain('Cơm tấm sườn bì chả trứng ốp la')
  })

  it('cột giá là số (không phải chuỗi), dòng cuối là tổng in đậm', async () => {
    const { read } = await unzip()
    const sheet = read('xl/worksheets/sheet1.xml')

    expect(cellXml(sheet, 'E2')).toContain('<v>18000</v>')
    expect(cellXml(sheet, 'E2')).not.toContain('t="s"')
    expect(cellXml(sheet, 'E5')).toContain('<v>88000</v>')
    expect(cellXml(sheet, 'E5')).not.toContain('t="s"')
    expect(sheet).not.toContain('r="A6"')

    const styleIndex = (ref: string) => Number(/ s="(\d+)"/.exec(cellXml(sheet, ref))?.[1] ?? 0)
    const styles = read('xl/styles.xml')
    const cellXfs = styles.slice(styles.indexOf('<cellXfs'))
    const xfs = [...cellXfs.matchAll(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/g)].map((match) => match[0])
    const fonts = [...styles.matchAll(/<font>.*?<\/font>|<font\/>/g)].map((match) => match[0])
    const fontOf = (ref: string) => {
      const fontId = Number(/fontId="(\d+)"/.exec(xfs[styleIndex(ref)] ?? '')?.[1] ?? 0)

      return fonts[fontId] ?? ''
    }

    expect(fontOf('E5')).toContain('<b/>')
    expect(fontOf('E2')).not.toContain('<b/>')
    expect(xfs[styleIndex('E2')]).toMatch(/numFmtId="(3|1\d\d)"/)
  })

  it('cột tên món đủ rộng để tên dài nhất không đè sang cột giá', async () => {
    const sheet = (await unzip()).read('xl/worksheets/sheet1.xml')
    const widths = [...sheet.matchAll(/<col [^>]*min="(\d+)"[^>]*width="([\d.]+)"/g)].map(
      (match) => [Number(match[1]), Number(match[2])] as const,
    )
    const dishWidth = widths.find(([column]) => column === 4)?.[1] ?? 0

    expect(dishWidth).toBeGreaterThanOrEqual('Cơm tấm sườn bì chả trứng ốp la'.length)
  })

  it('locale=en: sheet "Meal plan", tiêu đề và tên món tiếng Anh', async () => {
    const { read } = await unzip('en')
    const strings = read('xl/sharedStrings.xml')

    expect(read('xl/workbook.xml')).toContain('name="Meal plan"')
    expect(strings).toContain('Price (VND)')
    expect(strings).toContain('Broken rice with pork chop')
    expect(strings).not.toContain('Cơm tấm')
  })
})
