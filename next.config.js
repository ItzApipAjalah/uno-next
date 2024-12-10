/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        domains: ['uno-backend-eta.vercel.app'],
    },
    async rewrites() {
        return [
            {
                source: '/socket.io/:path*',
                destination: 'https://uno-backend-eta.vercel.app/socket.io/:path*',
            },
        ]
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Credentials', value: 'true' },
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS,PUT,DELETE' },
                    { key: 'Access-Control-Allow-Headers', value: 'X-Requested-With, Accept, Content-Type' },
                ]
            }
        ]
    }
}

module.exports = nextConfig 