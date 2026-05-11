import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: process.env.CI !== "true",
});

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
    "@survivefun/solana-pda",
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-base-ui",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-phantom",
  ],
};

export default withBundleAnalyzer(nextConfig);
