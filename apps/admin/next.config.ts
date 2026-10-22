import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NODE_ENV === "production" ? ".next-production" : ".next",
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
    cpus: 1,
  },
};

export default config;
