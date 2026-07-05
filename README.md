# Tullamore

「未来シミュレーション」にフォーカスしたAI-nativeなDI（Decision Intelligence／意思決定インテリジェンス）ツール。過去を振り返るBI（ダッシュボード中心）とは異なり、AIがデータから回帰分析・機械学習モデルを作り、人間が変数を動かしてシナリオをシミュレーションし、次のアクション（レポート・KPI設定）に繋げる——意思決定のループを回す体験を提供する。

チャットでの自然言語分析（SQL自動生成・グラフ化）に加え、目的ごとの専用画面（回帰分析・相関分析・A/Bテスト等の分析モジュール、レポート作成、KPI管理）もチャットを介さず直接使える。詳細なプロダクトコンセプトは [`docs/concept.md`](docs/concept.md) を参照。

## 主な機能

- **チャットAI**（`/`）— Claude API + MCP ツールによる自然言語でのデータ集計・グラフ生成、シミュレーター作成
- **レポート作成**（`/report-create`）— 相関分析・回帰分析・記述統計・ロジスティック回帰（分類）・A/Bテストから好きな手法を選んで実行し、AIが結果を踏まえたレポートを作成
- **KPI管理**（`/kpi`）— 目的変数の目標値からKPI候補（説明変数）の目標値を逆算してプランとして保存。保存後は対象期間の実績データに基づく達成率をゲージで確認できる
- **分析モジュール**（`/analysis/*`）— チャットを介さず直接設定して都度実行する11種類の統計分析: 記述統計・相関分析・A/Bテスト・回帰分析・ロジスティック回帰（分類）・感度分析・シナリオ比較・ゴールシーク・トレンド予測・モンテカルロ・予算配分最適化。各画面の結果には妥当性チェックが自動表示され、右側のAIアシスタントに相談しながら設定できる
- **シミュレーター**（`/simulators`）— チャットの依頼で作成される永続化された回帰モデル。スライダーで変数を動かして予測値の変化を確認、AIレビュー・左側AIチャット相談欄付き
- **データベース管理**（`/database`）— データソースの登録・CSVインポート・スキーマ確認・データ品質チェック（欠損値・外れ値）・グローバルSQLクエリコンソール
- **接続管理**（`/connections`、管理者のみ）— 外部Postgres/MySQL（Hyperdrive／TCP Sockets）からのテーブル取り込み。大規模テーブルはCloudflare Queueでバックグラウンド継続取り込み
- **設定**（`/settings`）— 外部API連携、メール送信設定、AIモデル設定、自身のプロフィール編集
- **通知** — 通知センター
- **認証・権限** — ログイン必須（全ルートガード）、`general`/`admin` 権限による管理画面・APIのアクセス制御

## 技術スタック

| 分類 | 技術 |
|------|------|
| パッケージマネージャー | Bun |
| フロントエンド | SvelteKit, TypeScript |
| バリデーション | Zod |
| ORM | DrizzleORM |
| インフラ | Cloudflare (Wrangler, D1, R2, KV, Queue, Hyperdrive) |
| AI | Claude API (Anthropic) |
| プロトコル | MCP (Model Context Protocol) |
| i18n | Paraglide-JS |
| テスト | Vitest（ユニット・D1連携テストの2構成）, Playwright（E2E） |

## 開発環境のセットアップ

### 必要なもの

- [Bun](https://bun.sh/) v1.x 以上
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)

### 1. インストール

```sh
git clone https://github.com/alcogy/tullamore.git
cd tullamore
bun install
```

### 2. 環境変数の設定

`.dev.vars.example` をコピーして `.dev.vars` を作成し、必要な値を入力する:

```sh
cp .dev.vars.example .dev.vars
```

最低限必要な設定:

```sh
ANTHROPIC_API_KEY="sk-ant-..."  # Anthropic API キー
MOCK_AI="false"                 # true にするとAPI不要でモックレスポンスで動作確認できる
```

メール機能を使う場合は `EMAIL_PROVIDER` と対応するキーも設定する（`resend` / `ses` / `smtp`）。

### 3. データベースのマイグレーション

D1 ローカルデータベースにマイグレーションを適用する（`.wrangler/state/` にSQLiteが作成される）:

```sh
bunx wrangler d1 migrations apply tullamore --local
```

### 4. 管理者アカウントの作成

