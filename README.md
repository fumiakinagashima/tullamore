# Tullamore

An AI-native DI (Decision Intelligence) tool focused on "future simulation." Unlike BI (dashboard-centric, backward-looking), Tullamore has AI build regression/ML models from your data, lets you move variables to simulate scenarios, and turns that into your next action (a report, a KPI plan) — closing the decision-making loop.

Alongside natural-language chat analysis (automatic SQL generation and charting), purpose-built screens (regression, correlation, A/B testing, and other analysis modules, report creation, KPI management) are also available directly, without going through chat. See [`docs/concept.md`](docs/concept.md) for the full product concept.

## Key features

- **Chat AI** (`/chat`) — natural-language data aggregation, chart generation, and simulator creation via the Claude API + MCP tools
- **Report creation** (`/report-create`) — pick any combination of correlation, regression, descriptive statistics, logistic regression (classification), and A/B testing, run them, and have AI write up a report based on the results
- **KPI management** (`/kpi`) — back-solve target values for candidate driver variables from a target's goal value, save it as a plan, then track achievement against actuals for the target period with a gauge
- **Analysis modules** (`/analysis/*`) — 11 statistical analyses you configure and run directly, without going through chat: descriptive statistics, correlation, A/B testing, regression, logistic regression (classification), sensitivity analysis, scenario comparison, goal seek, trend forecasting, Monte Carlo simulation, and budget allocation optimization. Every screen shows an automatic validity check on its results, and you can configure it while consulting the AI assistant on the right
- **Simulators** (`/simulators`) — persisted regression models created from chat. Move variables with sliders to see how the prediction changes, with an AI review and a chat panel on the left
- **Database management** (`/database`) — register data sources, import CSVs, inspect schemas, run data-quality checks (missing values, outliers), and query everything from a global SQL console
- **Connections** (`/connections`, admin only) — import tables from external Postgres/MySQL databases (via Hyperdrive or TCP Sockets); large tables are ingested continuously in the background via a Cloudflare Queue
- **Settings** (`/settings`) — external API integrations, email settings, AI model settings, your own profile
- **Notifications** — a notification center
- **Auth & permissions** — login required everywhere (all routes are guarded), with `general`/`admin` permissions gating admin screens and APIs

## Tech stack

| Category | Technology |
|------|------|
| Package manager | Bun |
| Frontend | SvelteKit, TypeScript |
| Validation | Zod |
| ORM | DrizzleORM |
| Infrastructure | Cloudflare (Wrangler, D1, R2, KV, Queue, Hyperdrive) |
| AI | Claude API (Anthropic) |
| Protocol | MCP (Model Context Protocol) |
| i18n | Paraglide-JS |
| Testing | Vitest (two projects: plain-node unit tests + D1-backed tests), Playwright (E2E) |

## Setting up a dev environment

### Requirements

- [Bun](https://bun.sh/) v1.x or later
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)

### 1. Install

```sh
git clone https://github.com/fumiakinagashima/tullamore.git
cd tullamore
bun install
```

### 2. Configure environment variables

Copy `.dev.vars.example` to `.dev.vars` and fill in the values you need:

```sh
cp .dev.vars.example .dev.vars
```

At minimum:

```sh
ANTHROPIC_API_KEY="sk-ant-..."  # Your Anthropic API key
MOCK_AI="false"                 # Set to true to try the app with mocked AI responses, no API key needed
```

If you want email, also set `EMAIL_PROVIDER` and the matching keys (`resend` / `ses` / `smtp`).

### 3. Run database migrations

Apply migrations to the local D1 database (SQLite is created under `.wrangler/state/`):

```sh
bunx wrangler d1 migrations apply tullamore --local
```

### 4. Create an admin account

There's no sign-up screen (every route requires login), so create the first account directly via SQL:

```sh
bunx wrangler d1 execute tullamore --local --command "INSERT INTO accounts (id, name, email, permission, password_hash) VALUES ('local-admin-0001', 'Admin', 'admin@example.com', 'admin', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8')"
```

The password is `password` (the hash above is a temporary SHA-256 format that gets automatically migrated to PBKDF2 on first successful login). After logging in, create a data source from `/database` to start exploring chat and the analysis modules.

### 5. Start the dev server

```sh
bun dev   # Vite + platformProxy, with HMR
```

Open `http://localhost:5173` in your browser and sign in from `/signin`.

KV, R2, and D1 are created automatically under `.wrangler/state/` locally — no extra setup needed.

> **Note on sending email (SMTP)**: the SMTP provider on `/settings/email` uses `cloudflare:sockets` (a workerd-runtime-only API), so it doesn't work under `bun dev` (Vite on Node.js). Use Resend or AWS SES to test email locally.

