import type { NextConfig } from "next";

// Turbopack がポートバインドを要求しサンドボックスで失敗するため、Webpack ビルダーへ明示的に戻す
const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => config,
};

export default nextConfig;
