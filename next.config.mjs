/** @type {import('next').NextConfig} */
const nextConfig = {
    // Tell Next.js not to try bundling these Node.js packages
    serverExternalPackages: ['mongoose', 'bcryptjs', 'jsonwebtoken'],
};

export default nextConfig;