> **Note on data connections (Hyperdrive)**: `/connections` uses Hyperdrive bindings, which don't work correctly under `bun dev` (`getPlatformProxy`). `getPlatformProxy` returns Hyperdrive as a "plain passthrough value" whose shape differs from the real thing under `wrangler dev`/production (see [Cloudflare's docs](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy)). Use `bun run build && wrangler dev` instead (see `docs/DATA_CONNECTIONS.md`).

> **Note on background ingestion (Queue)**: continuous processing for large external-table imports only runs through the `queue()` handler in `worker.ts`. `bun dev` doesn't go through `worker.ts` (it's Vite's own dev server), so use `bun run build && wrangler dev` to test it as well.

### Other commands

```sh
bun run check          # Type checking (svelte-check)
bun run test:unit      # Unit tests (Vitest, plain Node) + D1-backed tests (@cloudflare/vitest-pool-workers, real D1 on Miniflare)
bun run test:e2e       # E2E tests (Playwright)
bun run db:studio      # Browse the local DB with Drizzle Studio
```

## UI components

Components fall into three categories.

- **`src/lib/components/ui/`** — app UI (design system)
- **`src/lib/components/chat/`** — components the AI returns as no-code responses
- **`src/lib/components/analysis/`** — analysis-workbench-only components (AI assistant, KPI form, report modal)

A live demo is available at the `/ui` route.

---

### App UI components

#### Textbox

A text input field.

```svelte
<Textbox label="Data source name" bind:value={name} placeholder="Monthly sales..." required />
<Textbox label="Email" bind:value={email} type="email" error="Please enter a valid email address" />
```

| prop | type | description |
|------|----|------|
| `label` | `string?` | Label text |
| `value` | `string` (bindable) | Input value |
| `type` | `string?` | The input's `type` attribute (default `text`) |
| `placeholder` | `string?` | Placeholder text |
| `required` | `boolean?` | Shows a required marker |
| `disabled` | `boolean?` | Disabled state |
| `error` | `string?` | Error message |

---

#### Textarea

A multi-line text input.

```svelte
<Textarea label="Notes" bind:value={memo} rows={4} placeholder="Anything else..." />
```

| prop | type | description |
|------|----|------|
| `rows` | `number?` | Number of rows (default `3`) |
| others | — | Same as Textbox |

---

#### Select

A native `<select>` with a custom arrow.

```svelte
<Select label="Period type" bind:value={periodType} options={[
  { value: 'year', label: 'Yearly' },
  { value: 'month', label: 'Monthly' }
]} />
```

| prop | type | description |
|------|----|------|
| `options` | `{ value: string; label: string }[]` | The choices |
| `placeholder` | `string?` | Text shown when nothing is selected |

---

#### SearchSelect

A combobox with search, supporting keyboard navigation (↑↓ Enter Esc).

```svelte
<SearchSelect label="Data source" bind:value={dataSourceId} options={sourceOptions} placeholder="Search or select..." />
```

| prop | type | description |
|------|----|------|
| `options` | `{ value: string; label: string }[]` | The choices |
| `placeholder` | `string?` | Placeholder text |

---

#### Toggle

An on/off switch.

```svelte
<Toggle label="Enable Monte Carlo threshold" bind:checked={thresholdEnabled} />
```

| prop | type | description |
|------|----|------|
| `label` | `string?` | Label text |
| `checked` | `boolean` (bindable) | State |
| `disabled` | `boolean?` | Disabled state |

---

#### MultiSelect

Multi-select buttons (an alternative to checkboxes). Value is `string[]`.

```svelte
<MultiSelect label="Feature variables" bind:value={featureColumns} options={columnOptions} />
```

| prop | type | description |
|------|----|------|
| `value` | `string[]` (bindable) | Currently selected values |
| `options` | `{ value: string; label: string }[]` | The choices |

---

#### SingleSelect

Single-select buttons (an alternative to radio buttons), styled as a segmented control.

```svelte
<SingleSelect label="Test method" bind:value={testType} options={[
  { value: 'mean', label: 'Difference in means (t-test)' },
  { value: 'proportion', label: 'Difference in proportions (z-test)' }
]} />
```

---

#### DatePicker

A date input (native `<input type="date">`).

```svelte
<DatePicker label="Period from" bind:value={periodFrom} max={periodTo} required />
```

| prop | type | description |
|------|----|------|
| `value` | `string` (bindable) | Date string in ISO 8601 format |
| `min` / `max` | `string?` | Allowed range |
| `required` | `boolean?` | Shows a required marker |

---

#### TimePicker

A time input (native `<input type="time">`).

```svelte
<TimePicker label="Run time" bind:value={time} />
```

---

#### DateTimePicker

