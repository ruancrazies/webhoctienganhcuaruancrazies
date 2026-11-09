import type { ThemeTokens } from "../../../cosmetics/core/tokens";
import type { ThemeSkin } from "../../../cosmetics/core/define";
import { ID_RE } from "../../../cosmetics/core/unlock";

/**
 * Hợp đồng của một Scene đăng nhập. `scene.ts` NHẸ (chỉ dữ liệu, ~1 KB) và được import tĩnh để màu/chữ có trong HTML từ server;
 * `draw.ts` NẶNG (vẽ canvas) chỉ được nạp động ở client, sau khi form đã hiện.
 */

/** Token của thẻ đăng nhập: đè đúng các biến mà form dùng, trong phạm vi [data-login-scene]. Thẻ luôn nền đặc, nên không phụ thuộc theme của app. */
export type CardTokens = Pick<
  ThemeTokens,
  "surface" | "text" | "textSoft" | "accent" | "accentSoft" | "onAccent" | "accentEdge" | "border" | "controlBorder" | "margin" | "mark" | "danger" | "dangerSoft" | "success" | "successSoft"
>;

/** Token của "sân khấu" (khu minh họa bên trái / dải trên ở điện thoại). */
export type StageTokens = {
  stageBg: string; // đầu gradient
  stageBg2: string; // cuối gradient
  stageText: string; // chữ chính trên sân khấu (đạt 4.5:1 trên cả hai đầu gradient)
  stageTextSoft: string; // chữ phụ
  stageAccent: string; // nét nhấn/viền focus của công cụ (đạt 3:1)
  glow: string; // màu chùm sáng (trang trí)
};

export type SceneTokens = CardTokens & StageTokens;

export type SceneCanvas = {
  /** hang: nhân vật treo trên dây, đi ngang theo con trỏ. walk: đi trên mặt đất theo con trỏ. */
  mascot: "hang" | "walk";
  /** Tên đọc được của công cụ kéo thả (screen reader), ví dụ "Đèn pin". */
  toolLabel: string;
  /** Gợi ý ngắn (chữ thật, không bắt buộc làm theo). */
  hint: string;
  /** true nếu drawDecor có chuyển động liên tục (tuyết, dơi): vòng lặp không tự dừng khi đứng yên. */
  ambient: boolean;
};

export type SceneMeta = {
  /** Bất biến: DB (login_scenes.key) tham chiếu mã này. */
  id: string;
  /** Tên cho admin. */
  name: string;
  /** Câu chào mặc định (admin sửa được, tối đa 80 ký tự). Là văn bản thật, đọc được bằng screen reader. */
  greeting: string;
  /** Dòng phụ dưới câu chào. */
  tagline: string;
  tokens: SceneTokens;
  /** Hình khối của thẻ đăng nhập (bo góc, bóng, viền). Độc lập với skin của theme trong app; mặc định "soft". Không dùng "glass" vì thẻ cần nền đặc. */
  skin?: Exclude<ThemeSkin, "glass">;
  /** Có phần canvas nâng cao không (khi có thì BẮT BUỘC có draw.ts; test kiểm). */
  canvas?: SceneCanvas;
  sort?: number;
  /** false = ngừng cung cấp: không chọn được, scene đang dùng rơi về mặc định. */
  active?: boolean;
};

export function defineScene<T extends SceneMeta>(s: T): T {
  if (!ID_RE.test(s.id)) throw new Error(`scene: id "${s.id}" không hợp lệ (chữ thường, số, gạch ngang; 2–24 ký tự; bắt đầu bằng chữ cái)`);
  return s;
}

/** Trạng thái truyền cho hàm vẽ (toạ độ theo px CSS, gốc ở góc trên trái của vùng đăng nhập). */
export type DrawState = {
  t: number; // giây từ lúc bắt đầu
  dt: number;
  w: number;
  h: number;
  stage: { x: number; y: number; w: number; h: number };
  mascot: { x: number; y: number; facing: 1 | -1; moving: boolean; blink: boolean; excited: boolean; look: { x: number; y: number } };
  tool: { x: number; y: number; angle: number; held: boolean };
  /** Chùm sáng đang chiếu vào ô mật khẩu. */
  lit: boolean;
  pal: { glow: string; accent: string; text: string; bg: string; bg2: string };
};

export type SceneDraw = {
  drawMascot(ctx: CanvasRenderingContext2D, s: DrawState): void;
  /** Vẽ thân công cụ tại (tool.x, tool.y), hướng theo tool.angle (radian, 0 = sang phải). */
  drawTool(ctx: CanvasRenderingContext2D, s: DrawState): void;
  /** Chuyển động nền (tuyết, dơi…). Hình tĩnh của scene nằm trong CSS. */
  drawDecor(ctx: CanvasRenderingContext2D, s: DrawState): void;
};
