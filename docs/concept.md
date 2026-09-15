# Tullamore

An AI-native DI (Decision Intelligence) tool focused on "future simulation." Unlike BI (dashboard-centric, backward-looking), DI is about running the decision-making loop (model → simulate → act → monitor).
The idea: AI builds a simulator from your data, and humans change the numbers to run simulations and decide on actions.
It's built on classic, well-understood techniques — regression analysis and machine learning — with AI handling variable design, choosing the best analysis method, and generating simulators.
On top of that, an AI assistant proposes multiple scenarios, explains variables, and generates charts of data trends.

## Tech stack

SvelteKit
TypeScript
DrizzleORM
Zod
Cloudflare Wrangler
Cloudflare D1
Cloudflare R2
Cloudflare KV
Cloudflare Queue

## Architecture

App (SvelteKit): chat UI, natural-language instructions
↓
Claude AI
↓
MCP (data, UI definitions)

## Sample use cases

## Comparison with existing BI/reporting tools

## Infrastructure policy

Currently built on Cloudflare (D1/KV/R2/Queue/Workers), chosen for edge deployment, serverless operation, and low cost — a good fit for a PoC.

That said, to leave room for a future infrastructure change (e.g. to AWS/GCP/Azure for partner reasons), the project follows these principles:

- **All DB access goes through DrizzleORM** (never call D1-specific APIs directly). DrizzleORM also supports PostgreSQL, MySQL, etc., so migrating means swapping the adapter.
- **Storage, queues, and KV should eventually sit behind an abstraction layer.** For now, calling Cloudflare directly is fine.
- **Keep dependence on runtime-specific APIs (`caches`, `waitUntil`, etc.) to a minimum.**

The current PoC implementation depends directly on Cloudflare; refactor toward an abstraction layer once an infrastructure migration becomes a real possibility.
