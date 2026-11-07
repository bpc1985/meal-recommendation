import type { CellObject } from 'write-excel-file/browser'
import { planTable, type PlanExportInput, type PlanTableRow } from './plan-export'

const PRICE_FORMAT = '#,##0'

function displayLength(value: string | number): number {
  return typeof value === 'number' ? value.toLocaleString('en-US').length : value.length
}

/**
 * Thực đơn dạng .xlsx: cùng bảng với CSV, giá là ô số định dạng `#,##0`, hàng tổng in đậm.
 *
 * Thư viện chỉ được nạp lúc user bấm tải, để trang chi tiết thực đơn không mang thêm JS.
 */
export async function buildPlanXlsx(input: PlanExportInput): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const { header, rows, total } = planTable(input)

  const toCells = (row: PlanTableRow, bold: boolean): CellObject[] =>
    row.map((value) =>
      typeof value === 'number'
        ? { value, type: Number, format: PRICE_FORMAT, ...(bold && { fontWeight: 'bold' }) }
        : { value, ...(bold && { fontWeight: 'bold' }) },
    )

  // Excel đo độ rộng cột theo số ký tự; thiếu bước này tên món dài tràn sang cột giá.
  const columns = header.map((title, index) => ({
    width:
      Math.max(...[header, ...rows, total].map((row) => displayLength(row[index] ?? title))) + 2,
  }))

  return writeXlsxFile(
    [
      header.map((value): CellObject => ({ value, fontWeight: 'bold' })),
      ...rows.map((row) => toCells(row, false)),
      toCells(total, true),
    ],
    { sheet: input.t('plans.export.sheetName'), columns, stickyRowsCount: 1 },
  ).toBlob()
}
