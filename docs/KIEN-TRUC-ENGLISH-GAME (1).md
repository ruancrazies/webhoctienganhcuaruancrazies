# Kiến trúc: English Game

> Next.js + TypeScript + Supabase (PostgreSQL) · Vercel · Cloudflare (DNS; R2 về sau)
> Nguồn nội dung là **Google Sheet**, đồng bộ vào Postgres bằng `content:sync` qua CSV.

```
✅ Yêu cầu đã phân tích            (mục 1)
✅ Kiến trúc đã thiết kế           (mục 2)
✅ Mô hình dữ liệu                 (mục 3)
✅ Đặc tả game & quy tắc           (mục 4)
✅ Pseudo-code & hợp đồng dữ liệu  (mục 5)
✅ Hiệu năng, bảo mật, vận hành    (mục 6)
✅ Kế hoạch thực thi               (mục 7)
⏳ Chờ xác nhận các giả định       (mục 8)
```

---

## 1. Phân tích yêu cầu

**Mục tiêu:** ứng dụng web học tiếng Anh tích hợp trò chơi cho người Việt: người học vừa **học từ vựng theo cấp** (xem từ, nghĩa, phiên âm, câu ví dụ) vừa chơi nhiều trò chơi từ vựng/ngữ pháp, hệ thống nhớ tiến độ từng từ theo lịch ôn tập, có XP, chuỗi ngày học, bảng xếp hạng và mở khóa theo cấp độ A1→C1.

**Quy mô dữ liệu và người dùng**
- Trên **200.000 mục từ**, kèm **kho câu ví dụ thật** (nhiều câu cho mỗi từ, đa dạng kiểu câu: khẳng định, phủ định, nghi vấn, điều kiện, bị động…), và câu hỏi ngữ pháp.
- **10–15 người dùng mỗi ngày.** Tải rất nhỏ; thách thức chính là **kích thước dữ liệu** (không được quét toàn bộ bảng từ ở bất kỳ request nào).

**Input**
- *Nội dung:* **Google Sheet** (sáu tab từ vựng theo cấp `A1`…`C2`, tab câu, ngữ pháp, chủ đề, lĩnh vực). Thêm/bớt/sửa từ ngay trên Sheet.
- *Người dùng:* đăng ký/đăng nhập bằng email, câu trả lời trong từng vòng chơi.

**Output**
- Danh sách từ để học (phân trang theo cấp/chủ đề, kèm câu ví dụ); câu hỏi cho từng trò chơi; kết quả vòng chơi (XP, tiến độ, chuỗi ngày, điểm cao); bảng xếp hạng; trạng thái mở khóa các cấp.

**Stack đã chốt**

| Lớp | Lựa chọn |
|---|---|
| Ứng dụng | Next.js (App Router) + TypeScript, chạy trên **Vercel** |
| Cơ sở dữ liệu | **Supabase PostgreSQL** |
| Đăng nhập | **Supabase Auth** (email + mật khẩu, xác nhận bằng mã) |
| Gửi mail | **Google Apps Script** (Gmail của chủ dự án), nối vào Supabase qua **Send Email Hook** |
| Tên miền | **Cloudflare DNS** (bản ghi trỏ về Vercel để *DNS only*) |
| Ảnh/âm thanh | Cloudflare R2 — **mở rộng sau** (đợt đầu chỉ dùng giọng đọc của trình duyệt và âm hiệu ứng tạo bằng Web Audio, không có file) |
| Kiểm tra dữ liệu vào | Zod |
| Test | Vitest (logic thuần) + Supabase local (tích hợp) |

**Trong phạm vi**
- Chế độ Học từ vựng (mục 4.5), 10 trò chơi (mục 4.1), SRS cho từng từ, XP, chuỗi ngày, bảng xếp hạng, khóa/mở cấp.
- **Bài kiểm tra lên cấp** (mục 4.6): muốn mở cấp kế tiếp phải thi đạt cấp hiện tại; server ra đề và chấm.
- Nội dung nằm trong Google Sheet, tách riêng khỏi code, đồng bộ vào DB bằng script `content:sync`.
- Server tự phát câu hỏi và tự chấm điểm (không tin kết quả do trình duyệt tự báo).
- Tên miền riêng trên Cloudflare.

**Ngoài phạm vi (đợt này)**
- Ảnh minh họa và file giọng đọc (R2) — thiết kế để sẵn chỗ, chưa làm.
- Kiểm tra *nội dung* (nghĩa, câu, CEFR): chủ dự án tự lo. Hệ thống chỉ kiểm tra *định dạng* khi nạp.
- Ứng dụng di động gốc, chế độ đối kháng nhiều người chơi, thanh toán.
- Câu sinh theo mẫu (chỉ dùng kho câu thật).
- Danh sách yêu thích, bài học có thứ tự riêng; phát dữ liệu học dưới dạng JSON tĩnh / Cloudflare Pages (xem ADR-6).
---

## 2. Thiết kế kiến trúc

### 2a. Cấu trúc thư mục

**Google Sheet là nguồn sự thật của mọi nội dung.** Ứng dụng không đọc thẳng từ Sheet (Sheets API có giới hạn lượt đọc, chậm, không có index); script `content:sync` kéo Sheet về, kiểm tra định dạng rồi upsert vào Postgres. Thư mục `content/` trong repo chỉ còn cấu hình và bản sao lưu.

**Các tab của Sheet** (hàng 1 là tiêu đề cột; tên cột là hợp đồng với script):

| Tab | Nội dung | Cột bắt buộc | Cột tùy chọn |
|---|---|---|---|
| `A1` `A2` `B1` `B2` `C1` `C2` | từ vựng, **mỗi cấp một tab** (cùng một bộ cột) | `key, en, vi, pos, cefr, domain, topics` | `vi_alt, ipa, rank, note` |
| `sentences` | kho câu thật | `key, en, words` | `vi, kind, cefr, source, note` |
| `grammar` | câu hỏi ngữ pháp | `key, level, question, options, answer` | `topic, explanation, note` |
| `topics` | chủ đề | `slug, title, cefr, domain` | `emoji, sort` |
| `domains` | lĩnh vực | `code, title` | `emoji` |
| `Nguon_va_ghi_chu` | ghi chú nguồn | — | **không nạp** (mọi tab không có trong `sheet.config.json` đều bị bỏ qua) |

- Tên các tab từ vựng nằm trong `sheet.config.json` (`wordTabs`), cùng `gid` của từng tab. Cột `cefr` trong tab phải **khớp tên tab** (tab `B2` chỉ chứa `cefr = B2`).
- Cột thừa ngoài danh sách trên (ví dụ `Specialized vocabulary`) bị **cảnh báo và bỏ qua**; cột bắt buộc thiếu hoặc sai tên là **lỗi**.
- Sheet **không có cột `status`**: mọi dòng trên Sheet là `active` (mục 3.4). Nếu sau này cần ẩn tạm một từ thì thêm cột `status` tùy chọn, sync đã hỗ trợ sẵn.

```
english-game/
├── content/                              # CẤU HÌNH + SAO LƯU (không còn là nguồn chính)
│   ├── README.md                         # quy ước các tab/cột, cách thêm/sửa/ngừng dùng từ
│   ├── taxonomy/
│   │   └── levels.yml                    # A1..C1, tỉ lệ được vào thi, cấu hình bài kiểm tra (giữ trong repo)
│   ├── sheet.config.json                 # sheetId, tên tab, ánh xạ cột (không chứa khóa bí mật)
│   ├── import/                           # (tùy chọn) CSV tải tay, dùng với `sync --from-dir`; không commit
│   ├── backup/                           # JSONL do export.ts dump định kỳ, commit để có diff/khôi phục
│   ├── media/                            # (SAU) audio/ + image/, không commit
│   └── sources/                          # dữ liệu thô, không commit; có SOURCES.md
│
├── scripts/content/                      # công cụ nội dung (chạy trên máy bạn)
│   ├── sheet.ts                          # tải CSV từng tab (hoặc đọc thư mục CSV với --from-dir) → mảng bản ghi (có tab + số dòng gốc)
│   ├── validate.ts                       # kiểm tra ĐỊNH DẠNG (báo tab + số dòng)
│   ├── stats.ts                          # đếm theo cefr × domain × pos
│   ├── sync.ts                           # Sheet → validate → diff → upsert vào Postgres (--dry-run)
│   ├── export.ts                         # xuất DB ra JSONL (sao lưu)
│   ├── genkeys.ts                        # điền cột `key` cho dòng mới trên Sheet (một lần/dòng; đếm số thứ tự trên MỌI tab từ vựng)
│   └── media-sync.ts                     # (SAU) đẩy file lên R2
│
├── supabase/
│   ├── migrations/                       # 0001_schema.sql, 0002_rls.sql, 0003_functions.sql
│   ├── tests/                            # kiểm thử SQL/tích hợp
│   └── config.toml
│
├── src/
│   ├── app/                              # Next.js App Router (giao diện + Route Handlers)
│   │   ├── (auth)/ login, register, forgot, reset
│   │   ├── (app)/
│   │   │   ├── page.tsx                  # trang chủ: cấp độ, chủ đề, chuỗi ngày
│   │   │   ├── level/[cefr]/             # chọn lĩnh vực/chủ đề của một cấp
│   │   │   ├── learn/[cefr]/             # chế độ Học: danh sách từ + thẻ chi tiết, phân trang
│   │   │   ├── exam/[cefr]/              # bài kiểm tra lên cấp: điều kiện thi, làm bài, kết quả
│   │   │   ├── play/[game]/              # màn chơi
│   │   │   ├── leaderboard/
│   │   │   └── profile/
│   │   └── api/
│   │       ├── play/start/route.ts
│   │       ├── play/finish/route.ts
│   │       ├── home/route.ts
│   │       ├── leaderboard/route.ts
│   │       ├── words/search/route.ts
│   │       ├── learn/words/route.ts      # danh sách từ để học (phân trang keyset)
│   │       ├── learn/mark/route.ts       # đánh dấu "đã học"
│   │       ├── exam/start/route.ts       # bắt đầu (hoặc tiếp tục) bài thi lên cấp
│   │       ├── exam/submit/route.ts      # nộp bài, server chấm
│   │       └── auth/send-email/route.ts  # Send Email Hook
│   │
│   ├── core/                             # LOGIC THUẦN — không biết gì về DB/HTTP, test được ngay
│   │   ├── srs.ts                        # nextSrsState()
│   │   ├── levels.ts                     # levelStatus() từ số liệu đếm
│   │   ├── rules.ts                      # GAME_RULES, hằng số (XP, cap, INTERVALS)
│   │   ├── questions.ts                  # dựng câu hỏi, đáp án nhiễu
│   │   ├── grading.ts                    # chấm từng loại câu trả lời + tính điểm Blitz từ chuỗi trả lời
│   │   ├── exam.ts                       # cấu hình đề thi, điều kiện được thi/qua, giờ chờ & giới hạn lượt
│   │   ├── streak.ts                     # chuỗi ngày theo giờ Việt Nam
│   │   └── text.ts                       # chuẩn hóa chữ khi so khớp (norm, lev)
│   │
│   ├── server/                           # nối core với thế giới bên ngoài
│   │   ├── db.ts                         # tạo client Supabase (server)
│   │   ├── repo/                         # truy cập dữ liệu: words, progress, rounds, profiles
│   │   ├── services/                     # startRound, finishRound, home, leaderboard, learn, exam
│   │   ├── auth/                         # lấy người dùng từ phiên, kiểm tra chữ ký hook
│   │   ├── ratelimit.ts                  # giới hạn tần suất, đếm trong Postgres (bảng rate_limits)
│   │   └── mail.ts                       # sendMail() → Apps Script (dự phòng: Resend khi đặt RESEND_API_KEY)
│   │
│   ├── games/                            # 10 trò chơi (React client components)
│   │   ├── registry.ts                   # danh sách trò + cách lấy dữ liệu
│   │   ├── shell/                        # khung chung: tiến trình, kết quả, âm thanh
│   │   └── flash.tsx, match.tsx, type.tsx, scramble.tsx, cloze.tsx,
│   │       listen.tsx, blitz.tsx, build.tsx, tf.tsx, quiz.tsx
│   ├── components/                       # UI dùng chung
│   ├── lib/                              # tiện ích client: speak(), sfx(), format
│   └── types/                            # database.ts (sinh tự động) + hợp đồng API
│
├── tests/                                # unit (core/) + tích hợp (services/)
├── .env.example
└── package.json
```

