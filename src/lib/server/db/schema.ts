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

export const reminders = sqliteTable('reminders', {
	id: text('id').primaryKey(),
	remindAt: integer('remind_at', { mode: 'timestamp' }).notNull(),
	content: text('content').notNull(),
	channels: text('channels').notNull().default('[]'),
	status: text('status', { enum: ['pending', 'sent', 'failed'] }).notNull().default('pending'),
	accountId: text('account_id'),
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

export const briefings = sqliteTable('briefings', {
	id: text('id').primaryKey(),
	accountId: text('account_id'),
	date: text('date').notNull(),
	contents: text('contents').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type EmailProviderSettings = typeof emailProviders.$inferSelect;
export type NewEmailProviderSettings = typeof emailProviders.$inferInsert;
export type AiSettings = typeof aiSettings.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
export type Briefing = typeof briefings.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;