サインアップ画面は無い（ログイン必須・全ルートガード）ため、最初のアカウントはSQLで直接作成する:

```sh
bunx wrangler d1 execute tullamore --local --command "INSERT INTO accounts (id, name, email, permission, password_hash) VALUES ('local-admin-0001', '管理者', 'admin@example.com', 'admin', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8')"
```

パスワードは `password`（上記ハッシュはSHA-256の仮フォーマットで、ログイン成功時に自動でPBKDF2形式へ移行される）。ログイン後、`/database` からデータソースを作成すればチャット・各分析モジュールが試せる。

### 5. 開発サーバーの起動

```sh
bun dev   # Vite + platformProxy で HMR 付き起動
```

ブラウザで `http://localhost:5173` を開き、`/signin` からログインする。

KV・R2・D1 はローカルでは `.wrangler/state/` に自動作成されるため、追加設定は不要。

> **メール送信（SMTP）の注意**: `/settings/email` のSMTPプロバイダーは `cloudflare:sockets`（workerdランタイム専用API）を使うため、`bun dev`（Node.js上のVite）では動作しない。ローカルで確認する場合は Resend または AWS SES を使用すること。

> **データ連携（Hyperdrive）の注意**: `/connections` はHyperdriveバインディングを使うため、`bun dev`（`getPlatformProxy`）では正しく動作しない。`getPlatformProxy`はHyperdriveを「単純なパススルー値」として返す仕様で、`wrangler dev`・本番の実際の値とは形が異なる（[Cloudflare公式ドキュメント](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy)参照）。確認する場合は `bun run build && wrangler dev` を使うこと（`docs/DATA_CONNECTIONS.md` 参照）。

> **バックグラウンド取り込み（Queue）の注意**: 大規模な外部テーブル取り込みの継続処理は `worker.ts` の `queue()` ハンドラでのみ動作する。`bun dev` は `worker.ts` を経由しない（Vite自身の開発サーバー）ため、確認する場合は同様に `bun run build && wrangler dev` を使うこと。

### その他のコマンド

```sh
bun run check          # 型チェック（svelte-check）
bun run test:unit      # ユニットテスト（Vitest, plain node環境）+ D1連携テスト（@cloudflare/vitest-pool-workers, Miniflare上の実D1）
bun run test:e2e       # E2Eテスト（Playwright）
bun run db:studio      # Drizzle Studio でローカルDBを確認
```

## UIコンポーネント

コンポーネントは3種類に分類される。

- **`src/lib/components/ui/`** — アプリ UI（デザインシステム）
- **`src/lib/components/chat/`** — AI がノーコードとしてレスポンスに返すコンポーネント
- **`src/lib/components/analysis/`** — 分析ワークベンチ専用（AIアシスタント、KPIフォーム、レポートモーダル）

ライブデモは `/ui` ルートで確認できる。

---

### アプリ UI コンポーネント

#### Textbox

テキスト入力フィールド。

```svelte
<Textbox label="データソース名" bind:value={name} placeholder="月次売上..." required />
<Textbox label="メール" bind:value={email} type="email" error="正しいメールアドレスを入力してください" />
```

| prop | 型 | 説明 |
|------|----|------|
| `label` | `string?` | ラベルテキスト |
| `value` | `string` (bindable) | 入力値 |
| `type` | `string?` | input の type 属性（デフォルト `text`） |
| `placeholder` | `string?` | プレースホルダー |
| `required` | `boolean?` | 必須マーク表示 |
| `disabled` | `boolean?` | 無効状態 |
| `error` | `string?` | エラーメッセージ |

---

#### Textarea

複数行テキスト入力。

```svelte
<Textarea label="メモ" bind:value={memo} rows={4} placeholder="自由記述..." />
```

| prop | 型 | 説明 |
|------|----|------|
| `rows` | `number?` | 行数（デフォルト `3`） |
| その他 | — | Textbox と同様 |

---

#### Select

ネイティブ select（カスタム矢印付き）。

```svelte
<Select label="期間の種類" bind:value={periodType} options={[
  { value: 'year', label: '年次' },
  { value: 'month', label: '月次' }
]} />
```

| prop | 型 | 説明 |
|------|----|------|
| `options` | `{ value: string; label: string }[]` | 選択肢 |
| `placeholder` | `string?` | 未選択時の表示テキスト |

