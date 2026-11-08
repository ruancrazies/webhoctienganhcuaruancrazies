import type { SceneDraw } from "../types";

const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const FUR = "#9a6b45";
const DARK = "#5c3b24";

const draw: SceneDraw = {
  drawDecor(ctx, s) {
    const n = s.stage.h < 200 ? 22 : 42;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < n; i++) {
      const speed = 14 + rnd(i + 2) * 22;
      const r = 1.3 + rnd(i + 5) * 1.9;
      const y = s.stage.y + ((rnd(i + 9) * s.stage.h + s.t * speed) % s.stage.h);
      const x = s.stage.x + rnd(i + 1) * s.stage.w + Math.sin(s.t * 0.8 + i) * 10;
      ctx.globalAlpha = 0.55 + rnd(i + 4) * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  drawMascot(ctx, s) {
    const { x, y, facing, moving, blink, excited } = s.mascot;
    const step = moving ? Math.sin(s.t * 14) : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1); // vẽ quay mặt sang phải, lật khi đi sang trái
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // chân (bốn cái, hai cặp đối pha)
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 4;
    for (const [lx, ph] of [[-14, 1], [-8, -1], [10, -1], [16, 1]] as const) {
      ctx.beginPath();
      ctx.moveTo(lx, -14);
      ctx.lineTo(lx + step * ph * 6, -1);
      ctx.stroke();
    }
    // thân
    ctx.fillStyle = FUR;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -22, 24, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // cổ + đầu
    ctx.beginPath();
    ctx.moveTo(14, -28);
    ctx.lineTo(24, -42);
    ctx.lineTo(32, -38);
    ctx.lineTo(24, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(31, -42, 9, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // gạc
    ctx.strokeStyle = "#d8c19a";
    ctx.lineWidth = 2.5;
    for (const [bx, dir] of [[25, -1], [31, 1]] as const) {
      ctx.beginPath();
      ctx.moveTo(bx, -48);
      ctx.lineTo(bx + dir * 3, -60);
      ctx.moveTo(bx + dir * 1.5, -54);
      ctx.lineTo(bx + dir * 9, -57);
      ctx.moveTo(bx + dir * 3, -60);
      ctx.lineTo(bx + dir * 2, -66);
      ctx.stroke();
    }
    // mắt
    ctx.fillStyle = "#1a1208";
    if (blink) ctx.fillRect(26, -44, 5, 1.6);
    else {
      ctx.beginPath();
      ctx.arc(28, -44, excited ? 2.6 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // mũi đỏ: sáng rực khi chùm sáng chạm ô mật khẩu
    if (excited) {
      const g = ctx.createRadialGradient(39, -41, 1, 39, -41, 16);
      g.addColorStop(0, "rgba(255,90,80,0.75)");
      g.addColorStop(1, "rgba(255,90,80,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(39, -41, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e5322a";
    ctx.beginPath();
    ctx.arc(39, -41, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  drawTool(ctx, s) {
    const { x, y, angle, held } = s.tool;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // ngôi sao năm cánh, một cánh hướng theo chùm sáng
    ctx.fillStyle = s.pal.glow;
    ctx.strokeStyle = s.pal.accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 8 : 19;
      const a = (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (held) {
      ctx.strokeStyle = s.pal.text;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-23, -23, 46, 46);
    }
    ctx.restore();
  },
};

export default draw;
