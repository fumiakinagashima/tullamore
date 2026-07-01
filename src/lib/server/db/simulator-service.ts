import { desc, eq } from 'drizzle-orm';
import { simulators, type NewSimulator, type Simulator } from './schema';
import type { Db } from '.';
import type { Model } from '$lib/analysis/types';

export function parseFeatureColumns(json: string): string[] {
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? (parsed as string[]) : [];
	} catch {
		return [];
	}
}

export function parseModel(json: string): Model {
	return JSON.parse(json) as Model;
}

export async function listSimulators(db: Db): Promise<Simulator[]> {
	return db.select().from(simulators).orderBy(desc(simulators.createdAt));
}

export async function getSimulator(db: Db, id: string): Promise<Simulator | null> {
	const rows = await db.select().from(simulators).where(eq(simulators.id, id));
	return rows[0] ?? null;
}

export async function createSimulator(db: Db, data: NewSimulator): Promise<Simulator> {
	await db.insert(simulators).values(data);
	return (await getSimulator(db, data.id as string))!;
}

export async function updateSimulator(
	db: Db,
	id: string,
	data: Partial<Omit<Simulator, 'id' | 'createdAt' | 'dataSourceId'>>
): Promise<Simulator> {
	await db.update(simulators).set({ ...data, updatedAt: new Date() }).where(eq(simulators.id, id));
	return (await getSimulator(db, id))!;
}

export async function deleteSimulator(db: Db, id: string): Promise<void> {
	await db.delete(simulators).where(eq(simulators.id, id));
}
