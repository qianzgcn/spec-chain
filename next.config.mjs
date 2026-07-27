/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: process.env.SPECCHAIN_E2E === "true" ? ".next-e2e" : ".next",
};

export default nextConfig;
