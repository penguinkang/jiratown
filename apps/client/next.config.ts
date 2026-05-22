import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@jiratown/shared", "@jiratown/engine"]
};

export default nextConfig;
