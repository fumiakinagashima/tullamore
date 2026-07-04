import type { GroupMeanStats, GroupProportionStats } from '$lib/analysis/ab-test';
import { quoteIdent } from './sql-ident';

/** グループ列の値ごとにCOUNT/AVG/SUM/SUM_SQを集計する（1本のSQLクエリ） */
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
		const found = groups.map((g) => `"${g.group}"（${g.n}件）`).join(', ');
		throw new Error(
			groups.length === 0
				? 'グループ列に値のある行が見つかりませんでした'
				: `グループ列の値が2種類である必要があります（現在: ${found || groups.length + '種類'}）。データを絞り込むか別の列を選んでください`
		);
	}
	return [groups[0], groups[1]];
}

/** 連続値指標（購入額など）の2グループ統計量を求める（Welchのt検定用） */
export async function computeGroupMeanStats(
	db: D1Database,
	tableName: string,
	groupColumn: string,
	metricColumn: string
): Promise<[GroupMeanStats, GroupMeanStats]> {
	const rows = await groupedAggregates(db, tableName, groupColumn, metricColumn);
	const [a, b] = requireTwoGroups(rows);

	const toStats = (r: (typeof rows)[number]): GroupMeanStats => {
		if (r.n < 2) throw new Error(`グループ "${r.group}" のサンプル数が不足しています（2件以上必要）`);
		const mean = r.sum / r.n;
		const variance = Math.max(0, r.sumSq - r.n * mean * mean) / (r.n - 1);
		return { group: r.group, n: r.n, mean, variance };
	};

	return [toStats(a), toStats(b)];
}

/** 二値指標（コンバージョンの有無=0/1など）の2グループ統計量を求める（比率のz検定用） */
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
			throw new Error(`指標列 "${metricColumn}" は0または1の二値である必要があります`);
		}
		return { group: r.group, n: r.n, successes: r.sum };
	};

	return [toStats(a), toStats(b)];
}