### 2b. Luồng dữ liệu

**Đồng bộ nội dung (chạy trên máy chủ dự án, ngoài ứng dụng):**
```
[Google Sheet] → [sheet.ts: CSV từng tab] → [validate: định dạng] → [COPY vào bảng tạm]
                                                 ↓ (lỗi: tab + số dòng)      ↓
                                              [dừng]                [so sánh theo key: thêm/sửa/đổi trạng thái]
                                                          ↓ (--dry-run dừng ở đây)
                                           [upsert theo key, lô 5.000 dòng]
                                                          ↓
                                        [làm mới content_stats] → [ghi content_imports]
```

**Một vòng chơi:**
```
[Trình duyệt] → POST /play/start {game, scope, n}
      │
      ▼
[Route Handler] → xác thực phiên → [services.startRound]
      │               ├─ kiểm tra cấp đã mở? (levels.ts ← user_level_stats + content_stats + level_passes)
      │               ├─ chọn từ: đến hạn ôn → từ mới → bổ sung (repo.pickWords, dùng index)
      │               ├─ dựng câu hỏi + đáp án nhiễu (questions.ts ← repo.pickDistractors)
      │               └─ lưu vòng + đáp án vào game_rounds
      ▼
[Trình duyệt] ← {roundId, items (không kèm đáp án đúng, trừ trò cần)}
      │   người chơi trả lời…
      ▼
[Trình duyệt] → POST /play/finish {roundId, answers[]}
      │
      ▼
[services.finishRound]
      ├─ khóa vòng (chỉ kết thúc được một lần)
      ├─ chấm (grading.ts) → đúng/sai từng câu
      ├─ tính trạng thái SRS mới từng từ (srs.ts) + XP + thưởng
      └─ ghi MỘT lần, nguyên tử: RPC apply_round_result
              (progress, bộ đếm, xp, chuỗi ngày, điểm cao, grammar_stats)
      ▼
[Trình duyệt] ← {xp_gained, perfect, streak, review_list, board?}
```

**Chế độ Học:**
```
[Trình duyệt] → GET /api/learn/words?cefr=B2&topic=food-drink&cursor=…
      ▼
[services.learn.list] → kiểm tra cấp đã mở → repo.listWordsByRank (keyset, 30 từ/trang)
      ├─ repo.progressFor (≤30 từ, PK user_id+word_id) → trạng thái Mới/Đã học/Cần ôn/Đã thuộc
      └─ repo.examplesFor (sentence_words, ≤3 câu/từ)
      ▼
[Trình duyệt] ← {items[], nextCursor}
      │   người học bấm "Đã học"
      ▼
[Trình duyệt] → POST /api/learn/mark {wordIds[≤50]} → RPC mark_learned (một giao dịch)
```

**Bài kiểm tra lên cấp:**
```
[Trình duyệt] → POST /api/exam/start {cefr}
      ▼
[services.exam.start]
      ├─ cấp này phải ĐANG MỞ (mọi cấp trước đã có trong level_passes) và CHƯA qua → không thi nhảy cấp
      ├─ đủ điều kiện vào thi: tổng từ general "đã học" từ A1 đến cấp này ≥ ngưỡng số từ tối thiểu của cấp (levels.yml, mục 4.3)
      ├─ đang có bài thi dở, chưa hết giờ → trả lại đúng bài đó (không tính thêm lượt)
      ├─ chưa quá 3 lượt trong ngày (giờ VN) và đã qua 1 giờ kể từ lần trượt gần nhất của cấp này
      ├─ dựng đề (20 từ + 10 ngữ pháp) → lưu level_exams (kèm đáp án, hạn nộp)
      ▼
[Trình duyệt] ← {examId, items (không kèm đáp án), expiresAt}
      │   làm bài… (đếm ngược 20 phút)
      ▼
[Trình duyệt] → POST /api/exam/submit {examId, answers[]}
      ▼
[services.exam.submit] → khóa bài thi → chấm → RPC apply_exam_result
      │   (đạt: ghi level_passes → cấp kế tiếp mở; trượt: ghi giờ được thi lại)
      ▼
[Trình duyệt] ← {passed, scoreTotal, scoreVocab, scoreGrammar, review[], nextAttemptAt?, attemptsLeftToday}
```

**Gửi mail xác nhận:**
```
[Người dùng đăng ký/quên mật khẩu] → [Supabase Auth]
      → POST /api/auth/send-email (Send Email Hook, có chữ ký)
      → [kiểm tra chữ ký] → [dựng nội dung mail tiếng Việt từ email_action_type + token]
      → [Apps Script webhook] → Gmail → [Người dùng]
      (lỗi → trả lỗi cho Auth; giao diện báo "thử lại sau")
```

### 2c. Danh sách module

| Module | Trách nhiệm | Nhận vào | Trả ra | Phụ thuộc |
|---|---|---|---|---|
| `core/srs` | Tính trạng thái SRS mới của một từ sau một lần trả lời | `SrsState`, `correct`, `now` | `SrsState` mới | `rules` |
| `core/levels` | Tính trạng thái các cấp (đạt/mở khóa) từ số liệu đếm | `LevelCounters[]`, cấu hình cấp | `LevelStatus[]` | `rules` |
| `core/questions` | Dựng câu hỏi cho từng trò từ từ/câu/đáp án nhiễu | `game`, `Word[]`, `Distractors`, `Sentence[]` | `Question[]` | `text` |
| `core/grading` | Chấm câu trả lời so với đáp án đã lưu | `StoredItem`, `Answer` | `{correct, near?}` | `text` |
| `core/exam` | Cấu hình đề, điều kiện được thi, điều kiện qua, tính giờ chờ & lượt còn lại trong ngày | `ExamConfig`, `LevelStatus`, lịch sử lượt thi, `now` | `{canStart, reason?, nextAt?, attemptsLeft}` / `{passed, scores}` | `rules`, `streak` |
| `core/streak` | Tính chuỗi ngày theo giờ Việt Nam | `lastDay`, `streak`, `nowUtc` | `{streak, best, lastDay}` | — |
| `server/repo` | Mọi truy vấn DB (đều đi qua index, có LIMIT) | tham số tìm kiếm | dữ liệu thô | `db` |
| `server/services/startRound` | Điều phối: kiểm tra mở khóa → chọn → dựng → lưu vòng | `StartRequest`, `userId` | `StartResponse` | `core/*`, `repo` |
| `server/services/finishRound` | Chấm vòng, tính SRS/XP, ghi nguyên tử | `FinishRequest`, `userId` | `FinishResponse` | `core/*`, `repo` |
| `server/services/learn` | Liệt kê từ để học (phân trang) và đánh dấu "đã học" | `scope`, `cursor`, `wordIds`, `userId` | `LearnPage` / `ok` | `core/srs`, `core/levels`, `repo` |
| `server/services/exam` | Bắt đầu/tiếp tục bài thi, chấm và ghi kết quả | `cefr`, `examId`, `answers[]`, `userId` | `ExamStartResponse` / `ExamResult` | `core/exam`, `core/questions`, `core/grading`, `repo` |
| `server/auth` | Lấy người dùng từ phiên; kiểm tra chữ ký hook | request | `UserId` / lỗi | Supabase |
| `server/mail` | Gửi mail qua Apps Script | `{to, subject, html}` | `ok` / lỗi | biến môi trường |
| `games/*` | Giao diện từng trò, gọi `shell` để bắt đầu/kết thúc vòng | `Question[]` | danh sách `Answer` | `shell` |
| `scripts/content/*` | Tải Sheet, kiểm tra định dạng, đồng bộ, xuất sao lưu | tab của Google Sheet | bản ghi trong DB | Zod, Postgres, Google Sheets |

### 2d. Quyết định kiến trúc (ADR)

```
ADR-1: Trình duyệt KHÔNG truy cập bảng DB trực tiếp; mọi thao tác đi qua mã server của Next.js
Lý do: server phát câu hỏi và chấm điểm nên không thể gian lận XP; khóa service_role chỉ ở server;
       RLS vẫn bật làm lớp phòng thủ thứ hai.
Đánh đổi: thêm một lớp API phải viết; mỗi thao tác tốn một lượt gọi server (chấp nhận được ở quy mô này).
```

```
ADR-2: Logic nghiệp vụ (SRS, mở khóa, chấm, dựng câu hỏi) viết thành HÀM THUẦN trong src/core;
       DB chỉ thực hiện một hàm ghi nguyên tử apply_round_result
Lý do: test được ngay không cần DB; không bị trùng logic ở hai nơi (TypeScript và SQL).
       SQL chỉ lo phần nó giỏi: khóa dòng, cập nhật hàng loạt, tính chênh lệch bộ đếm.
Đánh đổi: server phải đọc trạng thái hiện tại của tối đa vài chục từ trong vòng trước khi ghi;
          cần khóa vòng chơi để hai lần kết thúc đồng thời không ghi trùng.
```

```
ADR-3: Nội dung nằm trong Google Sheet (nguồn để soạn); Postgres là bản sao để truy vấn, đồng bộ bằng script (upsert theo key ổn định)
Lý do: thêm/bớt/sửa từ ngay trên bảng tính, không cần import file; Sheet có version history và phân quyền sẵn;
       key ổn định giúp tiến độ người dùng không bao giờ mồ côi khi sửa nội dung.
       Không đọc Sheet lúc chạy vì: giới hạn lượt đọc của Sheets API, độ trễ, không có index/cột rand/bộ đếm.
Đánh đổi: sửa trên Sheet chưa có hiệu lực cho tới khi chạy sync; mất diff của git (bù bằng version history + backup JSONL);
          phải bảo vệ cột `key` và kiểm tra định dạng vì Sheet cho phép gõ tự do.
```

```
ADR-4: Chọn ngẫu nhiên bằng cột `rand` có index và bộ đếm có sẵn, thay vì ORDER BY RANDOM() / COUNT(*)
Lý do: với 200k từ, quét toàn bảng cho mỗi request là điều cần tránh nhất.
Đánh đổi: bộ đếm phải được giữ đúng (cập nhật cùng giao dịch ghi tiến độ; làm mới sau mỗi lần nạp nội dung).
```

```
ADR-5: Supabase Auth + Send Email Hook gửi qua Apps Script, thay vì tự viết đăng nhập
Lý do: không tự quản mật khẩu/phiên/mã xác nhận; vẫn dùng Gmail của chủ dự án để gửi mail.
Đánh đổi: phụ thuộc Apps Script (chậm vài giây, ~100 người nhận/ngày); phải bảo vệ endpoint hook bằng chữ ký.
```


```
ADR-6: Từ vựng chia 6 tab theo cấp; CSV UTF-8 là định dạng trung gian; chỉ host trên Vercel
Lý do: tab theo cấp nhẹ hơn cho Google Sheets (200k dòng trong một tab rất chậm) và hợp cách soạn theo cấp;
       CSV từng tab là định dạng đơn giản nhất cho script; web đọc từ Postgres để có index, phân trang, tìm kiếm.
       Không phát JSON tĩnh và không dùng Cloudflare Pages: sẽ có hai nguồn dữ liệu phải giữ đồng bộ,
       không tìm kiếm được, và không cần thiết với 10–15 người dùng mỗi ngày.
Đánh đổi: sync phải gộp nhiều tab, kiểm tra `cefr` khớp tên tab và `key` duy nhất xuyên tab.
          Cloudflare chỉ giữ DNS (và R2 về sau).
```

