import type { SceneDraw } from "../types";

const BODY = "#0b0614";
const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function bat(ctx: CanvasRenderingContext2D, x: number, y: number, flap: number, size: number): void {
  const wing = Math.sin(flap) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = BODY;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 12, -10 - wing * 10, side * 24, -2 - wing * 8);
    ctx.quadraticCurveTo(side * 18, 2, side * 14, 4);
    ctx.quadraticCurveTo(side * 9, 1, side * 5, 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 1, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(-2, -9);
  ctx.lineTo(0, -5);
  ctx.lineTo(2, -9);
  ctx.lineTo(3, -4);
  ctx.fill();
  ctx.restore();
}

const draw: SceneDraw = {
  drawDecor(ctx, s) {
    const n = s.stage.h < 200 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const speed = 38 + rnd(i + 1) * 30;
      const span = s.stage.w + 80;
      const x = s.stage.x + ((s.t * speed + rnd(i + 7) * span) % span) - 40;
      const y = s.stage.y + s.stage.h * (0.14 + 0.16 * i) + Math.sin(s.t * 2.2 + i * 2) * 10;
      bat(ctx, x, y, s.t * 11 + i * 3, 0.85 + rnd(i + 3) * 0.3);
    }
  },

  drawMascot(ctx, s) {
    const { x, y, moving, blink, excited, look } = s.mascot;
    // dây tơ từ đỉnh sân khấu
    ctx.strokeStyle = s.pal.text;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, s.stage.y);
    ctx.lineTo(x, y - 14);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y);
    // 8 chân, đung đưa khi đang đi
    const sway = moving ? Math.sin(s.t * 18) * 5 : Math.sin(s.t * 2.5) * 1.5;
    ctx.strokeStyle = BODY;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const a = -0.9 + i * 0.55;
        const ex = side * (20 + Math.cos(a) * 14);
        const ey = Math.sin(a) * 18 + 6 + (i % 2 ? sway : -sway);
        ctx.beginPath();
        ctx.moveTo(side * 6, 2);
        ctx.quadraticCurveTo(side * 22, -10 + i * 6, ex, ey);
        ctx.stroke();
      }
    }
    // thân + viền cam để nổi trên nền tối
    ctx.fillStyle = BODY;
    ctx.strokeStyle = s.pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 8, 14, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -8, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // mắt nhìn theo con trỏ
    const dx = look.x - x;
    const dy = look.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const px = (dx / d) * 1.8;
    const py = (dy / d) * 1.8;
    const r = excited ? 4.4 : 3.6;
    for (const ex of [-3.6, 3.6]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      if (blink) ctx.rect(ex - r, -9.5, r * 2, 1.6);
      else ctx.arc(ex, -9, r, 0, Math.PI * 2);
      ctx.fill();
      if (!blink) {
        ctx.fillStyle = BODY;
        ctx.beginPath();
        ctx.arc(ex + px, -9 + py, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  drawTool(ctx, s) {
    const { x, y, angle, held } = s.tool;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineJoin = "round";
    // thân đèn
    ctx.fillStyle = "#4a4560";
    ctx.strokeStyle = BODY;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-20, -7, 30, 14, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = s.pal.accent;
    ctx.fillRect(-8, -7, 5, 14);
    // đầu đèn loe ra
    ctx.fillStyle = "#6a6485";
    ctx.beginPath();
    ctx.moveTo(10, -7);
    ctx.lineTo(24, -12);
    ctx.lineTo(24, 12);
    ctx.lineTo(10, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // kính đèn
    ctx.fillStyle = s.pal.glow;
    ctx.beginPath();
    ctx.ellipse(24, 0, 3, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (held) {
      ctx.strokeStyle = s.pal.text;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-23, -15, 50, 30);
    }
    ctx.restore();
  },
};

export default draw;
