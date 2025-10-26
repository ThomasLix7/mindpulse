import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

export default {
  outputFileTracingRoot: "F:\\playground\\mindpulse",
  serverExternalPackages: ["@supabase/supabase-js", "playwright"],
  experimental: {},
  images: {
    domains: ["chrome.browserless.io"],
  },
  webpack: (config) => {
    // Optimize cache serialization to use Buffer instead of strings
    config.cache = {
      ...config.cache,
      type: "filesystem",
      buildDependencies: {
        config: [__filename],
      },
      // Use compression to reduce serialization size
      compression: "gzip",
      // Store large data as buffers instead of strings
      store: "pack",
    };

    return config;
  },
};
