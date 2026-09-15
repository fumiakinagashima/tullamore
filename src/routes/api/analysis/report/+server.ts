import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { generateAnalysisReport } from '$lib/server/ai/analysis-report';
import { errors } from '$lib/server/errors';

export const POST: RequestHandler = async ({ request, platform }) => {
	const mockMode = platform?.env?.MOCK_AI === 'true' || env.MOCK_AI === 'true';

	const body = (await request.json()) as {
		analysisType?: string;
		config?: Record<string, unknown>;
		resultSummary?: Record<string, unknown>;
	};
	if (!body.analysisType || !body.resultSummary) {
		return errors.badRequest('analysisType / resultSummary are required');
	}

	if (mockMode) {
		const report = [
			`# ${body.analysisType} Report (Mock)`,
			'',
			'## Overview',
			'Returning a simplified report because mock mode is enabled.',
			'',
			'## Key Findings',
			'- (mock)',
			'',
			'## Statistical Validity',
			'- (mock)',
			'',
			'## Recommended Next Actions',
			'- (mock)'
		].join('\n');
		return json({ report });
	}

	const apiKey = platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY ?? '';
	if (!apiKey) return errors.internal(new Error('ANTHROPIC_API_KEY is not configured'));

	try {
		const report = await generateAnalysisReport(apiKey, {
			analysisType: body.analysisType,
			config: body.config ?? {},
			resultSummary: body.resultSummary
		});
		return json({ report });
	} catch (e) {
		return errors.internal(e);
	}
};
