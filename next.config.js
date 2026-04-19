/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: "",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/pagos", destination: "/checkout", permanent: true },
      { source: "/pagos/:path*", destination: "/checkout/:path*", permanent: true },
    ];
  },
};

module.exports = nextConfig;
