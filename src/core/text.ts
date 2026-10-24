/** Chuẩn hóa chữ khi so khớp đáp án tiếng Anh (mục 2c: text). */

/** NFC + cắt khoảng trắng đầu/cuối. Dùng cho so khớp CHÍNH XÁC (đáp án tiếng Việt: không bỏ dấu). */
export function nfc(s: string): string {
  return s.normalize("NFC").trim();
}

/**
 * Chuẩn hóa để so khớp đáp án tiếng Anh gõ tay: bỏ dấu, hạ chữ thường, đổi nháy cong thành nháy thẳng,
 * gộp khoảng trắng, bỏ dấu câu ở hai đầu. Giữ dấu gạch nối và nháy trong từ.
 */
export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,!?;:"“”()]+|[\s.,!?;:"“”()]+$/g, "")
    .trim();
}

/** Như norm nhưng bỏ cả khoảng trắng (so khớp trò xếp chữ cái). */
export function compact(s: string): string {
  return norm(s).replace(/\s+/g, "");
}

/** Khoảng cách Levenshtein. */
export function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** "Gần đúng": sai đúng một ký tự và đáp án dài từ 4 ký tự (từ ngắn sai một chữ là từ khác). */
export function isNear(typed: string, expected: string): boolean {
  const a = norm(typed);
  const b = norm(expected);
  return b.length >= 4 && a !== b && lev(a, b) === 1;
}
