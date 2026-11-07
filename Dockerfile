# Build: cài toàn bộ workspace (cần devDeps để build + chạy tsx bootstrap), compile,
# rồi copy nguyên workspace sang image runtime. better-sqlite3 là native module nên
# phải build trong đúng base image (glibc) thay vì copy từ máy dev.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
# better-sqlite3 không có prebuild cho mọi cặp Node/A1 → cần toolchain để compile.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/i18n/package.json packages/i18n/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
WORKDIR /app

ENV PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/mam.db

# Toàn bộ workspace: dist/ của web, migrations + script bootstrap của @mam/db,
# và node_modules đã compile native module ở stage build.
COPY --from=build /app /app

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Bootstrap (migrate + seed, idempotent) mỗi lần start: volume có thể rỗng ở lần
# chạy đầu, và migration mới phải được áp dụng khi nâng version image.
CMD ["sh", "-c", "./node_modules/.bin/tsx packages/db/scripts/bootstrap.ts && exec node scripts/serve-build.mjs"]
