import type { NextConfig } from "next";
import path from "path";

// Turbopack がポートバインドで失敗する環境向けに Webpack ビルドへ固定
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => config,
};

export default nextConfig;
