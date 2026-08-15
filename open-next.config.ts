import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * OpenNext adapter config for Cloudflare Workers.
 *
 * Defaults are deliberate. The incremental cache, tag cache, and revalidation
 * queue overrides all exist to serve ISR, which this app does not use: the only
 * prerendered routes are / and /app, and everything under /api is dynamic.
 * Leaving them unset keeps the deployment to a single Worker with no R2 bucket.
 *
 * routePreloadingBehavior is left at "none" on purpose. Preloading raises CPU
 * usage on cold starts, and CPU per invocation is the binding constraint on the
 * Workers free plan.
 */
export default defineCloudflareConfig()
