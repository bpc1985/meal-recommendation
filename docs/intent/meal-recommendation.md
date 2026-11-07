# Intent: Meal Recommendation Webapp (vi/en)

**Confirmed:** 2026-10-29

```
Outcome:      Webapp gợi ý bữa sáng/trưa/tối theo vai trò + ngân sách, 2 đường vào
              (chat AI + form UI), xuất được thực đơn tuần/tháng trong budget.
User:         Người Việt — nhân viên văn phòng, sinh viên, freelancer, + role tự nhập.
Why now:      Công cụ dùng hằng ngày, đồng thời là dự án học/portfolio với stack hiện đại.
Success:      Vai trò + budget → gợi ý <5s; đăng ký → lịch sử + thực đơn 7/30 ngày trong
              budget; vi/en + dark mode; demo được không cần API key.
Constraint:   Budget theo bữa/ngày/tháng (user chọn); VND thực tế; OpenRouter qua adapter
              OpenAI-compatible + mock mode; email/password session SQLite; chạy 1 lệnh.
Out of scope: Payment, tư vấn dinh dưỡng y tế, đặt món, mobile app, social, email, teams.
```

## Assumptions accepted

1. Giá món là dữ liệu seed ước lượng, user sửa được; AI bị ràng buộc chọn từ danh sách
   ứng viên lấy từ DB để không bịa giá.
2. Role là preset + tuỳ chỉnh.
3. Anonymous dùng đầy đủ tính năng gợi ý; history chỉ ở localStorage. Registered có
   history server-side + thực đơn tuần/tháng được lưu.
4. ~100 món seed với tag (meal type, độ no, thời gian nấu, chay/mặn, vùng miền, giá).
5. Chạy local bằng `pnpm dev`, có mock AI mode nên không cần key để demo.

## Decisions made later (xem docs/spec.md)

- LLM: ban đầu OpenRouter (OpenAI-compatible) + mock provider; 2026-10-31 thay bằng Google Gemini
  trực tiếp vì model free chỉ 50 request/ngày (ADR-014).
- Budget: hỗ trợ cả 3 đơn vị bữa / ngày / tháng.
- Auth: email + password, session cookie HttpOnly lưu trong SQLite.
