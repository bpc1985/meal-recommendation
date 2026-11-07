# ADR-005: Session tự quản, không dùng thư viện auth

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Cần đăng ký/đăng nhập email + mật khẩu, giữ phiên qua reload, và tách dữ liệu giữa các user. Ứng
dụng chạy một node với SQLite, không có Redis, không có email service. Các lựa chọn: NextAuth/Auth.js
(không hợp TanStack Start, kéo theo adapter), Lucia (đã ngừng phát triển), hoặc tự viết.

## Quyết định

Tự quản session trong SQLite:

- Bảng `sessions` lưu SHA-256 của token; token 32 byte random chỉ nằm trong cookie `mam_session`.
- Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, hạn 30 ngày, `Secure` chỉ khi
  `NODE_ENV=production` (dev chạy HTTP).
- Login xoá session cũ của user rồi tạo token mới (rotate), nên mỗi tài khoản có một phiên sống.
- Mật khẩu hash bằng `scrypt` của `node:crypto`, không thêm native dependency ngoài
  `better-sqlite3`.
- Rate limit in-memory theo IP/email; mọi query dữ liệu luôn scope `user_id`.

Chi tiết tham số hash, dummy hash chống dò user, khoá rate limit và cách đọc session trong server
fn/route handler: [ADR-010](0010-auth-session.md).

## Hệ quả

- Không phụ thuộc thư viện auth, không có adapter lạ; toàn bộ luồng nằm trong repo và test được
  bằng DB in-memory.
- Tự chịu trách nhiệm bảo mật: CSRF (cookie `SameSite=Lax`), rotation, timing attack, rate limit.
  Đã xử lý trong ADR-010 nhưng không có cộng đồng vá hộ.
- Một session/user làm đăng nhập thiết bị thứ hai sẽ đăng xuất thiết bị đầu — chấp nhận cho demo.
- Chưa có reset mật khẩu, xác thực email, 2FA; thêm sau sẽ cần email service và bảng token riêng.
- Test: `password.test.ts`, `session.test.ts`, `auth.service.test.ts`, `auth-input.test.ts`,
  `auth-redirect.test.ts`; browser: `scripts/checkpoint-e.mjs`.
