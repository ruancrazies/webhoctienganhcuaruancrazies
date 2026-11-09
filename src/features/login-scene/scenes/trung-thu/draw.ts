import type { SceneDraw } from "../types";

const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const FUR = "#f4efe6";
const EDGE = "#8a8497";
const PINK = "#f7a8be";
const LANTERN = "#ff9a3c";
const BAND = "#ffd86b";

const draw: SceneDraw = {
  // Sao lấp lánh và đom đóm bay chậm.
  drawDecor(ctx, s) {
    const n = s.stage.h < 200 ? 18 : 34;
    for (let i = 0; i < n; i++) {
      const x = s.stage.x + rnd(i + 1) * s.stage.w;
      const y = s.stage.y + rnd(i + 3) * s.stage.h * 0.8;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(s.t * (0.8 + rnd(i + 5)) + i));
      ctx.globalAlpha = tw;
      ctx.fillStyle = i % 5 === 0 ? s.pal.glow : "#ffffff";
      ctx.beginPath();
      ctx.arc(i % 5 === 0 ? x + Math.sin(s.t * 0.5 + i) * 12 : x, i % 5 === 0 ? y + Math.cos(s.t * 0.4 + i) * 8 : y, i % 5 === 0 ? 2.4 : 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // Thỏ ngọc: lông trắng, tai dài, nhảy nhẹ khi đi; mắt sáng khi chùm sáng chạm ô mật khẩu.
  drawMascot(ctx, s) {
    const { x, y, facing, moving, blink, excited } = s.mascot;
    const hop = moving ? Math.abs(Math.sin(s.t * 10)) * 5 : 0;
    ctx.save();
    ctx.translate(x, y - hop);
    ctx.scale(facing, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // đuôi
    ctx.fillStyle = FUR;
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-22, -20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // thân
    ctx.beginPath();
    ctx.ellipse(-4, -18, 21, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // chân
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(-12, -1);
    ctx.moveTo(8, -6);
    ctx.lineTo(10, -1);
    ctx.stroke();
    // tai
    for (const [ex, tilt] of [[18, -0.25], [26, 0.05]] as const) {
      ctx.save();
      ctx.translate(ex, -44);
      ctx.rotate(tilt + (moving ? Math.sin(s.t * 10) * 0.1 : 0));
      ctx.fillStyle = FUR;
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -12, 4.5, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PINK;
      ctx.beginPath();
      ctx.ellipse(0, -12, 2, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // đầu
    ctx.fillStyle = FUR;
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(24, -34, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // mắt
    ctx.fillStyle = "#c2294a";
    if (blink) ctx.fillRect(25, -37, 5, 1.6);
    else {
      ctx.beginPath();
      ctx.arc(28, -36, excited ? 2.8 : 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // mũi + má
    ctx.fillStyle = PINK;
    ctx.beginPath();
    ctx.arc(34, -33, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (excited) {
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(26, -30, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  // Lồng đèn tròn: thân cam, hai dải vàng, nắp và tua.
  drawTool(ctx, s) {
    const { x, y, angle, held } = s.tool;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = LANTERN;
    ctx.strokeStyle = s.pal.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = BAND;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = s.pal.accent;
    ctx.fillRect(-6, -19, 12, 5);
    ctx.fillRect(-6, 14, 12, 4);
    ctx.fillStyle = BAND;
    ctx.fillRect(-1.5, 18, 3, 8);
    if (held) {
      ctx.strokeStyle = s.pal.text;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-24, -26, 48, 54);
    }
    ctx.restore();
  },
};

export default draw;
