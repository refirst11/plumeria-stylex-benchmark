import type { NextConfig } from "next";
import { withPlumeria } from "@plumeria/next-plugin/turbopack";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../"),
};

export default withPlumeria(nextConfig);