---

#### SearchSelect

検索機能付きの Combobox。キーボードナビゲーション（↑↓ Enter Esc）対応。

```svelte
<SearchSelect label="データソース" bind:value={dataSourceId} options={sourceOptions} placeholder="検索または選択..." />
```

| prop | 型 | 説明 |
|------|----|------|
| `options` | `{ value: string; label: string }[]` | 選択肢 |
| `placeholder` | `string?` | プレースホルダー |

---

#### Toggle

オン/オフ切り替えスイッチ。

```svelte
<Toggle label="モンテカルロ閾値を有効にする" bind:checked={thresholdEnabled} />
```

| prop | 型 | 説明 |
|------|----|------|
| `label` | `string?` | ラベルテキスト |
| `checked` | `boolean` (bindable) | 状態 |
| `disabled` | `boolean?` | 無効状態 |

---

#### MultiSelect

複数選択ボタン（チェックボックスの代替）。値は `string[]`。

```svelte
<MultiSelect label="説明変数" bind:value={featureColumns} options={columnOptions} />
```

| prop | 型 | 説明 |
|------|----|------|
| `value` | `string[]` (bindable) | 選択中の値の配列 |
| `options` | `{ value: string; label: string }[]` | 選択肢 |

---

#### SingleSelect

単一選択ボタン（ラジオボタンの代替）。セグメントコントロール風。

```svelte
<SingleSelect label="検定方法" bind:value={testType} options={[
  { value: 'mean', label: '平均の差（t検定）' },
  { value: 'proportion', label: '比率の差（z検定）' }
]} />
```

---

#### DatePicker

日付入力（ネイティブ `<input type="date">`）。

```svelte
<DatePicker label="期間FROM" bind:value={periodFrom} max={periodTo} required />
```

| prop | 型 | 説明 |
|------|----|------|
| `value` | `string` (bindable) | ISO 8601 形式の日付文字列 |
| `min` / `max` | `string?` | 入力範囲 |
| `required` | `boolean?` | 必須マーク表示 |

---

#### TimePicker

時刻入力（ネイティブ `<input type="time">`）。

```svelte
<TimePicker label="実行時刻" bind:value={time} />
```

---

#### DateTimePicker

日時入力（ネイティブ `<input type="datetime-local">`）。値はJSTのウォールクロックとして扱う（`src/lib/datetime.ts` の `parseJstDatetime` 等を参照）。

```svelte
<DateTimePicker label="予定日時" bind:value={datetime} />
```

---

#### NumberInput

数値入力（−/＋ ステッパーボタン付き）。ブラウザのスピンボタンは非表示。

```svelte
<NumberInput label="サンプル数" bind:value={sampleCount} min={1000} max={10000} step={500} />
<NumberInput label="予算総額" bind:value={totalBudget} prefix="¥" step={10000} />
```

| prop | 型 | 説明 |
|------|----|------|
| `value` | `number` (bindable) | 数値 |
| `min` / `max` | `number?` | 範囲（上下限でボタン無効化） |
| `step` | `number?` | ステップ量（デフォルト `1`） |
| `prefix` / `suffix` | `string?` | 前後の単位表示 |

---

#### FileUpload

ドラッグ&ドロップ対応のファイル選択エリア。

```svelte
<FileUpload label="CSVファイル" accept=".csv" />
```

| prop | 型 | 説明 |
|------|----|------|
| `accept` | `string?` | 許可する拡張子 |
| `multiple` | `boolean?` | 複数ファイル選択 |

---

#### Table

ソート・ページネーション付きのデータテーブル。

```svelte
<Table
  columns={[
    { key: 'label', label: 'KPI項目' },
    { key: 'current', label: '現在値' }
  ]}
  rows={tableRows}
/>
```

| prop | 型 | 説明 |
|------|----|------|
| `columns` | `{ key, label, sortable? }[]` | カラム定義 |
| `rows` | `Record<string, unknown>[]` | データ |
| `pageSize` | `number?` | 1ページの行数（デフォルト `10`） |

---

#### Pagination

ページネーションコントロール（Table 内でも使用）。一覧表示は `LIST_PAGE_SIZE`（`constants.ts`）ごとにページングするのが規約。

```svelte
<Pagination bind:page={currentPage} totalPages={20} />
```

---

#### List

