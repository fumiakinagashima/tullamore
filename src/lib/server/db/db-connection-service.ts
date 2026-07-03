import { eq, desc } from 'drizzle-orm';
import { dbConnections, externalTableSyncs, type DbConnection, type NewDbConnection, type ExternalTableSync, type NewExternalTableSync } from './schema';
import type { Db } from './index';

export async function listDbConnections(db: Db): Promise<DbConnection[]> {
	return db.select().from(dbConnections).orderBy(dbConnections.name);
}

export async function getDbConnection(db: Db, id: string): Promise<DbConnection | null> {
	const rows = await db.select().from(dbConnections).where(eq(dbConnections.id, id));
	return rows[0] ?? null;
}

export async function createDbConnection(db: Db, data: NewDbConnection): Promise<DbConnection> {
	await db.insert(dbConnections).values(data);
	return (await getDbConnection(db, data.id))!;
}

export async function updateDbConnection(
	db: Db,
	id: string,
	data: Partial<Omit<DbConnection, 'id' | 'createdAt'>>
): Promise<void> {
	await db.update(dbConnections).set({ ...data, updatedAt: new Date() }).where(eq(dbConnections.id, id));
}

export async function deleteDbConnection(db: Db, id: string): Promise<void> {
	await db.delete(dbConnections).where(eq(dbConnections.id, id));
}

export async function getExternalTableSyncByDataSource(db: Db, dataSourceId: string): Promise<ExternalTableSync | null> {
	const rows = await db.select().from(externalTableSyncs).where(eq(externalTableSyncs.dataSourceId, dataSourceId));
	return rows[0] ?? null;
}

export async function listExternalTableSyncsForConnection(db: Db, dbConnectionId: string): Promise<ExternalTableSync[]> {
	return db
		.select()
		.from(externalTableSyncs)
		.where(eq(externalTableSyncs.dbConnectionId, dbConnectionId))
		.orderBy(desc(externalTableSyncs.updatedAt));
}

export async function createExternalTableSync(db: Db, data: NewExternalTableSync): Promise<ExternalTableSync> {
	await db.insert(externalTableSyncs).values(data);
	const rows = await db.select().from(externalTableSyncs).where(eq(externalTableSyncs.id, data.id));
	return rows[0]!;
}

export async function updateExternalTableSync(
	db: Db,
	id: string,
	data: Partial<Omit<ExternalTableSync, 'id' | 'createdAt'>>
): Promise<void> {
	await db.update(externalTableSyncs).set({ ...data, updatedAt: new Date() }).where(eq(externalTableSyncs.id, id));
}
