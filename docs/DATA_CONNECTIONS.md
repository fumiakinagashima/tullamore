# Data Connections (External DB Connections)

`/connections` (the "Connections" link under the "Data Sources" section in the sidebar, admin only) lets you pull tables from external Postgres/MySQL-family databases (Supabase, AWS RDS, etc.) into `data_sources`. This is a separate feature from `/settings/integrations` (notification integrations such as Slack/Teams).

## Architecture

`/connections` supports two kinds of providers (abstracted in `src/lib/server/db-connections/registry.ts`; if an `http_api` provider — e.g. Supabase REST — is added in the future, implement it there):

### Hyperdrive (`hyperdrive`)

- Connections go through Cloudflare **Hyperdrive** (supports both PostgreSQL and MySQL). Hyperdrive bindings are static (must be pre-registered in `wrangler.toml` and require a redeploy), so Tullamore never stores connection strings or passwords itself — it only references the `env.HYPERDRIVE_*` binding name.
- The `/connections` UI simply lists "bindings already registered in wrangler.toml" and lets you enable/disable each one with a toggle switch (bindings whose names start with `HYPERDRIVE_` are scanned at runtime — see `listAvailableHyperdriveBindings` in `src/lib/server/db-connections/hyperdrive.ts`). There's no form to type in a name/URL and "add a connection" — once you add the binding, it automatically shows up in the list, and turning the toggle on is all it takes.
- **The engine (Postgres/MySQL) is auto-detected from the shape of the binding.** There's no UI for an admin to pick the engine. In production, a real Hyperdrive binding exposes `{connectionString}` for Postgres, and for MySQL exposes `{host, port, user, password, database}` directly rather than a `connectionString` (per Cloudflare's own docs). However, `wrangler dev`'s local dev mode (`localConnectionString`) passes MySQL through in `{connectionString}` form too, so in that case detection falls back to the URL scheme (`postgres://` / `mysql://`) — see `isConnectionStringBinding` / `isHyperdriveMysqlObjectBinding` in `hyperdrive.ts`.
- `db_connections.id` reuses the binding name as-is. That means toggling off and back on repeatedly resurrects the same row, so the "imported from" display and re-sync via `external_table_syncs` keep working across a disable/re-enable cycle (see the `/api/db-connections` POST handler). This is deliberate — a random UUID would break that link every time the connection was disabled.
- Intended for major DB connections you use on an ongoing basis. Not self-service without a redeploy, since bindings are static.

### TCP Sockets (`tcp_socket`)