```
ADR-7: Chế độ Học dùng chung SRS với game; học chỉ đưa từ lên level 1
Lý do: một nguồn tiến độ duy nhất; từ đã học tự vào hàng "đến hạn ôn" của các trò chơi;
       học không cộng XP và không thể tạo "thuộc ảo" (level ≥ 3 chỉ đạt qua trò chơi).
Đánh đổi: chưa có khái niệm bài học riêng hay danh sách yêu thích (ngoài phạm vi đợt này).
```

```
ADR-8: Mở khóa cấp bằng BÀI KIỂM TRA do server ra đề và chấm, không dùng số từ "thuộc"
Lý do: "thuộc" (đúng 3 lần liên tiếp) có thể đạt bằng cách chơi dễ trong một buổi nên không phản ánh trình độ;
       đề lấy ngẫu nhiên từ toàn bộ từ general của cấp (cột rand), đáp án nằm ở server (level_exams) nên không giả mạo được;
       giờ chờ + 3 lượt/ngày + hạn nộp khiến không thể thử đi thử lại hoặc tra cứu lâu.
Đánh đổi: thêm 2 bảng, 2 API, 1 trang; người học phải đạt vốn từ tối thiểu của cấp (mục 4.3) mới được thi;
          kết quả thi KHÔNG ghi vào SRS (tránh biến một bài thi thành "thuộc ảo").
```

```
ADR-9: Giới hạn tần suất đếm trong Postgres, không dùng bộ nhớ tiến trình
Lý do: hàm Vercel là serverless, mỗi request có thể chạy ở instance khác nên bộ nhớ trong không giữ được bộ đếm.
Đánh đổi: mỗi lần kiểm tra thêm một truy vấn nhỏ (PK ngắn, vài chục dòng/người) — chấp nhận được ở 10–15 người dùng/ngày.
```

---

## 3. Mô hình dữ liệu

Mọi nội dung có `key` chuỗi ổn định (ví dụ `abandon:v:1`) để Sheet và DB khớp nhau. Mọi bảng nội dung ở DB có `status` (`active` / `draft` / `retired`): **không xóa**, chỉ đổi trạng thái. Sheet không có cột `status`; sync đặt `active` cho mọi dòng trên Sheet và `retired` cho key bị gỡ khỏi Sheet (khi có `--retire-missing`).

### 3.1 Nội dung (chỉ đọc từ phía ứng dụng)

| Bảng | Cột chính | Index |
|---|---|---|
| `domains` | `code` (PK), `title`, `emoji` | — |
| `topics` | `id`, `slug` (duy nhất), `title`, `emoji`, `cefr`, `domain`, `sort` | `(cefr, domain)` |
| `words` | `id`, `key` (duy nhất), `en`, `pos`, `vi`, `vi_alt[]`, `ipa`, `cefr`, `freq_rank` (trống trên Sheet → `1000000000`), `domain`, `quality` (chỉ ghi chú), `status`, **`rand`** (số thực ngẫu nhiên cố định), `has_audio`, `has_image`, `media_version` (3 cột cuối để sẵn, chưa dùng) | `(cefr, domain, rand)` lọc `status='active'` · `(cefr, domain, freq_rank, id)` (danh sách học) · `(pos, cefr, rand)` · gin trigram trên `en` |
| `word_topics` | `topic_id`, `word_id` (PK ghép) | `(word_id)` |
| `sentences` | `id`, `key`, `en`, `vi`, `cefr`, **`kind`** (statement / negative / question / conditional / passive…), `source`, `status`, `has_audio` | `(cefr, kind)` |
| `sentence_words` | `word_id`, `sentence_id` (PK ghép) | `(sentence_id)` |
| `grammar_questions` | `id`, `key`, `level`, `topic`, `question`, `options` (JSON), `answer`, `explanation`, `status`, **`rand`** (cố định như `words`) | `(level, topic)` · `(level, rand)` lọc `status='active'` |
| `content_stats` | `cefr`, `domain`, `topic_id?`, `word_count` | duy nhất `(cefr, domain, topic_id)` |
| `content_imports` | lịch sử mỗi lần sync: thời điểm, `sheet_revision`/hash, số thêm/sửa/ngừng dùng | — |

### 3.2 Người dùng và tiến độ

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `username` (không phân biệt hoa thường, duy nhất), `xp`, `streak`, `best_streak`, `last_day`, `xp_today`, `xp_day` | tạo tự động khi có người dùng mới; index `(xp desc)`; `xp_today`/`xp_day` = XP đã nhận trong ngày VN (để chặn cày XP) |
| `user_word_progress` | `user_id`, `word_id`, **`cefr`, `domain`** (sao chép từ `words` khi ghi), `level` 0–5, `bad`, `next_review`, `updated_at` | PK `(user_id, word_id)`; index `(user_id, cefr, domain, next_review)` — lọc từ đến hạn theo phạm vi mà không cần join |
| `user_level_stats` | `user_id`, `cefr`, `domain`, `learned`, `mastered` | bộ đếm có sẵn, cập nhật cùng giao dịch ghi tiến độ |
| `grammar_stats` | `user_id`, `level`, `correct`, `total` | chỉ để hiển thị thống kê, **không còn dùng để mở khóa** (mục 4.3) |
| `game_scores` | `user_id`, `game` (vd `blitz:B1`), `best`, `plays` | index `(game, best desc)` |
| `game_rounds` | `id` (uuid), `user_id`, `game`, `items` (JSON: câu hỏi + đáp án đúng), `created_at` (= giờ bắt đầu), `finished_at` | khóa vòng chơi, chống nộp hai lần; `created_at` dùng kiểm tra thời gian tối thiểu |
| `level_exams` | `id` (uuid), `user_id`, `cefr`, `items` (JSON: câu hỏi + đáp án đúng), `started_at`, `expires_at`, `finished_at`, `score_total`, `score_vocab`, `score_grammar`, `passed` | mỗi lượt thi một dòng; index `(user_id, started_at desc)`; ràng buộc: **tối đa một bài chưa kết thúc cho mỗi người** (unique partial index `WHERE finished_at IS NULL`) |
| `level_passes` | `user_id`, `cefr`, `passed_at`, `score`, `exam_id` | PK `(user_id, cefr)`; **nguồn duy nhất** quyết định cấp nào đã qua/mở |
| `rate_limits` | `key` (vd `play-start:<user>`, `login:<ip>`), `window_start`, `count` | PK `(key, window_start)`; hàm `hit_rate_limit(key, window, max)` tăng và trả về cho phép/không; dọn dòng cũ khi ghi |

### 3.3 Bảo mật dữ liệu
- RLS bật trên mọi bảng. Bảng nội dung: chỉ đọc cho người đã đăng nhập. Bảng người dùng: chỉ đọc dòng của chính mình. **Không có quyền ghi từ phía trình duyệt.**
- Ghi tiến độ chỉ qua hàm `apply_round_result` chạy với quyền server.
- `level_exams` **không cho trình duyệt đọc** (chứa đáp án); `level_passes` chỉ đọc dòng của chính mình; ghi qua `apply_exam_result` (quyền server). `rate_limits` chỉ server truy cập.

### 3.4 Ánh xạ Google Sheet → bảng DB

**Các tab từ vựng `A1`…`C2` → `words`** (+ `word_topics`)

| Cột Sheet | Cột DB | Bắt buộc | Quy tắc |
|---|---|---|---|
| `key` | `key` | ✔ | Xem quy tắc `key` bên dưới |
| `en` | `en` | ✔ | Dạng gốc của từ (nên tránh dạng biến thể như `drinks`, `cooked` nếu đã có từ gốc) |
| `vi` | `vi` | ✔ | **Một nghĩa chính, ngắn gọn** (dùng làm đáp án trắc nghiệm). Nếu chứa `;` thì validate cảnh báo: chuyển phần sau sang `vi_alt` |
| `vi_alt` | `vi_alt[]` | | Các nghĩa phụ, ngăn cách bằng `;` |
| `pos` | `pos` | ✔ | Nằm trong danh sách cho phép (khai báo trong schema Zod, ví dụ `n`, `v`, `adj`, `adv`…) |
| `ipa` | `ipa` | | Phiên âm |
| `cefr` | `cefr` | ✔ | `A1`–`C2`, **phải khớp tên tab** |
| `domain` | `domain` | ✔ | **Đúng một** `code` có trong tab `domains` (xem bên dưới) |
| `topics` | `word_topics` | ✔ | Một hoặc nhiều `slug`, ngăn cách bằng `,`; phải có trong tab `topics` |
| `rank` | `freq_rank` | | Số nguyên; **thứ tự học trong cấp** (nhỏ = học trước). Để trống → `1000000000`, tức xếp sau, theo thứ tự dòng khi nạp lần đầu |
| `note` | — | | Không nạp, chỉ để người soạn tham khảo |

**`domain` và `topics` khác nhau**

| | `domain` | `topics` |
|---|---|---|
| Ý nghĩa | Từ thuộc **lĩnh vực/chuyên ngành** nào | Từ nằm trong **chủ đề** nào |
| Số giá trị mỗi từ | Đúng 1 | Một hoặc nhiều |
| Ví dụ | `general`, `medicine`, `it` | `food-drink`, `home-objects` |
| Ảnh hưởng | Chọn phạm vi chơi/học; **chỉ `general` tính cho điều kiện qua cấp** (G5) | Chọn phạm vi chơi/học theo chủ đề |

**Quy tắc `key`**
- Dạng `en:pos:n`, **chữ thường**; khoảng trắng trong `en` đổi thành `-`; `en` không chứa dấu `:`. Ví dụ `slice:v:1`, `ice-cream:n:1`.
- `n` là số thứ tự phân biệt các dòng cùng `en` + `pos` nhưng **khác nghĩa**, bắt đầu từ 1 (`bank:n:1` ngân hàng, `bank:n:2` bờ sông). Cùng `en` nhưng khác `pos` thì đều là `:1` (`jam:n:1`, `jam:v:1`).
- **Giá trị tĩnh, không phải công thức Sheet.** Do `genkeys.ts` điền một lần cho dòng chưa có key; script đếm số thứ tự trên **tất cả** tab từ vựng nên không trùng.
- **Duy nhất xuyên mọi tab từ vựng.** Chuyển từ sang cấp khác = chuyển dòng sang tab mới, sửa cột `cefr`, **giữ nguyên `key`**.
- Không sửa tay; cột `key` được bảo vệ (protected range).

**Quy tắc đồng bộ**
- Sync đọc mọi tab trong `wordTabs`, gộp lại rồi so với DB theo `key`.
- **Mọi dòng trên Sheet là `active`.** Muốn bỏ một từ khỏi game: xóa dòng trên Sheet rồi chạy `sync --retire-missing`. DB chỉ đánh dấu `retired` (không xóa) nên tiến độ người dùng giữ nguyên; dòng xuất hiện lại thì từ trở về `active`. Không có cờ thì sync chỉ cảnh báo các key vắng.
- **Sửa `vi`, `vi_alt`, `ipa`, `cefr`, `domain`, `topics`, `rank`… giữ nguyên `key`:** cập nhật tại chỗ, tiến độ người dùng không đổi, `rand` giữ nguyên.
- **Sửa `en` hoặc `pos`:** nếu `key` không đổi thì coi là sửa chính tả. Muốn một từ *khác hẳn* thì thêm dòng mới (key mới) và xóa dòng cũ (cũ thành `retired`).
- **`key` trùng** giữa hai dòng (cùng tab hoặc khác tab) → lỗi validate, dừng.
- Cùng `en` + `pos` xuất hiện ở nhiều dòng → **cảnh báo** (hợp lệ nếu khác nghĩa và khác `n`).

