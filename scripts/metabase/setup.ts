/**
 * Dựng collection + câu hỏi + dashboard trên Metabase từ scripts/metabase/questions/*.sql (giai đoạn 1a).
 *
 *   MB_URL=http://localhost:3000 MB_USER=admin@example.com MB_PASSWORD=... npx tsx scripts/metabase/setup.ts
 *
 * Trước đó: đã chạy trình hướng dẫn cài Metabase và kết nối CSDL (docs/metabase.md, mục 5–6).
 * Có thể chạy lại nhiều lần: câu hỏi / dashboard trùng tên trong collection được CẬP NHẬT, không nhân đôi.
 * Script chỉ gọi API của Metabase, không chạm CSDL của app.
 *
 * LƯU Ý: script này viết theo API Metabase mà chưa được chạy thử trên một bản Metabase thật. Nếu API đổi và script lỗi,
 * nó in nguyên lỗi từ Metabase; khi đó tạo thủ công theo docs/metabase.md (mục 7) — SQL trong thư mục questions/ dùng chung.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MB_URL = (process.env.MB_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MB_USER = process.env.MB_USER;
const MB_PASSWORD = process.env.MB_PASSWORD;
const DB_NAME = process.env.MB_DATABASE_NAME ?? "English Game analytics"; // tên kết nối CSDL đã tạo trong Metabase
const COLLECTION = "English Game: phân tích";
const QUESTIONS_DIR = path.join(__dirname, "questions");

/** Biến dùng trong SQL → khai báo template tag và bộ lọc dashboard. */
const PARAMS: Record<string, { label: string; type: "text" | "number"; default?: number }> = {
  cefr: { label: "Cấp (CEFR)", type: "text" },
  domain: { label: "Lĩnh vực", type: "text" },
  pos: { label: "Loại từ", type: "text" },
  game: { label: "Game", type: "text" },
  topic: { label: "Chủ đề ngữ pháp", type: "text" },
  min_attempts: { label: "Lượt tối thiểu", type: "number", default: 20 },
  min_users: { label: "Số người tối thiểu", type: "number", default: 5 },
};

const DASHBOARDS: Record<string, { name: string; description: string }> = {
  hard: { name: "Từ và bài khó", description: "Từ, câu ngữ pháp, dạng bài sai nhiều; cặp dễ nhầm; câu nghi sai nội dung. Làm mới mỗi đêm." },
  health: { name: "Sức khoẻ dữ liệu", description: "Sự kiện mỗi ngày, độ phủ response_ms, lần làm mới view." },
  activity: { name: "Hoạt động và giữ chân", description: "Người học mỗi ngày và tuần, độ dài phiên, giờ học phổ biến, tỉ lệ bỏ dở, người quay lại sau 7 ngày. Người dùng là user_ref băm một chiều." },
  level: { name: "Trình độ chung", description: "Số người ở từng cấp, tỉ lệ qua kỳ thi, điểm bài thi theo thời gian và theo phần, điểm yếu phổ biến." },
  effect: { name: "Hiệu quả gợi ý", description: "So sánh trước/sau theo từng người sau khi có gợi ý theo luật (weak-first) và coach AI: độ chính xác, số ngày học, điểm kiểm tra. Không có nhóm đối chứng ngẫu nhiên; đọc kèm docs/buoc-4-do-hieu-qua.md." },
};

let session = "";

// Phản hồi API Metabase không có kiểu cố định; các chỗ dùng tự khai báo hình dạng cần đọc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${MB_URL}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(session ? { "X-Metabase-Session": session } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : (undefined as T);
}

type Question = {
  file: string; name: string; dashboard: string; display: string; w: number; h: number;
  sql: string; vars: string[]; dimensions?: string[]; metrics?: string[];
};

function loadQuestions(): Question[] {
  return readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith(".sql")).sort().map((file) => {
    const raw = readFileSync(path.join(QUESTIONS_DIR, file), "utf8");
    const meta: Record<string, string> = {};
    const body: string[] = [];
    for (const line of raw.split("\n")) {
      const m = /^--\s*(name|dashboard|display|size|graph\.dimensions|graph\.metrics):\s*(.+)$/.exec(line);
      if (m) meta[m[1]] = m[2].trim();
      else body.push(line);
    }
    const sql = body.join("\n").trim();
    const [w, h] = (meta.size ?? "12x8").split("x").map(Number);
    const vars = [...new Set([...sql.matchAll(/\{\{(\w+)\}\}/g)].map((x) => x[1]))];
    for (const v of vars) if (!PARAMS[v]) throw new Error(`${file}: biến {{${v}}} chưa khai báo trong PARAMS`);
    if (!meta.name || !meta.dashboard || !DASHBOARDS[meta.dashboard]) throw new Error(`${file}: thiếu/sai -- name hoặc -- dashboard`);
    return {
      file, name: meta.name, dashboard: meta.dashboard, display: meta.display ?? "table", w, h, sql, vars,
      dimensions: meta["graph.dimensions"]?.split(","), metrics: meta["graph.metrics"]?.split(","),
    };
  });
}