- Connects directly using a host/port/username/password you supply, via Cloudflare Workers' `cloudflare:sockets` (the `net`/`tls` compatibility layer under `nodejs_compat`). No pre-registered binding or redeploy needed — you can create one on the spot from the "Manual DB Connection" section's form on `/connections`.
- **The engine (Postgres/MySQL) must be selected explicitly in the form** (unlike Hyperdrive, it can't be auto-detected from connection info alone). When you switch the engine, the port field automatically updates to the new engine's default (5432/3306) if it was still showing the other engine's default.
- Implemented in `src/lib/server/db-connections/tcp-socket.ts`, which dispatches to `createPgDriver` in `pg-driver.ts` (the `pg` package) or `createMysqlDriver` in `mysql-driver.ts` (the `mysql2/promise` package) depending on `engine`. Both drivers only use `net.connect()`/`tls.connect()` and have no dependency on Hyperdrive-specific APIs, so they work as-is against any Postgres/MySQL connection. `mysql2` requires `disableEval: true` on Cloudflare Workers (its default row-parsing optimization uses `eval()`).
- Unlike Hyperdrive, connection details (host/port/username/password) are stored as-is in `db_connections.config`. The password is always masked before being returned to the client via `maskAuthConfig`/`mergeAuthConfig` in `src/lib/server/db/integration-service.ts` (shared with the secret-masking used for `integrations`); if an edit is submitted with the masked value unchanged, the existing value is kept.
- When `ssl: true`, connections use `{ rejectUnauthorized: false }` — a practical compromise for RDS/Supabase-style certificates that often can't be verified against Node's standard CA bundle. Note this weakens protection against man-in-the-middle attacks.
- No connection pooling/caching like Hyperdrive. Intended for connections that change often or are hard to pre-register.
- Works under both `bun dev` and `wrangler dev` (unlike Hyperdrive, it isn't limited by `getPlatformProxy`'s passthrough behavior — the `net`/`tls` APIs used by `pg`/`mysql2` have a real native implementation under Bun/Node and a `cloudflare:sockets`-backed compatibility layer under Workers, so both environments work).

### Common

- Import is **manual only** (the table-import flow on `/connections/[id]`, and the "Re-sync now" button on `/database/[id]`). Importing creates a `data_sources` row plus a `ds_<uuid>` physical table, after which the existing analysis stack (`/analysis/*`, etc.) works on it unmodified. Disabling or deleting a connection leaves already-imported data sources in place (they just can no longer be re-synced).
- **Large tables are ingested continuously via a Queue**: a single request can import up to `SYNC_ROW_BUDGET` rows (`src/lib/server/db-connections/ingest.ts`, 50,000). For a larger table, the first request synchronously imports that first batch of 50,000 rows (deleting and replacing any existing data), sets `external_table_syncs.lastSyncStatus` to `syncing`, and pushes the remainder onto a Cloudflare **Queue** (the `INGEST_QUEUE` binding in `wrangler.toml`). The `queue()` handler in `worker.ts` (`src/lib/server/db-connections/queue-consumer.ts`) appends `QUEUE_BATCH_ROWS` (20,000) rows at a time, re-queuing itself at the next offset as long as there's more to fetch. On completion, `lastSyncStatus` becomes `success`; on error it becomes `failed` with `lastSyncError` set (there's no infinite retry — the user can manually retry via "Re-sync now" on `/database/[id]`). While a background import is running, `/database/[id]` automatically reloads progress (`lastSyncRowCount`) every `INGEST_SYNC_POLL_INTERVAL_MS`.
- Column type mapping (`src/lib/server/db-connections/column-mapping.ts`) switches between the Postgres mapper (`mapPgTypeToColumnType`) and the MySQL mapper (`mapMysqlTypeToColumnType`) based on `DbConnectionDriver.engine`. **Known limitation**: MySQL's `BOOLEAN` is just an alias for `TINYINT(1)` and is indistinguishable from an ordinary tinyint column in `information_schema.columns.data_type`, so it's treated as a number rather than detected as boolean.
- **Fix for a date-column timezone bug**: by default, `pg`/`mysql2` interpret date/timestamp columns in the process's local timezone before converting to a `Date` object. `wrangler dev`/production always run in UTC, but `bun dev` runs in the machine's local timezone (e.g. JST), so the same date value could end up off by 9 hours. `pg-driver.ts` works around this with `types.setTypeParser` so date/timestamp/timestamptz columns come back as raw strings; `mysql-driver.ts` uses `dateStrings: true` for the same effect.

## Adding a real external DB in production

### Hyperdrive

1. Run `wrangler hyperdrive create <a descriptive name> --connection-string="postgres://user:pass@host:5432/db"` (or `mysql://user:pass@host:3306/db` for MySQL), and note the `id` it prints.
2. Add a `[[hyperdrive]]` block to `wrangler.toml`. `binding` must start with `HYPERDRIVE_` (e.g. `HYPERDRIVE_CUSTOMER_RDS`):

   ```toml
   [[hyperdrive]]
   binding = "HYPERDRIVE_CUSTOMER_RDS"
   id = "<the ID from step 1>"
   ```

3. `bun run build && wrangler deploy`
4. Open `/connections` as an admin — the new binding automatically appears in the list. Turn its toggle on.
5. Open "Import tables", pick the table(s) you want, and click "Import this table".

### TCP Sockets

