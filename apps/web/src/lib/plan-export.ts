import { formatDate, type Locale, type Translator } from '@mam/i18n'
import { addDays, mealTypes, type MealType } from '@mam/domain'

export interface PlanExportItem {
  dayIndex: number
  mealType: MealType
  dishId: string
  nameVi: string
  nameEn: string
  priceVnd: number
}

export interface PlanExportInput {
  title: string
  startDate: string
  days: number
  dailyBudgetVnd: number
  items: readonly PlanExportItem[]
  locale: Locale
  t: Translator
  formatMoney: (amount: number) => string
  formatDay: (date: string | Date | number) => string
}

/** Tên món có thể chứa `|` (dữ liệu nhập tay) — phải escape để bảng markdown không vỡ. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

const MEAL_LABEL_KEY = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
} as const satisfies Record<MealType, string>

/** Một bữa trong thực đơn đã dịch sẵn, là nguồn chung của markdown, CSV và .xlsx. */
export interface PlanRow {
  dayIndex: number
  /** `YYYY-MM-DD` */
  date: string
  weekday: string
  meal: string
  dishId: string
  dish: string
  priceVnd: number
}

type PlanRowsInput = Pick<PlanExportInput, 'startDate' | 'days' | 'items' | 'locale' | 't'>

/** Các bữa theo thứ tự ngày rồi bữa; món ngoài khoảng `days` bị bỏ. */
export function planRows({ startDate, days, items, locale, t }: PlanRowsInput): PlanRow[] {
  return items
    .filter((item) => item.dayIndex >= 0 && item.dayIndex < days)
    .toSorted(
      (a, b) =>
        a.dayIndex - b.dayIndex || mealTypes.indexOf(a.mealType) - mealTypes.indexOf(b.mealType),
    )
    .map((item) => {
      const date = addDays(startDate, item.dayIndex)

      return {
        dayIndex: item.dayIndex,
        date,
        weekday: formatDate(date, locale, { weekday: 'long' }),
        meal: t(MEAL_LABEL_KEY[item.mealType]),
        dishId: item.dishId,
        dish: locale === 'en' ? item.nameEn : item.nameVi,
        priceVnd: item.priceVnd,
      }
    })
}

/** Ngày, thứ, bữa, món, giá. Giá là số VND nguyên để bảng tính cộng được. */
export type PlanTableRow = readonly [string, string, string, string, number]

export interface PlanTable {
  header: readonly [string, string, string, string, string]
  rows: PlanTableRow[]
  total: PlanTableRow
}

/** Bảng phẳng cho bảng tính: tiêu đề cột, một hàng mỗi bữa, hàng tổng cuối. */
export function planTable(input: PlanRowsInput): PlanTable {
  const { t } = input
  const rows = planRows(input).map((row): PlanTableRow => [
    row.date,
    row.weekday,
    row.meal,
    row.dish,
    row.priceVnd,
  ])

  return {
    header: [
      t('plans.export.columnDate'),
      t('plans.export.columnWeekday'),
      t('plans.detail.tableMeal'),
      t('plans.detail.tableDish'),
      t('plans.export.columnPrice'),
    ],
    rows,
    total: [t('plans.detail.total'), '', '', '', rows.reduce((sum, row) => sum + row[4], 0)],
  }
}

/** RFC 4180: bọc ngoặc kép khi có dấu phẩy, ngoặc kép hoặc xuống dòng; ngoặc kép nhân đôi. */
function csvField(value: string | number): string {
  const text = String(value)

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV phân tách bằng dấu phẩy, dòng kết thúc CRLF. BOM do nơi tải file thêm. */
export function buildPlanCsv(input: PlanRowsInput): string {
  const { header, rows, total } = planTable(input)

  return [header, ...rows, total].map((row) => `${row.map(csvField).join(',')}\r\n`).join('')
}

/**
 * Thực đơn dạng markdown để copy, tải file hoặc in.
 *
 * Đây là thứ duy nhất user mang ra ngoài web, nên nó phải đọc được độc lập:
 * có tiêu đề, khoảng ngày, tổng tiền và danh sách đi chợ gộp theo món.
 * Mọi con số cộng lại từ `items` — không nhận total từ bên ngoài.
 */
export function buildPlanMarkdown({
  title,
  startDate,
  days,
  dailyBudgetVnd,
  items,
  locale,
  t,
  formatMoney,
  formatDay,
}: PlanExportInput): string {
  const rows = planRows({ startDate, days, items, locale, t })
  const endDate = addDays(startDate, Math.max(0, days - 1))
  const totalVnd = rows.reduce((sum, row) => sum + row.priceVnd, 0)

  const lines: string[] = [
    `# ${title}`,
    '',
    `${t('plans.detail.dateRange', {
      start: formatDay(startDate),
      end: formatDay(endDate),
    })} · ${t('plans.create.dayOption', { count: days })}`,
    '',
    `- ${t('plans.detail.total')}: **${formatMoney(totalVnd)}**`,
    `- ${t('plans.detail.budget')}: ${formatMoney(dailyBudgetVnd * days)}`,
    `- ${t('plans.detail.daily')}: ${formatMoney(dailyBudgetVnd)}`,
    '',
  ]

  const rowsByDay = new Map<number, PlanRow[]>()

  for (const row of rows) rowsByDay.set(row.dayIndex, [...(rowsByDay.get(row.dayIndex) ?? []), row])

  for (const [dayIndex, dayRows] of rowsByDay) {
    const dayTotal = dayRows.reduce((sum, row) => sum + row.priceVnd, 0)

    lines.push(
      `## ${t('plans.detail.day', { index: dayIndex + 1 })} — ${formatDay(dayRows[0]!.date)}`,
      '',
      `| ${t('plans.detail.tableMeal')} | ${t('plans.detail.tableDish')} | ${t(
        'plans.detail.tablePrice',
      )} |`,
      '| --- | --- | ---: |',
    )

    for (const row of dayRows) {
      lines.push(`| ${row.meal} | ${cell(row.dish)} | ${formatMoney(row.priceVnd)} |`)
    }

    lines.push('', `**${t('plans.detail.dayTotal')}:** ${formatMoney(dayTotal)}`, '')
  }

  const shopping = new Map<string, { name: string; count: number; priceVnd: number }>()

  for (const row of rows) {
    const current = shopping.get(row.dishId)

    shopping.set(row.dishId, {
      name: row.dish,
      count: (current?.count ?? 0) + 1,
      priceVnd: row.priceVnd,
    })
  }

  lines.push(`## ${t('plans.export.shoppingList')}`, '')

  for (const entry of [...shopping.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(
      `- [ ] ${cell(entry.name)} — ${entry.count} × ${formatMoney(
        entry.priceVnd,
      )} = ${formatMoney(entry.priceVnd * entry.count)}`,
    )
  }

  lines.push('', '---', '', `_${t('plans.export.disclaimer')}_`, '')

  return lines.join('\n')
}

export type PlanExportFormat = 'md' | 'csv' | 'xlsx'

/** Tên file an toàn cho mọi hệ điều hành, giữ được dấu tiếng Việt. */
export function planFileName(title: string, startDate: string, format: PlanExportFormat): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[\p{Cc}\\/:*?"<>|]+/gu, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  // Cắt theo code point: `slice` trên UTF-16 có thể chẻ đôi emoji thành ký tự hỏng.
  const slug = Array.from(cleaned).slice(0, 60).join('')

  return `${slug || 'meal-plan'}-${startDate}.${format}`
}