const tags = (vars: string[]) =>
  Object.fromEntries(vars.map((v) => {
    const p = PARAMS[v];
    return [v, {
      id: randomUUID(), name: v, "display-name": p.label, type: p.type,
      ...(p.default !== undefined ? { required: true, default: p.default } : { required: false }),
    }];
  }));

async function main() {
  if (!MB_USER || !MB_PASSWORD) throw new Error("Thiếu MB_USER / MB_PASSWORD (tài khoản quản trị Metabase).");
  session = (await api<{ id: string }>("POST", "/api/session", { username: MB_USER, password: MB_PASSWORD })).id;

  const dbs = await api<{ data?: { id: number; name: string }[] } | { id: number; name: string }[]>("GET", "/api/database");
  const list = Array.isArray(dbs) ? dbs : dbs.data ?? [];
  const db = list.find((d) => d.name === DB_NAME);
  if (!db) throw new Error(`Không thấy kết nối CSDL tên "${DB_NAME}" (có: ${list.map((d) => d.name).join(", ") || "không có"}). Tạo kết nối trước hoặc đặt MB_DATABASE_NAME.`);

  const cols = await api<{ id: number | string; name: string; personal_owner_id?: number | null }[]>("GET", "/api/collection");
  let collection = cols.find((c) => c.name === COLLECTION && !c.personal_owner_id);
  if (!collection) collection = await api("POST", "/api/collection", { name: COLLECTION });
  const collectionId = collection!.id as number;

  const items = async (model: "card" | "dashboard") =>
    (await api<{ data: { id: number; name: string; model: string }[] }>("GET", `/api/collection/${collectionId}/items?models=${model}`)).data;
  const existingCards = await items("card");
  const existingDash = await items("dashboard");

  const questions = loadQuestions();
  const cardIds = new Map<string, number>();
  for (const q of questions) {
    const payload = {
      name: q.name, display: q.display, collection_id: collectionId,
      visualization_settings: q.dimensions ? { "graph.dimensions": q.dimensions, "graph.metrics": q.metrics } : {},
      dataset_query: { database: db.id, type: "native", native: { query: q.sql, "template-tags": tags(q.vars) } },
    };
    const found = existingCards.find((c) => c.name === q.name);
    const card = found ? await api("PUT", `/api/card/${found.id}`, payload) : await api("POST", "/api/card", payload);
    cardIds.set(q.file, card.id);
    console.log(`${found ? "cập nhật" : "tạo"} câu hỏi: ${q.name}`);
  }

  for (const [key, d] of Object.entries(DASHBOARDS)) {
    const qs = questions.filter((q) => q.dashboard === key);
    const used = [...new Set(qs.flatMap((q) => q.vars))];
    const parameters = used.map((v) => ({
      id: v, name: PARAMS[v].label, slug: v, type: PARAMS[v].type === "number" ? "number/=" : "string/=",
      ...(PARAMS[v].default !== undefined ? { default: PARAMS[v].default } : {}),
    }));
    const found = existingDash.find((x) => x.name === d.name);
    const dash = found
      ? await api("PUT", `/api/dashboard/${found.id}`, { name: d.name, description: d.description, parameters })
      : await api("POST", "/api/dashboard", { name: d.name, description: d.description, collection_id: collectionId, parameters });

    // Xếp lưới 24 cột: từ trái sang phải, hết hàng thì xuống dòng.
    let row = 0, col = 0, rowH = 0;
    const dashcards = qs.map((q, i) => {
      if (col + q.w > 24) { row += rowH; col = 0; rowH = 0; }
      const placed = {
        id: -(i + 1), card_id: cardIds.get(q.file), row, col, size_x: q.w, size_y: q.h,
        parameter_mappings: q.vars.map((v) => ({ parameter_id: v, card_id: cardIds.get(q.file), target: ["variable", ["template-tag", v]] })),
      };
      col += q.w; rowH = Math.max(rowH, q.h);
      return placed;
    });
    await api("PUT", `/api/dashboard/${dash.id}`, { dashcards });
    console.log(`${found ? "cập nhật" : "tạo"} dashboard: ${d.name} (${qs.length} câu hỏi) → ${MB_URL}/dashboard/${dash.id}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