**Các tab còn lại**
- `sentences`: cột `words` liệt kê các `key` của từ xuất hiện trong câu (ngăn cách `,`) → `sentence_words`. Mỗi từ nên có ít nhất một câu cho chế độ Học và trò `cloze`/`build`.
- `grammar`: `options` là các lựa chọn ngăn cách bằng `|`; `answer` là số thứ tự (bắt đầu từ 1) hoặc đúng văn bản của một lựa chọn.
- `topics`: `slug` duy nhất; `cefr`, `domain` phải hợp lệ. `domains`: `code` viết thường, không dấu, không khoảng trắng; có sẵn `general`.

### 3.5 Dữ liệu người dùng lưu ở đâu

Toàn bộ nằm trong **một project Supabase (PostgreSQL)**, không có kho nào khác:

| Dữ liệu | Nơi lưu | Ai quản lý |
|---|---|---|
| Email, mật khẩu (đã băm), phiên đăng nhập, mã xác nhận | schema `auth` của Supabase (`auth.users`, …) | **Supabase Auth**: ứng dụng không đọc hay lưu mật khẩu |
| Tên đăng nhập, XP, chuỗi ngày | `public.profiles` (khóa = `auth.users.id`) | ứng dụng, ghi qua server |
| Tiến độ từng từ, bộ đếm, điểm ngữ pháp, điểm cao | `user_word_progress`, `user_level_stats`, `grammar_stats`, `game_scores` | ứng dụng, ghi qua `apply_round_result` |
| Vòng chơi, bài thi, cấp đã qua | `game_rounds`, `level_exams`, `level_passes` | ứng dụng, ghi qua RPC |
| Bộ đếm giới hạn tần suất | `rate_limits` | ứng dụng |
| Nội dung (từ, câu, ngữ pháp) | Google Sheet → bản sao ở các bảng nội dung | chủ dự án (mục 3.1) |

- Trình duyệt chỉ giữ **cookie phiên** của Supabase Auth (và vài tùy chọn giao diện như tắt âm); không lưu tiến độ ở máy người dùng.
- Dữ liệu cá nhân thực chất chỉ gồm **email và tên đăng nhập** (cộng tiến độ học); không có thanh toán hay thông tin nhạy cảm khác.
- Vị trí máy chủ do chọn vùng khi tạo project (nên chọn Singapore, gần Việt Nam và nên khớp vùng hàm Vercel, mục 6.1). Gói free có giới hạn dung lượng/tạm dừng khi không dùng và **không nên coi là có sao lưu**: xem mục 6.3.
- Tài khoản của ứng dụng cũ (Cloudflare D1) **không chuyển sang**: mật khẩu cũ dùng cách băm khác, không nhập được vào Supabase Auth. Người dùng cũ đăng ký lại (G20).

---

## 4. Đặc tả trò chơi và quy tắc

Các giá trị dưới đây là **mặc định đề xuất**, đặt tập trung ở `core/rules.ts` và `content/taxonomy/levels.yml` (hoặc tab riêng của Sheet) để chỉnh không cần sửa logic.

### 4.1 Mười trò chơi

| Trò | Dữ liệu cần | Tính SRS? | XP/câu đúng | Tối đa câu/vòng |
|---|---|---|---|---|
| `quiz` Trắc nghiệm từ vựng | từ + 3 đáp án nhiễu | Có | 10 | 20 |
| `blitz` Đua tốc độ (60 giây, 3 mạng, combo ×1→×4), chỉ theo cấp | từ | Có | 4 | 60 |
| `type` Gõ từ | từ | Có | 15 | 20 |
| `scramble` Xếp chữ cái | từ | Có | 12 | 20 |
| `cloze` Điền vào câu | từ + câu chứa từ | Có | 12 | 20 |
| `listen` Nghe & chọn | từ (giọng đọc của trình duyệt) | Có | 12 | 20 |
| `match` Ghép cặp | từ | Không | 6 | 30 |
| `flash` Thẻ ghi nhớ | từ | Không | 3 | 30 |
| `build` Xếp câu | câu thật (và câu ngữ pháp đúng) | Không | 15 | 20 |
| `tf` Ngữ pháp đúng/sai, chỉ theo cấp | câu ngữ pháp | Không | 8 | 30 |

- Trò "dễ" (không SRS) chỉ cộng XP để không tạo "thuộc ảo". `flash` và `match` do người chơi tự đánh giá/đã thấy cả hai mặt nên server **không chấm đúng/sai**; chỉ ghi nhận số thẻ/cặp đã hoàn thành.
- **Chống cày XP** (mặc định, đặt ở `rules.ts`): mỗi vòng phải mất ≥ 1 giây × số câu (Blitz ≥ 0,7 giây × số câu) kể từ lúc bắt đầu mới được nộp; tối đa **1.500 XP/ngày** (giờ VN); `play/start` tối đa 30 lượt/giờ.
- Đúng hết (từ 5 câu trở lên): thưởng thêm 20% XP. Mỗi vòng cộng tối đa **500 XP**.
- Mỗi từ chỉ được tính **một lần** cho tiến độ trong một vòng; từ được tính đúng khi *mọi lượt* của từ đó trong vòng đều đúng.
- **Điểm Blitz do server tính**, không nhận số điểm client gửi: duyệt các câu trả lời theo thứ tự, câu đúng cộng `10 × hệ số` (hệ số `min(1 + ⌊combo/5⌋, 4)`), sai thì combo về 0 và mất 1 mạng, hết 3 mạng thì bỏ các câu sau. Bảng xếp hạng Blitz theo cấp (top 5).

### 4.2 SRS cho từng từ

Trạng thái: `level` 0–5 và `bad` (số lần sai liên tiếp khi đã thuộc).

```
Chưa có dòng        = Mới
level 0             = Cần ôn      (vừa sai khi chưa thuộc; hỏi lại ngay)
level 1–2           = Đã học
level ≥ 3           = Đã thuộc    (đúng 3 lần liên tiếp)
Đã thuộc mà sai     = vẫn giữ "thuộc"; sai 3 lần liên tiếp mới quên (về level 0)
Khoảng ôn lại theo level mới: [0, 0, 0, 4, 7, 14] ngày
```

### 4.3 Mở khóa cấp độ

- **A1 luôn mở.** Cấp N chỉ mở khi **đã qua bài kiểm tra** của cấp N−1 (có dòng trong `level_passes`) — và mọi cấp trước đó cũng đã qua. **Không thi nhảy cấp.**
- Số từ "thuộc" và ngữ pháp **không còn là điều kiện qua cấp**; chúng chỉ còn là số liệu hiển thị. Điều kiện duy nhất là bài kiểm tra (mục 4.6).
- **Điều kiện được vào thi** cấp N: cấp N đang mở, chưa qua, và **tổng số từ `general` đã học** (`level ≥ 1`) **cộng dồn từ A1 đến cấp N** ≥ `examMinWords[N]` — một **số từ tuyệt đối** đặt ở `levels.yml`, không còn là tỉ lệ phần trăm. Nếu nội dung hiện có ít hơn ngưỡng (chưa nạp đủ từ) thì ngưỡng tự hạ xuống bằng tổng số từ `general` active từ A1 đến cấp N, để không bị kẹt.

  | Cấp | Vốn từ tối thiểu để được thi (cộng dồn, từ đã học) | Cơ sở |
  |---|---|---|
  | A1 | **1.000** | Ước lượng: Milton & Alexiou chỉ nêu A1 là *dưới 1.500*, không có mốc dưới; lấy giữa khoảng ~500–1.500 |
  | A2 | **2.000** | Trung bình của khoảng 1.500–2.500 (Milton & Alexiou 2009) |
  | B1 | **3.000** | Trung bình của khoảng 2.750–3.250 |
  | B2 | **3.500** | Trung bình của khoảng 3.250–3.750 |
  | C1 | **4.100** | Trung bình của khoảng 3.750–4.500 (4.125, làm tròn) |

  Đây là số **tối thiểu để được vào thi**; việc qua cấp vẫn do bài thi quyết định. Đơn vị là *lemma* (từ gốc), gần với cách `words` của hệ thống đếm (mỗi dòng là một từ gốc + loại từ + nghĩa). Số liệu gốc có nhiều nguồn lệch nhau (xem mục 6.6), nên đây là mặc định đề xuất, chỉnh trong `levels.yml`.
- Cấp C1: qua bài kiểm tra C1 nghĩa là hoàn thành lộ trình (không còn cấp để mở). C2 có từ nhưng không có cổng.
- **Người dùng cũ phải thi lại:** không có cơ chế công nhận trước; mọi tài khoản, kể cả dữ liệu được chuyển từ nơi khác (nếu có), bắt đầu với `level_passes` rỗng.
- Chỉ tính từ của lĩnh vực `general` cho điều kiện được thi và đề thi; từ chuyên ngành tính riêng ở trang thống kê.

### 4.4 Chuỗi ngày và XP
- Ngày tính theo **giờ Việt Nam (UTC+7)**. Học ở bất kỳ trò nào trong ngày đều được tính. Bỏ lỡ hơn một ngày thì chuỗi về 0 (khi hiển thị).
- Bảng xếp hạng: top 10 theo XP; hiển thị cấp cao nhất đã qua liên tiếp từ A1 (đọc từ `level_passes`).

### 4.5 Chế độ Học

- Vào từ `learn/[cefr]`, chọn lĩnh vực/chủ đề. **Tuân theo khóa cấp giống game** (cấp chưa mở thì chưa vào học; giả định G15).
- Danh sách **phân trang 30 từ/trang**, theo thứ tự `freq_rank` tăng dần rồi `id` (dùng keyset, không dùng OFFSET). Từ không có `rank` xếp sau cùng, theo thứ tự dòng trên Sheet ở lần nạp đầu.
- Thẻ từ hiển thị: `en`, `ipa`, `pos`, `vi`, `vi_alt`, nút nghe (`speak()` của trình duyệt), tối đa 3 câu ví dụ (qua `sentence_words`; ẩn phần này nếu từ chưa có câu) và trạng thái **Mới / Đã học / Cần ôn / Đã thuộc**.
- Nút **"Đã học"** (từng thẻ hoặc cả trang, tối đa 50 từ mỗi lần): từ chưa có tiến độ hoặc đang ở `level 0` được đưa lên `level 1`, `bad = 0`, `next_review = now` (đến hạn ngay, nên trò chơi sẽ ưu tiên ôn từ này). Từ đang ở `level ≥ 1` giữ nguyên.
- Học **không cộng XP** và **không bao giờ đưa từ lên "thuộc"** (`level ≥ 3` chỉ đạt qua trò chơi) để không tạo "thuộc ảo". Bộ đếm `learned` trong `user_level_stats` tăng khi từ lên `level 1`.

### 4.6 Bài kiểm tra lên cấp

Cấu hình đặt ở `content/taxonomy/levels.yml` (đọc vào `core/exam.ts`), chỉnh được không sửa logic:

```
examMinWords:                 # số từ general đã học, CỘNG DỒN từ A1, tối thiểu để được thi cấp đó
  A1: 1000
  A2: 2000
  B1: 3000
  B2: 3500
  C1: 4100
exam:
  vocab:   { total: 20, mix: { quiz: 8, cloze: 6, type: 6 } }   # chọn nghĩa / điền vào câu / gõ từ
  grammar: { total: 10 }                                         # câu ngữ pháp của đúng cấp đó
  durationMinutes: 20
  passTotal: 0.80             # tổng ≥ 80%
  passPart:  0.70             # từ vựng ≥ 70% VÀ ngữ pháp ≥ 70%
  cooldownMinutes: 60         # sau một lượt không đạt, chờ 1 giờ mới thi lại cấp đó
  maxAttemptsPerDay: 3        # tối đa 3 lượt/ngày (giờ VN), tính mọi cấp; mỗi lần bắt đầu thi là 1 lượt
```