A date-and-time input (native `<input type="datetime-local">`). Values are treated as JST wall-clock time (see `parseJstDatetime` etc. in `src/lib/datetime.ts`).

```svelte
<DateTimePicker label="Scheduled at" bind:value={datetime} />
```

---

#### NumberInput

A number input with −/+ stepper buttons. The browser's native spin buttons are hidden.

```svelte
<NumberInput label="Sample count" bind:value={sampleCount} min={1000} max={10000} step={500} />
<NumberInput label="Total budget" bind:value={totalBudget} prefix="$" step={10000} />
```

| prop | type | description |
|------|----|------|
| `value` | `number` (bindable) | The number |
| `min` / `max` | `number?` | Range (disables the stepper buttons at the bounds) |
| `step` | `number?` | Step size (default `1`) |
| `prefix` / `suffix` | `string?` | A unit shown before/after the value |

---

#### FileUpload

A drag-and-drop file picker.

```svelte
<FileUpload label="CSV file" accept=".csv" />
```

| prop | type | description |
|------|----|------|
| `accept` | `string?` | Allowed file extensions |
| `multiple` | `boolean?` | Allow multiple files |

---

#### Table

A data table with sorting and pagination.

```svelte
<Table
  columns={[
    { key: 'label', label: 'KPI' },
    { key: 'current', label: 'Current value' }
  ]}
  rows={tableRows}
/>
```

| prop | type | description |
|------|----|------|
| `columns` | `{ key, label, sortable? }[]` | Column definitions |
| `rows` | `Record<string, unknown>[]` | The data |
| `pageSize` | `number?` | Rows per page (default `10`) |

---

#### Pagination

Pagination controls (also used inside Table). The convention is to paginate list views by `LIST_PAGE_SIZE` (`constants.ts`).

```svelte
<Pagination bind:page={currentPage} totalPages={20} />
```

---

#### List

A card-based list. Generic, so it accepts a type-safe snippet.

```svelte
<List items={dataSources} columns={3}>
  {#snippet card(s)}
    <p>{s.name}</p>
  {/snippet}
</List>
```

---

#### DataGrid

A spreadsheet-style grid input, with Tab/Enter cell navigation. Used for things like editing the grid in trend forecasting.

```svelte
<DataGrid
  bind:rows={gridRows}
  columns={[
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'value', label: 'Value', type: 'number', width: 90 }
  ]}
  maxHeight={400}
  onchange={(rows) => refit(rows)}
/>
```

| prop | type | description |
|------|----|------|
| `columns` | `GridColumn[]` (`key`/`label`/`type: 'text'\|'number'\|'date'\|'select'`/`options`/`width`/`readonly`) | Column definitions |
| `rows` | `GridRow[]` (bindable) | The data (`Record<string, string\|number\|null>`) |
| `addable` / `deletable` | `boolean?` | Show add/delete row buttons (default `true`) |
| `maxHeight` | `number?` | When set, fixes the height and enables vertical scrolling |
| `onchange` | `(rows) => void?` | Change callback |

---

#### BarChart / LineChart / PieChart / ScatterChart

The base chart set used for chat-generated charts and the analysis modules (colored with `--chart-1` through `--chart-6`).

```svelte
<BarChart data={[{ label: 'Tokyo', value: 120 }]} mode="stacked" />
<LineChart series={[{ name: 'Actual', data: historical }, { name: 'Trend', data: trend }]} markerIndex={historicalCount} />
<PieChart data={[{ label: 'A', value: 40 }]} donut />
<ScatterChart points={[{ x: 1, y: 2 }]} xLabel="Ad spend" yLabel="Revenue" />
```

LineChart supports overriding the height with `height`, and drawing an actual/forecast boundary line with `markerIndex`/`markerLabel`.

---

#### TornadoChart

A tornado chart for sensitivity analysis (ranks each feature variable by how much it swings the outcome).

```svelte
<TornadoChart bars={sensitivityBars} base={baseline} />
```

---

#### GaugeChart

Shows the current value as a ratio of a target (e.g. KPI achievement) as a semicircular gauge, color-coded good (≥100%) / caution (≥70%) / poor (<70%).

```svelte
<GaugeChart value={achievement.current} target={achievement.targetValue} size={170} />
```

| prop | type | description |
|------|----|------|
| `value` / `target` | `number` | Current value / target value |
| `title` | `string?` | Caption |
| `size` | `number?` | Width in px (default `160`) |
| `showValues` | `boolean?` | Show the current/target numbers (default `true`) |

---

#### CorrelationHeatmap

A correlation-matrix heatmap (a diverging blue-to-orange color scale for negative/positive correlation).

```svelte
<CorrelationHeatmap columns={heatmapColumns} matrix={correlationMatrix.matrix} />
```

