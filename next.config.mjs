/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  webpack(config, { dev }) {
    if (dev) {
      // Switch to inline source maps so the browser never requests
      // external *.map files (eliminates LayoutGroupContext.mjs.map 404s
      // and similar noise from framer-motion / other packages).
      config.devtool = "eval-cheap-module-source-map";

      // Suppress webpack warnings about missing source maps in node_modules
      config.ignoreWarnings = [
        ...(config.ignoreWarnings ?? []),
        /Failed to parse source map/,
      ];
    }
    return config;
  },
};

export default nextConfig;
