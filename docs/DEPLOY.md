# Deploying to Cloudflare (GitHub integration)

A step-by-step guide for deploying your own instance of Tullamore to production using Cloudflare Workers Builds with GitHub integration.

Prerequisites:
- A Cloudflare account, with `bunx wrangler login` already run locally
- Your own fork/copy of this repository on GitHub, with `main` as the production branch

---

## 1. Create the D1 database

```sh
bunx wrangler d1 create tullamore
```

Copy the `database_id` it prints into `wrangler.toml`'s `[[d1_databases]]` block (replacing the `REPLACE_WITH_YOUR_D1_DATABASE_ID` placeholder).

## 2. Create the KV namespace

```sh
bunx wrangler kv namespace create KV
```

Copy the `id` it prints into `wrangler.toml`'s `[[kv_namespaces]]` block (replacing the `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` placeholder).

## 3. Create the R2 bucket

```sh
bunx wrangler r2 bucket create tullamore
```

`wrangler.toml`'s `bucket_name = "tullamore"` will pick this up automatically — no further changes needed unless you chose a different bucket name.

## 4. Create the Queue (for large-table external DB ingestion)

```sh
bunx wrangler queues create tullamore-ingest
```

`wrangler.toml`'s `[[queues.producers]]`/`[[queues.consumers]]` (`queue = "tullamore-ingest"`, `INGEST_QUEUE` binding) already reference this queue name — no further changes needed. See `docs/DATA_CONNECTIONS.md` for details.

> The producer/consumer counts stay at `0` in `wrangler queues list` until the first Worker deploy in step 7 picks up the binding from `wrangler.toml`.

## 5. Apply D1 migrations (remote)

```sh
bunx wrangler d1 migrations apply tullamore --remote
```

---

## 6. Seed the first admin account (required)

Every route requires login and there's no sign-up screen, so the first admin account has to be inserted into D1 directly. **Don't use a weak password like `password` — use a strong one for production.**

### 6-1. Generate a password hash

```sh
bun -e "
import { hashPassword } from './src/lib/server/auth/password.ts';
console.log(await hashPassword('REPLACE_WITH_STRONG_PASSWORD'));
"
```

Example output: `pbkdf2:100000:xxxxxxxx...:yyyyyyyy...`

### 6-2. Generate a UUID

```sh
bun -e "console.log(crypto.randomUUID())"
```

### 6-3. Write the INSERT statement to a file and run it

