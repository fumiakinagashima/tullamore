// Custom Worker entry point (wrangler.toml `main`).
//
// Wraps the SvelteKit-generated worker (built to .svelte-kit/cloudflare/_worker.js via
// wrangler.build.jsonc, see svelte.config.js). Kept outside src/ so svelte-check doesn't
// try to type-check the generated bundle that doesn't exist until `vite build` runs.
import sveltekitWorker from './.svelte-kit/cloudflare/_worker.js';

export default {
	fetch: sveltekitWorker.fetch
};
