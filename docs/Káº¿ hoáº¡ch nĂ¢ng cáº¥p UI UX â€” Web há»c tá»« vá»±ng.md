# Kế hoạch nâng cấp UI/UX — Web học từ vựng

Nov 7, 2026 · @axc

Đề xuất: giữ phong cách “vở ô ly” hiện có và thêm hai hệ thống nhỏ — **Scene** (đăng nhập theo mùa, admin điều khiển) và **Cosmetic** (theme + avatar mở khóa, có hạn) — chạy trên CSS variables và bảng dữ liệu riêng, không đụng vào luồng học/thi.

**Cập nhật 07/11 — ba thay đổi mới**: (1) avatar chuyển từ emoji sang bộ nhân vật minh họa có khung và nhiều biểu cảm; (2) Dark trở thành một theme riêng, Vở ô ly là theme mặc định, không còn trục sáng/tối tách riêng; (3) sắp xếp lại các màn hình — xem Phần 3. Các mục bên dưới đã được sửa theo.

## Hiện trạng (đọc từ code)

Nền móng đủ tốt để làm cả hai tính năng mà không viết lại: giao diện chạy bằng CSS variables, level tính từ XP, và đã có kênh thông báo qua thú cưng. Các điểm cần xử lý trước:

| Phát hiện | Vị trí | Ảnh hưởng |
| --- | --- | --- |
| Trang đăng nhập dùng bộ style khác hẳn app (indigo phẳng, font hệ thống) so với phong cách vở ô ly | `globals.css`, `(auth)/layout.tsx` | Đăng nhập trông như sản phẩm khác; cần thiết kế lại cùng ngôn ngữ với app |
| Chế độ sáng/tối chỉ lưu ở `localStorage` | `lib/theme.ts` | Không đồng bộ giữa thiết bị; theme tùy chỉnh phải lưu theo tài khoản |
| Màu app nằm gọn trong biến `.app { --paper, --ink, --mark… }` và ghi đè bằng `html[data-theme=dark]` | `app.css` | Thuận lợi: đổi theme = đổi bộ biến, không sửa component |
| Avatar là 16 emoji cố định, DB chỉ lưu mã (`profiles.avatar`, tối đa 32 ký tự) | `core/avatars.ts`, migration 0004 | Emoji hiển thị khác nhau theo hệ điều hành, khó gắn khung hoặc hạn dùng; nên chuyển sang bộ nhân vật minh họa có khung |
| Level tính từ XP, không lưu DB (tối đa 50; comment ghi sẵn sẽ nâng khi có phần thưởng mở khóa) | `core/xpLevel.ts` | Cần bảng cấp quyền để không bị thu hồi khi đổi công thức XP |
| Chưa có khái niệm quản trị viên; trình duyệt không ghi được bảng nào (RLS), mọi ghi đi qua server | `0002_rls.sql`, `server/db.ts` | Phải thêm vai trò admin và trang quản trị chạy bằng server action |
| CSP chặt: ảnh chỉ từ chính site và origin media (R2), font chỉ `self`, script phải có nonce | `lib/csp.ts` | Tài nguyên theo mùa phải tự host hoặc để trên R2; admin không được nhập CSS/HTML tự do |
| `app.css` khai báo font Be Vietnam Pro nhưng không thấy nạp ở đâu (không có `next/font`, không có thư mục `public`) | `app.css` | Đang rơi về font hệ thống; nên tự host font để đúng thiết kế và hợp CSP |

Hướng thẩm mỹ: mình không áp bộ gợi ý mặc định của công cụ (claymorphism, trang bán hàng có testimonial) vì app đã có bản sắc riêng. Áp dụng từ công cụ: biểu tượng SVG thay emoji, tương phản chữ 4.5:1, tôn trọng `prefers-reduced-motion`, đăng nhập cho phép dán mật khẩu và trình quản lý mật khẩu (WCAG 2.2), tối đa 1–2 phần tử chuyển động mỗi màn hình.

## Phần 1 — Đăng nhập theo mùa (admin điều khiển)

Trang đăng nhập được tách thành **khung cố định** (form, captcha, liên kết) và **Scene** thay được (màu, hình minh họa, câu chào, hiệu ứng nhẹ). Admin chỉ chọn và đặt lịch cho Scene có sẵn, không sửa được form.

### Bố cục

- Desktop: chia hai cột — trái là minh họa mùa (khoảng 55%), phải là thẻ đăng nhập nền đặc, kiểu tờ vở có lề đỏ như trong app.
- Mobile: dải minh họa cao khoảng 120px ở trên, thẻ đăng nhập bên dưới; không cuộn ngang ở 375px.
- Thẻ đăng nhập luôn có nền đặc, nên dù Scene rực rỡ đến đâu, chữ và ô nhập vẫn đạt tương phản 4.5:1.
- Giữ nguyên `autocomplete`, cho dán mật khẩu, Turnstile như hiện tại; ô nhập cao tối thiểu 44px.

### Scene hoạt động thế nào

