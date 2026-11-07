# ADR-013: Đóng gói Docker bằng multi-stage, giữ nguyên workspace

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Cần một image chạy được app đã build, với `better-sqlite3` (native module) và DB nằm trên volume
`data/` để dữ liệu không mất khi xoá container. Workspace là pnpm monorepo: web build ra
`apps/web/dist`, nhưng lúc khởi động còn cần migration/seed của `packages/db` và script
`scripts/serve-build.mjs`.

Các hướng đã cân nhắc:

- **Chỉ copy `apps/web/dist` + production dependencies:** gọn nhất nhưng không có migration, không
  có `tsx`, và `better-sqlite3` phải được build đúng ABI — dễ vỡ khi base image đổi.
- **Chạy `vite preview`:** không phải server production, không kiểm soát `PORT`/`HOST`/shutdown.
- **Full workspace, nhiều stage (đã chọn).**

## Quyết định

`Dockerfile` bốn stage trên `node:24-bookworm-slim` (glibc, khớp prebuild/compile của
`better-sqlite3`):

1. `base`: bật corepack, đặt `PNPM_HOME`, workdir `/app`.
2. `deps`: cài `python3 make g++` để compile `better-sqlite3`; copy `package.json`,
   `pnpm-lock.yaml`, `pnpm-workspace.yaml` và package.json của từng workspace rồi
   `pnpm install --frozen-lockfile`. **Không** dùng `--prod`: build và bootstrap cần devDeps
   (`tsx`, TypeScript, Vite).
3. `build`: copy toàn bộ repo (đã lọc bởi `.dockerignore`) và `pnpm build`.
4. `runtime`: copy `/app` từ stage build, tạo `/app/data`, `chown node:node`, chạy bằng user
   `node`, `EXPOSE 3000`, `VOLUME ["/app/data"]`, healthcheck gọi `/`, và
   `CMD ["sh","-c","./node_modules/.bin/tsx packages/db/scripts/bootstrap.ts && exec node scripts/serve-build.mjs"]`.

Bootstrap (migrate + seed) chạy **mỗi lần start** vì cả hai đều idempotent: volume rỗng vẫn lên
được, image mới áp migration mới mà không xoá dữ liệu người dùng.

Image **không** đặt `NODE_ENV=production`: cookie session chỉ bật `Secure` khi biến này bằng
`production`, và bản demo chạy `http://localhost`. Khi deploy sau HTTPS thì truyền
`-e NODE_ENV=production`; các biến khác (`AI_PROVIDER`, `OPENROUTER_API_KEY`, `DATABASE_PATH`…)
cũng truyền qua `-e`, không bake vào image. `.dockerignore` loại `.env`, `data/`, `node_modules`,
`dist/`, test artifacts và screenshot.

## Hệ quả

- Một image chứa cả dev tooling nên lớn hơn cách chỉ copy `dist` — đổi lại, bootstrap và migration
  chạy được mà không cần bước ngoài container.
- Build lần đầu chậm vì compile `better-sqlite3`; các lần sau dùng cache layer của `deps` khi
  lockfile không đổi.
- Chạy bằng user `node`, DB trên volume; quyền ghi `/app/data` do image tạo sẵn. Nếu mount volume
  từ host, UID phải khớp hoặc phải `chown` — đã ghi trong README.
- Không có `NODE_ENV=production` mặc định là lựa chọn có chủ ý cho localhost HTTP; quên truyền khi
  lên production sẽ khiến cookie thiếu cờ `Secure`.
- Kiểm chứng: `docker build -t mam .` rồi
  `docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" mam`; xác nhận `/` trả 200, đăng ký/đăng
  nhập được và `data/mam.db` xuất hiện ở host.
