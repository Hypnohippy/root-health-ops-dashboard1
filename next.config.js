/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/tiktok-developers-site-verification.txt/",
        destination: "/tiktok-developers-site-verification.txt",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