1. Server component của `/login` gọi `getActiveScene(now)` rồi render `<LoginScene>` bọc quanh `LoginForm`, in `data-login-scene=halloween`. Màu, chữ, nhãn đã nằm trong HTML từ server nên không bị nháy.
2. Mỗi scene gồm `scene.ts` (màu, chữ, loại công cụ, màu chùm sáng), `scene.css` (biến CSS giới hạn bởi `[data-login-scene]`) và `draw.ts` (hàm vẽ canvas cho nhân vật, công cụ, trang trí). Scene có bảng màu riêng nên không phụ thuộc theme của app.
3. Canvas là phần nâng cao nạp sau (xem mục kiến trúc bên dưới): nhân vật, công cụ kéo thả, vùng sáng. Tắt hoàn toàn khi người dùng bật `prefers-reduced-motion`, tiết kiệm dữ liệu hoặc canvas lỗi.
4. Mọi hình trang trí là `aria-hidden`; thông điệp mùa (ví dụ “Chúc mừng Giáng sinh”) là văn bản thật, đọc được bằng screen reader.

### Quy tắc chọn Scene hiển thị

| Ưu tiên | Nguồn | Khi nào |
| --- | --- | --- |
| 1 | Ghim thủ công (admin bật “dùng ngay”) | Admin muốn ép một Scene, kể cả ngoài lịch |
| 2 | Lịch tự động (bắt đầu/kết thúc, có độ ưu tiên khi trùng) | Đúng khoảng đã đặt, theo giờ Việt Nam |
| 3 | Mặc định | Không có gì ở trên, hoặc Scene lỗi/thiếu tài nguyên |

Kết quả được cache và xóa cache ngay khi admin lưu (`revalidateTag`), nên đổi Scene có hiệu lực trong vài giây mà trang đăng nhập không phải truy vấn DB mỗi lượt.

### Trang quản trị Scene (`/admin/scenes`)

- Danh sách scene với trạng thái: đang hiển thị, đã lên lịch, nháp, hết hạn.
- Form đặt lịch (khoảng ngày của từng năm, độ ưu tiên khi trùng), sửa câu chào, bật/tắt hiệu ứng canvas. Chỉ một vai trò admin.
- Nút **Xem trước** mở `/admin/scenes/<id>/preview` (cùng `<LoginScene>`, form bị vô hiệu); xem được ở khổ mobile.
- Chỉ nhập giá trị đã kiểm tra (zod): chọn scene từ danh sách có sẵn trong code, ngày, câu chào ngắn; không có ô nhập CSS, HTML hay URL ngoài.

### Bộ Scene đề xuất

| Scene | Gợi ý màu | Thời điểm |
| --- | --- | --- |
| Mặc định (vở ô ly) | Xanh mực, đỏ lề, vàng đánh dấu | Quanh năm |
| Halloween | Cam, tím đậm, dơi giấy | 25/10 – 01/11 |
| Giáng sinh | Đỏ, xanh thông, tuyết nhẹ | 15/12 – 26/12 |
| Tết Nguyên đán | Đỏ, vàng, hoa mai/đào | Theo âm lịch (admin đặt) |
| Trung thu | Xanh đêm, vàng, đèn lồng | Theo âm lịch |
| Khai giảng | Xanh dương, cam, cặp sách | Đầu tháng 9 |

Sáu Scene trên là gợi ý; tài nguyên đồ họa sẽ cần thiết kế riêng (mình có thể dựng mockup cho từng Scene khi bạn đồng ý hướng).

### Kiến trúc engine + scene (theo đề xuất của bạn, có chỉnh)

Kết luận: làm được và hợp với dự án. Mình giữ nguyên ý chính (engine dùng chung, scene chỉ khai báo, một route `/login`, nạp theo nhu cầu, rơi về mặc định) và chỉnh 8 điểm ở bảng dưới. Mình gọi là *scene* thay vì *theme* để không lẫn với theme giao diện app ở Phần 2.

```
src/features/login-scene/
  engine/        useScene.ts  loop.ts  reveal.ts  drag.ts
  scenes/
    types.ts     SceneMeta (nhẹ) + SceneDraw (nặng)
    index.ts     registry + getActiveScene()
    default/     scene.ts            (form hiện tại, không hiệu ứng)
    halloween/   scene.ts  scene.css  draw.ts
    trung-thu/  giang-sinh/  tet/ ...
```

Engine lo: canvas và vòng lặp vẽ, nhân vật đi theo con trỏ, kéo để di chuyển và kéo chấm tròn để xoay công cụ, vùng sáng. Scene khai báo: nhân vật vẽ thế nào (nhện, thỏ ngọc, tuần lộc, lân), công cụ (đèn pin, lồng đèn, ngôi sao, pháo), màu chùm sáng, màu, font, câu chữ, đồ trang trí (bí ngô, tuyết, hoa mai). Mỗi `draw.ts` export `drawMascot(ctx, state)`, `drawTool(ctx, state)`, `drawDecor(ctx, state)`.

