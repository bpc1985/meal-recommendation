import type { Page } from '@playwright/test'

/**
 * Chờ React gắn xong handler trước khi bấm/gõ.
 *
 * Trang render từ SSR nên nút đã hiện trước khi hydrate; bấm ngay lúc đó không
 * có handler nào chạy và test sẽ flake theo tốc độ máy. Dấu hiệu chắc chắn nhất
 * là React gắn prop nội bộ `__reactProps$...` lên phần tử form.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('form')].some((form) =>
        Object.keys(form).some((key) => key.startsWith('__reactProps$')),
      ),
    undefined,
    { timeout: 20_000 },
  )
}

/** Email duy nhất cho mỗi lượt chạy — DB e2e được xoá trước mỗi lần nhưng vẫn an toàn. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1_000)}@example.com`
}
