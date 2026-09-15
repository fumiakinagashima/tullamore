import type { GroupMeanStats, GroupProportionStats } from '$lib/analysis/ab-test';
import { quoteIdent } from './sql-ident';

/** Aggregates COUNT/AVG/SUM/SUM_SQ for each value of the group column (a single SQL query) */
async function groupedAggregates(
	db: D1Database,
	tableName: string,
	groupColumn: string,
	metricColumn: string
): Promise<{ group: string; n: number; sum: number; sumSq: number }[]> {
	const g = quoteIdent(groupColumn);
	const m = quoteIdent(metricColumn);
	const sql = `SELECT ${g} AS g, COUNT(*) AS n, SUM(${m}) AS sum, SUM(${m}*${m}) AS sumsq
		FROM ${quoteIdent(tableName)}
		WHERE ${g} IS NOT NULL AND ${m} IS NOT NULL
		GROUP BY ${g}`;
	const res = await db.prepare(sql).all<{ g: string | number; n: number; sum: number; sumsq: number }>();
	return res.results.map((r) => ({ group: String(r.g), n: Number(r.n), sum: Number(r.sum), sumSq: Number(r.sumsq) }));
}

function requireTwoGroups<T extends { group: string; n: number }>(groups: T[]): [T, T] {
	if (groups.length !== 2) {
		const found = groups.map((g) => `"${g.group}" (${g.n} rows)`).join(', ');
		throw new Error(
			groups.length === 0
				? 'No rows with a value in the group column were found'
				: `The group column must have exactly two distinct values (currently: ${found || groups.length + ' values'}). Filter the data or choose a different column`
		);
	}
	return [groups[0], groups[1]];
}

/** Computes two-group statistics for a continuous metric (e.g., purchase amount), for Welch's t-test */
export async function computeGroupMeanStats(
	db: D1Database,
	tableName: string,
	groupColumn: string,
	metricColumn: string
): Promise<[GroupMeanStats, GroupMeanStats]> {
	const rows = await groupedAggregates(db, tableName, groupColumn, metricColumn);
	const [a, b] = requireTwoGroups(rows);

	const toStats = (r: (typeof rows)[number]): GroupMeanStats => {
		if (r.n < 2) throw new Error(`Group "${r.group}" has an insufficient sample size (at least 2 rows are required)`);
		const mean = r.sum / r.n;
		const variance = Math.max(0, r.sumSq - r.n * mean * mean) / (r.n - 1);
		return { group: r.group, n: r.n, mean, variance };
	};

	return [toStats(a), toStats(b)];
}

/** Computes two-group statistics for a binary metric (e.g., conversion yes/no = 0/1), for the z-test for proportions */
export async function computeGroupProportionStats(
	db: D1Database,
	tableName: string,
	groupColumn: string,
	metricColumn: string
): Promise<[GroupProportionStats, GroupProportionStats]> {
	const rows = await groupedAggregates(db, tableName, groupColumn, metricColumn);
	const [a, b] = requireTwoGroups(rows);

	const toStats = (r: (typeof rows)[number]): GroupProportionStats => {
		if (r.sum < 0 || r.sum > r.n) {
			throw new Error(`Metric column "${metricColumn}" must be a binary 0 or 1 value`);
		}
		return { group: r.group, n: r.n, successes: r.sum };
	};

	return [toStats(a), toStats(b)];
}