| # | Điểm cần chỉnh | Vì sao | Cách làm |
| --- | --- | --- | --- |
| 1 | Tách `scene.ts` (nhẹ) khỏi `draw.ts` (nặng) | Màu, font, chữ phải có trong HTML server, nếu nạp cùng canvas thì trang nháy màu | Import tĩnh `scene.ts` + `scene.css` (khoảng 1 KB mỗi scene); chỉ `draw.ts` và engine nạp động |
| 2 | `next/dynamic` với `ssr: false` chỉ chạy trong Client Component | `/login` là Server Component | `<LoginScene>` là client wrapper, nó mới import động engine + draw |
| 3 | Mật khẩu luôn là `<input type=password>` thật | Trình quản lý mật khẩu, dán, screen reader đều cần input thật; không vẽ chữ lên canvas | Vùng sáng chỉ là một cách bật cùng trạng thái với nút **Hiện** (đồng bộ `aria-pressed`); tự ẩn khi rời vùng sáng, mất focus hoặc gửi form |
| 4 | Kéo thả cần cách thay thế (WCAG 2.2, Dragging Movements) | Người không kéo được vẫn phải dùng được | Nút **Hiện** luôn có sẵn là cách thay thế; thêm phím mũi tên để di chuyển công cụ khi đang focus; dùng Pointer Events + `setPointerCapture` |
| 5 | Nhấp đúp không hợp cảm ứng (chạm đúp là zoom) | Trên điện thoại thao tác bị nuốt | Mobile: chạm một lần vào khoảng trống để gọi nhân vật; `touch-action: none` chỉ trên vùng công cụ để không chặn cuộn trang; hiện gợi ý chữ nhỏ, không bắt buộc |
| 6 | Canvas không được chặn form | Hiệu ứng không được cản đăng nhập | Canvas nằm sau thẻ đăng nhập, `pointer-events: none` trừ vùng nhân vật/công cụ; thẻ đăng nhập luôn nền đặc |
| 7 | Hiệu năng | Vòng lặp vẽ tốn pin | Dừng khi tab ẩn (`visibilitychange`) và khi mọi thứ đứng yên (giữ khung tĩnh); DPR tối đa 2; ngân sách engine ≤ 15 KB gzip, mỗi `draw.ts` ≤ 20 KB gzip; form hiện trước, canvas vào sau trong khung kích thước cố định (không CLS) |
| 8 | Xem trước không dùng được trên `/login` | `proxy.ts` đưa người đã đăng nhập ra khỏi `/login` (`GUEST_ONLY`), nên admin không xem được | Xem trước ở `/admin/scenes/<id>/preview`; `?theme=` chỉ giữ cho môi trường dev |

**Chọn scene** (`getActiveScene()`), theo thứ tự ưu tiên: (1) xem trước, (2) scene admin ghim trong Supabase, (3) lịch admin đặt (khoảng ngày cụ thể từng năm, kể cả Tết và Trung thu theo âm lịch; không tự tính), (4) mặc định. Không dùng biến môi trường vì đổi phải deploy lại. Kết quả cache theo tag và xóa khi admin lưu.

**Rơi về an toàn**: khi bật `prefers-reduced-motion`, tiết kiệm dữ liệu, `getContext` trả null hoặc nạp `draw.ts` lỗi thì bỏ phần canvas. Mình đề xuất rơi về **bản tĩnh của scene đang bật** (giữ màu, chữ, trang trí CSS) thay vì về hẳn mặc định, vì phần này đã có sẵn trong HTML/CSS nên không tốn thêm; chỉ khi chính `scene.ts` lỗi mới về mặc định.

**Tương phản**: mỗi `scene.ts` khai báo token màu, test vitest tự tính tỷ lệ (chữ/nền thẻ 4.5:1, viền/ô nhập 3:1) và báo lỗi nếu thiếu. Thêm scene mới = thêm một thư mục + chạy test.

**Phạm vi**: giai đoạn đầu chỉ `/login`; `/register`, `/forgot`… dùng nền mặc định cho nhẹ, có thể mở rộng sau.

## Phần 2 — Theme và avatar tùy chỉnh, mở khóa, có hạn

Mọi thứ người dùng sưu tầm được gọi chung là **Cosmetic**, gồm ba loại: **theme** (bộ màu giao diện), **avatar** (hình đại diện SVG) và **khung** (viền/phụ kiện đè lên avatar, dùng cho sự kiện). Ba loại dùng chung một cơ chế mở khóa và một màn hình chọn.

### Theme: một trục duy nhất, Dark là một theme

- Chỉ còn một thuộc tính `<html data-theme=paper>`; giá trị là mã theme (`paper` = Vở ô ly mặc định, `dark`, rồi `forest`…). Mỗi theme tự khai báo bộ biến `.app` (`--paper`, `--ink`, `--mark`, `--red`…) và một cờ `scheme: light | dark` để đặt `color-scheme` (thanh cuộn, ô nhập mặc định của trình duyệt).
- Selector hiện có `html[data-theme=dark] .app` giữ nguyên nghĩa nên Dark chuyển sang chỉ cần đổi tên `light` thành `paper`; không phải viết lại CSS Dark.
- Dark và Vở ô ly luôn mở cho mọi người, không khóa theo level (chế độ ít sáng là nhu cầu trợ năng).
- “Tự động theo thiết bị” là một công tắt trong Cài đặt: khi bật, dùng Dark lúc hệ điều hành ở chế độ tối, còn lại dùng Vở ô ly. Chọn một theme khác thì công tắt tự tắt.
- Lưu theo tài khoản (`profiles.theme`) cộng cookie `eg-theme` để server render đúng ngay lần đầu, không nháy màu. Khách chưa đăng nhập vẫn dùng `localStorage`; giá trị cũ `dark` → `dark`, `light`/`system` → `paper`.
- Mỗi theme phải vượt kiểm tương phản tự động (chữ 4.5:1, viền/điều khiển 3:1) trước khi vào danh mục.
- Nút mặt trăng/mặt trời trên thanh trên bỏ; chuyển nhanh theme nằm trong menu nhanh (xem Phần 3).
- “Tùy chỉnh” giai đoạn đầu = chọn theme đã mở. Sau này có thể thêm chọn màu nhấn trong 6 màu đã kiểm tương phản; không dùng bảng màu tự do.