`seed-admin.sql` (don't commit this file):

```sql
INSERT INTO accounts (id, name, email, role, permission, password_hash)
VALUES ('<UUID from 6-2>', '<display name>', '<your email>', '<role, optional, may be NULL>', 'admin', '<hash from 6-1>');
```

```sh
bunx wrangler d1 execute tullamore --remote --file ./seed-admin.sql
rm seed-admin.sql
```

After deploying, sign in with this account. Create additional accounts as needed from `/database/accounts` (admin only).

---

## 7. Create the Worker via GitHub integration (first deploy)

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create** → "Import a Git repository".
2. Connect your GitHub account and select your repository.
3. Build settings:
   - **Production branch**: `main`
   - **Build command**: `bun install && bun run build`
   - **Deploy command**: `bunx wrangler deploy`
   - **Root directory**: `/`
4. Click "Save and Deploy" to run the first deployment.

> Wrangler's default deploy command is `npx wrangler deploy`, but since this project uses Bun, change it to `bunx wrangler deploy`. The build image is detected as a Bun project because of the committed `bun.lock`.
>
> `bun run build` generates `.svelte-kit/cloudflare/_worker.js` according to `wrangler.build.jsonc` (the adapter's build-only config); the following `wrangler deploy` then follows `wrangler.toml` (`main = "worker.ts"`) to deploy a custom worker that wraps it (adding the queue consumer for large-table external DB ingestion). See "Worker entry point" in `CLAUDE.md` for details.

> **Known pitfall**: deploying with a local-only `[[hyperdrive]]` block still in `wrangler.toml` (e.g. the docker-compose sample connection from `docs/DATA_CONNECTIONS.md`) fails with `Invalid hyperdrive database ID '...'. It must be a valid UUID. [code: 10156]` — `localConnectionString` only works locally, and a remote deploy validates that `id` is a real UUID. If you added that block while working locally, remove it before committing/deploying. `bunx wrangler deploy --dry-run` will catch this ahead of time.

---

## 8. Configure environment variables / secrets

In the Cloudflare dashboard, go to Workers & Pages → (the Worker created in step 7) → **Settings → Variables and Secrets** (runtime variables, separate from build-time variables).

Plain variables set in the dashboard other than `wrangler.toml`'s `[vars]` (`MOCK_AI`) **can be wiped out on the next deploy**, so set all of the following as **Secrets** (it's fine to use Secret even for non-sensitive values).

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key. The model itself is chosen from `/settings/ai` (admin only, stored in the DB), but the API key stays an environment variable |
| `EMAIL_PROVIDER` | - | Needed if you want system email (password reset): `resend` / `ses` / `smtp` |
| `EMAIL_FROM` | Conditional | Required if `EMAIL_PROVIDER` is set. The from address |
| `EMAIL_FROM_NAME` | - | Display name for the sender |
| `RESEND_API_KEY` | Conditional | Required when `EMAIL_PROVIDER=resend` |
| `SES_REGION` / `SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY` | Conditional | Required when `EMAIL_PROVIDER=ses` |
| `SMTP_HOST` / `SMTP_USERNAME` / `SMTP_PASSWORD` | Conditional | Required when `EMAIL_PROVIDER=smtp` |
| `SMTP_PORT` / `SMTP_SECURE` | - | Optional SMTP settings (default `587` / `false`) |

If you don't use email (leaving `EMAIL_PROVIDER` unset), password-reset emails will fail to send, but nothing else is affected (the `send_email` MCP tool and notification-integration email settings are configured separately, from `/settings/email`, and stored in the DB).

Leave `wrangler.toml`'s `[vars]` `MOCK_AI = "false"` as-is (AI mocking disabled in production).

---

## 9. Post-deploy checklist

- [ ] The deploy log shows a successful build and deploy
- [ ] `wrangler queues list` shows `1`/`1` producers/consumers for `tullamore-ingest`
- [ ] You can sign in at `/signin` with the account seeded in step 6
- [ ] `/settings/account` shows/lets you change your display name and password
- [ ] `/settings/ai` shows/lets you change the AI model
- [ ] If you configured email, `/settings/email` reflects it
- [ ] Optionally configure external integrations (e.g. Slack notifications) at `/settings/integrations`
- [ ] Add any additional accounts you need from `/database/accounts`

---

## 10. Continuous deployment notes

- Pushing to `main` automatically triggers a build and deploy.
- **D1 migrations are not part of `wrangler deploy`.** If you add a new Drizzle migration, apply it to the remote DB manually after deploying:
  ```sh
  bunx wrangler d1 migrations apply tullamore --remote
  ```
- If an admin changes a user's password, that user's existing sessions remain valid until the KV TTL (7 days) expires.
- To add a real external DB connection (Hyperdrive), see "Adding a real external DB in production" in `docs/DATA_CONNECTIONS.md`.

---

## 11. Loading demo sample data (optional)

To quickly try out the analysis modules (regression, trend forecasting, correlation, KPI planning, etc.) for a demo, you can load `docs/sample-data/monthly_marketing_performance.csv` — 36 months of synthetic monthly data with per-channel ad spend, web visits, new customers, and revenue, including seasonality and a trend.

1. While signed in as an admin, open `/database/new` and create the following columns **in this exact order** (import maps CSV values by column position, so the order must match):

   | key | label | type |
   |---|---|---|
   | `month` | Month | date |
   | `ad_spend_search` | Search ad spend | number |
   | `ad_spend_sns` | Social ad spend | number |
   | `ad_spend_email` | Email campaign spend | number |
   | `web_visits` | Website visits | number |
   | `new_customers` | New customers | number |
   | `revenue` | Revenue | number |

   Any name works for the data source itself — e.g. "Monthly Marketing Performance".
2. On the detail page (`/database/[id]`), use "CSV Import" to upload `docs/sample-data/monthly_marketing_performance.csv`.
3. Try it out on `/analysis/regression` (target = revenue, features = the three ad-spend columns plus visits and new customers), `/analysis/trend` (date column = month, target = revenue), `/analysis/correlation`, `/kpi/new`, and so on.

Once you're done, delete the data source from `/database` so it doesn't get mixed up with real data later.