**Đề thi**
- 150 câu từ vựng lấy ngẫu nhiên (cột `rand`) trong **toàn bộ từ `general`, `active` của cấp**, không chỉ từ người học đã học; loại các từ đã xuất hiện trong lượt thi gần nhất của cấp này. Đáp án nhiễu cùng `pos`, cùng cấp.
- 50 câu ngữ pháp của đúng cấp (cột `rand` của `grammar_questions`).
- Câu gõ từ **không có gợi ý**, so khớp bằng `norm()`, **không chấp nhận "gần đúng"**. Không dùng trò `listen` (phụ thuộc giọng đọc của trình duyệt).
- Thứ tự câu xáo trộn; đáp án nằm trong `level_exams.items`, không gửi xuống trình duyệt.

**Quy tắc lượt thi**
- Mỗi người **chỉ có một bài thi đang dở**; gọi `exam/start` khi đang có bài chưa hết giờ thì nhận lại đúng bài đó (không tốn lượt).
- Hết `expires_at` mà chưa nộp: coi như **trượt** (điểm 0, `finished_at = expires_at`), tính vào giờ chờ. Nộp trễ quá 30 giây sau hạn thì bị từ chối.
- Giờ chờ 1 giờ chỉ áp dụng sau lượt **không đạt** của cùng cấp; đạt rồi thì không cần chờ (nhưng cấp kế tiếp vẫn phải đủ điều kiện được thi).
- Thi đạt: ghi `level_passes`, cộng chuỗi ngày; **không cộng XP, không ghi SRS, không ghi `grammar_stats`** (kết quả thi không được biến thành "thuộc ảo").
- Màn kết quả cho biết điểm từng phần, các câu sai (từ + nghĩa đúng, câu ngữ pháp + giải thích), giờ được thi lại và số lượt còn trong ngày.

---

## 5. Pseudo-code và hợp đồng dữ liệu

### 5.1 Hợp đồng dữ liệu dùng chung

```
TYPE Cefr = A1 | A2 | B1 | B2 | C1 | C2
TYPE GameId = quiz | blitz | type | scramble | cloze | listen | match | flash | build | tf

TYPE Word = { id, key, en, pos, vi, viAlt?: string[], ipa?, cefr, domain }
TYPE Sentence = { id, en, vi?, cefr?, kind? }
TYPE GrammarQ = { id, level: Cefr, topic?, question, options: string[], answer: int, explanation? }

TYPE Scope =
    { by: "topic", topicSlug: string }
  | { by: "level", cefr: Cefr, domain: string | "all" }

TYPE SrsState = { level: 0..5, bad: int, nextReview: timestamp }

TYPE Question = {                       // thứ gửi xuống trình duyệt
  qid: string
  game: GameId
  wordId?: int, grammarId?: int, sentenceId?: int
  prompt: string
  options?: string[]                    // đáp án trắc nghiệm đã xáo
  tokens?: string[]                     // trò xếp câu/xếp chữ
  hint?: string
  // KHÔNG chứa đáp án đúng (trừ trò flash/match, nơi trình duyệt cần cả hai mặt)
}

TYPE StoredItem = Question + { expected: string | int | string[] }   // lưu trong game_rounds.items
TYPE Answer = { qid: string, value: string | int | string[], hintUsed?: bool, attempts?: int }

TYPE StartRequest  = { game: GameId, scope: Scope, n?: int }
TYPE StartResponse = { roundId: uuid, items: Question[], practice: bool }

TYPE FinishRequest  = { roundId: uuid, answers: Answer[], level?: Cefr }   // KHÔNG nhận điểm từ client; Blitz do server tính
TYPE FinishResponse = { xpGained: int, xp: int, perfect: bool, streak: int,
                        review: ReviewItem[], newBest?: bool, board?: BoardRow[] }

TYPE LevelCounters = { cefr, learned: int, total: int }         // learned: user_level_stats (general); total: content_stats (general)
TYPE LevelStatus   = { cefr, pass: bool, unlocked: bool, eligible: bool, learnedCum, needLearned }   // learnedCum: từ đã học cộng dồn A1→cấp này

TYPE ExamStartRequest  = { cefr: Cefr }
TYPE ExamStartResponse = { examId: uuid, items: Question[], expiresAt: timestamp, resumed: bool }
TYPE ExamSubmitRequest = { examId: uuid, answers: Answer[] }
TYPE ExamResult        = { passed: bool, scoreTotal: float, scoreVocab: float, scoreGrammar: float,
                           review: ReviewItem[], nextAttemptAt?: timestamp, attemptsLeftToday: int }
```

### 5.2 `core/srs`

```
FUNCTION nextSrsState(cur: SrsState | null, correct: bool, now: timestamp) → SrsState
  level = cur?.level ?? 0
  bad   = cur?.bad   ?? 0

  IF correct THEN
    level = MIN(level + 1, 5)
    bad   = 0
  ELSE IF level >= 3 THEN            // đã thuộc: chỉ quên khi sai 3 lần liên tiếp
    bad = bad + 1
    IF bad >= 3 THEN level = 0; bad = 0 END IF
  ELSE
    level = 0; bad = 0
  END IF

  days = correct ? INTERVALS[level] : 0       // INTERVALS = [0,0,0,4,7,14]
  RETURN { level, bad, nextReview: now + days }
END FUNCTION
```

### 5.3 `core/levels`

```
FUNCTION levelStatus(counters: LevelCounters[], passes: Set<Cefr>, cfg) → LevelStatus[]
  open = true                                          // A1 luôn mở
  learnedCum = 0;  totalCum = 0
  FOR EACH c IN counters ORDER BY cefr (A1 → C1)
    learnedCum += c.learned;  totalCum += c.total      // cộng dồn từ general
    pass        = c.cefr IN passes                     // CHỈ đạt khi đã thi đạt
    unlocked    = open
    needLearned = MIN(cfg.examMinWords[c.cefr], totalCum)      // nội dung chưa đủ thì hạ ngưỡng, tránh kẹt
    eligible    = unlocked AND NOT pass AND totalCum > 0 AND learnedCum >= needLearned
    EMIT { cefr: c.cefr, pass, unlocked, eligible, learnedCum, needLearned }
    open = open AND pass                                // không thi nhảy cấp
  END FOR
END FUNCTION
```

### 5.4 Chọn từ ngẫu nhiên có index (`repo`)

```
FUNCTION pickWords(userId, scope, n, preferNew: bool) → Word[]
  result = []

  // 1) Từ đến hạn ôn: chỉ đọc tiến độ của CHÍNH người này, đi qua index (user_id, next_review)
  // lọc theo phạm vi NGAY TRONG truy vấn (cefr, domain nằm sẵn ở user_word_progress), rồi mới LIMIT:
  //   nếu lấy LIMIT trước rồi lọc sau, từ đến hạn của cấp khác sẽ chiếm hết chỗ và trả về 0 từ
  due = SELECT progress JOIN words (theo word_id)
        WHERE user_id = userId AND next_review <= now AND <scope trên cefr/domain/topic>
        ORDER BY next_review LIMIT n
  result += words(due)

  // 2) Từ mới: chọn ngẫu nhiên bằng cột rand có index, KHÔNG quét toàn bảng
  WHILE LENGTH(result) < n
    r = RANDOM(0..1)
    batch = SELECT words WHERE <scope> AND status = 'active' AND rand >= r
            ORDER BY rand LIMIT (n - LENGTH(result)) * 3        // lấy dư để loại từ đã có/đã thuộc
    IF batch rỗng THEN                                           // quay vòng về đầu
      batch = SELECT words WHERE <scope> AND status='active' ORDER BY rand LIMIT ...
    END IF
    batch = batch BỎ những từ đã có trong result hoặc đang thuộc và chưa đến hạn
    result += batch
    NẾU thử quá K lần không thêm được → THOÁT (cho chơi chế độ luyện tập)
  END WHILE

  RETURN CẮT(result, n)
END FUNCTION

FUNCTION pickDistractors(word: Word, count = 3) → string[]
  // cùng loại từ (pos), cùng/liền kề cefr, khác nghĩa — dùng index (pos, cefr, rand)
  r = RANDOM(0..1)                    // sinh Ở ỨNG DỤNG rồi truyền vào như tham số
  // KHÔNG viết `rand >= RANDOM()` trong SQL: random() là hàm volatile, bị tính lại cho từng dòng
  // nên không dùng index như một khoảng và sẽ quét rất nhiều dòng
  RETURN SELECT vi FROM words WHERE pos = word.pos AND cefr IN near(word.cefr)
         AND vi <> word.vi AND status = 'active' AND rand >= r ORDER BY rand LIMIT count
         // (nếu không đủ `count` thì quay vòng về đầu như pickWords)
END FUNCTION
```

### 5.5 `services/startRound`

```
FUNCTION startRound(req: StartRequest, userId) → StartResponse
  rule = GAME_RULES[req.game];  IF NOT rule THEN ERROR "Trò chơi không hợp lệ"

  // Mở khóa (chỉ đọc bộ đếm có sẵn, không quét bảng từ)
  status = levelStatus(repo.levelCounters(userId), repo.levelPasses(userId), cfg)
  cefr   = req.scope là level ? req.scope.cefr : repo.topicCefr(req.scope.topicSlug)
  IF NOT status[cefr].unlocked THEN ERROR 403 "Cấp đang khóa"

  words    = repo.pickWords(userId, req.scope, MIN(req.n ?? default(game), rule.cap), preferNew = (game == flash))
  practice = (words là từ đã đủ thuộc, không có từ đến hạn/mới)
  extras   = game cần câu ? repo.pickSentences(words) : nil
  gq       = game cần ngữ pháp ? repo.pickGrammar(cefr, n) : nil

  items = core.questions.build(game, words, extras, gq, distractorsFn = repo.pickDistractors)

  roundId = repo.createRound(userId, game, storedItems = items VỚI expected)
  RETURN { roundId, items: items BỎ expected (trừ flash/match), practice }
END FUNCTION
```

### 5.6 `services/finishRound`

