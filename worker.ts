// Custom Worker entry point (wrangler.toml `main`).
//
// Wraps the SvelteKit-generated worker (built to .svelte-kit/cloudflare/_worker.js via
// wrangler.build.jsonc, see svelte.config.js). Kept outside src/ so svelte-check doesn't
// try to type-check the generated bundle that doesn't exist until `vite build` runs.
// Also owns the queue() handler for large-table ingestion continuation (INGEST_QUEUE,
// src/lib/server/db-connections/queue-consumer.ts) since that isn't part of the SvelteKit
// request/response lifecycle the generated worker handles.
import sveltekitWorker from './.svelte-kit/cloudflare/_worker.js';
import { handleIngestQueueBatch } from './src/lib/server/db-connections/queue-consumer';
import type { IngestQueueEnv, IngestQueueMessage } from './src/lib/server/db-connections/queue-consumer';

export default {
	fetch: sveltekitWorker.fetch,
	async queue(batch: MessageBatch<IngestQueueMessage>, env: IngestQueueEnv): Promise<void> {
		await handleIngestQueueBatch(batch, env);
	}
};