---

#### ValidityCard

Shows a good/caution/poor validity check for an analysis result (sample size, goodness of fit, etc.). Shared across all analysis modules.

```svelte
<ValidityCard validity={result.validity} />
```

---

#### TypingIndicator

A three-dot "AI is typing" animation.

```svelte
{#if isLoading}
  <TypingIndicator />
{/if}
```

---

### Chat UI components (`src/lib/components/chat/`)

Dynamic UI components the AI returns in its responses. Per the system prompt's spec, the AI emits a `<ui type="...">` tag, which the client parses and renders. The full spec lives in the system prompts under `src/lib/server/ai/`.

#### Form (chat)

```
<ui type="form" title="Send email">
[{"key":"to","label":"To","type":"email","required":true},{"key":"body","label":"Body","type":"textarea"}]
</ui>
```

Field types: `text` / `email` / `number` / `textarea` / `select` / `date` / `datetime-local` / `hidden`. Currently the only registered tool using this path is `send_email`.

#### Table (chat)

```
<ui type="table" title="Sales by region">
{"columns":[{"key":"region","label":"Region"},...],"rows":[...]}
</ui>
```

#### ActionSelector

```
<ui type="actions" title="What would you like to do?">
[{"id":"create_simulator","label":"Create a simulator","description":"Models the relationship between ad spend and revenue"}]
</ui>
```

When the user picks an action, its label is sent as the next chat message.

#### Other components

| Component | Purpose |
|------|------|
| `Values` | A key/value summary display |
| `Chart` | Renders AI-generated aggregate results as a bar/line/pie chart, etc. |
| `Simulator` | A chat-created regression simulator (slider controls, AI review) |
| `Link` | A link to a record. `newTab="true"` opens it in a new tab (without interrupting the conversation) |
| `Reply` | Inline UI for answering a question or choosing an option the AI presents |

---

## Directory structure

```
tullamore/
├── src/
│   ├── routes/
│   │   ├── chat/                 # Chat screen (/chat)
│   │   ├── report-create/        # Report creation (shares the AI-assistant layout)
│   │   ├── kpi/                  # KPI management (list, create, detail, edit)
│   │   ├── analysis/             # 11 analysis modules (descriptive-stats, correlation, ab-test, regression, classification, sensitivity, scenario, goal-seek, trend, monte-carlo, budget-allocation)
│   │   ├── simulators/           # List/detail for chat-created simulators
│   │   ├── database/             # Data source management workbench
│   │   ├── connections/          # External DB connection management (admin only)
│   │   ├── settings/             # Settings screens
│   │   ├── signin/               # Sign in, password reset
│   │   └── api/                  # API endpoints for chat, analysis, data sources, KPIs, connections, etc.
│   └── lib/
│       ├── analysis/             # Analysis engine (isomorphic, DB-independent: linear regression, correlation, descriptive stats, A/B testing, KPI back-solving, etc.)
│       ├── components/
│       │   ├── ui/               # App UI components (design system)
│       │   ├── chat/             # Components the AI returns as responses
│       │   ├── analysis/         # Analysis-workbench-only components
│       │   ├── dialog/           # Form dialogs
│       │   └── icon/             # SVG icon components
│       ├── server/
│       │   ├── db/               # DrizzleORM schema & queries
│       │   ├── analysis/         # D1-dependent analysis logic (SQL aggregation, validity checks, KPI achievement tracking, etc.)
│       │   ├── mcp/               # MCP tool definitions
│       │   ├── ai/               # Claude API integration, system prompts
│       │   ├── auth/             # Sessions, password hashing
│       │   ├── db-connections/   # External DB connections (Hyperdrive/TCP Sockets)
│       │   ├── email/            # System email sending
│       │   └── test-setup/       # Migration setup for D1-backed tests
│       ├── styles/               # Global styles, theme
│       └── types/                # Shared type definitions
├── messages/                     # i18n resources (en.json)
├── drizzle/                      # Migration files
├── docs/
│   ├── concept.md                # Product concept
│   └── DATA_CONNECTIONS.md       # How external DB connections work
├── vitest.workers.config.ts       # Vitest config for D1-backed tests (@cloudflare/vitest-pool-workers)
├── worker.ts                      # Cloudflare Workers entry point
├── wrangler.toml
└── wrangler.build.jsonc
```

## Theme

Dark / light / system (follows the OS setting), switchable from the sidebar. Tokens are defined as CSS custom properties (`--color-*`) and applied via the `data-theme` attribute.

## i18n

English strings live in `messages/en.json` and are referenced via `m.key()` (Paraglide-JS). English is the default and only language for now; the i18n setup is in place to add more languages later.

## License

[MIT](LICENSE)
