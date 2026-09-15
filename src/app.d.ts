// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			account: import('$lib/server/db/account-service').AccountRow | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			ctx: ExecutionContext;
			env: {
				DB: D1Database;
				ANTHROPIC_API_KEY: string;
				MOCK_AI: string;
				KV?: KVNamespace;
				R2?: R2Bucket;
				// email (set EMAIL_PROVIDER to 'resend' | 'ses' | 'smtp')
				EMAIL_PROVIDER?: string;
				EMAIL_FROM?: string;
				EMAIL_FROM_NAME?: string;
				RESEND_API_KEY?: string;
				SES_REGION?: string;
				SES_ACCESS_KEY_ID?: string;
				SES_SECRET_ACCESS_KEY?: string;
				SMTP_HOST?: string;
				SMTP_PORT?: string;
				SMTP_SECURE?: string;
				SMTP_USERNAME?: string;
				SMTP_PASSWORD?: string;
				// External DB connections (Hyperdrive). 1 connection = 1 binding (must be pre-registered in
				// wrangler.toml and requires a redeploy). To support multiple connections, bindings whose
				// name starts with `HYPERDRIVE_` are scanned at runtime and used
				// (see listAvailableHyperdriveBindings in src/lib/server/db-connections/hyperdrive.ts)
				[key: `HYPERDRIVE_${string}`]: Hyperdrive | undefined;
				// Queue for large-table continuation ingest of external DB connections (consumed by worker.ts's
				// queue() handler; see src/lib/server/db-connections/queue-consumer.ts)
				INGEST_QUEUE?: Queue<import('$lib/server/db-connections/queue-consumer').IngestQueueMessage>;
			};
		}
	}
}

export {};
