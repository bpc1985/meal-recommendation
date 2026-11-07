# Măm — gợi ý bữa ăn Việt theo ngân sách

Web app gợi ý bữa sáng/trưa/tối từ 100 món Việt với giá thật trong DB, kèm chat AI, trang duyệt món
`/dishes` và thực đơn 7/30 ngày (xuất markdown, CSV, .xlsx). Hai ngôn ngữ (vi/en), light/dark, dùng được không cần đăng nhập. Giá **luôn đọc từ DB** —
AI chỉ chọn món và giải thích, không bao giờ tự bịa giá.

## Chạy trong 3 bước

```bash
pnpm install
cp .env.example .env          # mặc định AI_PROVIDER=mock, không cần API key
pnpm db:bootstrap && pnpm dev # migrate + seed rồi mở http://localhost:3000
```

Yêu cầu: Node ≥ 22, pnpm 12 (`corepack enable`). Seed sẵn 100 món + 10 vai trò; DB nằm ở
`data/mam.db` (đã ignore trong git).

Muốn chat bằng model thật: đặt `AI_PROVIDER=gemini` và `GEMINI_API_KEY=...` (key Google AI Studio)
trong `.env`, rồi restart dev server. Kiểm key/model bằng `pnpm ai:check` (gọi thật 1 lần, in lỗi upstream). Thiếu key thì server **dừng ngay** kèm thông báo, không âm thầm
chuyển mock.

## Lệnh thường dùng

| Lệnh                  | Việc                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev`            | Dev server (Vite + TanStack Start) ở cổng 3000                                      |
| `pnpm build`          | Build production vào `apps/web/dist`                                                |
| `pnpm start`          | Chạy bản build (`PORT`, `HOST`, `DATABASE_PATH`)                                    |
| `pnpm test`           | Unit test toàn workspace (Vitest)                                                   |
| `pnpm test:e2e`       | Playwright (happy path, a11y, `/history`, `/dishes`), tự dựng server mock cổng 4310 |
| `pnpm typecheck`      | `tsc --noEmit` từng package                                                         |
| `pnpm lint`           | ESLint                                                                              |
| `pnpm format`         | Prettier (ghi) / `pnpm format:check` để kiểm                                        |
| `pnpm i18n:check`     | Key thiếu/thừa và chuỗi tiếng Việt hard-code                                        |
| `pnpm verify:planner` | Kiểm chứng vét cạn planner + nút đổi món (ngân sách, không lặp, giá từ DB)          |
| `pnpm ai:check`       | Gọi Gemini thật 1 lần (pick + chat), in status/lỗi upstream                         |
| `pnpm db:bootstrap`   | Migrate + seed (idempotent)                                                         |
| `pnpm db:reset`       | Xoá DB và tạo lại từ đầu                                                            |
| `pnpm db:studio`      | Drizzle Studio                                                                      |

`pnpm start` cần build trước. `pnpm test:e2e` dùng Chrome cài trên máy (`channel: 'chrome'`) và
một DB riêng trong `apps/web/.e2e/`, xoá trước mỗi lượt chạy.

## Kiến trúc

```
apps/web/            TanStack Start (React 19, SSR) + routes + server functions
  src/routes/        trang, `/api/chat` stream NDJSON
  src/server/        service (auth, recommend, plan, history, chat) — thuần, test bằng Vitest
  e2e/               Playwright: happy path, axe-core, /history, /dishes
packages/ai/         MealAdvisor: Google Gemini hoặc mock, parse/validate output
packages/db/         Drizzle + SQLite (schema, migrations, seed, query)
packages/domain/     kiểu dùng chung + tính ngân sách/chia bữa
packages/i18n/       dictionary có type (vi/en) + format tiền/ngày
packages/ui/         component shadcn/ui
scripts/             checkpoint trình duyệt, i18n check, serve bản build
docs/spec.md         spec + 12 tiêu chí nghiệm thu
docs/adr/            ADR 0001–0017 (quyết định + phương án đã loại)
```

Luồng gợi ý: form → server function `recommendMeals` → lọc ứng viên trong SQL theo bữa, ngân sách,
chế độ ăn, bỏ món user đã chán và đưa món thích lên đầu (ADR-016) → AI chọn 3 món → server **tính
lại giá và tổng** từ DB → trả về. Chat đi qua `/api/chat` (NDJSON), dùng cùng cách lọc món chán và
ưu tiên món thích, và lưu thread cho user đăng nhập; khách chỉ lưu `localStorage`.

### Bảo mật & dữ liệu

- Mật khẩu hash bằng `scrypt`, session lưu SQLite (SHA-256 của token) trong cookie `HttpOnly`
  `SameSite=Lax`. Đặt `NODE_ENV=production` khi chạy sau HTTPS để bật cờ `Secure`.
- Mọi input validate bằng Zod ở server; query luôn scope theo `user_id`.
- Rate limit theo IP cho chat/gợi ý (in-memory, reset khi restart).
- `.env` và `data/*.db` không nằm trong git.

## Docker

```bash
docker build -t mam .
docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" mam
```

Container chạy `apps/web/dist` bằng Node thuần (`scripts/serve-build.mjs`), bootstrap DB lúc khởi
động (migrate + seed, idempotent) nên volume rỗng vẫn lên được. Image mặc định **không** đặt
`NODE_ENV=production` để cookie hoạt động trên `http://localhost`; khi deploy thật sau HTTPS thì
truyền `-e NODE_ENV=production -e PORT=3000`. Cấu hình khác truyền qua `-e`: `AI_PROVIDER`,
`GEMINI_API_KEY`, `GEMINI_MODEL`, `DATABASE_PATH`.

## Kiểm thử

- **Unit/integration:** `pnpm test` — 459 test (domain, ai, db, i18n, server services). DB test chạy
  trên SQLite in-memory đã migrate + seed.
- **E2E:** `pnpm test:e2e` — 26 test: luồng khách → đăng ký → lưu thực đơn → tải markdown, CSV và
  .xlsx; axe-core (WCAG 2.x A/AA + best-practice) ở vi/en/dark; phân trang `/history` (10 lượt/trang);
  duyệt món `/dishes` (tìm, lọc, URL, trạng thái rỗng, header); thích và chán món khi đăng nhập; thẻ ngân sách còn lại của thực đơn
  và `/recommend` điền sẵn ngân sách từ URL; đổi món trong thực đơn (vòng xoay, reload, mobile); header
  không tràn ở 390/640/768/1280.
- **Checkpoint thủ công** (chạy với `AI_PROVIDER=mock`): `scripts/checkpoint-*.mjs` đo luồng thật
  trên trình duyệt (history, chat, a11y 47 bước, LCP/CLS trên bản build).

## Quyết định kiến trúc

Xem `docs/adr/`. Đáng đọc trước: ADR-001 (AI không bịa giá), ADR-005 (session tự quản),
ADR-009 (env gốc repo), ADR-011 (axe-core thay Lighthouse), ADR-012 (font tự host),
ADR-013 (đóng gói Docker).
