# ADR-016: Áp món thích và món chán vào gợi ý, chat và planner

**Ngày:** 2026-11-04
**Trạng thái:** Accepted

## Bối cảnh

T27 lưu lựa chọn thích hoặc chán từng món trong bảng `dish_preferences` (ADR-015). T28 dùng hai
tập này ở ba chỗ chọn món: `/recommend`, chat và tạo thực đơn mới. Yêu cầu:

- Món chán không bao giờ xuất hiện, kể cả khi Gemini lỗi và app chuyển sang mock.
- Món thích được ưu tiên khi vừa ngân sách, nhưng không nới bộ lọc nào (ngân sách, bữa, chế độ ăn).
- Planner (`buildPlan`) đã được kiểm chứng vét cạn (`pnpm verify:planner`). Không đổi thuật toán
  của nó.
- Khách không có dữ liệu trên server (bất biến #4), nên với khách mọi thứ phải chạy y như trước.

## Phương án

| Phương án                                                          | Món chán khi AI lỗi       | Cửa sổ 20 ứng viên              |
| ------------------------------------------------------------------ | ------------------------- | ------------------------------- |
| **Lọc món chán ở truy vấn ứng viên, trước khi cắt `limit`** (chọn) | Không bao giờ tới advisor | Vẫn đủ món                      |
| Lọc món chán sau khi đã cắt 20 ứng viên                            | Không tới advisor         | Hụt, có thể rỗng nếu chán nhiều |
| Chỉ dặn trong prompt "đừng chọn món chán"                          | Mock không đọc prompt     | Đủ món                          |

Lọc sau khi cắt làm cửa sổ hụt đúng bằng số món chán lọt vào top 20. User chán 10 món đắt gần trần
thì bữa đó chỉ còn món rẻ, hoặc không còn món nào. Dặn trong prompt là ràng buộc mềm: Gemini có thể
không nghe, và khi Gemini lỗi thì mock fallback chọn từ cùng danh sách ứng viên mà không đọc prompt.

## Quyết định

1. **Món chán bị lọc trước advisor.** `findDishCandidates` nhận `excludeDishIds` và
   `preferDishIds`. Không có cả hai thì chạy đúng SQL của trunk, có `LIMIT`. Có một trong hai thì
   chạy cùng SQL nhưng không `LIMIT`, rồi trong JS bỏ món chán, đưa món thích lên đầu (giữ nguyên
   thứ tự tương đối) và mới cắt về `limit`. Advisor chỉ thấy danh sách đã lọc, nên Gemini, mock và
   lượt mock fallback khi Gemini lỗi đều không thể chọn món chán. `applyGuards` loại mọi `dishId`
   không có trong ứng viên, nên Gemini có nêu id món chán thì pick đó cũng bị bỏ.
2. **Món thích lên đầu trước khi cắt 20 ứng viên.** Thứ tự SQL ưu tiên món no và đắt gần trần. Món
   thích rẻ có thể nằm ngoài top 20, nên phải xếp lên trước rồi mới cắt.
3. **Điểm thưởng `LIKED_BONUS = 46`.** Trong `rank.ts`, chênh điểm lớn nhất giữa hai món cùng vừa
   ngân sách là 30 (`UTILIZATION_WEIGHT`, món đúng trần so với món 0đ) + 2 × 6 (độ no 3 so với 1,
   `FILL_WEIGHT`) + 3 (`QUICK_BONUS`) = 45. Hoà điểm thì xếp theo `id`, nên thưởng phải lớn hơn hẳn 45. Hằng số được tính từ các trọng số trên (`+ 1`), không viết số cứng. Chỉ cộng khi món vừa
   ngân sách. Món thích vượt trần không được cộng và không có lý do `liked` (`reasonsFor` dùng cùng
   điều kiện). Test ca xấu nhất trong `ai.test.ts` (món thích 0đ, ít no, làm lâu đấu món không
   thích đúng trần, no nhất, làm nhanh) khoá giá trị: 44 và 45 đều làm test đỏ.
4. **Gemini biết món thích.** Danh sách ứng viên trong prompt pick và chat có thêm cột `liked`, kèm
   luật "ưu tiên món user thích khi vừa ngân sách". Món chán không cần cột vì đã bị lọc.
5. **Planner chỉ loại món chán.** `createPlanForUser` truyền `disliked` vào `excludeDishIds`, không
   truyền món thích. `planner.ts` không đổi một dòng, hash trong `.claude/skills/verify-planner`
   vẫn khớp. Cộng điểm món thích trong planner sẽ đổi thuật toán xếp lịch, cần kiểm chứng lại toàn
   bộ P1–P5.
6. **Một chỗ duy nhất phân nhánh khách.** `loadSessionPreferences(db, sessionToken)` trong
   `dish-preferences.service.ts` đọc session một lần và trả `{ user, preferences }`. Khách nhận
   `NO_PREFERENCES` (hai tập rỗng), nên đi đúng nhánh SQL của trunk. `recommend.functions.ts` và
   `api/chat.ts` đều gọi hàm này thay vì tự đọc session rồi tự dựng tập.
7. **Tên kiểu.** `DishPreferenceSets` (`@mam/ai`) là hai `ReadonlySet` dùng khi dựng gợi ý.
   `DishPreferences` (`@mam/db`) là hai mảng, an toàn cho JSON, trả cho client. Cùng dữ liệu, khác
   dạng, nên khác tên.

## Hệ quả

- Món thích rẻ có thể thắng món sát trần, nên tổng chi trong ngày có thể giảm (ví dụ 110k xuống
  80k). Điều này căng với T21 (ngân sách là mục tiêu chi, ưu tiên món sát trần). Đang chờ operator
  quyết định: giữ thưởng tuyệt đối như hiện tại, hay cho món thích chỉ thắng trong cùng mức giá.
- Khi user có lựa chọn, truy vấn ứng viên đọc mọi món qua bộ lọc thay vì 20 món, nên chi phí tăng
  theo kích thước bảng `dishes`. Với 100 món, recommend chậm hơn trunk 4,8–7,1% (+0,2–0,3 ms).
  Bảng lớn hơn nhiều thì cần đưa lọc về SQL.
- Không có preferences thì kết quả giống trunk từng byte (kiểm 1080 ca). Có preferences thì không
  món chán nào lọt vào gợi ý, chat hay thực đơn (8640 ca, 0 sai lệch).
- Thực đơn đã lưu từ trước không đổi. Chỉ thực đơn tạo mới mới loại món chán.
- Chat Gemini có thể nhắc tên một món chán trong phần chữ, nếu món đó đã có trong các lượt trước
  của hội thoại. Thẻ món vẫn chỉ dựng từ ứng viên đã lọc.
- Test: `packages/ai/src/{ai,gemini,mock-chat}.test.ts`, `packages/db/src/queries.test.ts`,
  `apps/web/src/server/{dish-preferences.service,recommend.service,chat.service,plan.service}.test.ts`.