**Nhiều loại theme (kẹo ngọt, ma mị…)**: mỗi theme là một thư mục theo Phần 4, có `group` để lọc trong Bộ sưu tập (Cổ điển, Ngọt ngào, Huyền bí, Thiên nhiên, Sự kiện), `scheme` sáng/tối, và tuỳ chọn họa tiết nền (hiện là lưới ô ly; theme khác có thể là chấm bi, sao, kẹo) và phông tự host.

### Avatar minh họa và khung

Phong cách theo ảnh bạn gửi: chân dung nhân vật trong khung tròn, và **khung là lớp riêng** xếp lên trên. Biểu cảm đã bỏ khỏi phạm vi.

- **Nguồn ảnh**: bạn đã có họa sĩ/bộ ảnh có bản quyền, nên dùng bộ đó. Các nhân vật trong hai ảnh tham khảo thuộc game khác, không đưa vào sản phẩm.
- **Định dạng**: tranh vẽ nên dùng WebP nền trong suốt (SVG chỉ hợp nếu họa sĩ giao vector). Mỗi ảnh xuất 96px và 192px (`srcset`), mục tiêu dưới 15 KB/ảnh; để trong `public/avatars/` hoặc R2 (CSP đã cho phép origin media).
- **Dữ liệu mỗi nhân vật**: `id`, tên, bộ sưu tập, điều kiện mở khóa, `duration_days` (trống = vĩnh viễn). DB chỉ lưu `avatar` và `frame` (mã dưới 32 ký tự).
- **Khung** có bốn bậc hiếm (thường, hiếm, sử thi, huyền thoại). Bậc phân biệt bằng hình dáng và nhãn chữ, không chỉ bằng màu. Khung tràn ra ngoài khoảng 12% kích thước, nên vùng chứa cần `aspect-ratio` và đệm cố định để không gây dịch bố cục (CLS).
- **Bàn giao với họa sĩ**: ảnh gốc từ 512px, nền trong suốt, nhân vật có vùng an toàn trong vòng tròn; khung xuất riêng, cùng kích thước, phần giữa để trống.
- `Avatar.tsx` dùng ở hồ sơ và bảng xếp hạng nên chỉ sửa một chỗ: thêm prop `frame`. Bảng xếp hạng trả thêm `frame` của người khác (avatar và khung là công khai; theme thì riêng tư). Ảnh là trang trí (`alt` rỗng) vì tên đã ở cạnh; trong màn hình chọn mỗi lựa chọn có tên đọc được.

### Quy tắc mở khóa

| Kiểu | Ví dụ | Cách cấp | Hạn dùng |
| --- | --- | --- | --- |
| Mặc định | Skin vở ô ly, 4–6 avatar đầu | Ai cũng có | Không |
| Lên level | Skin Rừng đêm ở Level 10, avatar Cú vàng ở Level 25 | Đủ level thì cấp vĩnh viễn | Không |
| Sự kiện | Khung nón Giáng sinh khi hoàn thành chuỗi nhiệm vụ sự kiện | Nhận trong khoảng sự kiện | Giới hạn khi nhận, có thể thêm hạn dùng |
| Phần thưởng | Thưởng chuỗi ngày học, admin tặng | Cấp tay hoặc qua nhiệm vụ | Tuỳ cài đặt |

**Đã chốt: hỗ trợ cả hai kiểu hạn.** *Cửa nhận* (`available_until`) giới hạn thời gian được nhận một món; nhận xong thì giữ theo hạn của chính món. *Hạn dùng* ghi lúc nhận bằng `duration_days` của món (trống = vĩnh viễn; ví dụ 30 hoặc 60 ngày): `expires_at = granted_at + duration_days`. Một sự kiện có thể tặng cả món vĩnh viễn lẫn món 30 ngày.

- Hết hạn được kiểm bằng cách so `expires_at` với giờ server mỗi lần đọc, không chờ job nền nên luôn đúng.
- Món đang dùng mà hết hạn: tự trở về avatar, khung hoặc theme mặc định; món vẫn nằm trong bộ sưu tập (xám, ghi ngày hết hạn) và báo một lần.
- Báo trước khi hết: nhãn “Còn 7 ngày” và nhắc qua thú cưng ở mốc 7 ngày và 1 ngày.
- Nhận lại món đã hết hạn: tính lại từ ngày nhận mới, không cộng dồn.
- Người khác chỉ thấy avatar và khung còn hạn.

Mở không dựa vào tính toán tức thời: khi người dùng lên level, server ghi dòng cấp quyền (có thể đồng bộ lười khi tải trang hồ sơ, không đụng hàm SQL chấm bài). Nhờ đó đổi công thức XP sau này không làm ai mất đồ đã mở.

### Màn hình chọn (trong Hồ sơ, thay `AvatarPicker` + `ThemePicker`)

