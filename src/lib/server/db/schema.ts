import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const dataSources = sqliteTable('data_sources', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	tableName: text('table_name').notNull().unique(),
	schemaJson: text('schema_json').notNull().default('[]'),
	rowCount: integer('row_count').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const integrations = sqliteTable('integrations', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	baseUrl: text('base_url').notNull(),
	authType: text('auth_type', { enum: ['none', 'api_key', 'bearer', 'basic'] }).notNull().default('none'),
	authConfig: text('auth_config').notNull().default('{}'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

// An external DB connection for data ingestion, separate from `integrations` (notification integrations
// like Slack/Teams). Since Hyperdrive bindings are static (must be pre-registered in wrangler.toml and
// require a redeploy), this table only records "which Hyperdrive binding (env.HYPERDRIVE_*) to use" —
// the actual connection string and password are never stored on Tullamore's side at all.
export const dbConnections = sqliteTable('db_connections', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	// provider is kept as an enum so 'http_api' can be added in the future
	provider: text('provider', { enum: ['hyperdrive', 'tcp_socket'] }).notNull().default('hyperdrive'),
	// Settings per provider. For hyperdrive: { bindingName }; for tcp_socket:
	// { host, port, database, username, password, ssl } (password is masked; see integration-service.ts)
	config: text('config').notNull().default('{}'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

// Record of ingesting a specific table from db_connections into data_sources.
// TODO: when implementing automatic resync via Cron, the plan is to scan this table and resync in order
// of oldest lastSyncedAt (currently manual sync only, triggered each time via the "Sync now" button on /connections)
export const externalTableSyncs = sqliteTable('external_table_syncs', {
	id: text('id').primaryKey(),
	dbConnectionId: text('db_connection_id').notNull(),
	dataSourceId: text('data_source_id').notNull(),
	externalSchema: text('external_schema').notNull(),
	externalTable: text('external_table').notNull(),
	// JSON of { [column key on data_sources]: actual column name on the external DB }. Kept so column selection
	// doesn't need to be redone every time a resync happens
	columnMapping: text('column_mapping').notNull().default('{}'),
	// 'syncing' means a large-table continuation ingest is in progress via Queue (the remainder cut off after
	// exceeding MAX_ROWS is being processed in the background)
	lastSyncStatus: text('last_sync_status', { enum: ['success', 'failed', 'syncing'] }),
	lastSyncError: text('last_sync_error'),
	lastSyncRowCount: integer('last_sync_row_count').notNull().default(0),
	// Resume position for Queue continuation ingest (the offset for the next fetchRows call). Matches lastSyncRowCount once sync completes
	lastSyncOffset: integer('last_sync_offset').notNull().default(0),
	lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const emailProviders = sqliteTable('email_providers', {
	id: text('id').primaryKey(),
	provider: text('provider', { enum: ['resend', 'ses', 'smtp'] }).notNull().default('resend'),
	config: text('config').notNull().default('{}'),
	fromAddress: text('from_address').notNull().default(''),
	fromName: text('from_name'),
	signature: text('signature'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const aiSettings = sqliteTable('ai_settings', {
	id: text('id').primaryKey(),
	model: text('model').notNull().default('claude-haiku-4-5-20251001'),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const accounts = sqliteTable('accounts', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email'),
	role: text('role'),
	permission: text('permission', { enum: ['general', 'admin'] }).notNull().default('general'),
	passwordHash: text('password_hash'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const simulators = sqliteTable('simulators', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	dataSourceId: text('data_source_id').notNull(),
	method: text('method').notNull().default('linear_regression'),
	targetColumn: text('target_column').notNull(),
	featureColumns: text('feature_columns').notNull().default('[]'),
	modelJson: text('model_json').notNull(),
	createdBy: text('created_by'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const kpiPlans = sqliteTable('kpi_plans', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	dataSourceId: text('data_source_id').notNull(),
	targetColumn: text('target_column').notNull(),
	periodLabel: text('period_label').notNull(),
	periodType: text('period_type').notNull().default('custom'),
	/** Date column plus FROM/TO ("YYYY-MM-DD") that scope the period for achievement-rate tracking. Unset = all periods */
	dateColumn: text('date_column'),
	periodFrom: text('period_from'),
	periodTo: text('period_to'),
	planJson: text('plan_json').notNull(),
	createdBy: text('created_by'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const notifications = sqliteTable('notifications', {
	id: text('id').primaryKey(),
	type: text('type').notNull().default('generic'),
	title: text('title').notNull(),
	body: text('body').notNull().default(''),
	seedContent: text('seed_content').notNull().default('[]'),
	accountId: text('account_id').notNull(),
	isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const chats = sqliteTable('chats', {
	id: text('id').primaryKey(),
	title: text('title').notNull().default(''),
	accountId: text('account_id'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const chatMessages = sqliteTable('chat_messages', {
	id: text('id').primaryKey(),
	chatId: text('chat_id').notNull().references(() => chats.id),
	role: text('role', { enum: ['user', 'assistant'] }).notNull(),
	contents: text('contents').notNull().default('[]'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type DbConnection = typeof dbConnections.$inferSelect;
export type NewDbConnection = typeof dbConnections.$inferInsert;
export type ExternalTableSync = typeof externalTableSyncs.$inferSelect;
export type NewExternalTableSync = typeof externalTableSyncs.$inferInsert;
export type EmailProviderSettings = typeof emailProviders.$inferSelect;
export type NewEmailProviderSettings = typeof emailProviders.$inferInsert;
export type AiSettings = typeof aiSettings.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Simulator = typeof simulators.$inferSelect;
export type NewSimulator = typeof simulators.$inferInsert;
export type KpiPlan = typeof kpiPlans.$inferSelect;
export type NewKpiPlan = typeof kpiPlans.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
