/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ensure server components use Node.js runtime
    serverComponentsExternalPackages: ["bcryptjs", "bcrypt"],
  },
  // Disable static optimization for better dynamic rendering
  trailingSlash: false,
  // Webpack configuration to handle Node.js polyfills
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/graphql",
        destination: process.env.NEXT_PUBLIC_GRAPHQL_URL,
      },
    ];
  },
};

module.exports = nextConfig;
