import { RepoError } from "../errors";
import { CEFR_ORDER, type Cefr, type Word } from "../../core/types";

/**
 * Client Supabase không có kiểu schema (chưa sinh types/database.ts) nên kiểu `data` do thư viện suy ra không đáng tin
 * (quan hệ nhiều-một bị suy thành mảng). Ta khai báo kiểu hàng ở từng chỗ dùng và ép tại đây.
 */
type PgResult = { data: unknown; error: { message: string; code?: string } | null };

/** Lấy `data` hoặc ném RepoError. `data` null (vd maybeSingle không có dòng) được trả nguyên. */
export function unwrap<T>(op: string, res: PgResult): T | null {
  if (res.error) throw new RepoError(op, res.error.message, res.error.code);
  return (res.data as T | null) ?? null;
}

/** Như unwrap nhưng trả mảng rỗng khi không có dữ liệu. */
export function unwrapList<T>(op: string, res: PgResult): T[] {
  return unwrap<T[]>(op, res) ?? [];
}

export const WORD_COLS = "id,key,en,pos,vi,vi_alt,ipa,cefr,domain";

export type WordRow = {
  id: number;
  key: string;
  en: string;
  pos: string;
  vi: string;
  vi_alt: string[] | null;
  ipa: string | null;
  cefr: string;
  domain: string;
  freq_rank?: number;
};

export function toWord(r: WordRow): Word {
  return {
    id: r.id,
    key: r.key,
    en: r.en,
    pos: r.pos,
    vi: r.vi,
    viAlt: r.vi_alt?.length ? r.vi_alt : undefined,
    ipa: r.ipa,
    cefr: r.cefr as Cefr,
    domain: r.domain,
  };
}

/** Cấp liền kề (kể cả chính nó, cấp đó đứng đầu): dùng chọn đáp án nhiễu. */
export function nearCefr(cefr: Cefr): Cefr[] {
  const i = CEFR_ORDER.indexOf(cefr);
  return [cefr, CEFR_ORDER[i - 1], CEFR_ORDER[i + 1]].filter((c): c is Cefr => !!c);
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Chạy `fn` cho mọi phần tử, tối đa `limit` việc song song, giữ thứ tự kết quả. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
