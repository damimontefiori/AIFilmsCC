/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma client should be treated as an external package on the server.
  serverExternalPackages: ["@prisma/client", "prisma"],
  eslint: {
    // Linting is run separately; don't fail production builds on lint.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
