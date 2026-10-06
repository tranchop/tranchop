/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['unpdf'],
  experimental: { serverActions: { bodySizeLimit: '50mb' } } // PDFs e dados via server action
};
export default nextConfig;
