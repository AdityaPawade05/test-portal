import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    cpus: 2,
  },
  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/admin/dashboard",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/admin/tests/:path*",
        destination: "/tests/:path*",
        permanent: false,
      },
      {
        source: "/admin/banks/:path*",
        destination: "/banks/:path*",
        permanent: false,
      },
      {
        source: "/admin/invitations/:path*",
        destination: "/invitations/:path*",
        permanent: false,
      },
      {
        source: "/invite",
        destination: "/candidate/dashboard",
        permanent: false,
      },
      {
        source: "/take",
        destination: "/candidate/dashboard",
        permanent: false,
      },
      {
        source: "/test/:path*",
        destination: "/tests/:path*",
        permanent: false,
      },
      {
        source: "/bank/:path*",
        destination: "/banks/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