- Ba tab: Theme / Avatar / Khung. Bộ lọc: Đã có, Chưa mở, Sự kiện.
- Hiện cả món bị khóa, không giấu: biểu tượng khóa + điều kiện rõ bằng chữ (“Cần Level 12 — còn 340 XP”), có thanh tiến độ. Dùng `aria-disabled` để vẫn tới được bằng bàn phím và đọc được lý do.
- Món có hạn có nhãn chữ “Còn 3 ngày” / “Hết hạn 12/12” (không chỉ dùng màu), tính theo giờ Việt Nam.
- **Dùng thử**: bấm vào theme để xem trước cả trang mà chưa lưu; bấm **Dùng** mới gọi server. Server kiểm tra lại quyền sở hữu và hạn dùng (như `updateAvatarAction` đang kiểm `isAvatarId`).
- Khi mở khóa: thông báo một lần qua `petSay` sẵn có (và nhãn “Mới” ở món); bản giảm chuyển động không có hiệu ứng pháo hoa.
- Khi hết hạn: tự trả về skin/avatar mặc định, món vẫn nằm trong bộ sưu tầm (xám, có ghi ngày hết), và báo một lần lần đăng nhập kế.

## Phần 3 — Sắp xếp lại các màn hình tính năng

Mình hiểu “cửa sổ tính năng” là các màn hình/mục trong app. Đề xuất: giữ 4 tab, mỗi thứ chỉ nằm ở một nơi, Hồ sơ thành “Tôi” gọn nhẹ, và có chỗ đàng hoàng cho Bộ sưu tập và Sự kiện.

### Vấn đề đang thấy trong code

- Trang Hồ sơ gộp 8 khối khác nhau (số liệu, level, XP hôm nay, lộ trình, kết quả, tài khoản, cài đặt, đăng xuất) nên rất dài trên điện thoại.
- Trùng lặp: XP hôm nay (Trang chủ và Hồ sơ), Level (Nhiệm vụ và Hồ sơ), lộ trình các cấp (Trang chủ “Các cấp độ” và Hồ sơ “Lộ trình”), chuỗi ngày và tổng XP (Trang chủ và Hồ sơ).
- Hồ sơ năng lực (`/insights`) và Lịch sử kết quả (`/results`) chỉ vào được qua liên kết phụ trong Trang chủ/Hồ sơ.
- Thanh trên có 4 nút biểu tượng (giao diện, chat thú cưng, bật/tắt thú cưng, tắt âm) cạnh menu, chật trên màn hình nhỏ.
- Trang Nhiệm vụ đang “Nhiệm vụ & Level”, chưa có chỗ cho Sự kiện; Bộ sưu tập theme/avatar mới cũng chưa có chỗ.

### Cấu trúc đề xuất

| Tab | Nội dung | Chuyển từ đâu |
| --- | --- | --- |
| Học (`/`) | Thanh chuyển đổi hai mục ở đầu trang: Hôm nay (/) gồm lời chào, chuỗi ngày, một thanh XP hôm nay, thẻ Ôn tập, Hôm nay nên học gì, Các cấp độ; và Năng lực (/insights) là Hồ sơ năng lực hiện có | Giữ trang chủ, rút 3 ô số liệu thành dải gọn; đưa Hồ sơ năng lực vào làm mục con |
| Nhiệm vụ (`/quests`) | Hai mục nhỏ: Hằng ngày và Sự kiện (có đếm ngược, phần thưởng hiện rõ món sẽ nhận); level chỉ còn dải tóm tắt trên đầu | Tách Level đầy đủ sang Tôi |
| Xếp hạng | Giữ nguyên; avatar + khung hiện ở mỗi hàng | Giữ |
| Tôi (`/profile`) | Thẻ danh tính (avatar + khung, tên, level + XP, chuỗi hiện tại/dài nhất); lối vào Kết quả bài kiểm tra (/results); lối vào Bộ sưu tập (`/profile/collection`: Theme, Avatar, Khung); lối vào Cài đặt (`/profile/settings`: tài khoản, âm thanh, thú cưng, theo thiết bị, đăng xuất) | Tách từ Hồ sơ cũ; bỏ khối Lộ trình vì trùng với Các cấp độ ở Trang chủ |

Giữ nguyên các URL cũ (`/insights`, `/results`, `/profile`, `/quests`) để liên kết và test hiện có không hỏng; chỉ đổi nơi sắp xếp trong `Nav.tsx`: tab Học nhận thêm `/insights` trong `match`. Thanh dưới vẫn 4 cột, không đổi CSS. Tab Tôi hiện avatar của người dùng thay cho biểu tượng. Hồ sơ năng lực tạm nằm chung tab Học; nếu sau này mục này lớn lên, tách thành tab riêng chỉ là thêm một mục vào `TABS` (thanh dưới cho phép tối đa 5).

### Thanh trên

- Trái: logo. Phải: chỉ còn **chat thú cưng** và **menu nhanh** (⋯) chứa Giao diện (ba theme gần nhất + “Xem tất cả”), Âm thanh, Bật/tắt thú cưng. Từ 4 nút còn 2.
- Trên desktop thêm chip Level + avatar nhỏ, bấm vào mở `/profile`.
- Mỗi nút ≥ 44px, có tên đọc được; menu đóng bằng Esc và trả focus về nút mở.

