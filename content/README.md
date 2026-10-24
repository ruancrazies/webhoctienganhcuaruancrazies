# Nội dung (Google Sheet → Postgres)

Google Sheet là **nguồn sự thật** của mọi nội dung. Ứng dụng không đọc thẳng từ Sheet:
script `content:sync` (Bước 1) kéo CSV từng tab, kiểm tra định dạng rồi upsert vào Postgres.

## Các tab

| Tab | Cột bắt buộc | Cột tùy chọn |
|---|---|---|
| `A1` `A2` `B1` `B2` `C1` `C2` (từ vựng, mỗi cấp một tab) | `key, en, vi, pos, cefr, domain, topics` | `vi_alt, ipa, rank, note` |
| `sentences` | `key, en, words` | `vi, kind, cefr, source, note` |
| `grammar` | `key, level, question, options, answer` | `topic, explanation, note` |
| `topics` | `slug, title, cefr, domain` | `emoji, sort` |
| `domains` | `code, title` | `emoji` |

Hàng 1 là tiêu đề; **tên cột là hợp đồng**. Cột thừa bị cảnh báo và bỏ qua; thiếu cột bắt buộc là lỗi.
Tab không có trong `content/sheet.config.json` (ví dụ `Nguon_va_ghi_chu`) không được nạp.
`domains` và `topics` là bắt buộc; `sentences` và `grammar` có thể chưa có (chỉ cảnh báo).

## Quy ước từng cột (tab từ vựng)

- `key`: dạng `en:pos:n`, **chữ thường**, khoảng trắng trong `en` → `-` (vd `ice-cream:n:1`). Duy nhất xuyên mọi tab.
  Không gõ tay: chạy `npm run content:genkeys`. Chuyển từ sang cấp khác = chuyển dòng sang tab mới, sửa `cefr`, **giữ nguyên `key`**.
- `en`: dạng gốc của từ, không chứa dấu `:`.
- `vi`: **một nghĩa chính, ngắn gọn** (dùng làm đáp án trắc nghiệm). Nghĩa phụ → `vi_alt`, ngăn cách bằng `;`.
- `pos`: một trong `n v adj adv prep conj pron det interj num modal aux phr` (sửa danh sách ở `content/schema/constants.ts`).
- `cefr`: phải **khớp tên tab**.
- `domain`: đúng **một** `code` trong tab `domains` (`general` là bắt buộc; chỉ `general` tính cho điều kiện qua cấp).
- `topics`: một hoặc nhiều `slug` trong tab `topics`, ngăn cách bằng `,`.
- `rank`: số nguyên, thứ tự học trong cấp (nhỏ = học trước). Để trống → xếp sau cùng.

`sentences.words`: các `key` từ xuất hiện trong câu, ngăn cách bằng `,`.
`grammar.options`: các lựa chọn ngăn cách bằng `|`; `answer` là số thứ tự (từ 1) hoặc đúng văn bản của một lựa chọn.

## Lệnh

```bash
npm run content:probe                     # thử tải CSV từng tab từ Sheet: kích thước, số dòng, thời gian
npm run content:validate                  # kiểm tra định dạng, báo tab + số dòng; mã thoát 1 nếu có lỗi
npm run content:stats                     # đếm từ theo cefr × domain × pos
npm run content:genkeys                   # sinh key cho dòng mới → content/import/keys-<tab>.txt

# Dùng CSV tải tay thay vì gọi Sheet (mỗi tab một file <tên-tab>.csv, UTF-8):
npm run content:validate -- --from-dir content/import
npm run content:genkeys  -- --from-dir content/import --write   # điền key thẳng vào CSV
```

Đặt ID Sheet trong `content/sheet.config.json` (`sheetId`) hoặc biến môi trường `CONTENT_SHEET_ID` (`.env.local`).
Sheet cần chia sẻ **"ai có link: chỉ đọc"**. Nếu một tab có `gid` thì điền vào `sheet.config.json` (tải ổn định hơn theo tên tab).

## Đồng bộ vào Postgres

```bash
npm run content:sync -- --dry-run                 # xem trước: thêm / sửa / vắng, không ghi gì
npm run content:sync                              # ghi vào DB local (DATABASE_URL_LOCAL)
npm run content:sync -- --retire-missing          # key vắng trên Sheet → status 'retired' (không xóa)
npm run content:sync -- --target prod --yes       # ghi vào prod (DATABASE_URL_PROD)
npm run content:export                            # DB → content/backup/*.jsonl (sao lưu, commit được)
```

- Chỉ ghi dòng thêm/đổi (so băm nội dung theo `key`); `rand` của từ cũ giữ nguyên; mọi thứ trong **một giao dịch**.
- Từ vắng trên Sheet: chỉ cảnh báo. Có `--retire-missing` thì đổi sang `retired`; nếu hơn 2% mục active sẽ bị retire thì dừng (thêm `--force` khi chắc chắn).
- Đổi cấp = chuyển dòng sang tab mới, sửa `cefr`, giữ `key`: tiến độ người dùng và bộ đếm được sửa theo.
- Có lỗi định dạng thì dừng, không ghi gì.

## Thư mục

- `taxonomy/levels.yml`: ngưỡng số từ để được thi, cấu hình bài kiểm tra lên cấp.
- `sheet.config.json`: ID Sheet, tên tab, `gid` (không chứa khóa bí mật).
- `schema/`: hợp đồng cột và Zod schema cho cấu hình.
- `import/`, `sources/`, `media/`: không commit. `backup/`: JSONL do `export.ts` (Bước 1) dump, có commit.
