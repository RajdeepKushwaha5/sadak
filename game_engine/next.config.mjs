/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,

  webpack: (config, { dev }) => {
    // This repo lives inside a OneDrive folder, which syncs `.next` while
    // webpack is still writing to it. That corrupts the on-disk cache and
    // surfaces as ENOENT renames on *.pack.gz, phantom "Cannot find module
    // './638.js'", or truncated bundles. Keeping the dev cache in memory costs
    // a slightly slower cold start and removes the whole class of failure.
    if (dev) config.cache = { type: "memory" };

    // Scope hoisting fails here non-deterministically: `next build` reports
    // "Unexpected end of JSON input" against a *different* handful of routes
    // each run, on a clean .next, with no dev server, on both Node 22 and 23.
    // The set changing between identical runs points at a race in the build
    // workers rather than anything in this app's code — disabling module
    // concatenation makes every run succeed. It costs a little bundle size,
    // which is the right trade for a build that always completes.
    config.optimization = { ...config.optimization, concatenateModules: false };

    return config;
  },
};

export default nextConfig;
