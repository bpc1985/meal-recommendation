/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Repo chỉ có một file .env ở gốc, nhưng Vite mặc định chỉ đọc env trong apps/web.
// Nạp .env gốc vào process.env để code server (AI key, session secret, DATABASE_PATH)
// nhìn thấy được. Biến đã có trong shell vẫn thắng giá trị trong file.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  const userNodeEnv = process.env.VITE_USER_NODE_ENV
  const fromFile = loadEnv(mode, repoRoot, '')
  // `NODE_ENV` trong .env bị bỏ qua để Vite tự đặt theo lệnh dev/build. `loadEnv` thấy nó
  // thì ghi `VITE_USER_NODE_ENV` (và trả lại biến đó trong kết quả), và Vite dùng biến đó
  // để build ra bản React dev: chunk lớn gấp rưỡi, `pnpm start` production lỗi 500.
  if (userNodeEnv === undefined) delete process.env.VITE_USER_NODE_ENV

  // Chỉ điền biến còn thiếu: biến đã có trong shell (CI, docker run, test) phải thắng
  // giá trị trong file, đúng như ADR-009.
  for (const [key, value] of Object.entries(fromFile)) {
    if (key === 'NODE_ENV' || key === 'VITE_USER_NODE_ENV') continue
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    server: {
      port: 3000,
    },
    // Chỉ unit test nằm trong src; `e2e/*.spec.ts` do Playwright chạy, không phải Vitest.
    test: {
      include: ['src/**/*.test.ts'],
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
    ssr: {
      external: ['better-sqlite3'],
    },
  }
})
