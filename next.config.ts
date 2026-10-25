import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // levels.yml được đọc lúc chạy (server/config.ts): phải đóng gói cùng hàm serverless trên Vercel.
  outputFileTracingIncludes: { "/**": ["./content/taxonomy/levels.yml"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // CSP (có nonce) được đặt theo từng request ở src/proxy.ts, không đặt tĩnh ở đây.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // microphone=(self): chừa chỗ cho tính năng luyện nói sau này; camera/vị trí/thanh toán tắt hẳn.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
