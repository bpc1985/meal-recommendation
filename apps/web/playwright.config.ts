import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * E2E chạy trên dev server thật nhưng **AI_PROVIDER=mock** và một DB riêng
 * (`.e2e/mam.db`, xoá trước mỗi lượt) để kết quả tất định và không đụng dữ liệu
 * đang dùng. Bootstrap = migrate + seed (idempotent) trước khi server lên.
 */
const PORT = Number(process.env.E2E_PORT ?? 4310)
const databasePath = fileURLToPath(new URL('./.e2e/mam.db', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // DB + rate limiter là state dùng chung của một server → chạy tuần tự.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 90_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: `http://localhost:${PORT}`,
    // Dùng Chrome có sẵn trên máy thay vì tải browser của Playwright.
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],

  webServer: {
    command: [
      `rm -f "${databasePath}" && rm -rf "${databasePath}-wal" "${databasePath}-shm"`,
      'pnpm --filter @mam/db db:bootstrap',
      `pnpm dev --port ${PORT} --strictPort`,
    ].join(' && '),
    url: `http://localhost:${PORT}`,
    // Không bao giờ dùng lại server lạ trên cổng này — một app khác đang chạy sẽ
    // khiến test kiểm nhầm trang và báo lỗi a11y không có thật.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AI_PROVIDER: 'mock',
      DATABASE_PATH: databasePath,
    },
  },
})
