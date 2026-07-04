import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { generateCompositeAnalysisReport, type AnalysisReportInput } from '$lib/server/ai/analysis-report';
import { errors } from '$lib/server/errors';

export const POST: RequestHandler = async ({ request, platform }) => {
	const mockMode = platform?.env?.MOCK_AI === 'true' || env.MOCK_AI === 'true';

	const body = (await request.json()) as { analyses?: AnalysisReportInput[] };
	if (!body.analyses || body.analyses.length === 0) {
		return errors.badRequest('analyses が必要です');
	}

	if (mockMode) {
		const report = [
			'# 複合分析レポート（モック）',
			'',
			'## 概要',
			'モックモードのため簡易レポートを返しています。',
			'',
			'## 各分析の結果',
			'- (モック)',
			'',
			'## 総合的な解釈',
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
		const report = await generateCompositeAnalysisReport(apiKey, body.analyses);
		return json({ report });
	} catch (e) {
		return errors.internal(e);
	}
};
