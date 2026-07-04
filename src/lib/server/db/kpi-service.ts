import { desc, eq } from 'drizzle-orm';
import { kpiPlans, type NewKpiPlan, type KpiPlan } from './schema';
import type { Db } from '.';
import type { KpiPlanSnapshot } from '$lib/analysis/kpi';

export function parseKpiPlanSnapshot(json: string): KpiPlanSnapshot {
	return JSON.parse(json) as KpiPlanSnapshot;
}

export async function listKpiPlans(db: Db): Promise<KpiPlan[]> {
	return db.select().from(kpiPlans).orderBy(desc(kpiPlans.createdAt));
}

export async function getKpiPlan(db: Db, id: string): Promise<KpiPlan | null> {
	const rows = await db.select().from(kpiPlans).where(eq(kpiPlans.id, id));
	return rows[0] ?? null;
}

export async function createKpiPlan(db: Db, data: NewKpiPlan): Promise<KpiPlan> {
	await db.insert(kpiPlans).values(data);
	return (await getKpiPlan(db, data.id as string))!;
}

export async function updateKpiPlan(
	db: Db,
	id: string,
	data: { name: string; dataSourceId: string; targetColumn: string; periodLabel: string; periodType: string; planJson: string }
): Promise<KpiPlan> {
	await db.update(kpiPlans).set({ ...data, updatedAt: new Date() }).where(eq(kpiPlans.id, id));
	return (await getKpiPlan(db, id))!;
}

export async function deleteKpiPlan(db: Db, id: string): Promise<void> {
	await db.delete(kpiPlans).where(eq(kpiPlans.id, id));
}
