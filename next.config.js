/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/tiktok-developers-site-verification.txt/",
        destination: "/tiktok-developers-site-verification.txt",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "roothealthops.com",
          },
        ],
        destination: "https://www.roothealthops.com/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
