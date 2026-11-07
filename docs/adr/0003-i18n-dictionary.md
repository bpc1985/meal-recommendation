# ADR-003: i18n bằng dictionary có type, không dùng thư viện

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

App có đúng hai locale (vi/en) và khoảng 225 chuỗi UI. Yêu cầu thật là: không được quên dịch một
key, không hiển thị key thô, và `t()` phải gợi ý key khi viết code. Các thư viện như i18next hay
Paraglide mang thêm runtime, plugin build hoặc định dạng message riêng; Paraglide còn ràng buộc
cách build của TanStack Start.

## Quyết định

`packages/i18n/src/vi.ts` là nguồn sự thật: object literal, key là chuỗi, `TranslationKey` là
`keyof typeof vi`. `en.ts` khai báo `const en: Dictionary`, nên thiếu hay thừa key đều là lỗi
TypeScript. `createTranslator(locale)` trả hàm `t(key, params)` nội suy `{param}` bằng
`String.replace`. Locale đọc từ cookie `mam_locale` qua `parseLocale` (fallback `vi`), không có URL
prefix.

Script `pnpm i18n:check` chạy thêm hai kiểm tra mà type không bắt được: key thiếu/thừa giữa hai
file (khi ai đó sửa tay) và chuỗi tiếng Việt hard-code trong JSX.

## Hệ quả

- Thêm chuỗi mới = sửa `vi.ts` trước; `en.ts` báo lỗi ngay ở `tsc`, không cần chạy app.
- Không có runtime i18n, không có file JSON tải riêng; bundle chỉ chứa hai object.
- Không hỗ trợ plural rules, format ngày/tiền phức tạp của ICU — đã có `formatVnd`, `formatDay`,
  `formatDateTime` tự viết trong cùng package.
- Thêm locale thứ ba hoặc thuê người ngoài dịch sẽ phải chuyển sang Paraglide; đổi lúc đó rẻ hơn
  là mang theo framework i18n ngay từ đầu.
- Test: `packages/i18n/src/i18n.test.ts` (cùng bộ key, không giá trị rỗng, nội suy, fallback
  locale), `scripts/i18n-check.ts`.