```
FUNCTION finishRound(req: FinishRequest, userId) → FinishResponse
  round = repo.lockRound(req.roundId, userId)            // SELECT ... FOR UPDATE; null nếu không phải của user
  IF round KHÔNG TỒN TẠI OR round.finishedAt != null THEN ERROR 409 "Vòng đã kết thúc hoặc không hợp lệ"

  rule = GAME_RULES[round.game]
  answers = req.answers CẮT còn rule.cap, KHỬ trùng theo qid
  IF NOT repo.hitRateLimit("play-finish:" + userId, 3600, 60) THEN ERROR 429
  elapsed = now - round.createdAt
  IF elapsed < rule.minSecondsPerAnswer * LENGTH(answers) THEN ERROR 429 "Nộp quá nhanh"   // chống bot nộp tức thì

  // Chấm
  results = []
  FOR EACH item IN round.items
    ans = answers[item.qid]
    correct = ans != nil AND core.grading.check(item, ans)      // trò gõ từ: có thể "gần đúng"
    IF ans.hintUsed THEN correct = false                       // dùng gợi ý thì không tính
    results += { item, correct }
  END FOR

  // Mỗi từ chỉ tính một lần: đúng khi MỌI lượt của từ đó đều đúng
  perWord = GOM results THEO wordId → AND(correct)

  // SRS (chỉ khi trò có SRS)
  updates = []
  IF rule.srs THEN
    currents = repo.getProgress(userId, KEYS(perWord))          // ≤ vài chục dòng
    FOR EACH (wordId, ok) IN perWord
      updates += { wordId, state: core.srs.nextSrsState(currents[wordId], ok, now) }
    END FOR
  END IF

  right   = ĐẾM results.correct
  xp      = right * rule.xp
  perfect = LENGTH(results) >= 5 AND right == LENGTH(results)
  IF perfect THEN xp = xp + ROUND(xp * 0.2)
  xp = MAX(0, MIN(xp, 500, DAILY_XP_CAP - repo.xpToday(userId, core.streak.dayNo(now))))   // trần 500/vòng và 1.500/ngày

  grammar = results CÓ grammarId → { level, correct }
  blitz   = (round.game == blitz AND req.level hợp lệ)
              ? { key: "blitz:" + req.level, score: core.grading.blitzScore(results THEO THỨ TỰ CÂU) } : nil
            // blitzScore: combo/hệ số/3 mạng như mục 4.1; bỏ qua mọi số điểm do client gửi

  // Ghi một lần, nguyên tử: progress + bộ đếm + xp + chuỗi ngày + điểm cao + grammar_stats + đánh dấu vòng đã xong
  out = repo.applyRoundResult(userId, round.id, { updates, xp, grammar, blitz, today = core.streak.dayNo(now) })

  RETURN { xpGained: xp, xp: out.xp, perfect, streak: out.streak,
           review: results SAI → ReviewItem, newBest: out.newBest, board: out.board }
END FUNCTION
```

### 5.7 `apply_round_result` (hàm SQL, mô tả hành vi)

```
FUNCTION apply_round_result(user, round, payload)         // một giao dịch
  UPDATE game_rounds SET finished_at = now WHERE id = round AND finished_at IS NULL
  IF không cập nhật được dòng nào THEN RAISE "đã kết thúc"       // chống nộp hai lần

  FOR EACH u IN payload.updates
    old = SELECT level FROM user_word_progress WHERE (user, u.wordId) FOR UPDATE
    UPSERT user_word_progress(user, u.wordId, u.level, u.bad, u.nextReview)
    // cập nhật bộ đếm theo CHÊNH LỆCH giữa level cũ và mới:
    learned  += (u.level >= 1) - (old.level >= 1)
    mastered += (u.level >= 3) - (old.level >= 3)
    ghi vào user_level_stats của (cefr, domain) của từ đó
  END FOR

  UPSERT grammar_stats THEO payload.grammar
  UPDATE profiles SET xp = xp + payload.xp, streak/best_streak/last_day theo core.streak (tính trong SQL từ today),
                      xp_today = (xp_day = today ? xp_today : 0) + payload.xp, xp_day = today
  IF payload.blitz THEN UPSERT game_scores (best = GREATEST(best, score), plays = plays + 1)
  RETURN { xp, streak, newBest, board }
END FUNCTION
```

### 5.8 `core/streak`

```
FUNCTION dayNo(nowUtc) → int  =  FLOOR((nowUtc_in_seconds + 7*3600) / 86400)

FUNCTION touchStreak(p: {last_day, streak, best_streak}, today) → {last_day, streak, best_streak}
  IF p.last_day == today THEN RETURN p
  streak = (p.last_day == today - 1) ? p.streak + 1 : 1
  RETURN { last_day: today, streak, best_streak: MAX(p.best_streak, streak) }
END FUNCTION

FUNCTION displayStreak(p, today) → int = (p.last_day >= today - 1) ? p.streak : 0
```

### 5.9 `scripts/content/sync`

```
FUNCTION syncContent(target: local | staging | prod, dryRun: bool, retireMissing: bool, fromDir?: path)
  cfg  = đọc content/sheet.config.json             // sheetId, wordTabs [A1..C2] + gid từng tab, tab khác
  raw  = fromDir ? đọc các file CSV trong fromDir
                 : sheet.fetch(CSV từng tab)        // https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<gid>
                                                    // (Sheet chia sẻ "ai có link: chỉ đọc"; riêng tư thì Sheets API + service account)
         MỖI bản ghi kèm (tab, rowNumber) để báo lỗi; CSV đọc theo UTF-8
  words = GỘP bản ghi của các wordTabs
  taxonomy = đọc content/taxonomy/levels.yml

  // 0) Dòng mới chưa có key: dừng và nhắc chạy genkeys (hoặc tự điền khi chạy với --fill-keys)
  VALIDATE ĐỊNH DẠNG (Zod):                       // KHÔNG kiểm tra nghĩa/câu/CEFR
    LỖI (dừng):
    - thiếu cột bắt buộc hoặc sai tên cột (mục 2a)
    - pos / cefr / domain nằm ngoài danh sách cho phép; cefr không khớp tên tab
    - topics / domain trỏ tới chủ đề/lĩnh vực không có thật
    - key trùng (trong cùng tab và giữa MỌI tab từ vựng); key sai định dạng en:pos:n
    - dòng trống hoàn toàn được bỏ qua
    CẢNH BÁO (không dừng):
    - cột thừa (ví dụ "Specialized vocabulary") bị bỏ qua
    - `vi` chứa ";" (nên chuyển phần sau sang vi_alt)
    - cùng (en, pos) ở nhiều dòng
    - từ chưa có câu nào trong tab sentences
    IF có lỗi THEN IN (tab, rowNumber, lý do); DỪNG

  rank trống → 1000000000;  status = cột status nếu tab có, ngược lại 'active'
  COPY records VÀO bảng tạm
  diff = SO SÁNH bảng tạm với bảng thật THEO key   → thêm / sửa / vắng trên Sheet
  IN diff
  IF số từ sẽ bị retired > ngưỡng (2%) VÀ KHÔNG có --force THEN DỪNG    // chống xóa/sửa hàng loạt nhầm
  IF dryRun THEN RETURN

  UPSERT THEO key, LÔ 5.000 dòng                  // từ vắng trên Sheet KHÔNG bị xóa; chỉ retired khi có --retire-missing
  sentences + sentence_words (theo cột words)
  GÁN rand NGẪU NHIÊN CHO TỪ MỚI (từ cũ giữ nguyên rand)
  LÀM MỚI content_stats
  GHI content_imports(hash, số liệu)
END FUNCTION
```

**Kích hoạt:** chạy tay `npm run content:sync` (mặc định; thêm `--dry-run` để xem trước). Chỉ đồng bộ phần thay đổi (so hash từng dòng) nên các lần sau lần đầu rất nhanh. Có thể thêm sau, không ảnh hưởng thiết kế: nút **"Đồng bộ" trong menu Sheet** (Apps Script gọi GitHub Actions `workflow_dispatch` để chạy `content:sync`, không dùng hàm Vercel vì giới hạn thời gian chạy), hoặc cron hằng đêm.

### 5.10 Send Email Hook

```
FUNCTION handleSendEmail(rawBody, headers) → HTTP
  IF NOT verifyStandardWebhook(rawBody, headers, SEND_EMAIL_HOOK_SECRET) THEN RETURN 401

  { user, email_data } = PARSE(rawBody)
  subject, html = buildMail(email_data.email_action_type, email_data.token)   // tiếng Việt, theo từng loại hành động
  ok = POST MAIL_WEBHOOK_URL { secret: MAIL_WEBHOOK_SECRET, to: user.email, subject, html }
  IF NOT ok THEN RETURN 502 với lỗi để Auth báo cho người dùng
  RETURN 200
END FUNCTION
```

### 5.11 Đăng nhập bằng email hoặc tên đăng nhập

```
FUNCTION login(identifier, password)
  email = identifier CHỨA "@" ? identifier : lookupEmailByUsername(identifier)   // dùng service_role, chỉ ở server
  result = SupabaseAuth.signInWithPassword(email ?? "", password)
  IF lỗi THEN RETURN "Sai tên đăng nhập/email hoặc mật khẩu"     // một thông báo chung, không lộ tài khoản có tồn tại
END FUNCTION
```

### 5.12 `services/learn`

```
TYPE LearnState = new | learned | due | mastered
TYPE LearnCard  = { wordId, key, en, pos, vi, viAlt[], ipa?, cefr, domain, state: LearnState,
                    examples: { en, vi? }[] }                 // tối đa 3
TYPE LearnPage  = { items: LearnCard[], nextCursor?: string } // cursor = (freq_rank, id) của phần tử cuối

FUNCTION listLearn(userId, scope, cursor?, limit = 30) → LearnPage
  cefr = scope là level ? scope.cefr : repo.topicCefr(scope.topicSlug)
  IF NOT levelStatus(repo.levelCounters(userId), repo.levelPasses(userId), cfg)[cefr].unlocked THEN ERROR 403 "Cấp đang khóa"

  words = repo.listWordsByRank(scope, cursor, MIN(limit, 30))
          // WHERE <scope> AND status='active' AND (freq_rank, id) > cursor
          // ORDER BY freq_rank, id LIMIT n          (index (cefr, domain, freq_rank, id))
  prog  = repo.progressFor(userId, words.ids)       // IN ≤30 id, PK (user_id, word_id)
  ex    = repo.examplesFor(words.ids, perWord = 3)  // sentence_words (word_id) + LIMIT
  RETURN { items: words KÈM state = stateOf(prog), examples, nextCursor }
END FUNCTION

FUNCTION markLearned(userId, wordIds)               // ≤ 50 id, có giới hạn tần suất
  RPC mark_learned(user, wordIds)                   // MỘT giao dịch
    FOR EACH w IN wordIds
      old = SELECT level FROM user_word_progress WHERE (user, w) FOR UPDATE
      IF old IS NULL OR old.level = 0 THEN
        UPSERT user_word_progress(user, w, level = 1, bad = 0, next_review = now)
        learned += 1 trong user_level_stats của (cefr, domain) của từ        // mastered và xp KHÔNG đổi
      END IF
    END FOR
END FUNCTION
```

### 5.13 `services/exam`

