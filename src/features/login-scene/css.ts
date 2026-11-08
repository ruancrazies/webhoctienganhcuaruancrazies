import { HEX_RE } from "../../cosmetics/core/tokens";
import type { SceneMeta } from "./scenes/types";

/** Tên biến CSS của từng token scene. Thẻ đăng nhập dùng đúng các biến của app (--surface, --accent…) để form không phải sửa. */
const VARS: Record<keyof SceneMeta["tokens"], string> = {
  surface: "--surface", text: "--text", textSoft: "--text-soft", accent: "--accent", accentSoft: "--accent-soft", onAccent: "--on-accent", accentEdge: "--accent-edge",
  border: "--border", controlBorder: "--control-border", margin: "--margin", mark: "--mark", danger: "--danger", dangerSoft: "--danger-soft", success: "--success", successSoft: "--success-soft",
  stageBg: "--ls-bg", stageBg2: "--ls-bg2", stageText: "--ls-text", stageTextSoft: "--ls-text-soft", stageAccent: "--ls-accent", glow: "--ls-glow",
};
export const SCENE_TOKEN_KEYS = Object.keys(VARS) as (keyof SceneMeta["tokens"])[];

/**
 * CSS biến của MỘT scene, sinh từ chính object scene (nên test tương phản chạy trên đúng dữ liệu đang dùng).
 * Phạm vi [data-login-scene="id"]: không đụng phần còn lại của app. Giá trị chỉ nhận #rrggbb nên không chèn được CSS lạ.
 */
export function sceneCss(s: SceneMeta): string {
  const decl = SCENE_TOKEN_KEYS.map((k) => {
    const v = s.tokens[k];
    if (!HEX_RE.test(v)) throw new Error(`scene ${s.id}: token ${k} phải là #rrggbb`);
    return `${VARS[k]}:${v}`;
  });
  decl.push("color-scheme:light");
  return `[data-login-scene="${s.id}"]{${decl.join(";")}}`;
}