Việc này làm ngay trong giai đoạn 0 (khung điều hướng, không cần DB) và giai đoạn 2 (Tôi + Bộ sưu tập); tab Sự kiện trong Nhiệm vụ vào giai đoạn 3.

## Phần 4 — Kiến trúc để thêm nội dung mới dễ dàng

Vì được làm lại từ đầu, nguyên tắc là: **lõi chỉ biết hợp đồng, không biết từng món**. Thêm theme, avatar, khung hay scene đăng nhập mới = thêm một thư mục và chạy một lệnh, không sửa component, trang hay schema DB. Phạm vi làm lại đã chốt ở mục ngay dưới: xây lại toàn bộ tầng giao diện, giữ lõi logic và backend đã có test.

### Phạm vi làm lại: xây lại giao diện, giữ lõi đã kiểm chứng

Phương án tốt nhất là xây lại **toàn bộ tầng giao diện** và **không** xây lại lõi. Lý do: mọi thứ bạn muốn đổi (token, điều hướng, avatar, theme, đăng nhập) đều nằm ở giao diện, còn phần chấm điểm, XP, ôn tập lặp lại, thi và bảo mật đã có hơn 50 file test; viết lại nó không cải thiện trải nghiệm mà chỉ thêm nguy cơ sai điểm hoặc lệch XP.

| Phần | Quyết định | Ghi chú |
| --- | --- | --- |
| Giao diện: `src/components`, `src/app/(app)`, form trong `(auth)/_components`, `app.css`, `globals.css`, giao diện các trò chơi `src/games/*.tsx` | Xây lại | Khoảng 5.600 dòng TSX và 510 dòng CSS, dùng token mới và điều hướng 4 tab |
| Lõi logic `src/core/*` (chấm điểm, SRS, XP, level, thi, insights) | Giữ nguyên | Hàm thuần, có test; chỉ thêm hàm mới cho mở khóa |
| Backend `src/server/*`, `supabase/migrations`, các route `/api/*`, `types/api.ts` | Giữ, chỉ thêm | Hợp đồng API là ranh giới: giao diện mới gọi cùng API; migration chỉ thêm bảng/cột |
| Bảo mật: server action đăng nhập, captcha, rate limit, CSP, `proxy.ts` | Giữ | Đã kiểm chứng; giao diện mới dùng lại server action có sẵn |
| Thêm mới | Xây mới | `profiles.role`, `requireAdmin`, `/admin`, bảng cosmetics/scenes/events, registry, gallery |

**Lưới an toàn cho phần xây lại**: trong gói bạn gửi, thư mục `tests/` chỉ phủ logic (core, db, server, api, auth), chưa thấy test nào cho giao diện. Vì vậy trước khi đập phải dựng bộ kiểm giao diện: Playwright chạy các luồng chính (đăng nhập, học một vòng, thi lên cấp, đổi theme, đổi avatar), axe kiểm trợ năng, và ảnh chụp so sánh ở 375px và 1024px cho từng theme. Chạy lại cuối mỗi giai đoạn.

**Thứ tự xây** để mỗi giai đoạn đều chạy được: token + khung → đăng nhập → tab Học và trò chơi → Nhiệm vụ → Xếp hạng → Tôi + Bộ sưu tập. Trang cũ và mới dùng chung API nên chuyển từng nhóm trang mà không phải ngưng hệ thống.

### Thêm một món mới cần gì

| Loại | Thư mục | File phải có | Lệnh tạo khung | Cần deploy |
| --- | --- | --- | --- | --- |
| Theme | `src/cosmetics/themes/<id>/` | `theme.ts` (token + thông tin) | `npm run new:theme <id>` | Có |
| Avatar | `src/cosmetics/avatars/<id>/` + `public/avatars/<id>/` | `avatar.ts` + ảnh 96 và 192 | `npm run new:avatar <id>` | Có; sau này để ảnh trên R2 thì không cần |
| Khung | `src/cosmetics/frames/<id>/` | `frame.ts` + ảnh 96 và 192 | `npm run new:frame <id>` | Như avatar |
| Scene đăng nhập | `src/features/login-scene/scenes/<id>/` | `scene.ts`, `scene.css`, `draw.ts` (tuỳ chọn) | `npm run new:scene <id>` | Có |
| Luật mở khóa mới | `src/cosmetics/unlock/<rule>.ts` | một hàm kiểm tra | thủ công | Có |

Ví dụ khai báo (kiểu được kiểm bởi `tsc`, thiếu token là lỗi biên dịch):

```ts
// src/cosmetics/themes/candy/theme.ts
export default defineTheme({
  id: "candy", name: "Kẹo ngọt", group: "sweet", scheme: "light",
  unlock: { type: "level", level: 15 },
  tokens: { bg: "#fff0f6", surface: "#ffffff", text: "#4a1d3b" /* …đủ bộ token */ },
  pattern: "dots", // tuỳ chọn: họa tiết nền
});

// src/cosmetics/avatars/mochi/avatar.ts  (ảnh: public/avatars/mochi/96.webp, 192.webp)
export default defineAvatar({
  id: "mochi", name: "Mochi", series: "Bánh ngọt",
  unlock: { type: "event", event: "tet-2027" }, durationDays: 30,
});
```

