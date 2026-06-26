---
name: project-overview
description: Tullamore project overview — AI-first CRM/SFA forked from Midleton, tech stack, key architectural decisions
metadata:
  type: project
---

Tullamore is an AI-first chat-based CRM/SFA (forked from "Midleton"). Users issue business instructions via chat; AI dynamically generates UI, forms, and registration flows.

**Why:** Alcogy product built on SvelteKit + Claude AI + MCP server pattern.

**How to apply:** Use this as the baseline when suggesting architecture changes or new features.

## Tech Stack
- Package manager: Bun
- Frontend: SvelteKit 5 (Svelte runes mode enforced), TypeScript, SCSS
- Validation: Zod
- ORM: DrizzleORM (D1 SQLite via Cloudflare)
- Infra: Cloudflare Workers, D1, R2, KV
- AI: Claude API (Anthropic SDK)
- Protocol: MCP (Model Context Protocol)
- i18n: @inlang/paraglide-sveltekit (Japanese default, messages/ja.json)

## What Was Removed from Midleton for Tullamore
- Workflows (wrangler.toml used to have cron triggers for workflow runs — worker.ts import removed)
- Approval requests
- Custom entity tables (entity_types, entity_fields, entities)
- Migration 0026_remove_workflows_approvals_entities.sql drops these tables

## Key Files
- `worker.ts` — Cloudflare Workers entry (wraps SvelteKit worker, adds `scheduled` for reminders)
- `wrangler.toml` — local dev & production config
- `wrangler.build.jsonc` — adapter-only build config (main points to .svelte-kit/cloudflare/_worker.js)
- `src/lib/server/db/schema.ts` — Drizzle schema (single source of truth)
- `src/lib/server/mcp/` — MCP tool definitions per domain

## Local Dev Setup (completed 2026-06-26)
1. `bun install`
2. `bun run build` (generates .svelte-kit/cloudflare/_worker.js)
3. `bunx wrangler d1 migrations apply tullamore --local`
4. Insert admin account (see project memory: local-dev-accounts)
5. `bun run scripts/seed-demo-data.ts` (optional demo data)
6. `bunx wrangler dev` → http://localhost:8787