1. On `/connections` (as an admin), open the "Manual DB Connection" section and click "+ Add connection".
2. Fill in the name, engine (Postgres/MySQL), host, port, database name, username, password, and whether SSL is required, then save (no redeploy needed — it's usable immediately).
3. Open "Import tables", pick the table(s) you want, and click "Import this table".

## Local development

`docker-compose.yml` sets up sample Postgres and MySQL instances (Postgres's host port is `55432` to avoid clashing with other projects; MySQL uses `3306`).

**`wrangler.toml` does not permanently include a local Hyperdrive sample connection** (doing so would break production deploys, as explained below). If you want to try this sample DB via Hyperdrive, temporarily add the following to `wrangler.toml` (**do not commit it**):

```toml
[[hyperdrive]]
binding = "HYPERDRIVE_LOCAL_SAMPLE"
id = "local-sample-placeholder"
localConnectionString = "postgres://tullamore:tullamore@localhost:55432/tullamore_sample"

[[hyperdrive]]
binding = "HYPERDRIVE_LOCAL_SAMPLE_MYSQL"
id = "local-sample-mysql-placeholder"
localConnectionString = "mysql://tullamore:tullamore@localhost:3306/tullamore_sample"
```

Both point at the `external_sales` table (sample monthly sales data, identical content) created by `01_sample_data.sql` under `docker/postgres-init/` and `docker/mysql-init/`.

```bash
docker compose up -d
bun run build
wrangler dev
```

**Hyperdrive does not work under `bun dev`.** The `getPlatformProxy` that `bun dev` relies on returns Hyperdrive as a "plain passthrough value" whose shape differs from the real thing under `wrangler dev`/production (D1/KV/R2 work fine under `bun dev` — this limitation is specific to Hyperdrive). Always use `bun run build && wrangler dev` when testing a Hyperdrive connection. **TCP Sockets do work under `bun dev`** (they aren't subject to `getPlatformProxy`'s binding-specific limitations). You can verify against the same Postgres/MySQL sample (`localhost:55432`/`localhost:3306`, `tullamore`/`tullamore`/`tullamore_sample`, no SSL) via the TCP Sockets provider too.

**Known pitfall (this actually broke the first production deploy on 2026-07-06)**: leaving the `[[hyperdrive]]` block above in `wrangler.toml` and running `wrangler deploy` will fail, because `localConnectionString` is local-only (used only by `wrangler dev`/`bun dev`), while a remote deploy validates that `id` is a real Hyperdrive Config UUID — resulting in `Invalid hyperdrive database ID 'local-sample-placeholder'. It must be a valid UUID. [code: 10156]`. If you added this block locally, remember to remove it from `wrangler.toml` once you're done.

## Adding a real Queue in production

1. `wrangler queues create tullamore-ingest`
2. The `[[queues.producers]]`/`[[queues.consumers]]` blocks in `wrangler.toml` (`queue = "tullamore-ingest"`) are already set up, so just run `bun run build && wrangler deploy`.
3. No pre-creation is needed locally under `wrangler dev` (Miniflare simulates it in memory). `bun dev` doesn't support Queue bindings at all, so verify large-table ingestion under `wrangler dev` (the same constraint as Hyperdrive).

## TODO (not yet implemented)

- **Automatic re-sync via Cron**: the `external_table_syncs` table was designed with future automation in mind (it has `lastSyncedAt`, etc.). Adding a `scheduled` handler to `worker.ts` and a `[triggers]` block to `wrangler.toml` would let a cron job scan this table and re-sync periodically.
- **HTTP API providers (Supabase REST/PostgREST, Aurora RDS Data API, etc.) are intentionally deferred**: research showed that the major serverless Postgres/MySQL offerings (Supabase, Neon, Aurora Serverless v2, etc.) reconnect transparently over the standard wire protocol even after scaling to zero, which Hyperdrive/TCP Sockets already cover (Neon's own docs, for instance, recommend using a standard driver like node-postgres rather than a dedicated one when using Cloudflare Workers + Hyperdrive). An HTTP API connection is really only needed for (1) older auto-pause-only services like Aurora Serverless v1, or (2) cases that specifically require going through Supabase REST's Row Level Security policies — narrow enough cases that it's better to revisit once an actual need shows up (the AWS Data API in particular requires hand-rolling SigV4 signing, which is costly enough to deprioritize further).
- **Live queries from chat**: a lightweight preview path that skips the import step. Only the import-based approach is implemented for now.
