import type { SceneDraw } from "../types";

const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const BAG = "#ffb020";
const BAG_DARK = "#c77700";
const POCKET = "#1457b5";
const SKIN = "#ffd9b3";
const CONFETTI = ["#ffb020", "#ffffff", "#ffe08a", "#8ec5ff"] as const;

const draw: SceneDraw = {
  // Giấy màu rơi chậm, xoay nhẹ.
  drawDecor(ctx, s) {
    const n = s.stage.h < 200 ? 16 : 30;
    for (let i = 0; i < n; i++) {
      const speed = 16 + rnd(i + 2) * 24;
      const w = 4 + rnd(i + 5) * 4;
      const y = s.stage.y + ((rnd(i + 9) * s.stage.h + s.t * speed) % s.stage.h);
      const x = s.stage.x + rnd(i + 1) * s.stage.w + Math.sin(s.t * 0.9 + i) * 12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.t * (0.8 + rnd(i + 7)) + i);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = CONFETTI[i % CONFETTI.length];
      ctx.fillRect(-w / 2, -w / 4, w, w / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // Chú cặp sách: thân cam, túi xanh, hai chân nhỏ; nhảy bước khi đi, mắt mở to khi chùm sáng chạm ô mật khẩu.
  drawMascot(ctx, s) {
    const { x, y, facing, moving, blink, excited } = s.mascot;
    const step = moving ? Math.sin(s.t * 14) : 0;
    const bob = moving ? Math.abs(Math.sin(s.t * 14)) * 2 : 0;
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.scale(facing, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // chân + giày
    ctx.strokeStyle = BAG_DARK;
    ctx.lineWidth = 4;
    for (const [lx, ph] of [[-7, 1], [7, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(lx, -10);
      ctx.lineTo(lx + step * ph * 4, -2);
      ctx.stroke();
      ctx.fillStyle = BAG_DARK;
      ctx.beginPath();
      ctx.ellipse(lx + step * ph * 4 + 2, -1.5, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // thân cặp
    ctx.fillStyle = BAG;
    ctx.strokeStyle = BAG_DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-16, -48, 32, 38, 9);
    ctx.fill();
    ctx.stroke();
    // nắp cặp
    ctx.fillStyle = BAG_DARK;
    ctx.beginPath();
    ctx.roundRect(-16, -48, 32, 14, [9, 9, 3, 3]);
    ctx.fill();
    // túi trước
    ctx.fillStyle = POCKET;
    ctx.beginPath();
    ctx.roundRect(-9, -26, 18, 12, 4);
    ctx.fill();
    // quai đeo + tay
    ctx.strokeStyle = POCKET;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, -48);
    ctx.lineTo(-10, -30);
    ctx.stroke();
    ctx.strokeStyle = SKIN;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(15, -30);
    ctx.lineTo(21, -24 + step * 3);
    ctx.stroke();
    // mắt trên nắp cặp (nhìn sang phải)
    ctx.fillStyle = "#ffffff";
    for (const ex of [3, 11]) {
      ctx.beginPath();
      ctx.arc(ex, -41, excited ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#0e1a33";
    if (blink) {
      ctx.fillRect(0, -41.6, 6, 1.6);
      ctx.fillRect(8, -41.6, 6, 1.6);
    } else {
      for (const ex of [4, 12]) {
        ctx.beginPath();
        ctx.arc(ex, -41, excited ? 2 : 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  // Kính lúp: gọng cam, mặt kính sáng, cán cầm.
  drawTool(ctx, s) {
    const { x, y, angle, held } = s.tool;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = s.pal.glow;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(2, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffb020";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(2, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = s.pal.text;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-24, 0);
    ctx.stroke();
    if (held) {
      ctx.strokeStyle = s.pal.text;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-28, -20, 48, 40);
    }
    ctx.restore();
  },
};

export default draw;