カード表示のリスト。ジェネリクス対応で型安全なスニペットを受け取る。

```svelte
<List items={dataSources} columns={3}>
  {#snippet card(s)}
    <p>{s.name}</p>
  {/snippet}
</List>
```

---

#### DataGrid

スプレッドシート型のグリッド入力。Tab/Enter キーでセル移動。トレンド予測のグリッド編集等で使用。

```svelte
<DataGrid
  bind:rows={gridRows}
  columns={[
    { key: 'date', label: '日付', type: 'date' },
    { key: 'value', label: '値', type: 'number', width: 90 }
  ]}
  maxHeight={400}
  onchange={(rows) => refit(rows)}
/>
```

| prop | 型 | 説明 |
|------|----|------|
| `columns` | `GridColumn[]`（`key`/`label`/`type: 'text'\|'number'\|'date'\|'select'`/`options`/`width`/`readonly`） | カラム定義 |
| `rows` | `GridRow[]` (bindable) | データ（`Record<string, string\|number\|null>`） |
| `addable` / `deletable` | `boolean?` | 行追加・削除ボタン表示（デフォルト `true`） |
| `maxHeight` | `number?` | 指定すると高さ固定で縦スクロールになる |
| `onchange` | `(rows) => void?` | 変更コールバック |

---

#### BarChart / LineChart / PieChart / ScatterChart

チャットのグラフ生成・分析モジュールで使う基本チャート群（`--chart-1`〜`--chart-6` の配色）。

```svelte
<BarChart data={[{ label: '東京', value: 120 }]} mode="stacked" />
<LineChart series={[{ name: '実績', data: historical }, { name: 'トレンド', data: trend }]} markerIndex={historicalCount} />
<PieChart data={[{ label: 'A', value: 40 }]} donut />
<ScatterChart points={[{ x: 1, y: 2 }]} xLabel="広告費" yLabel="売上" />
```

LineChart は `height` で縦幅の上書き、`markerIndex`/`markerLabel` で実績/予測の境界線描画に対応。

---

#### TornadoChart

感度分析用のトルネードチャート（各説明変数の振れ幅をランキング表示）。

```svelte
<TornadoChart bars={sensitivityBars} base={baseline} />
```

---

#### GaugeChart

KPI達成率等、目標に対する現在値の比率を半円ゲージで表示。達成率に応じてgood(≥100%)/caution(≥70%)/poor(<70%)の3段階で色分け。

```svelte
<GaugeChart value={achievement.current} target={achievement.targetValue} size={170} />
```

| prop | 型 | 説明 |
|------|----|------|
| `value` / `target` | `number` | 現在値・目標値 |
| `title` | `string?` | キャプション |
| `size` | `number?` | 幅（px、デフォルト `160`） |
| `showValues` | `boolean?` | 現在値/目標値の数値表示（デフォルト `true`） |

---

#### CorrelationHeatmap

相関行列のヒートマップ（負=青・正=オレンジの発散配色）。

```svelte
<CorrelationHeatmap columns={heatmapColumns} matrix={correlationMatrix.matrix} />
```

---

#### ValidityCard

分析結果の妥当性チェック（サンプル数・当てはまりの良さ等）をgood/caution/poorの3段階で表示。全分析モジュール共通。

```svelte
<ValidityCard validity={result.validity} />
```

---

#### TypingIndicator

AIのタイピング中アニメーション（3点ドット）。

```svelte
{#if isLoading}
  <TypingIndicator />
{/if}
```

---

### チャット UI コンポーネント（`src/lib/components/chat/`）

AI がレスポンスとして返す動的UIコンポーネント。システムプロンプトの仕様に従って AI が `<ui type="...">` タグを出力し、クライアント側でパースされて描画される。詳細な仕様は `src/lib/server/ai/` のシステムプロンプトで一元管理している。

#### Form（チャット用）

```
<ui type="form" title="メール送信">
[{"key":"to","label":"宛先","type":"email","required":true},{"key":"body","label":"本文","type":"textarea"}]
</ui>
```

フィールドタイプ: `text` / `email` / `number` / `textarea` / `select` / `date` / `datetime-local` / `hidden`。現状この経路を使う登録系ツールは `send_email` のみ。

#### Table（チャット用）

```
<ui type="table" title="地域別売上">
{"columns":[{"key":"region","label":"地域"},...],"rows":[...]}
</ui>
```

