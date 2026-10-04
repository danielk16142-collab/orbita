import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@orbita/security", "@orbita/agent"],
  serverExternalPackages: ["undici", "cheerio", "sharp"],
  // Per-request CSP (with nonce) is set in middleware.
};

export default createNextIntlPlugin("./src/i18n/request.ts")(config);
