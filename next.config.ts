import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: ["@supabase/supabase-js", "playwright"],
  images: {
    domains: ["chrome.browserless.io"],
  },
};

export default nextConfig;
