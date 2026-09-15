import { eq } from 'drizzle-orm';
import { dataSources, type DataSource, type NewDataSource } from './schema';
import type { Db } from './index';

export type ColumnDef = {
	key: string;
	label: string;
	type: 'text' | 'number' | 'date' | 'boolean';
};

export function parseSchema(schemaJson: string): ColumnDef[] {
	try { return JSON.parse(schemaJson); } catch { return []; }
}

// Column keys are embedded directly into CREATE/ALTER TABLE statements, so as a SQL injection
// countermeasure we restrict them to a form that is valid as an identifier
export function isValidColumnKey(key: string): boolean {
	return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key);
}

export async function listDataSources(db: Db): Promise<DataSource[]> {
	return db.select().from(dataSources).orderBy(dataSources.createdAt);
}

export async function getDataSource(db: Db, id: string): Promise<DataSource | null> {
	const rows = await db.select().from(dataSources).where(eq(dataSources.id, id));
	return rows[0] ?? null;
}

export async function createDataSource(db: Db, data: NewDataSource): Promise<DataSource> {
	await db.insert(dataSources).values(data);
	return (await getDataSource(db, data.id))!;
}

export async function updateDataSource(db: Db, id: string, data: Partial<Omit<DataSource, 'id' | 'createdAt'>>): Promise<void> {
	await db.update(dataSources).set({ ...data, updatedAt: new Date() }).where(eq(dataSources.id, id));
}

export async function deleteDataSource(db: Db, id: string): Promise<void> {
	await db.delete(dataSources).where(eq(dataSources.id, id));
}

export function makeTableName(id: string): string {
	return `ds_${id.replace(/-/g, '_')}`;
}
