# ADR-004: Locale và theme qua cookie, không prefix URL

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Cần chọn ngôn ngữ và light/dark, giữ nguyên qua reload và qua điều hướng. Có hai hướng quen thuộc:
`/vi/...`, `/en/...` (route prefix) hoặc lưu lựa chọn ở cookie rồi render theo cookie. App dùng
TanStack Start với SSR; theme phải đúng ngay từ HTML đầu tiên để tránh nháy trắng (FOUC), và
locale phải có trước khi server render chuỗi.

Ràng buộc thêm: mọi trang đều dùng được khi chưa đăng nhập, nên không thể chỉ lưu trong profile.

## Quyết định

- Locale: cookie `mam_locale` (`vi` | `en`), đọc ở server trong `__root.tsx`, truyền vào
  `<html lang>`. Đổi ngôn ngữ gọi server fn ghi cookie rồi invalidate router.
- Theme: cookie `mam_theme`; server đọc và gắn class `dark` lên `<html>` ngay trong HTML SSR.
  Không dùng script inline chống FOUC, không dùng `next-themes`.
- Không prefix URL, không `hreflang`, không route riêng cho từng locale.
- Khi đăng nhập, lựa chọn hiện tại được ghi vào profile; lần đăng nhập sau cookie vẫn là nguồn
  quyết định để không đổi giao diện giữa chừng.

## Hệ quả

- Route đơn giản, mọi `<Link>` không phải mang locale; SSR biết locale/theme ngay từ request.
- Link chia sẻ không giữ ngôn ngữ: người nhận link tiếng Việt có thể mở bằng tiếng Anh nếu cookie
  của họ khác. Chấp nhận trong phạm vi hiện tại (không có nhu cầu SEO đa ngôn ngữ).
- Cookie là `SameSite=Lax`, không `HttpOnly` cho hai cookie sở thích (không chứa bí mật) để client
  đọc được khi cần.
- Nếu sau này cần SEO theo ngôn ngữ hoặc chia sẻ link giữ locale, phải thêm route prefix — thay
  đổi lan rộng, nên làm trước khi có nội dung công khai.
- Test: `parseLocale`/format trong `packages/i18n/src/i18n.test.ts`; browser:
  `scripts/checkpoint-a11y.mjs` kiểm `lang`, theme dark và reduced-motion; `apps/web/e2e/a11y.spec.ts`
  quét lại axe ở cả vi/en/dark.
