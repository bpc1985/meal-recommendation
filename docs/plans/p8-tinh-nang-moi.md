# Kế hoạch P8 cho năm tính năng mới

> **Trạng thái (2026-11-07): đã hoàn tất.** Cả sáu đơn vị T25–T30 được operator duyệt (T30 ngày
> 2026-11-04; kéo theo "Sửa bất biến #3 cho chat"). Ban chứng của từng đơn vị nằm trong
> `tasks/todo.md` + `docs/plans/p8-trail.md`; dấu vết tick trực tiếp nằm trong các mục T2x bên
> dưới — những ô checklist ở phần "Program checklist" là kịch bản vận hành, không phải trạng thái.

Năm tính năng cho người dùng Măm, chia thành sáu đơn vị công việc theo thứ tự T25 đến T30.
T25 là trang duyệt món `/dishes`. T26 là xuất CSV và .xlsx. T27 lưu món thích và món chán.
T28 áp món thích và món chán vào gợi ý, chat và planner. T29 tính ngân sách còn lại của tháng.
T30 đổi một món trong thực đơn. Luật chung là mọi tính năng giữ sáu bất biến domain trong
`CLAUDE.md`, đặc biệt giá luôn lấy từ DB và thực đơn không vượt ngân sách, không lặp món trong 2 ngày.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. Repo này chưa có git, nên "PR" ở đây là một đơn vị công việc trong working tree, kết thúc bằng các cổng của `CLAUDE.md` và một mục trong `tasks/todo.md`. Không ai merge. Operator (user) duyệt từng đơn vị theo thứ tự và là người duy nhất quyết định chuyển sang đơn vị kế tiếp. T25, T26, T27, T29 và T30 dừng ở trạng thái sẵn sàng duyệt cho operator.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start. Re-read them at every tick. Repo chưa có git, nên thay `git show origin/main:<path>` bằng đọc bản local trong thư mục plugin pstack.
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:pstack/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:pstack/skills/principle-prove-it-works/SKILL.md`
  - [ ] Đọc `CLAUDE.md` và `.claude/skills/verify-planner/SKILL.md` của repo.
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] T25 chạy trước. T26 chạy ngay sau khi code của T25 xong, vì cả hai sửa `packages/i18n/src/{vi,en}.ts` (sửa ngày 2026-10-31, bản đầu ghi nhầm là song song).
  - [ ] T27 sau T25, vì nút thích và chán đặt trên thẻ món của `/dishes`.
  - [ ] T28 sau T27.
  - [ ] T29 sau T26, vì cả hai sửa `apps/web/src/routes/plans/$planId.tsx`.
  - [ ] T30 sau T28 và T29, vì T30 dùng danh sách món chán và sửa cùng trang chi tiết thực đơn.
- [ ] Hold the file boundaries.
  - [ ] T25 chỉ chạm `apps/web/src/routes/dishes*`, `apps/web/src/components/dishes/**`, `apps/web/src/server/catalog.functions.ts`, `apps/web/src/lib/dish-filter*`, `packages/db/src/queries.ts`, `apps/web/src/components/site-header.tsx`, `packages/i18n/src/{vi,en}.ts`.
  - [ ] T26 chỉ chạm `apps/web/src/lib/plan-export*`, `apps/web/src/components/plans/export-menu.tsx`, `apps/web/package.json`, `pnpm-lock.yaml`, i18n.
  - [ ] Hai đơn vị cùng sửa i18n thì chạy nối tiếp, không song song.
- [ ] Hold the review gate. T25, T26, T27, T29 và T30 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`. Repo chưa có git, nên ghi lại là không có forge và bỏ qua mọi thao tác PR.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Không có git thì thay bằng mục `### T2x` trong `tasks/todo.md` kèm danh sách file.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on. Ở repo này là chuỗi cổng `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm i18n:check`, cộng `pnpm test:e2e`.
- [ ] Run `/deslop` before each commit and `/no-comments` before review. Hai skill này không có trong Claude Code, nên owner tự rà comment theo mục Comments của poteto-mode.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`. Repo không có Bugbot, ghi là không áp dụng.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, on a CI failure that comes from a change on trunk, or when a known concurrent change to the same files lands. Không có git, nên "trunk" là working tree sau đơn vị trước đã được duyệt.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head, and a wording-only change gets none. Run each full swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Judge every finding by the execution playbook's blocking rule. The verdict is clean when none blocks. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] Theo autopilot-stack, không owner nào tự merge. Đơn vị sạch dừng ở sẵn sàng duyệt, operator duyệt rồi mới mở đơn vị kế tiếp. Không có git nên patch-id được thay bằng SHA-256 của các file đã sửa, ghi trong `tasks/todo.md`.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. Drive through `control-ui` or `control-cli` from `cursor-team-kit`. Ở đây không có cloud VM và không có `control-ui`, nên mỗi lane chạy local bằng Playwright giống `scripts/checkpoint-*.mjs`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`. Không có git, nên lane chạy trên working tree hiện tại và ghi SHA-256 các file đã sửa.
- [ ] Dựng server mock riêng cho lane `AI_PROVIDER=mock DATABASE_PATH=<scratch>/lane-<n>.db pnpm --filter @mam/web dev --port <4400+n> --strictPort`, chạy `pnpm db:bootstrap` với cùng `DATABASE_PATH` trước, rồi chờ `curl -sf http://localhost:<port>/` trả 200.
- [ ] Chỉ đưa input qua Playwright (click, gõ phím, điều hướng). Chẩn đoán chỉ đọc bằng `sqlite3 <db> "select ..."` và console log của trang.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Thêm trang duyệt món /dishes (T25)

**Depends on.** None.

**Files.**

- [ ] Create `apps/web/src/routes/dishes.tsx`.
- [ ] Create `apps/web/src/components/dishes/dish-browser.tsx`.
- [ ] Create `apps/web/src/lib/dish-filter.ts` và `apps/web/src/lib/dish-filter.test.ts`.
- [ ] Edit `apps/web/src/server/catalog.functions.ts`.
- [ ] Edit `packages/db/src/queries.ts` và `packages/db/src/queries.test.ts`.
- [ ] Edit `apps/web/src/components/site-header.tsx`.
- [ ] Edit `packages/i18n/src/vi.ts` và `packages/i18n/src/en.ts`.

**Build.**

- [ ] Thêm `listAllDishes(db)` trong `packages/db/src/queries.ts`, trả `DishCard[]` gồm id, slug, tên vi/en, `priceVnd`, `mealTypes`, `tags`, `region`, `prepMinutes`, `fillLevel`, mô tả vi/en, sắp theo `slug`.
- [ ] Thêm server function `listDishes` trong `catalog.functions.ts`, không cần đăng nhập.
- [ ] Viết hàm thuần `filterDishes(dishes, filter)` trong `dish-filter.ts`. `DishFilter` có `q`, `meal`, `tags`, `minPrice`, `maxPrice`. `q` so khớp tên vi/en sau khi bỏ dấu và hạ chữ thường. Nhiều tag là AND.
- [ ] Route `/dishes` đọc filter từ URL qua `validateSearch` (`?q=&meal=&tag=&min=&max=`), loader gọi `listDishes` một lần, lọc phía client vì 100 món chỉ khoảng 33,5KB JSON.
- [ ] Thêm link `nav.dishes` vào mảng nav trong `site-header.tsx`, cả desktop lẫn mobile sheet.

**You see.**

- [ ] `/dishes` hiện 100 thẻ món. Gõ `pho` thì còn các món Phở. Chọn bữa Sáng và tag `vegetarian` thì URL thành `/dishes?meal=breakfast&tag=vegetarian` và số món đếm được khớp với SQL tương ứng.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `dish-filter.test.ts` có case bỏ dấu (`com tam` khớp `Cơm tấm`), lọc bữa, nhiều tag là AND, khoảng giá có biên, filter rỗng trả đủ. Run `pnpm --filter @mam/web test`.
- [x] `queries.test.ts` có case `listAllDishes` trả đủ 100 món seed, sắp theo slug. Run `pnpm --filter @mam/db test`.
- [x] Chạy đủ chuỗi cổng của `CLAUDE.md` và `pnpm test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `inherit-parent` at the PR head, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Trunk chưa có `/dishes`, nên ghi nhận trunk trả 404 và gate hành vi mới. Mở `/dishes` ở head. Save `dishes-all.png`. Pass when có đúng 100 thẻ `[data-testid^="dish-card-"]`.
- [x] Lane 2. Gõ `pho` vào ô tìm. Save `dishes-search.png`. Pass when mọi thẻ còn lại có tên chứa "Phở" và số thẻ bằng `select count(*) from dishes where name_vi like '%Phở%'`.
- [x] Lane 3. Gõ `com tam` không dấu. Save `dishes-no-accent.png`. Pass when thẻ "Cơm tấm" xuất hiện.
- [x] Lane 4. Chọn bữa Tối. Save `dishes-dinner.png`. Pass when số thẻ bằng số món có `"dinner"` trong `meal_types`.
- [x] Lane 5. Chọn tag `vegetarian` và `quick`. Save `dishes-tags.png`. Pass when mọi thẻ có cả hai tag.
- [x] Lane 6. Đặt khoảng giá 20.000 đến 40.000. Save `dishes-price.png`. Pass when mọi giá hiện trong khoảng và số thẻ khớp SQL.
- [x] Lane 7. Mở `/dishes?meal=lunch&tag=soup` rồi reload, rồi bấm back sau khi đổi filter. Save `dishes-url.png`. Pass when filter khôi phục đúng từ URL sau reload và back.
- [x] Lane 8. Lọc ra không món nào (`?q=zzzz`). Save `dishes-empty.png`. Pass when có trạng thái rỗng kèm nút xoá filter, và bấm nút thì về 100 món.
- [x] Lane 9. Viewport 390px, chuyển locale en và dark mode. Save `dishes-mobile-dark.png`. Pass when không tràn ngang, tên món hiện tiếng Anh, và link "Dishes" có trong mobile sheet.
- [x] Lane 10. Chạy axe trên `/dishes` ở vi sáng và en tối. Save `dishes-axe.png`. Pass when axe báo 0 vi phạm.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Thời gian từ điều hướng tới khi thẻ món đầu tiên hiện trên `/dishes`, và độ trễ từ lúc gõ phím tới lúc danh sách cập nhật. Trunk không có trang này, nên so trang `/recommend` của trunk làm mốc tải trang.
- [x] Probe. Playwright đo `performance.now()` quanh `goto` và quanh `fill`, 10 lần xen kẽ giữa `/recommend` ở trunk và `/dishes` ở head, trên build production (`pnpm build && pnpm start`).
- [x] Baseline. Record the trunk thời gian tải `/recommend` trước.
- [x] Rule. Ngân sách tuyệt đối cho phần mới là `/dishes` hiện thẻ đầu tiên trong 1,5 lần mốc trunk, và cập nhật filter dưới 50ms ở trung vị. Vượt một trong hai số này là fail.

**Review gate.** The operator reviews before merge.

- [x] Copy lane 1, 5 và 9 screenshots into `docs/screenshots/p8/T25-review-*.png`.
- [x] Record a 30 to 60 second video of the change bằng `recordVideo` của Playwright. Save it as `docs/screenshots/p8/T25-review.webm`.
- [x] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [x] Root's clean verdict at the exact head SHA, tức SHA-256 các file đã sửa.
- [x] Bugbot triage done, ghi không áp dụng.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged, tức hash file không đổi sau verdict.
- [x] Operator duyệt trong chat. Thêm T25 vào `tasks/plan.md` và `tasks/todo.md`, sửa `docs/spec.md` (cây thư mục và mục catalog).

## Xuất thực đơn ra CSV và .xlsx (T26)

**Depends on.** None.

**Files.**

- [ ] Edit `apps/web/src/lib/plan-export.ts` và `apps/web/src/lib/plan-export.test.ts`.
- [ ] Create `apps/web/src/lib/plan-xlsx.ts`.
- [ ] Edit `apps/web/src/components/plans/export-menu.tsx`.
- [ ] Edit `apps/web/package.json` và `pnpm-lock.yaml`.
- [ ] Edit `packages/i18n/src/vi.ts` và `packages/i18n/src/en.ts`.

**Build.**

- [ ] Tách dữ liệu bảng ra hàm thuần `planRows(input)` trong `plan-export.ts`, trả các hàng ngày, thứ, bữa, món, giá. Markdown, CSV và .xlsx cùng dựng từ `planRows`.
- [ ] Thêm `buildPlanCsv(input)`, dấu phẩy, bọc ngoặc kép theo RFC 4180, có BOM khi tải về, giá là số nguyên không có dấu chấm ngăn cách, dòng cuối là tổng.
- [ ] `planFileName(title, startDate, ext)` nhận đuôi `md`, `csv` hoặc `xlsx`.
- [ ] Thêm dependency `write-excel-file@4.1.1` (MIT, 1 dependency con `fflate`). `plan-xlsx.ts` gọi `import('write-excel-file/browser')` khi user bấm, nên không vào bundle lúc tải trang. Đặt độ rộng cột để tên món không đè cột giá, định dạng giá `#,##0`, dòng tổng in đậm.
- [ ] Thêm hai mục `plan-export-csv` và `plan-export-xlsx` vào `export-menu.tsx`.

**You see.**

- [ ] Menu xuất có thêm "Tải CSV" và "Tải Excel (.xlsx)". File .xlsx mở bằng Excel hoặc Numbers đúng tiếng Việt, cột giá là số, có dòng tổng.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `plan-export.test.ts` có case CSV bọc ngoặc kép cho tên món có dấu phẩy, tổng bằng tổng các dòng, tên file theo đuôi. Run `pnpm --filter @mam/web test`.
- [x] Mở rộng `apps/web/e2e/happy-path.spec.ts` để tải CSV và .xlsx, giải nén .xlsx và kiểm `xl/sharedStrings.xml` chứa tên món tiếng Việt. Run `pnpm test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `inherit-parent` at the PR head, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Tải markdown ở trunk và ở head cho cùng một thực đơn. Save `export-md.png`. Pass when hai file markdown giống nhau từng byte.
- [x] Lane 2. Tải CSV thực đơn 7 ngày. Save `export-csv.png`. Pass when file có BOM, 21 dòng món cộng tiêu đề và dòng tổng, tổng khớp `select sum(price_vnd) from plan_items where plan_id = ?`.
- [x] Lane 3. Tải .xlsx thực đơn 7 ngày. Save `export-xlsx.png`. Pass when giải nén được, sheet có 21 dòng món, cột giá là số.
- [x] Lane 4. Render .xlsx bằng `qlmanage -t`. Save `export-xlsx-preview.png`. Pass when tên món không đè lên cột giá và tiếng Việt hiện đúng.
- [x] Lane 5. Thực đơn 30 ngày. Save `export-30.png`. Pass when CSV và .xlsx đều có 90 dòng món.
- [x] Lane 6. Thực đơn có tiêu đề chứa ký tự đặc biệt `Tuần 1/11 "ăn chay"`. Save `export-filename.png`. Pass when tên file hợp lệ trên macOS và Windows.
- [x] Lane 7. Locale en. Save `export-en.png`. Pass when tiêu đề cột và tên món trong CSV là tiếng Anh.
- [x] Lane 8. Theo dõi network khi tải trang chi tiết thực đơn. Save `export-network.png`. Pass when chunk `write-excel-file` chỉ được tải sau khi bấm "Tải Excel".
- [x] Lane 9. Chỉ dùng bàn phím mở menu xuất và chọn từng mục. Save `export-keyboard.png`. Pass when cả ba lần tải đều chạy và focus quay về nút menu.
- [ ] Lane 10. Viewport 390px, dark mode. Save `export-mobile.png`. Pass when menu hiện đủ mục và không tràn ngang.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Kích thước JS tải lúc mở trang chi tiết thực đơn, và thời gian từ bấm "Tải Excel" tới khi có file với thực đơn 30 ngày.
- [x] Probe. Đo tổng byte JS qua `page.on('response')` trên build production ở trunk và head, xen kẽ 5 lần mỗi bên. Đo thời gian tạo .xlsx 10 lần ở head.
- [x] Baseline. Record the trunk tổng byte JS của trang chi tiết thực đơn trước.
- [x] Rule. Head tăng quá 2KB gzip lúc tải trang là fail, vì thư viện phải được tải lười. Tạo .xlsx 30 ngày quá 1 giây ở trung vị là fail. Chunk lười đã đo khi prototype là 20,9KB gzip, vượt 40KB là fail.

**Review gate.** The operator reviews before merge.

- [x] Copy lane 2, 3 và 4 screenshots into `docs/screenshots/p8/T26-review-*.png`.
- [x] Record a 30 to 60 second video of the change bằng `recordVideo` của Playwright. Save it as `docs/screenshots/p8/T26-review.webm`.
- [x] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [x] Root's clean verdict at the exact head SHA, tức SHA-256 các file đã sửa.
- [x] Bugbot triage done, ghi không áp dụng.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged, tức hash file không đổi sau verdict.
- [x] Operator duyệt trong chat. Cập nhật `docs/spec.md` (user story 5), README và bảng lệnh nếu có.

## Lưu món thích và món chán (T27)

**Depends on.** T25.

**Files.**

- [ ] Edit `packages/db/src/schema.ts`.
- [ ] Create migration mới trong `packages/db/migrations/` bằng `pnpm --filter @mam/db db:generate`.
- [ ] Create `packages/db/src/preferences.ts` và `packages/db/src/preferences.test.ts`.
- [ ] Create `apps/web/src/server/dish-preferences.functions.ts`.
- [ ] Create `apps/web/src/components/dishes/dish-preference-toggle.tsx`.
- [ ] Edit `apps/web/src/components/dishes/dish-browser.tsx`.
- [ ] Edit `packages/i18n/src/vi.ts` và `packages/i18n/src/en.ts`.

**Build.**

- [ ] Thêm bảng `dish_preferences(user_id, dish_id, kind, created_at)` với khoá chính `(user_id, dish_id)` và `kind` là `'like' | 'dislike'`. Một món chỉ có một trạng thái, nên không thể vừa thích vừa chán. Xoá user hoặc món thì cascade.
- [ ] `setDishPreference(db, userId, dishId, kind | null)` là upsert, `null` thì xoá, gọi lặp lại vẫn ra cùng trạng thái. `listDishPreferences(db, userId)` trả hai tập id.
- [ ] Server function `setPreference` (POST, Zod, bắt buộc đăng nhập, scope `user_id`) và `listMyPreferences`.
- [ ] Mỗi thẻ món trên `/dishes` có hai nút thích và chán, có `aria-pressed`. Khách bấm thì được mời đăng nhập, không lưu gì ở server và không lưu localStorage.
- [ ] Filter `/dishes` thêm "Chỉ món thích" cho user đăng nhập.

**You see.**

- [ ] User đăng nhập bấm thích "Phở bò", reload vẫn thấy nút đang bật. `select kind from dish_preferences` trả `like`. Bấm chán thì hàng đó đổi sang `dislike`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `preferences.test.ts` có case upsert lặp lại vẫn một hàng, đổi like sang dislike, `null` xoá, không đọc được dữ liệu user khác, xoá user thì cascade. Run `pnpm --filter @mam/db test`.
- [x] Test server function với khách trả `unauthorized` và với `dishId` không tồn tại trả lỗi. Run `pnpm --filter @mam/web test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `inherit-parent` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk chưa có nút thích. Ở cả trunk và head, chạy `node scripts/checkpoint-g.mjs`. Save `prefs-regression.png`. Pass when checkpoint G đạt 22/22 ở cả hai bên.
- [x] Lane 2. User đăng nhập thích một món rồi reload. Save `prefs-like.png`. Pass when nút vẫn bật và DB có đúng một hàng `like`.
- [x] Lane 3. Đổi từ thích sang chán. Save `prefs-switch.png`. Pass when DB chỉ còn một hàng với `kind = 'dislike'`.
- [x] Lane 4. Bấm lại để bỏ chọn. Save `prefs-clear.png`. Pass when hàng bị xoá.
- [x] Lane 5. Khách bấm thích. Save `prefs-guest.png`. Pass when hiện lời mời đăng nhập, bảng không có hàng mới và localStorage không có key mới.
- [x] Lane 6. Hai user khác nhau thích các món khác nhau. Save `prefs-isolation.png`. Pass when mỗi user chỉ thấy lựa chọn của mình.
- [x] Lane 7. Bấm thích 5 lần thật nhanh. Save `prefs-rapid.png`. Pass when trạng thái cuối trên UI khớp DB và không có toast lỗi.
- [x] Lane 8. Bật filter "Chỉ món thích". Save `prefs-filter.png`. Pass when số thẻ bằng số hàng `like` của user.
- [x] Lane 9. Chỉ dùng bàn phím. Save `prefs-keyboard.png`. Pass when Tab tới được nút, Space bật tắt được và `aria-pressed` đổi theo.
- [x] Lane 10. Chạy axe trên `/dishes` khi đã đăng nhập, sáng và tối. Save `prefs-axe.png`. Pass when axe báo 0 vi phạm.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Thời gian tải `/dishes` khi đã đăng nhập, và độ trễ của server function `setPreference`.
- [ ] Probe. Playwright đo `goto` tới thẻ đầu tiên, 10 lần xen kẽ giữa T25 (trunk) và T27 (head). Đo `setPreference` 50 lần bằng `performance.now()` quanh lời gọi.
- [ ] Baseline. Record the trunk thời gian tải `/dishes` ở T25 trước.
- [ ] Rule. Head chậm hơn trunk quá 15% ở trung vị là fail. `setPreference` quá 100ms ở p95 trên máy local là fail.

**Review gate.** The operator reviews before merge.

- [x] Copy lane 2, 5 và 8 screenshots into `docs/screenshots/p8/T27-review-*.png`.
- [x] Record a 30 to 60 second video of the change bằng `recordVideo` của Playwright. Save it as `docs/screenshots/p8/T27-review.webm`.
- [x] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [x] Root's clean verdict at the exact head SHA, tức SHA-256 các file đã sửa.
- [x] Bugbot triage done, ghi không áp dụng.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged, tức hash file không đổi sau verdict.
- [x] Operator duyệt trong chat. Thêm ADR-015 cho bảng `dish_preferences`, cập nhật mô hình dữ liệu trong `docs/spec.md` §5.

## Áp món thích và món chán vào gợi ý, chat và planner (T28)

**Depends on.** T27.

**Files.**

- [ ] Edit `apps/web/src/server/recommend.service.ts`, `recommend.functions.ts` và test của chúng.
- [ ] Edit `apps/web/src/server/chat.service.ts`, `apps/web/src/routes/api/chat.ts` và `chat.service.test.ts`.
- [ ] Edit `apps/web/src/server/plan.service.ts` và `plan.service.test.ts`.
- [ ] Edit `packages/ai/src/types.ts`, `rank.ts`, `gemini.ts`, `mock.ts` và test của chúng.

**Build.**

- [ ] Định nghĩa kiểu `DishPreferences = { liked: ReadonlySet<string>; disliked: ReadonlySet<string> }` trong `packages/ai/src/types.ts`. Khách dùng hằng `NO_PREFERENCES` với hai tập rỗng, nên không có nhánh "có user hay không" rải rác.
- [ ] Server function lấy user trước khi dựng gợi ý, đọc `listDishPreferences` một lần, rồi truyền vào `buildRecommendation`, `runChat` và `createPlanForUser`.
- [ ] Món chán bị loại khỏi danh sách ứng viên ở cả ba nơi, trước khi advisor nhìn thấy. Đây là lọc cứng, nên không phụ thuộc AI có nghe lời hay không.
- [ ] `scoreCandidate` cộng `LIKED_BONUS` cho món thích. Số điểm chọn sao cho món thích vừa ngân sách thắng món không thích cùng nhóm, nhưng không thắng món vừa ngân sách khi món thích vượt ngân sách. Test khoá đúng thứ tự này.
- [ ] Prompt Gemini (`buildPickMessages`, `buildChatMessages`) đánh dấu món thích bằng cột `liked` trong bảng ứng viên và một câu "prefer liked dishes when they fit".
- [ ] Planner chỉ loại món chán, không cộng điểm món thích. Chạy `pnpm verify:planner` để chắc planner không đổi.

**You see.**

- [ ] User chán "Chả giò" thì không còn thấy món này ở `/recommend`, trong chat và trong thực đơn mới. User thích một món vừa ngân sách thì món đó lên đầu khi dùng mock.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `rank` test có case món thích thắng món cùng điểm, nhưng không thắng món vừa ngân sách khi món thích vượt ngân sách. Run `pnpm --filter @mam/ai test`.
- [x] `recommend.service.test.ts`, `chat.service.test.ts` và `plan.service.test.ts` có case món chán không bao giờ xuất hiện, kể cả khi nó là món rẻ nhất. Run `pnpm test`.
- [x] `pnpm verify:planner` vẫn OK P1 đến P5.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `inherit-parent` at the PR head, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Cùng một user không có món thích hay chán, gọi `/recommend` với ngân sách 120.000/ngày ở trunk và head. Save `apply-regression.png`. Pass when ba món giống hệt nhau.
- [x] Lane 2. Chán món mà trunk chọn cho bữa trưa ở lane 1, rồi gợi ý lại. Save `apply-dislike-recommend.png`. Pass when món đó không còn và tổng vẫn không vượt ngân sách.
- [x] Lane 3. Thích một món trưa vừa ngân sách mà mock không chọn. Save `apply-like-recommend.png`. Pass when món đó được chọn cho bữa trưa.
- [x] Lane 4. Chat "trưa nay 40k ăn gì" sau khi chán món đầu bảng. Save `apply-chat.png`. Pass when không có thẻ món nào là món đã chán.
- [x] Lane 5. Tạo thực đơn 7 ngày sau khi chán 3 món. Save `apply-plan.png`. Pass when `select count(*) from plan_items` với 3 id đó bằng 0.
- [x] Lane 6. Chán mọi món sáng vừa ngân sách. Save `apply-all-disliked.png`. Pass when bữa sáng nằm trong `missingMeals` hoặc thực đơn báo infeasible, không có lỗi 500.
- [x] Lane 7. Khách gợi ý món. Save `apply-guest.png`. Pass when kết quả giống trunk cho cùng input.
- [x] Lane 8. User A chán một món, user B không chán. Save `apply-isolation.png`. Pass when B vẫn nhận được món đó.
- [x] Lane 9. Bật `AI_PROVIDER=gemini` với key giả. Save `apply-gemini-fallback.png`. Pass when fallback mock vẫn tôn trọng món chán.
- [x] Lane 10. Chạy `node scripts/checkpoint-chat.mjs`. Save `apply-chat-checkpoint.png`. Pass when đạt 25/25.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Độ trễ server của `recommendMeals` với mock, và thời gian tạo thực đơn 30 ngày.
- [x] Probe. Gọi mỗi thao tác 30 lần xen kẽ ở trunk và head bằng Playwright, với user có 10 món thích và 10 món chán.
- [x] Baseline. Record the trunk trung vị của cả hai thao tác trước.
- [x] Rule. Head chậm hơn trunk quá 10% ở trung vị, hoặc thêm hơn 5ms tuyệt đối, là fail.

**Review gate.** None. T28 is not review-gated.

**Merge.**

- [x] Root's clean verdict at the exact head SHA, tức SHA-256 các file đã sửa.
- [x] Bugbot triage done, ghi không áp dụng.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged, tức hash file không đổi sau verdict.
- [x] Cập nhật `docs/spec.md` (luồng gợi ý và planner contract), ADR-015, và đồng bộ skill `verify-planner` (hash mới).

## Tính ngân sách còn lại của tháng (T29)

**Depends on.** T26.

**Files.**

- [ ] Create `packages/domain/src/remaining-budget.ts` và `packages/domain/src/remaining-budget.test.ts`.
- [ ] Edit `apps/web/src/routes/plans/$planId.tsx`.
- [ ] Edit `apps/web/src/routes/recommend.tsx` để nhận ngân sách từ URL.
- [ ] Edit `packages/i18n/src/vi.ts` và `packages/i18n/src/en.ts`.

**Build.**

- [ ] Hàm thuần `remainingBudget({ startDate, days, budgetVnd, dayTotals, today })` trả một trong ba trạng thái `notStarted`, `inProgress` với `spentVnd`, `remainingVnd`, `daysLeft`, `newDailyVnd`, hoặc `finished`. Dùng union có `kind` để UI không phải ghép boolean.
- [ ] "Đã tiêu" là tổng các ngày của thực đơn có ngày nhỏ hơn hôm nay, theo lựa chọn của operator. `budgetVnd` là `dailyBudgetVnd × days`. `newDailyVnd` làm tròn xuống bội 1.000đ. Âm thì hiện 0 kèm cảnh báo.
- [ ] "Hôm nay" tính theo múi giờ `Asia/Ho_Chi_Minh`, truyền vào hàm thuần từ server để test được.
- [ ] Trang chi tiết thực đơn có thẻ "Đã tiêu X, còn Y, ngân sách mới Z/ngày" và nút "Gợi ý theo ngân sách này" dẫn tới `/recommend?unit=day&amount=Z`.
- [ ] `/recommend` đọc `unit` và `amount` từ URL để điền sẵn form, validate bằng `budgetSchema`.

**You see.**

- [ ] Thực đơn bắt đầu 3 ngày trước, ngân sách 100.000/ngày, ba ngày đã qua tổng 255.000. Thẻ hiện "Đã tiêu 255.000₫, còn 445.000₫ cho 4 ngày, ngân sách mới 111.000₫/ngày".

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `remaining-budget.test.ts` có case chưa bắt đầu, ngày đầu, giữa chừng, ngày cuối, đã kết thúc, chi vượt ngân sách, và ranh giới nửa đêm theo giờ Việt Nam. Run `pnpm --filter @mam/domain test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `inherit-parent` at the PR head, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Mở cùng một thực đơn ở trunk và head. Save `remaining-regression.png`. Pass when bảng món, tổng và nút xuất giống nhau, head có thêm thẻ ngân sách còn lại.
- [x] Lane 2. Thực đơn bắt đầu hôm nay. Save `remaining-today.png`. Pass when đã tiêu 0 và ngân sách mới bằng ngân sách gốc.
- [x] Lane 3. Sửa `start_date` trong DB lùi 3 ngày. Save `remaining-midway.png`. Pass when số trên thẻ khớp phép tính tay từ `plan_items`.
- [x] Lane 4. Thực đơn bắt đầu ngày mai. Save `remaining-future.png`. Pass when thẻ báo chưa bắt đầu.
- [x] Lane 5. Thực đơn đã kết thúc. Save `remaining-finished.png`. Pass when thẻ báo đã xong và hiện tổng đã tiêu.
- [x] Lane 6. Bấm "Gợi ý theo ngân sách này". Save `remaining-recommend.png`. Pass when `/recommend` điền sẵn đơn vị ngày và đúng số Z.
- [x] Lane 7. Sửa tay URL `/recommend?unit=day&amount=-5`. Save `remaining-bad-url.png`. Pass when form bỏ giá trị rác và giữ mặc định.
- [ ] Lane 8. Thực đơn 30 ngày với ngân sách tháng. Save `remaining-month.png`. Pass when ngân sách gốc bằng `dailyBudgetVnd × 30` (ví dụ 2.500.000/tháng → 83.000 × 30 = 2.490.000). (sửa 2026-11-04 theo quyết định B của operator)
- [x] Lane 9. Locale en và viewport 390px. Save `remaining-en-mobile.png`. Pass when tiền hiện đúng định dạng en và không tràn ngang.
- [x] Lane 10. Chạy axe trên trang chi tiết thực đơn. Save `remaining-axe.png`. Pass when axe báo 0 vi phạm.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Thời gian tải trang chi tiết thực đơn 30 ngày.
- [x] Probe. Playwright đo `goto` tới bảng món, 10 lần xen kẽ ở trunk và head, trên build production.
- [x] Baseline. Record the trunk trung vị trước.
- [x] Rule. Head chậm hơn trunk quá 10% ở trung vị là fail.

**Review gate.** The operator reviews before merge.

- [x] Copy lane 3, 6 và 9 screenshots into `docs/screenshots/p8/T29-review-*.png`.
- [x] Record a 30 to 60 second video of the change bằng `recordVideo` của Playwright. Save it as `docs/screenshots/p8/T29-review.webm`.
- [x] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA, tức SHA-256 các file đã sửa.
- [x] Bugbot triage done, ghi không áp dụng.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged, tức hash file không đổi sau verdict.
- [x] Operator duyệt trong chat. Cập nhật `docs/spec.md` §6.2 và thêm tiêu chí S mới cho ngân sách còn lại.

## Đổi một món trong thực đơn (T30)

**Depends on.** T28 và T29.

**Files.**

- [ ] Edit `packages/db/src/schema.ts` và tạo migration thêm cột `diet_tags` cho `plans`.
- [ ] Create `packages/domain/src/plan-swap.ts` và `packages/domain/src/plan-swap.test.ts`.
- [ ] Edit `packages/db/src/plans.ts` và `packages/db/src/plans.test.ts`.
- [ ] Edit `apps/web/src/server/plan.service.ts`, `plan.functions.ts` và test của chúng.
- [ ] Edit `apps/web/src/routes/plans/$planId.tsx`.
- [ ] Edit `scripts/verify-planner.ts`.
- [ ] Edit `packages/i18n/src/vi.ts` và `packages/i18n/src/en.ts`.

**Build.**

- [ ] Lưu `diet_tags` của thực đơn khi tạo, vì hiện bảng `plans` không lưu chế độ ăn nên đổi món không thể lọc lại. Thực đơn cũ có `diet_tags = '[]'` và UI ghi rõ điều đó. Đây là thay đổi schema, cần operator đồng ý trước khi bắt đầu.
- [ ] Hàm thuần `swapPlanMeal(plan, { dayIndex, mealType }, candidates)` trong `packages/domain` trả món thay thế hoặc `null`. Ứng viên phải phục vụ đúng bữa, khớp chế độ ăn, không phải món chán, không trùng món nào của hôm trước, hôm nay và hôm sau, và giữ tổng ngày không vượt ngân sách ngày. Trong các ứng viên hợp lệ, chọn món có giá gần món cũ nhất, hoà thì theo `id`. Bấm lần nữa thì đổi sang món kế tiếp theo cùng thứ tự đó, xoay vòng.
- [ ] `updatePlanItem` trong `plans.ts` cập nhật đúng một hàng, scope theo `user_id` qua `plan_id`, giá lấy từ bảng `dishes`.
- [ ] Server function `swapPlanMeal` (POST, Zod). Không có món thay thế thì trả `{ ok: false, error: 'no_alternative' }`.
- [ ] Mỗi ô món trên trang chi tiết là một nút "Đổi món" có nhãn cho trình đọc màn hình, cả bảng desktop lẫn accordion mobile. Đổi xong thì nạp lại dữ liệu, tổng ngày và thẻ ngân sách còn lại của T29 cập nhật theo.
- [ ] Thêm thuộc tính P6 vào `scripts/verify-planner.ts`, áp `swapPlanMeal` lên mọi ô của mọi thực đơn hợp lệ trong phạm vi và kiểm lại P1 sau mỗi lần đổi.

**You see.**

- [ ] Bấm ô bữa trưa ngày 3 thì món đổi sang một món trưa khác có giá gần nhất, tổng ngày 3 vẫn không vượt ngân sách, và không món nào lặp với ngày 2 hoặc ngày 4.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `plan-swap.test.ts` có case chọn giá gần nhất, xoay vòng khi bấm lại, loại món của ngày kề, loại món chán, giữ trần ngân sách ngày, và trả `null` khi hết ứng viên. Run `pnpm --filter @mam/domain test`.
- [x] `plans.test.ts` có case không sửa được thực đơn của user khác. Run `pnpm --filter @mam/db test`.
- [x] `pnpm verify:planner` báo OK cho P1 đến P6.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `inherit-parent` at the PR head, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Trunk chưa có nút đổi món. Tạo cùng một thực đơn ở trunk và head. Save `swap-regression.png`. Pass when hai thực đơn giống nhau từng ô trước khi đổi.
- [x] Lane 2. Đổi bữa trưa ngày 3. Save `swap-lunch.png`. Pass when món mới phục vụ bữa trưa, giá gần món cũ nhất trong các ứng viên hợp lệ, và DB khớp UI.
- [x] Lane 3. Bấm cùng ô 3 lần. Save `swap-cycle.png`. Pass when ra 3 món khác nhau theo đúng thứ tự giá gần nhất.
- [x] Lane 4. Sau mỗi lần đổi, đọc cả thực đơn từ DB. Save `swap-invariants.png`. Pass when mọi ngày không vượt ngân sách và không món nào lặp trong 2 ngày liền.
- [x] Lane 5. Thực đơn chay. Save `swap-diet.png`. Pass when món thay thế luôn có tag `vegetarian`.
- [x] Lane 6. Thực đơn ngân sách sát sàn không còn món thay thế. Save `swap-none.png`. Pass when hiện thông báo không có món thay thế và DB không đổi.
- [x] Lane 7. User B gọi `swapPlanMeal` với `planId` của user A. Save `swap-forbidden.png`. Pass when bị từ chối và DB không đổi.
- [x] Lane 8. Đổi món rồi xem thẻ ngân sách còn lại của T29. Save `swap-remaining.png`. Pass when số trên thẻ cập nhật theo giá mới.
- [x] Lane 9. Đổi món rồi xuất CSV. Save `swap-export.png`. Pass when CSV chứa món mới.
- [x] Lane 10. Viewport 390px, chỉ dùng bàn phím, rồi chạy axe. Save `swap-mobile-a11y.png`. Pass when đổi được món từ accordion mobile và axe báo 0 vi phạm.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Thời gian từ bấm "Đổi món" tới khi ô hiện món mới, và thời gian tải trang chi tiết thực đơn 30 ngày.
- [x] Probe. Playwright đo cả hai, 20 lần, xen kẽ trunk và head cho phần tải trang. Phần đổi món chỉ có ở head.
- [x] Baseline. Record the trunk thời gian tải trang chi tiết thực đơn 30 ngày trước.
- [x] Rule. Tải trang chậm hơn trunk quá 10% ở trung vị là fail. Đổi món quá 300ms ở trung vị trên build production local là fail.

**Review gate.** The operator reviews before merge.

- [x] Copy lane 2, 3 và 6 screenshots into `docs/screenshots/p8/T30-review-*.png`.
- [x] Record a 30 to 60 second video of the change bằng `recordVideo` của Playwright. Save it as `docs/screenshots/p8/T30-review.webm`.
- [x] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA, tức SHA-256 các file đã sửa.
- [x] Bugbot triage done, ghi không áp dụng.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged, tức hash file không đổi sau verdict.
- [x] Operator duyệt trong chat. Cập nhật `docs/spec.md` §6.2, ADR-016 cho cột `diet_tags`, và đồng bộ skill `verify-planner` (P6, hash mới).

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

Repo chưa có git, nên bằng chứng nằm trong thư mục scratchpad của phiên này thay cho branch và SHA.

- Thư viện .xlsx. `write-excel-file@4.1.1` tạo được file 3.120 byte có tiếng Việt đúng trong `xl/sharedStrings.xml`, tên sheet "Thực đơn", ô giá là số với định dạng `#,##0`. macOS Quick Look render đúng, ảnh ở `/private/tmp/claude-501/-Users-hungho-Code-study-meal-recommendation/8fccf41c-f23a-456e-92c3-d1d1555f75d0/scratchpad/xlsx-proto/plan.xlsx.png`. Prototype cũng cho thấy cột tên món quá hẹp và đè cột giá, nên T26 phải đặt độ rộng cột.
- Kích thước thư viện. Bản build cho trình duyệt của `write-excel-file/browser` là 74.734 byte sau minify và 20.867 byte sau gzip, đo bằng esbuild. So sánh lúc chọn thư viện là `exceljs@4.4.0` 21,8MB với 9 dependency con, `xlsx@0.18.5` 7,5MB với 7 dependency con, `write-excel-file@4.1.1` 1,8MB với 1 dependency con.
- Kích thước danh sách món. Toàn bộ 100 món kèm mô tả là 33.553 byte JSON, đo bằng `json_group_array` trên `data/mam.db`. Đủ nhỏ để `/dishes` tải một lần rồi lọc ở client.
- Câu hỏi chưa chứng minh. Hằng `LIKED_BONUS` của T28 chưa được chọn. Cách lưu `diet_tags` của T30 chưa được operator duyệt.

## Appendix B. Alternatives rejected

- Lọc `/dishes` ở server theo từng lần gõ phím. Bị loại vì 100 món chỉ khoảng 33,5KB, lọc ở client nhanh hơn và không tốn request.
- `exceljs` và `xlsx` cho file Excel. Bị loại vì nặng hơn nhiều lần và nhiều dependency con. `xlsx` trên npm đã đứng ở bản 0.18.5.
- Tạo .xlsx ở server. Bị loại vì server function trả file nhị phân phức tạp hơn, trong khi tải lười ở client không làm tăng bundle lúc mở trang.
- Cho món chán chỉ là điểm trừ. Bị loại vì user nói "loại món chán", và lọc cứng không phụ thuộc AI có nghe lời hay không.
- Lưu yêu thích của khách trong localStorage. Bị loại theo lựa chọn của operator để tránh một đường code song song.
- Ghi chi tiêu thật cho ngân sách còn lại. Bị loại theo lựa chọn của operator, vì cần thêm schema và UI nhập liệu. Có thể làm sau.
- Chọn món thay thế ngẫu nhiên. Bị loại vì khó test và khó đoán. Xoay vòng theo giá gần nhất cho kết quả tất định.

## Appendix C. Risks

- T27 và T30 đổi schema. Owner chạy migration trên bản sao của `data/mam.db` trước, và `pnpm db:bootstrap` phải vẫn idempotent.
- T28 đổi luồng chọn món, thuộc diện CLAUDE.md bắt hỏi trước. Operator đã đồng ý ý tưởng, owner vẫn trình số `LIKED_BONUS` trước khi hoàn tất.
- T28 có thể làm `missingMeals` tăng khi user chán quá nhiều món rẻ. Lane 6 canh trường hợp này.
- T29 phụ thuộc múi giờ. Server chạy ở múi giờ khác Việt Nam thì "hôm nay" có thể lệch một ngày. Hàm thuần nhận `today` từ ngoài để test ranh giới.
- T30 có thể phá bất biến không lặp món nếu bỏ sót ngày kề. Thuộc tính P6 trong `verify-planner` canh việc này trên mọi thực đơn nhỏ.
- T25, T26, T27, T29 và T30 cùng sửa i18n và vài trang chung. Đơn vị chạy nối tiếp theo đồ thị phụ thuộc để không ghi đè nhau.
- Rate limit đăng ký in-memory (5 lần/IP/giờ) làm các lane đăng ký nhiều user bị chặn. Mỗi lane dùng server riêng nên giới hạn tách biệt.

## Appendix D. Links and reading list

- `CLAUDE.md` và `AGENTS.md` cho bất biến domain, cổng bắt buộc và ranh giới hỏi trước.
- `docs/spec.md` §5 mô hình dữ liệu, §6.2 planner contract, §6.3 history contract, bảng tiêu chí S1 đến S10.
- `docs/adr/0001-ai-khong-bia-gia.md` và `docs/adr/0014-gemini-thay-openrouter.md`.
- `.claude/skills/verify-planner/SKILL.md` cho T28 và T30.
- T28 và T30 chạy `pstack/skills/how/SKILL.md` trước khi viết code. T28 chạy `pstack/skills/interrogate/SKILL.md` cho hằng `LIKED_BONUS`.
- Dấu vết quyết định theo `pstack/skills/show-me-your-work/SKILL.md`, giữ local trong `docs/plans/p8-trail.md`.
