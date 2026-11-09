import type { SceneDraw } from "../types";

const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const RED = "#c8202c";
const DARK = "#7a0f14";
const GOLD = "#ffd24d";
const CREAM = "#fff6e0";
const PETAL = ["#ffd24d", "#ffb3c7", "#ffe28a", "#ff8fb0"] as const; // mai vàng, đào hồng

const draw: SceneDraw = {
  // Cánh hoa mai/đào rơi chậm, xoay nhẹ.
  drawDecor(ctx, s) {
    const n = s.stage.h < 200 ? 16 : 30;
    for (let i = 0; i < n; i++) {
      const speed = 12 + rnd(i + 2) * 20;
      const r = 3 + rnd(i + 5) * 3;
      const y = s.stage.y + ((rnd(i + 9) * s.stage.h + s.t * speed) % s.stage.h);
      const x = s.stage.x + rnd(i + 1) * s.stage.w + Math.sin(s.t * 0.9 + i) * 14;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.t * (0.6 + rnd(i + 7)) + i);
      ctx.globalAlpha = 0.7 + rnd(i + 4) * 0.3;
      ctx.fillStyle = PETAL[i % PETAL.length];
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // Lân: thân đỏ, bờm vàng, râu trắng; mở miệng và sáng mắt khi chùm sáng chạm ô mật khẩu.
  drawMascot(ctx, s) {
    const { x, y, facing, moving, blink, excited } = s.mascot;
    const step = moving ? Math.sin(s.t * 14) : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // chân
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 5;
    for (const [lx, ph] of [[-16, 1], [-8, -1], [10, -1], [18, 1]] as const) {
      ctx.beginPath();
      ctx.moveTo(lx, -14);
      ctx.lineTo(lx + step * ph * 6, -1);
      ctx.stroke();
    }
    // đuôi: chùm lông vàng
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(-30, -32 + step * 2, 6, 0, Math.PI * 2);
    ctx.fill();
    // thân + vảy
    ctx.fillStyle = RED;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-2, -24, 27, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 9 - 2, -26, 5, Math.PI, 0);
      ctx.stroke();
    }
    // bờm
    ctx.fillStyle = GOLD;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(31 + Math.cos(a) * 14, -40 + Math.sin(a) * 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // đầu
    ctx.fillStyle = RED;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(19, -52, 26, 24, 9);
    ctx.fill();
    ctx.stroke();
    // sừng
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(30, -52);
    ctx.lineTo(33, -62);
    ctx.lineTo(36, -52);
    ctx.fill();
    // mắt
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(35, -43, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a0a0a";
    if (blink) ctx.fillRect(32, -43.5, 6, 1.6);
    else {
      ctx.beginPath();
      ctx.arc(36, -43, excited ? 2.8 : 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // mũi + miệng + râu
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(43, -37, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (excited) ctx.arc(37, -34, 5, 0.1, Math.PI - 0.1);
    else {
      ctx.moveTo(32, -33);
      ctx.lineTo(42, -33);
    }
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.moveTo(31, -30);
    ctx.lineTo(38, -30);
    ctx.lineTo(34, -22 + step);
    ctx.fill();
    ctx.restore();
  },

  // Bao lì xì: nền đỏ, viền và đồng tiền vàng.
  drawTool(ctx, s) {
    const { x, y, angle, held } = s.tool;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = RED;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-13, -19, 26, 38, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.fillRect(-1.5, -4, 3, 8);
    ctx.fillRect(-4, -1.5, 8, 3);
    if (held) {
      ctx.strokeStyle = s.pal.text;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-23, -26, 46, 52);
    }
    ctx.restore();
  },
};

export default draw;
