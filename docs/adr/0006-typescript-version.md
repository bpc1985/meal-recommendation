# ADR-006: Dùng TypeScript 6.0 thay vì 7.0

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

`typescript@7.0.2` là bản mới nhất trên npm tại thời điểm khởi tạo (2026-10-29) và là lựa chọn
trong spec ban đầu. Tuy nhiên `typescript-eslint@8.72.1` — công cụ lint duy nhất hỗ trợ
type-aware linting cho TS — từ chối chạy với TS 7:

```
typescript-eslint does not support TS 7.0.
```

`pnpm lint` fail toàn bộ workspace. Không có workaround sạch: tắt type-aware lint sẽ mất
một lớp kiểm tra quan trọng, còn tắt hẳn ESLint thì không chấp nhận được.

## Quyết định

Dùng `typescript@6.0.3` cho toàn workspace.

## Hệ quả

- `pnpm lint` chạy được với `typescript-eslint` recommended rules.
- Mất các tính năng chỉ có ở TS 7 (compiler native viết bằng Go, nhanh hơn đáng kể).
  Với quy mô dự án này, tốc độ typecheck không phải nút cổ chai.
- Khi `typescript-eslint` hỗ trợ TS 7, nâng cấp là thay đổi một dòng trong `package.json`.
- Đã cập nhật `docs/spec.md` §2 cho khớp thực tế.
