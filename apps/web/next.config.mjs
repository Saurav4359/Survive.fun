/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@survivefun/types",
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-base-ui",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-wallets",
  ],
};

export default nextConfig;
