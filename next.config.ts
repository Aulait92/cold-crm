import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CSV-Import der Agenturliste (~3 MB) läuft über eine Server Action
    serverActions: { bodySizeLimit: "20mb" },
    proxyClientMaxBodySize: "20mb",
  },
};

export default nextConfig;