### Năm cơ chế giữ cho việc thêm mới an toàn

1. **Manifest có kiểu**: `defineTheme`, `defineAvatar`, `defineFrame`, `defineScene` kiểm đủ trường lúc biên dịch.
2. **Registry tự sinh**: `npm run gen:registry` (chạy trong `prebuild`) quét thư mục và sinh danh sách; một test đảm bảo thư mục khớp registry và id không trùng.
3. **Đồng bộ lên DB**: `npm run cosmetics:sync` (cùng kiểu `content:sync` đang có) ghi danh mục từ manifest vào bảng `cosmetics`. Manifest chỉ là giá trị mặc định; phần admin chỉnh được (bật/tắt, lịch, hạn dùng, điều kiện) nằm trong DB và chạy lại sync không ghi đè.
4. **Cổng kiểm tự động (CI)**: schema, id duy nhất, tương phản của theme và scene, ảnh avatar đủ hai kích cỡ và dưới ngân sách KB, có tên tiếng Việt. Không qua thì không merge.
5. **Trang `/admin/gallery`**: xem mọi theme, avatar, khung, scene cạnh nhau kèm kết quả kiểm, để nhìn bằng mắt trước khi bật cho người dùng.

### Token ngữ nghĩa thay cho màu thô

- Dựng một bộ token duy nhất: nền, bề mặt, chữ, chữ phụ, nhấn, chữ trên nhấn, đánh dấu, viền, bóng đáy, thành công, cảnh báo, nguy hiểm, họa tiết nền. Component chỉ dùng token, không dùng mã màu hay tên cũ (`--paper`, `--ink`). Phong cách vở ô ly trở thành theme `paper`.
- Theme là object TypeScript; CSS được sinh từ chính object đó, nên test tương phản chạy trên đúng dữ liệu đang dùng.
- Mỗi trang chỉ in CSS của **theme đang dùng**; thêm 20 theme không làm trang thường nặng hơn. Trang Bộ sưu tập nạp CSS của mọi theme, giới hạn bởi `[data-theme=<id>]`, để xem trước từng ô mà không đổi cả trang.

### Quy ước để không gãy dữ liệu

