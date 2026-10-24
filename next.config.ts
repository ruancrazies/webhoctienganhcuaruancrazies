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
        ],
      },
    ];
  },
};

export default config;
