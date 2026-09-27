import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Garante que a cópia local dos documentos (pasta base/) vá junto no deploy.
  outputFileTracingIncludes: {
    "/api/**": ["./base/**/*"],
  },
};

export default nextConfig;