- `id` bất biến vì DB tham chiếu; đổi tên chỉ đổi `name`.
- Ngừng cung cấp = `active=false`, không xóa thư mục, người đã sở hữu vẫn thấy.
- `id` lạ (đã bị xóa khỏi code) → tự về mặc định; server luôn đối chiếu registry và DB trước khi cho trang bị.
- Luật mở khóa là kiểu hợp (`default`, `level`, `event`, `grant`), mỗi loại có một hàm kiểm trong một bảng ánh xạ; thêm loại mới là thêm một file.
- Avatar emoji cũ bỏ hẳn: migration đặt \`profiles.avatar\` về null cho mọi người dùng hiện có (một câu lệnh, chạy một lần), nên họ dùng avatar mặc định như người mới; không có lời mời, thông báo hay bộ “Cổ điển”.

## Dữ liệu, quyền quản trị và bảo mật

Theo đúng quy ước hiện có (RLS bật mọi bảng, trình duyệt không ghi được, mọi thao tác qua server bằng service\_role), cần một migration mới (số `0017`) gồm các bảng dưới đây. Đây là phác thảo để thống nhất ý tưởng, chưa phải SQL cuối.

| Bảng / cột | Nội dung chính | Ghi chú |
| --- | --- | --- |
| `profiles.role` | `user` (mặc định) hoặc `admin` | Đặt bằng SQL thủ công; không có API nào cho phép tự nâng quyền |
| `profiles.theme`, `profiles.frame` | Mã đang dùng (`avatar` giữ nguyên) | Server kiểm sở hữu trước khi ghi |
| `login_scenes` | key, tên, câu chào, `starts_at`, `ends_at`, `priority`, `pinned`, `motion_enabled`, `status` | Preset là mã trong code; bảng chỉ lưu lịch và tuỳ chọn |
| `cosmetics` | id, kind (theme/avatar/frame), tên, độ hiếm, `unlock` (jsonb: level, sự kiện, tay), `available_from/until`, duration\_days, `active` | Skin/SVG thật nằm trong code, DB chỉ điều khiển việc cấp |
| `user_cosmetics` | (user\_id, cosmetic\_id), source, granted\_at, `expires_at`, `seen_at` | `seen_at` để báo mở khóa đúng một lần |
| `seasonal_events` | key, tên, khoảng thời gian, danh sách cosmetic thưởng, điều kiện | Dùng lại cơ chế nhận thưởng của `quests` |
| `admin_audit` | ai, làm gì, lúc nào, trước/sau | Ghi mọi thay đổi của admin |

### Quyền và bảo mật

- `requireAdmin()` đặt cạnh `requireUser()`: đọc `role` từ DB ở server, không tin dữ liệu từ client; mọi trang `/admin/*` và server action đều gọi nó (proxy chỉ là lớp tiện lợi, giống cách `(app)` đang làm).
- Có giới hạn tốc độ cho thao tác admin và cho đổi skin/avatar (dùng `hitRateLimit` sẵn có).
- Preview Scene chỉ bật được khi đã đăng nhập là admin; người chưa đăng nhập không thấy Scene chưa đăng.
- CSP giữ nguyên: ảnh/SVG đặt trong `public/` hoặc R2, font tự host bằng `next/font/local`; không nới lỏng `img-src`.
- Dữ liệu từ admin chỉ là giá trị đã qua zod (enum Scene, ngày, văn bản ngắn); render bằng React nên tự thoát ký tự.
- Đo lường: ghi sự kiện `unlock`, `equip`, `scene_view` vào hệ thống analytics sẵn có (migration 0012/0013) để xem món nào được dùng.

## Lộ trình theo giai đoạn

Chia năm giai đoạn; mỗi giai đoạn đều phát hành được độc lập. Độ lớn: S ≤ 2 ngày, M 3–5 ngày, L 1–2 tuần (ước lượng thô, 1 dev).

| # | Giai đoạn | Làm gì | Xong khi | Cỡ |
| --- | --- | --- | --- | --- |
| 0 | Nền tảng | Bộ token ngữ nghĩa mới, registry + lệnh scaffold + gallery + test CI + bộ test giao diện Playwright/axe (Phần 4); hợp nhất `globals.css` và `app.css`; nạp font tự host; thêm `profiles.role` và `requireAdmin`; chuyển sang theme một trục (paper/dark) và dựng khung Avatar mới | Thêm được một theme thử chỉ bằng một thư mục + một lệnh, không sửa file nào khác; test và typecheck xanh | M |
| 1 | Đăng nhập mới + Scene | Thiết kế lại trang đăng nhập theo vở ô ly; `resolveScene`; engine canvas + 3 scene (mặc định, Halloween, Giáng sinh); `/admin/scenes` có xem trước | Admin đổi Scene và thấy hiệu lực dưới 1 phút; đạt tương phản 4.5:1 ở 375px | L |
| 2 | Theme + avatar theo level | Migration cosmetics; theme một trục (gồm Dark); màn hình chọn có trạng thái khóa, dùng thử; đồng bộ quyền khi lên level; thông báo mở khóa | Lên level mở đúng món, đổi skin không nháy | L |
| 3 | Sự kiện + hạn dùng | `seasonal_events`, nhận thưởng, khung avatar, đếm ngày còn lại, tự trả về mặc định khi hết hạn; `/admin/events` | Sự kiện chạy trọn vòng đời trên máy thử (nhận, hết hạn, nhận lại) | L |
| 4 | Hoàn thiện | Quét trọn trợ năng (bàn phím, screen reader), hiệu năng (LCP trang đăng nhập), thêm Scene Tết, Trung thu, Khai giảng; chọn màu nhấn | Qua checklist bên dưới | M |

Checklist trước khi phát hành mỗi giai đoạn: chữ đạt 4.5:1 ở cả sáng/tối và mọi skin; focus nhìn thấy; ô bấm từ 44px; kiểm ở 375, 768, 1024, 1440px; `prefers-reduced-motion` tắt hết chuyển động trang trí; không có emoji làm biểu tượng; không tăng CLS (giữ chỗ cho minh họa).

## Câu hỏi cần bạn chốt

Đã chốt phần lớn; còn 3 điểm mở, mỗi điểm có mặc định mình sẽ làm nếu bạn không đổi.

| Câu hỏi | Quyết định |
| --- | --- |
| Hạn dùng | Hỗ trợ cả hai: vật phẩm vĩnh viễn và có thời hạn (30, 60 ngày…); sự kiện giới hạn thời gian nhận |
| Mức tùy chỉnh theme | Theme có sẵn ở giai đoạn 2, sẽ có nhiều loại (kẹo ngọt, ma mị…) theo cơ chế theme pack; màu nhấn giới hạn ở giai đoạn 4 |
| Quyền quản trị | Một vai trò admin duy nhất |
| Lịch mùa | Admin tự đặt |
| Đồ họa và nguồn avatar | Đã có họa sĩ/bộ ảnh có bản quyền |
| Biểu cảm avatar | Bỏ |
| Đăng nhập tương tác | Dùng kiến trúc engine + scene của bạn, kèm 8 điều chỉnh ở Phần 1 |
| Hồ sơ năng lực | Để chung với tab Học (mục con), giữ 4 tab; chưa tách tab Tiến bộ |
| Phạm vi làm lại | Xây lại toàn bộ tầng giao diện; giữ lõi logic, backend và API đã có test (chi tiết ở Phần 4) |
| Avatar emoji cũ | Bỏ; người dùng cũ được đưa về avatar mặc định, không có lời mời hay thông báo |

- [ ] **Định dạng họa sĩ giao**: ảnh WebP/PNG hay vector SVG, và khung có xuất riêng một lớp không? (Mặc định: ảnh từ 512px, khung riêng.)
- [ ] **Món hết hạn rồi nhận lại**: tính lại từ ngày nhận mới hay cộng dồn? (Mặc định: tính lại, không cộng dồn.)
- [ ] **Vùng sáng hiện mật khẩu**: đồng ý đây chỉ là cách bật thêm bên cạnh nút Hiện, mật khẩu vẫn là ô nhập thật? (Mặc định: có.)

Bước tiếp theo hợp lý: mình dựng mockup trang đăng nhập (mặc định, Halloween), màn hình Tôi và Bộ sưu tập để bạn duyệt trước khi code.
