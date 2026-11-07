import { expect, test, type Download, type Page } from '@playwright/test'
import { readZipEntry } from './read-zip'
import { uniqueEmail, waitForHydration } from './support'

async function downloadExport(page: Page, testId: string): Promise<Download> {
  await page.getByTestId('plan-export-menu').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId(testId).click()
  const download = await downloadPromise
  // Menu còn đang chạy hiệu ứng đóng thì cú bấm mở lại bị nuốt, nên chờ nó ẩn hẳn.
  await expect(page.getByRole('menu')).toBeHidden()

  return download
}

async function readDownload(download: Download): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer)

  return Buffer.concat(chunks)
}

/**
 * Luồng chính của sản phẩm, đúng thứ tự một người dùng mới đi:
 * khách xem gợi ý → bấm lưu → được mời đăng ký → quay lại lưu được thực đơn →
 * tải file markdown, CSV và Excel. Khách phải làm được mọi thứ trừ lưu trên server.
 */
test.describe('happy path', () => {
  test('khách gợi ý → đăng ký → lưu thực đơn 7 ngày → tải markdown, CSV, .xlsx', async ({
    page,
  }) => {
    await page.goto('/recommend')
    await waitForHydration(page)

    // 1. Khách nhận gợi ý mà không cần đăng nhập.
    await page.getByLabel('Số tiền').fill('60000')
    await page.getByRole('button', { name: 'Gợi ý 3 bữa' }).click()

    const saveCta = page.getByTestId('save-plan-cta')
    await expect(saveCta).toBeVisible()
    await expect(saveCta).toBeEnabled()
    await expect(page.getByText('Đăng nhập để lưu thực đơn 7 ngày.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ba bữa cho hôm nay' })).toBeVisible()

    // 2. Lưu khi chưa đăng nhập → sang /login và mang theo redirect.
    await saveCta.click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Frecommend$/)

    // 3. Đăng ký tài khoản mới, quay lại đúng /recommend.
    await page.getByRole('link', { name: 'Chưa có tài khoản? Tạo ngay' }).click()
    await expect(page).toHaveURL(/\/register\?redirect=%2Frecommend$/)
    await waitForHydration(page)

    const email = uniqueEmail('e2e')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click()

    await expect(page).toHaveURL(/\/recommend$/)
    await waitForHydration(page)
    await expect(page.getByRole('button', { name: email })).toBeVisible()

    // 4. Chạy lại gợi ý (state cũ mất khi đăng ký) rồi lưu thực đơn.
    await page.getByLabel('Số tiền').fill('60000')
    await page.getByRole('button', { name: 'Gợi ý 3 bữa' }).click()
    await expect(page.getByTestId('save-plan-cta')).toBeEnabled()
    await page.getByTestId('save-plan-cta').click()

    await expect(page.getByText('Đã lưu thực đơn 7 ngày.')).toBeVisible()
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Thực đơn 7 ngày' })).toBeVisible()
    await expect(page.getByTestId('plan-day-0')).toBeVisible()
    await expect(page.getByTestId('plan-day-6')).toBeVisible()

    // 5. Xuất markdown: tải file và kiểm nội dung thật.
    const mdDownload = await downloadExport(page, 'plan-export-download')
    expect(mdDownload.suggestedFilename()).toMatch(/^Thực-đơn-7-ngày-\d{4}-\d{2}-\d{2}\.md$/u)

    const markdown = (await readDownload(mdDownload)).toString('utf8')

    expect(markdown).toContain('# Thực đơn 7 ngày')
    expect(markdown).toContain('## Đi chợ')
    expect(markdown).toContain('Giá là ước lượng tham khảo, không phải báo giá.')

    // Món ngày 1 bữa sáng lấy từ bảng markdown, để CSV/.xlsx kiểm cùng một tên món thật.
    const firstDish = /\| Bữa sáng \| (.+?) \|/u.exec(markdown)?.[1]
    expect(firstDish).toBeTruthy()

    // 6. CSV: BOM, tiêu đề cột, 21 dòng món và dòng tổng bằng tổng các dòng.
    const csvDownload = await downloadExport(page, 'plan-export-csv')
    expect(csvDownload.suggestedFilename()).toMatch(/^Thực-đơn-7-ngày-\d{4}-\d{2}-\d{2}\.csv$/u)

    const csvBytes = await readDownload(csvDownload)
    expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])

    const csvLines = csvBytes.subarray(3).toString('utf8').trimEnd().split('\r\n')
    expect(csvLines[0]).toBe('Ngày,Thứ,Bữa,Món,Giá (VND)')
    expect(csvLines).toHaveLength(1 + 21 + 1)
    expect(csvLines[1]).toContain(`,Bữa sáng,${firstDish},`)

    const price = (line: string) => Number(line.split(',').at(-1))
    const mealSum = csvLines.slice(1, -1).reduce((sum, line) => sum + price(line), 0)
    expect(csvLines.at(-1)).toMatch(/^Tổng chi,,,,\d+$/u)
    expect(price(csvLines.at(-1)!)).toBe(mealSum)

    // 7. Excel: file zip hợp lệ, tên món tiếng Việt nằm trong sharedStrings.
    const xlsxDownload = await downloadExport(page, 'plan-export-xlsx')
    expect(xlsxDownload.suggestedFilename()).toMatch(/^Thực-đơn-7-ngày-\d{4}-\d{2}-\d{2}\.xlsx$/u)

    const xlsx = await readDownload(xlsxDownload)
    expect(readZipEntry(xlsx, '[Content_Types].xml')).toContain('spreadsheetml')
    expect(readZipEntry(xlsx, 'xl/workbook.xml')).toContain('name="Thực đơn"')
    expect(readZipEntry(xlsx, 'xl/sharedStrings.xml')).toContain(firstDish!)
    expect(readZipEntry(xlsx, 'xl/worksheets/sheet1.xml')).toContain('r="E23"')

    // 8. Thực đơn nằm trong danh sách của tài khoản.
    await page.goto('/plans')
    await expect(page.getByRole('heading', { name: 'Thực đơn của bạn' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Thực đơn 7 ngày', level: 3 })).toBeVisible()
    await expect(page.getByText('7 ngày · 21 món')).toBeVisible()
  })
})