#### ActionSelector

```
<ui type="actions" title="どうしますか？">
[{"id":"create_simulator","label":"シミュレーターを作る","description":"広告費と売上の関係をモデル化します"}]
</ui>
```

ユーザーがアクションを選択すると、そのラベルがチャット入力として送信される。

#### その他のコンポーネント

| コンポーネント | 用途 |
|------|------|
| `Values` | キー・バリュー形式のサマリー表示 |
| `Chart` | AIが生成した集計結果をBar/Line/Pie等で表示 |
| `Simulator` | チャット作成の回帰シミュレーター（スライダー操作・AIレビュー） |
| `Link` | レコードへのリンク。`newTab="true"` で別タブ表示（会話を中断させない） |
| `Reply` | AIが質問・選択肢を提示する際のインライン回答UI |
| `TurnHistoryDrawer` | 過去のチャットターンを右ドロワーで簡易表示（テキストはコピー可） |

---

## ディレクトリ構成

```
tullamore/
├── src/
│   ├── routes/
│   │   ├── +page.svelte          # チャット画面（/）
│   │   ├── report-create/        # レポート作成（AIアシスタント付きレイアウト共有）
│   │   ├── kpi/                  # KPI管理（一覧・新規登録・詳細・編集）
│   │   ├── analysis/             # 11の分析モジュール（descriptive-stats, correlation, ab-test, regression, classification, sensitivity, scenario, goal-seek, trend, monte-carlo, budget-allocation）
│   │   ├── simulators/           # チャット作成シミュレーターの一覧・詳細
│   │   ├── database/             # データソース管理ワークベンチ
│   │   ├── connections/          # 外部DB接続管理（管理者のみ）
│   │   ├── settings/             # 設定画面
│   │   ├── signin/               # ログイン・パスワードリセット
│   │   └── api/                  # チャット・分析・データソース・KPI・接続 等のAPIエンドポイント
│   └── lib/
│       ├── analysis/             # 分析エンジン（isomorphic・DB非依存、線形回帰・相関・記述統計・A/Bテスト・KPI逆算 等）
│       ├── components/
│       │   ├── ui/               # アプリUIコンポーネント（デザインシステム）
│       │   ├── chat/             # AI がレスポンスとして返すコンポーネント
│       │   ├── analysis/         # 分析ワークベンチ専用コンポーネント
│       │   ├── dialog/           # フォームダイアログ
│       │   └── icon/             # SVGアイコンコンポーネント
│       ├── server/
│       │   ├── db/               # DrizzleORM スキーマ・クエリ
│       │   ├── analysis/         # D1依存の分析処理（SQL集計・妥当性チェック・KPI達成率トラッキング 等）
│       │   ├── mcp/              # MCP ツール定義
│       │   ├── ai/               # Claude API 連携・システムプロンプト
│       │   ├── auth/             # セッション・パスワードハッシュ
│       │   ├── db-connections/   # 外部DB接続（Hyperdrive/TCP Sockets）
│       │   ├── email/            # システムメール送信
│       │   └── test-setup/       # D1連携テスト用のmigration適用
│       ├── styles/               # グローバルスタイル・テーマ
│       └── types/                # 共通型定義
├── messages/                     # i18n リソース（ja.json）
├── drizzle/                      # マイグレーションファイル
├── docs/
│   ├── concept.md                # プロダクトコンセプト
│   ├── roadmap.md                # 開発ロードマップ
│   └── DATA_CONNECTIONS.md       # 外部DB接続の仕組み
├── vitest.workers.config.ts       # D1連携テスト用Vitest設定（@cloudflare/vitest-pool-workers）
├── worker.ts                      # Cloudflare Workers エントリポイント
├── wrangler.toml
└── wrangler.build.jsonc
```

## テーマ

ダーク / ライト / システム（OS 設定追従）の3択。サイドバー下部のスイッチで切り替え。CSS カスタムプロパティ（`--color-*`）でトークンを定義し `data-theme` 属性で切り替える。

## i18n

`messages/ja.json` に日本語リソースを定義し `m.key()` 形式で参照する（Paraglide-JS）。デフォルト言語は日本語。

## ロードマップ

開発の進行状況は [`docs/roadmap.md`](docs/roadmap.md) を参照。
