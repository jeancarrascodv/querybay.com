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
      { source: "/signin", destination: "https://app.querybay.com/signin", permanent: false },
      { source: "/signup", destination: "https://app.querybay.com/signup", permanent: false },
    ];
  },
};

module.exports = nextConfig;