```
FUNCTION startExam(req: ExamStartRequest, userId) → ExamStartResponse
  IF NOT repo.hitRateLimit("exam-start:" + userId, 3600, 10) THEN ERROR 429      // chống spam gọi API

  status = levelStatus(repo.levelCounters(userId), repo.levelPasses(userId), cfg)[req.cefr]
  IF NOT status.unlocked THEN ERROR 403 "Cấp này chưa mở (không thi nhảy cấp)"
  IF status.pass          THEN ERROR 409 "Bạn đã qua cấp này"
  IF NOT status.eligible  THEN ERROR 403 "Cần học thêm N từ (đã học X / tối thiểu Y) mới được thi cấp này"

  open = repo.activeExam(userId)                                  // finished_at IS NULL
  IF open THEN
    IF open.expiresAt > now THEN
      IF open.cefr != req.cefr THEN ERROR 409 "Đang có bài thi cấp khác chưa nộp"
      RETURN { examId: open.id, items: BỎ expected, expiresAt: open.expiresAt, resumed: true }   // không tốn lượt
    ELSE
      repo.failExam(open.id)                                     // hết giờ chưa nộp = trượt, điểm 0
    END IF
  END IF

  hist = repo.examHistory(userId, since = startOfVnDay(now))
  IF LENGTH(hist) >= cfg.maxAttemptsPerDay THEN ERROR 429 "Đã dùng hết 3 lượt hôm nay" + nextDay
  last = repo.lastFailedExam(userId, req.cefr)
  IF last AND now < last.endedAt + cfg.cooldownMinutes THEN ERROR 429 "Chờ đến <giờ>" + nextAttemptAt

  exclude = repo.examWordIds(userId, req.cefr, lastAttempts = 1)
  words   = repo.pickWordsForExam(req.cefr, domain = "general", n = cfg.vocab.total, exclude)   // cột rand + index
  grammar = repo.pickGrammar(req.cefr, cfg.grammar.total)                                       // cột rand + index
  items   = core.exam.buildItems(words, grammar, cfg.vocab.mix, distractorsFn)   // quiz/cloze/type; type: không hint

  exam = repo.createExam(userId, req.cefr, storedItems = items VỚI expected, expiresAt = now + cfg.durationMinutes)
          // unique partial index đảm bảo không có hai bài dở cùng lúc, kể cả khi hai request song song
  RETURN { examId: exam.id, items: items BỎ expected, expiresAt: exam.expiresAt, resumed: false }
END FUNCTION

FUNCTION submitExam(req: ExamSubmitRequest, userId) → ExamResult
  exam = repo.lockExam(req.examId, userId)                        // SELECT ... FOR UPDATE
  IF NOT exam OR exam.finishedAt != null THEN ERROR 409 "Bài thi đã kết thúc hoặc không hợp lệ"
  IF now > exam.expiresAt + 30 giây THEN
    repo.failExam(exam.id);  ERROR 410 "Hết giờ"                  // đã tính là một lượt trượt

  answers = KHỬ trùng theo qid
  results = FOR EACH item IN exam.items → { item, correct = check(item, answers[item.qid]) }   // type: so khớp norm(), không near
  vocabScore   = ĐÚNG(phần từ vựng) / cfg.vocab.total
  grammarScore = ĐÚNG(phần ngữ pháp) / cfg.grammar.total
  total        = ĐÚNG(tất cả) / (cfg.vocab.total + cfg.grammar.total)       // câu bỏ trống = sai
  passed = total >= cfg.passTotal AND vocabScore >= cfg.passPart AND grammarScore >= cfg.passPart

  out = repo.applyExamResult(userId, exam.id, { passed, total, vocabScore, grammarScore, today = dayNo(now) })
        // MỘT giao dịch: level_exams.finished_at + điểm; nếu passed → INSERT level_passes ON CONFLICT DO NOTHING; chuỗi ngày
        // KHÔNG đụng user_word_progress, xp, grammar_stats

  nextAt = passed ? nil : now + cfg.cooldownMinutes
  RETURN { passed, scoreTotal: total, scoreVocab: vocabScore, scoreGrammar: grammarScore,
           review: results SAI → ReviewItem, nextAttemptAt: nextAt,
           attemptsLeftToday: cfg.maxAttemptsPerDay - (LENGTH(hist hôm nay)) }
END FUNCTION
```

---

## 6. Hiệu năng, bảo mật, vận hành

### 6.1 Quy tắc hiệu năng (bắt buộc khi review)
1. Không có truy vấn nào quét toàn bộ `words` hoặc `sentences`; mọi truy vấn có `LIMIT` và đi qua index.
2. Không dùng `ORDER BY RANDOM()`; chọn ngẫu nhiên bằng cột `rand` + index (mục 5.4).
3. Không `COUNT(*)` trên bảng nội dung: tổng số lấy từ `content_stats`, tiến độ lấy từ `user_level_stats`.
4. Từ đến hạn ôn lấy qua index `(user_id, next_review)`.
5. Bảng xếp hạng: một truy vấn `profiles ORDER BY xp DESC LIMIT 10` + bộ đếm của 10 người; cache 60 giây.
6. Đáp án nhiễu cùng `pos` và cùng/liền kề `cefr`.
7. Mục tiêu: mỗi API dưới ~200 ms ở 200k từ; kiểm bằng `EXPLAIN` — không có `Seq Scan` trên bảng nội dung.
8. Đặt vùng chạy hàm của Vercel gần database (ví dụ Singapore nếu project Supabase ở Singapore).
9. Danh sách học dùng phân trang **keyset** `(freq_rank, id)`, tối đa 30 từ/trang, không OFFSET; học theo chủ đề lọc qua `word_topics` (chủ đề có số từ bị chặn bởi nội dung, không quét cả cấp).
10. Đề thi lấy từ cột `rand` (từ vựng `(cefr, domain, rand)`, ngữ pháp `(level, rand)`), không `ORDER BY RANDOM()`; điều kiện được thi chỉ đọc `user_level_stats` và `content_stats`.

