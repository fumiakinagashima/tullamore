import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { generateReport, type AnalysisReportInput } from '$lib/server/ai/analysis-report';
import { errors } from '$lib/server/errors';

export const POST: RequestHandler = async ({ request, platform }) => {
	const mockMode = platform?.env?.MOCK_AI === 'true' || env.MOCK_AI === 'true';

	const body = (await request.json()) as { analyses?: AnalysisReportInput[] };
	if (!body.analyses || body.analyses.length === 0) {
		return errors.badRequest('analyses が必要です');
	}

	if (mockMode) {
		const report = [
			'# レポート（モック）',
			'',
			'## 概要',
			'モックモードのため簡易レポートを返しています。',
			'',
			'## 主な発見',
			'- (モック)',
			'',
			'## 統計的な妥当性',
			'- (モック)',
			'',
			'## 推奨される次のアクション',
			'- (モック)'
		].join('\n');
		return json({ report });
	}

	const apiKey = platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY ?? '';
	if (!apiKey) return errors.internal(new Error('ANTHROPIC_API_KEY が設定されていません'));

	try {
		const report = await generateReport(apiKey, body.analyses);
		return json({ report });
	} catch (e) {
		return errors.internal(e);
	}
};
