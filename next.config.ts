import type { NextConfig } from "next";
import path from "path";

// Turbopack がポートバインドを要求しサンドボックスで失敗するため、Webpack ビルダーへ明示的に戻す
const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => config,
};

export default nextConfig;
