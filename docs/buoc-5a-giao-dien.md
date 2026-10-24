# Bước 5a: giao diện (không gồm 10 trò chơi)

File mới / sửa so với bản trước:
- `src/app/app.css`                       giao diện "vở ô ly" (chỉ áp dụng trong nhóm (app))
- `src/app/(app)/layout.tsx`              khung chung: thanh trên, thanh tab dưới (điện thoại), nút tắt âm
- `src/app/(app)/page.tsx`                trang chủ (thay trang tạm của Bước 3)
- `src/app/(app)/level/[cefr]/*`          trang cấp: chọn phạm vi, Học, thi, lưới 10 trò
- `src/app/(app)/learn/[cefr]/*`          trang Học từ vựng (phân trang keyset, "Đã học")
- `src/app/(app)/exam/[cefr]/*`           thi lên cấp: điều kiện, đếm ngược, nộp bài, kết quả
- `src/app/(app)/leaderboard/*`           xếp hạng XP + Đua tốc độ theo cấp
- `src/app/(app)/profile/*`               hồ sơ, lộ trình, tắt âm, đăng xuất
- `src/app/(app)/{loading,error,not-found}.tsx`
- `src/components/{Nav,MuteButton,QuestionCard}.tsx`
- `src/lib/{api,format,sound}.ts`         fetch API, định dạng, speak() + sfx()
- `src/games/registry.ts`                 danh sách 10 trò (đang `ready: false`)
- `next.config.ts`                        thêm outputFileTracingIncludes cho levels.yml (cần khi lên Vercel)
