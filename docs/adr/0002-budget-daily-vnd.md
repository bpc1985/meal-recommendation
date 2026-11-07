# ADR-002: Chuẩn hoá ngân sách về `dailyBudgetVnd`

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Người dùng nghĩ về ngân sách theo nhiều đơn vị: "15k một bữa", "100k một ngày", "3 triệu một
tháng". Form gợi ý, chat, planner 7 ngày và planner 30 ngày đều cần so sánh với cùng một con số.
Nếu mỗi màn hình tự quy đổi, chỉ cần một chỗ quên chia số ngày là thực đơn tháng vượt ngân sách
mà không ai thấy.

## Quyết định

`packages/domain/src/budget.ts` là nơi duy nhất quy đổi:

- `meal` → `amount × 3`
- `day` → `amount`
- `month` → `floor(amount / daysInMonth)` (mặc định 30, planner tháng truyền số ngày thật)

Mọi thứ phía sau dùng `dailyBudgetVnd`. Chia bữa theo tỉ lệ cố định **25% sáng / 40% trưa /
35% tối**, làm tròn tới 1.000đ qua `floorToThousand`. Planner tuần/tháng chỉ nhân ngân sách ngày
với số ngày; không có phép chia ngược nào ở tầng UI.

## Hệ quả

- Một đơn vị duy nhất để so sánh, hiển thị và kiểm thử; đổi tỉ lệ bữa chỉ sửa một bảng hằng số.
- Làm tròn xuống 1.000đ khiến tổng các bữa có thể thấp hơn ngân sách ngày vài nghìn — có lợi cho
  người dùng, và test đã chốt hành vi này.
- Ngân sách tháng phụ thuộc số ngày truyền vào; nơi gọi phải truyền đúng (`days` của thực đơn),
  nếu không sẽ lệch vài nghìn mỗi ngày.
- Test: `packages/domain/src/budget.test.ts` (3 đơn vị, tháng 30/31 ngày, làm tròn, tỉ lệ bữa).
