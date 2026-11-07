# ADR-009: Nạp `.env` ở gốc repo cho SSR của Vite

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Repo chỉ có một file `.env` ở gốc, dùng chung cho:

- Script DB (`pnpm db:migrate`, `db:seed`) chạy bằng `tsx` trong `packages/db`.
- Server của web: `AI_PROVIDER`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `NODE_ENV` (TS12 dùng
  thêm secret cho session).

Vite đặt `envDir` mặc định bằng `config.root`, tức `apps/web`. Plugin `loadEnvPlugin` của
TanStack Start cũng gọi `loadEnv(config.mode, config.root, '')`. Vì vậy `apps/web/.env` mới được
nạp vào `process.env`, còn `.env` ở gốc thì không — dẫn tới:

- `AI_PROVIDER=openrouter` trong `.env` bị bỏ qua, server lặng lẽ dùng mock.
- `OPENROUTER_API_KEY` không có trong `process.env`, nên fail-fast bắn nhầm "thiếu key".

Đã kiểm chứng bằng `loadEnv('development', process.cwd(), '')` tại `apps/web`: chỉ trả các biến
có sẵn trong shell; gọi với `envDir` là gốc repo mới thấy `AI_PROVIDER`, `OPENROUTER_API_KEY`.

## Quyết định

`apps/web/vite.config.ts` nạp `.env` gốc vào `process.env` ngay khi evaluate config:

```ts
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, repoRoot, ''))
  // ...
})
```

- Dùng `loadEnv` của Vite (không thêm `dotenv`) để giữ nguyên thứ tự ưu tiên của Vite: biến đã
  có trong shell **thắng** giá trị trong file, và vẫn đọc được `.env.local` / `.env.<mode>`.
- `prefixes = ''` để lấy cả biến không có tiền tố `VITE_`. Đây là pattern TanStack Start đã dùng,
  và bản thân Vite vẫn chỉ inline `VITE_*` vào bundle client, nên không lộ secret.
- Production không dựa vào file: `.env` không được đóng gói vào output, biến phải có sẵn trong
  môi trường runtime (Docker/systemd/Paas). Việc nạp file chỉ phục vụ dev và test.

## Hệ quả

- Chạy `pnpm dev` hoặc `pnpm test` ở `apps/web` là đủ; không cần `export` biến hay copy `.env`
  sang `apps/web`.
- Đổi `.env` phải restart dev server (Vite không theo dõi file env).
- Vitest cũng evaluate `vite.config.ts` nên test thấy cùng bộ biến; test nào cần trạng thái khác
  phải tự set/restore `process.env` như hiện tại.
- Nếu sau này tách `.env` theo app, phải sửa lại `repoRoot` trong `vite.config.ts`.
