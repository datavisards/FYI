import type { NextConfig } from "next";

import { AI_HEADER_LIST } from "./src/lib/ai/headers";

const nextConfig: NextConfig = {
  /** /study was the path during the user study; keep it working. */
  async redirects() {
    return [{ source: "/study", destination: "/app", permanent: true }];
  },

  /** CORS for the API routes. The preflight itself is answered per route. */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            /* These win over the route's OPTIONS headers, so they must stay in sync. */
            value: `Content-Type, ${AI_HEADER_LIST}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
