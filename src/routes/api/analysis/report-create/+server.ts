import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { generateReport, type AnalysisReportInput } from '$lib/server/ai/analysis-report';
import { errors } from '$lib/server/errors';

export const POST: RequestHandler = async ({ request, platform }) => {
	const mockMode = platform?.env?.MOCK_AI === 'true' || env.MOCK_AI === 'true';

	const body = (await request.json()) as { analyses?: AnalysisReportInput[] };
	if (!body.analyses || body.analyses.length === 0) {
		return errors.badRequest('analyses is required');
	}

	if (mockMode) {
		const report = [
			'# Report (mock)',
			'',
			'## Overview',
			'Returning a simplified report because mock mode is enabled.',
			'',
			'## Key findings',
			'- (mock)',
			'',
			'## Statistical validity',
			'- (mock)',
			'',
			'## Recommended next actions',
			'- (mock)'
		].join('\n');
		return json({ report });
	}

	const apiKey = platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY ?? '';
	if (!apiKey) return errors.internal(new Error('ANTHROPIC_API_KEY is not set'));

	try {
		const report = await generateReport(apiKey, body.analyses);
		return json({ report });
	} catch (e) {
		return errors.internal(e);
	}
};