### 6.2 Bảo mật
- `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `MAIL_WEBHOOK_SECRET`, `MAIL_WEBHOOK_URL` chỉ là biến môi trường phía server (Vercel), không bao giờ có tiền tố `NEXT_PUBLIC_`.
- Endpoint hook kiểm tra chữ ký trước khi làm gì khác.
- Giới hạn tần suất cho `play/start`, `play/finish`, `exam/start` và đăng nhập, **đếm trong bảng Postgres `rate_limits`** (theo người dùng/IP; ADR-9). Không dùng bộ nhớ tiến trình vì hàm Vercel là serverless. Thêm trần XP/ngày và thời gian nộp tối thiểu (mục 4.1).
- Bài thi: đáp án chỉ nằm ở `level_exams` (trình duyệt không đọc được); chấm ở server; hạn nộp, 1 bài dở/người, 3 lượt/ngày và giờ chờ 1 giờ đều kiểm tra ở server (mục 4.6).
- Thông báo lỗi đăng nhập/quên mật khẩu dùng câu chung, không tiết lộ tài khoản có tồn tại hay không.
- Mật khẩu tối thiểu 6 ký tự (có thể tăng); phiên và băm mật khẩu do Supabase Auth quản lý.
- Sheet: chia sẻ **chỉ đọc** cho \"ai có link\" (đủ cho tải CSV) hoặc dùng service account nếu muốn riêng tư; quyền *sửa* chỉ cấp cho người soạn; bảo vệ (protected range) cột `key` và hàng tiêu đề.
- Chỉ kiểm tra *định dạng* nội dung; vì nội dung do chủ dự án tự kiểm tra, mọi chuỗi hiển thị vẫn phải được thoát ký tự khi render (React mặc định đã làm).

### 6.3 Vận hành
- **Môi trường:** `local` (Supabase chạy cục bộ), `staging` (một project Supabase riêng, nếu muốn), `prod`. Mỗi môi trường có `.env` riêng; `.env.example` được commit.
- **Migration:** mọi thay đổi schema đi qua file trong `supabase/migrations/`; không sửa tay trên dashboard.
- **CI:** chạy `content:validate` trên bản Sheet mới nhất (hoặc trên bản backup JSONL), kiểm tra kiểu TypeScript, test `core/`.
- **Sao lưu:** nội dung chính nằm trong Google Sheet (có version history); `export.ts` dump ra `content/backup/*.jsonl` và commit định kỳ; dữ liệu người dùng (mục 3.5): kiểm tra chính sách sao lưu của gói Supabase đang dùng; nếu gói không có sao lưu tải về được thì chạy `pg_dump` định kỳ (ví dụ GitHub Actions hằng tuần, lưu ở nơi riêng tư, **không commit lên repo công khai** vì có email).
- **Theo dõi:** log lỗi của Vercel; ghi `content_imports` mỗi lần sync.

### 6.4 Biến môi trường

| Biến | Phía | Mục đích |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | trình duyệt + server | kết nối Supabase cho phiên đăng nhập |
| `SUPABASE_SERVICE_ROLE_KEY` | **chỉ server** | thao tác dữ liệu có quyền cao |
| `SEND_EMAIL_HOOK_SECRET` | chỉ server | kiểm tra chữ ký Send Email Hook |
| `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_SECRET` | chỉ server | gọi Apps Script |
| `CONTENT_SHEET_ID` | chỉ server/máy chạy sync | ID của Google Sheet nội dung |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | chỉ server/máy chạy sync | (tùy chọn) chỉ cần khi Sheet không công khai |
| `NEXT_PUBLIC_SITE_URL` | cả hai | địa chỉ chính thức (dùng cho liên kết trong mail) |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | trình duyệt | (SAU) địa chỉ `media.<tên-miền>` |

### 6.5 Tên miền (Cloudflare)
1. Đưa tên miền về Cloudflare DNS.
2. Thêm tên miền vào project Vercel; tạo đúng các bản ghi Vercel yêu cầu, đặt **DNS only** (không bật proxy).
3. Cập nhật **Site URL**, **Redirect URLs** trong Supabase Auth và địa chỉ của Send Email Hook; đặt `NEXT_PUBLIC_SITE_URL`.
4. (SAU) `media.<tên-miền>` trỏ vào bucket R2 để phục vụ ảnh/âm thanh; không dùng địa chỉ `r2.dev` cho bản thật.

Cloudflare chỉ làm DNS (và R2 về sau). **Không dùng Cloudflare Pages**: ứng dụng chạy trên Vercel (ADR-6).

### 6.6 Nguồn của các ngưỡng số từ (mục 4.3)

| Nguồn | Con số | Ghi chú |
|---|---|---|
| Milton & Alexiou (2009), bảng 2 trong bài của Milton & Alexiou, GALA 14 | A1 < 1.500 · A2 1.500–2.500 · B1 2.750–3.250 · B2 3.250–3.750 · C1 3.750–4.500 · C2 4.500–5.000 | Đơn vị lemma; đo bằng X-Lex (tối đa 5.000 từ), chỉ là mức chỉ dẫn, không phải yêu cầu tuyệt đối |
| Oxford Learner's Dictionaries | Oxford 3000 phủ A1–B2; Oxford 5000 thêm 2.000 từ cho B2–C1 | Chỉ có tổng, không chia số lượng theo từng cấp |
| Laufer & Ravenhorst-Kalovski (2010), Nation (2006), trích trong bài của Swansea (Cronfa) | C1 cần *trên* 5.000 từ; C2 khoảng 8.000–9.000 | Đơn vị *word family* (lớn hơn lemma), nên cao hơn số của Milton |
| Text Inspector (FAQ CEFR) | A1–A2: 1.000–2.000 · B1–B2: 3.000–6.000 · C1–C2: 8.000+ | Không nêu nguồn |
| Nghiên cứu ở Tây Ban Nha (Universidad de La Rioja) | A1 trên 5.450 từ đến C2 gần 11.200 từ (thụ động); chủ động 1.110 → 6.865 | Số đo của người học cụ thể và đơn vị khác; chênh rất xa các nguồn trên |

Các nguồn **không thống nhất** (chênh vài lần tùy đơn vị đếm và cách đo), nên các ngưỡng ở mục 4.3 là mặc định hợp lý, không phải chuẩn. Chúng chỉ quyết định *khi nào được vào thi*; mức độ thật sự do bài thi quyết định.

---

## 7. Kế hoạch thực thi

```
Bước 0: Khung dự án và kiểm tra định dạng nội dung — Độ phức tạp: Thấp
  - Tạo: package.json, tsconfig, lint, .env.example, cấu trúc thư mục (mục 2a)
  - Tạo: content/schema (Zod), scripts/content/sheet.ts, validate.ts, stats.ts, genkeys.ts, taxonomy/levels.yml, sheet.config.json (wordTabs + gid)
  - Việc ngoài code: trên Sheet — tách `vi` thành `vi` (nghĩa chính) + `vi_alt` (nghĩa phụ); bỏ/đổi tên cột `Specialized vocabulary`; tạo tab `topics`, `domains` (và `sentences`, `grammar`); chạy `genkeys` để điền `key`; bảo vệ cột `key`
  - Thử sớm tải CSV của tab lớn (hàng chục nghìn dòng); nếu chậm/bị cắt thì đọc bằng Sheets API (`batchGet` theo đoạn) trong `sheet.ts`
  - Nghiệm thu: validate chạy được trên Sheet thật, báo đúng tab + số dòng lỗi

Bước 1: Cơ sở dữ liệu — Độ phức tạp: Trung
  - Tạo: supabase/migrations (schema, index, RLS, trigger tạo profile, hàm apply_round_result, mark_learned, apply_exam_result, hit_rate_limit; bảng level_exams, level_passes, rate_limits)
  - Tạo: scripts/content/sync.ts (+ --dry-run, --retire-missing, --from-dir), export.ts
  - Nghiệm thu: nạp dữ liệu mẫu vào Supabase local; tạo thử 200k dòng giả để đo thời gian nạp và EXPLAIN

Bước 2: Logic thuần (core) có test — Độ phức tạp: Trung
  - Tạo: core/srs, levels, rules, questions, grading, exam, streak, text + test Vitest
  - Nghiệm thu: test phủ các nhánh SRS (đúng/sai/đã thuộc/quên), mở khóa cấp theo level_passes (không nhảy cấp), điều kiện được thi (đủ số từ cộng dồn; hạ ngưỡng khi nội dung ít), điều kiện qua thi, giờ chờ 1 giờ và 3 lượt/ngày (kể cả qua nửa đêm giờ VN), tính điểm Blitz từ chuỗi trả lời

Bước 3: Đăng nhập — Độ phức tạp: Trung
  - Tạo: trang đăng ký/đăng nhập/quên mật khẩu, server/auth, api/auth/send-email, server/mail
  - Việc ngoài code: bật Send Email Hook, tạo secret, triển khai Apps Script mới (Code.gs), đặt biến môi trường
  - Nghiệm thu: đăng ký → nhận mã qua Gmail thật → đăng nhập; quên mật khẩu hoạt động

Bước 4: Lõi vòng chơi — Độ phức tạp: Cao
  - Tạo: server/repo, server/ratelimit, services/startRound, finishRound, learn, exam, api/play/*, api/learn/*, api/exam/*, api/home, api/leaderboard
  - Nghiệm thu: test tích hợp (gửi đáp án giả bị từ chối; nộp hai lần bị chặn; đúng 3 lần → "thuộc"; thi cấp chưa mở bị 403; thi khi chưa học đủ bị 403; thi trượt rồi thi lại trong 1 giờ bị 429; lượt thứ 4 trong ngày bị 429; hai request `exam/start` song song chỉ tạo một bài; nộp trễ bị từ chối; thi đạt thì cấp kế mở);
    EXPLAIN không có Seq Scan trên bảng nội dung ở 200k từ

Bước 5: Giao diện và 10 trò chơi — Độ phức tạp: Cao
  - Tạo: games/shell + 10 trò, trang Học (learn/[cefr]), trang Thi lên cấp (exam/[cefr]: điều kiện còn thiếu, đếm ngược, kết quả), trang chủ, chọn cấp/chủ đề, màn kết quả "cần ôn lại", bảng xếp hạng, hồ sơ
  - Dùng: speak() (giọng trình duyệt) và sfx() (Web Audio) như đặc tả; nút tắt âm
  - Nghiệm thu: chơi đủ 10 trò trên điện thoại và máy tính; tiến độ, XP, chuỗi ngày đúng

Bước 6: Nạp nội dung thật — Độ phức tạp: Trung
  - Chủ dự án điền nội dung vào Google Sheet; chạy sync --dry-run → sync (local/staging) → sync prod, theo lô tăng dần (1.000 → 20k → 200k dòng)
  - Trước khi nạp prod: kiểm tra mẫu nội dung (khoảng 200 dòng ngẫu nhiên mỗi cấp: nghĩa, loại từ, cấp CEFR), vì nghĩa sai sẽ làm hỏng đáp án nhiễu và bài thi
  - Nghiệm thu: mọi API < ~200 ms ở 200k từ; thời gian nạp 200k từ ở mức chấp nhận được; không vượt dung lượng gói

Bước 7: Tên miền và đưa lên chạy thật — Độ phức tạp: Thấp
  - Mục 6.5; cấu hình biến môi trường production; kiểm tra lại gửi mail trên tên miền thật
  - Nghiệm thu: vào tên miền thấy ứng dụng; người dùng thật đăng ký và chơi được

Bước 8 (SAU, ngoài đợt này): Ảnh và âm thanh trên R2 — Độ phức tạp: Trung
  - Tạo bucket + media.<tên-miền>, scripts/content/media-sync.ts, cập nhật has_audio/has_image, trình phát (file nếu có, giọng trình duyệt nếu không)
```

---

## 8. Giả định cần bạn xác nhận

| # | Giả định |Xác nhận |
|---|---|---|
| G1 | Giữ đúng 10 trò chơi và các giá trị XP/giới hạn ở mục 4.1 | Bạn cho danh sách trò/XP mong muốn; chỉ sửa `rules.ts` và `registry.ts` |
| G2 | Dùng SRS với level 0–5 và khoảng ôn `[0,0,0,4,7,14]` ngày như mục 4.2 | Cho mình quy tắc khác; chỉ sửa `core/srs.ts` |
| G3 | **Qua cấp bằng bài kiểm tra** (mục 4.6): 30 câu (150 từ + 50 ngữ pháp), 60 phút, đạt khi tổng ≥ 80% và mỗi phần ≥ 70%; **được thi khi tổng từ general đã học (cộng dồn từ A1) đạt ngưỡng tuyệt đối: A1 1.000 · A2 2.000 · B1 3.000 · B2 3.500 · C1 4.100** (trung bình khoảng của Milton & Alexiou); không thi nhảy cấp; chờ 1 giờ sau lượt trượt, tối đa 3 lượt/ngày | Chỉnh các số trong `levels.yml`; bỏ khóa cấp thì bỏ kiểm tra ở `startRound`/`listLearn` |
| G4 | Cấp độ chỉ A1–C1 để khóa/mở; C2 có từ nhưng không có cổng | Nếu muốn có C2 làm cổng thì thêm vào `levels.yml` |
| G5 | Chỉ từ lĩnh vực `general` tính cho điều kiện được thi và đề thi | Nêu lĩnh vực khác cũng tính nếu muốn |
| G6 | Không có trang quản trị riêng; **Google Sheet đóng vai trang quản trị**: thêm/sửa/ngừng dùng từ trên Sheet rồi chạy `content:sync` | Nếu cần trang quản trị thật thì thêm một đợt riêng |
| G7 | Dữ liệu từ vựng ban đầu do bạn cung cấp (từ ChatGPT, bạn tự kiểm tra). Nếu bạn có sẵn danh sách từ cũ muốn dùng làm dữ liệu mồi thì dán vào tab `words` của Sheet | — |
| G8 | Chỉ cần **một** project Supabase cho bản chạy thật + Supabase chạy cục bộ để phát triển/thử; chưa cần project staging riêng | Nếu muốn staging riêng thì tạo thêm project (gói free cho tối đa 2 project đang hoạt động) |
| G9 | Mật khẩu tối thiểu 6 ký tự; tên đăng nhập 3–20 ký tự chữ/số/`_` | Cho quy tắc khác |
| G10 | Chỉ giao diện tiếng Việt | Nếu cần thêm ngôn ngữ thì chuẩn bị i18n ngay từ đầu |
| G11 | Đồng bộ **chạy tay** (`npm run content:sync`); nút "Đồng bộ" trong Sheet (Apps Script gọi GitHub Actions) hoặc cron là tùy chọn thêm sau | Chọn nút/cron ngay từ đầu thì thêm workflow vào Bước 1 |
| G12 | Sheet **không có cột `status`**: mọi dòng trên Sheet là `active`; muốn bỏ từ thì xóa dòng rồi `sync --retire-missing` (DB đánh dấu `retired`, không xóa, tiến độ giữ nguyên) | Nếu cần ẩn tạm một từ: thêm cột `status` tùy chọn vào tab (sync đã hỗ trợ) |
| G13 | Sheet chia sẻ "ai có link" chỉ đọc là đủ riêng tư cho nội dung từ vựng | Nếu cần riêng tư thì dùng service account (`GOOGLE_SERVICE_ACCOUNT_JSON`) |
| G14 | Từ vựng chia **6 tab theo cấp** `A1`…`C2` (không gộp một tab `words`); cột `cefr` phải khớp tên tab; `key` duy nhất xuyên tab | Nếu muốn gộp một tab thì chỉ đổi `wordTabs` trong `sheet.config.json` |
| G15 | Chế độ Học tuân theo **khóa cấp** như game; học không cộng XP và chỉ đưa từ tới `level 1`; "thuộc" chỉ đạt qua trò chơi | Nếu muốn học tự do mọi cấp thì bỏ bước kiểm tra khóa trong `listLearn` |
| G16 | `key` có dạng `en:pos:n` chữ thường, khoảng trắng → `-`, sinh bằng `genkeys.ts` (không dùng công thức Sheet) | Cho quy ước khác; chỉ sửa `genkeys.ts` và regex trong schema |
| G17 | `domain` là **đúng một** `code` trong tab `domains`; cột `Specialized vocabulary` bỏ (từ chuyên ngành = `domain ≠ general`) | Nếu một từ cần nhiều lĩnh vực thì đổi `domain` thành danh sách (đổi schema, `user_level_stats`) |
| G18 | Web chỉ chạy trên **Vercel**; CSV chỉ là trung gian nạp DB; không dùng Cloudflare Pages hay JSON tĩnh | Nếu sau này DB thành điểm nghẽn mới xét JSON tĩnh cho danh sách học |
| G19 | Chống cày XP: ≥ 1 giây/câu mỗi vòng, 1.500 XP/ngày, 30 vòng/giờ (số tạm, chỉnh ở `rules.ts`); Blitz do server tính điểm | Cho số bạn muốn, hoặc bỏ trần ngày |
| G20 | Tài khoản ứng dụng cũ **không chuyển** sang (người dùng cũ đăng ký lại); nếu có chuyển tiến độ thì **không** chuyển "đã qua cấp": phải thi lại | Muốn giữ tài khoản cũ thì cần kế hoạch nhập riêng (mật khẩu cũ không nhập được vào Supabase Auth, phải đặt lại mật khẩu) |
| G21 | Đề thi lấy từ **toàn bộ** từ general của cấp, nên người vừa đủ ngưỡng số từ có thể chưa đạt 80% (ví dụ ở B1 mới học 2.750 từ trong khi cấp có nhiều từ hơn) | Muốn dễ hơn: hạ `passTotal`, hoặc lấy đề chỉ từ các từ đã học |
| G22 | Kết quả thi **không** ghi SRS, XP hay `grammar_stats`; thi đạt chỉ ghi `level_passes` và cộng chuỗi ngày | Muốn thưởng XP khi qua cấp thì thêm vào `apply_exam_result` |
| G23 | Ngưỡng số từ lấy từ nghiên cứu Milton & Alexiou (lemma, kiểm tra X-Lex tối đa 5.000 từ) nên vẫn **thấp hơn** nhiều ước lượng khác (xem 6.6); "đã học" (`level ≥ 1`) là mức nhẹ hơn "thuộc" | Muốn khắt khe hơn: nâng số ở `levels.yml`, hoặc đếm theo từ `thuộc` (`level ≥ 3`) thay vì `đã học` |

---

## Nguồn tham khảo

- Supabase Send Email Hook: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- Supabase pricing (giới hạn gói free/pro): https://supabase.com/pricing.md
- Milton & Alexiou, *Vocabulary size and the Common European Framework of Reference for Languages*: https://www.enl.auth.gr/gala/14th/Papers/English%20papers/Milton&Alexiou.pdf
- Oxford Learner's Dictionaries, CEFR word lists: https://www.oxfordlearnersdictionaries.com/about/wordlists/cefr
- Cloudflare R2 (giá; truy cập công khai bằng custom domain, không dùng `r2.dev` cho bản thật): https://developers.cloudflare.com/r2/pricing/ · https://developers.cloudflare.com/r2/buckets/public-buckets/
- Vercel domains: https://vercel.com/docs/domains/working-with-domains
