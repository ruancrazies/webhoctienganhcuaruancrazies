import "server-only";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "./auth/session";
import { isServiceError } from "./errors";

/**
 * Lớp mỏng cho Route Handler: xác thực phiên → kiểm tra đầu vào bằng Zod → gọi service → đổi lỗi thành JSON.
 * Route không chứa logic nghiệp vụ (ADR-1, ADR-2).
 */

const MAX_BODY_BYTES = 64 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

export const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: NO_STORE });
const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) =>
  json({ error, code, ...extra }, status);

/** Chặn POST từ trang web khác (cookie phiên được gửi kèm): nếu có Origin thì phải cùng host. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // gọi từ server/curl không có Origin; vẫn phải có cookie phiên hợp lệ
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new HttpError(413, "TOO_LARGE", "Yêu cầu quá lớn");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "BAD_JSON", "Nội dung yêu cầu không phải JSON hợp lệ");
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  throw new HttpError(400, "BAD_REQUEST", `Dữ liệu không hợp lệ${first ? `: ${first.path.join(".") || "_"} — ${first.message}` : ""}`);
}

async function run(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof UnauthorizedError) return fail(401, "UNAUTHORIZED", "Chưa đăng nhập");
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    if (isServiceError(e)) return json(e.toBody(), e.status);
    console.error("[api]", e); // lỗi DB/bất ngờ: không lộ chi tiết cho client
    return fail(500, "INTERNAL", "Lỗi máy chủ, vui lòng thử lại");
  }
}

/** POST JSON: kiểm tra Origin → đăng nhập → parse body → service. */
export function postJson<S extends z.ZodType>(schema: S, fn: (body: z.infer<S>, userId: string) => Promise<unknown>) {
  return (req: Request): Promise<Response> =>
    run(async () => {
      if (!sameOrigin(req)) throw new HttpError(403, "BAD_ORIGIN", "Yêu cầu không hợp lệ");
      const userId = await requireUserId();
      return fn(parse(schema, await readJson(req)), userId);
    });
}

/** GET: đăng nhập → `query(searchParams)` dựng đối tượng để Zod kiểm tra → service. */
export function getQuery<S extends z.ZodType>(
  schema: S,
  query: (params: URLSearchParams) => unknown,
  fn: (q: z.infer<S>, userId: string) => Promise<unknown>,
) {
  return (req: Request): Promise<Response> =>
    run(async () => {
      const userId = await requireUserId();
      return fn(parse(schema, query(new URL(req.url).searchParams)), userId);
    });
}
