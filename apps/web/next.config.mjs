/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dd.dexscreener.com",
        pathname: "/ds-data/**",
      },
    ],
  },
  transpilePackages: [
    "@survivefun/types",
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-base-ui",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-phantom",
  ],
};

export default nextConfig;
