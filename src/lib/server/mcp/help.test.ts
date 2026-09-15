import { describe, it, expect } from 'vitest';
import { handleGetHelp } from './help';

const TOPICS = ['overview', 'data_sources', 'analysis', 'simulator', 'report_create', 'kpi', 'email'];

describe('handleGetHelp', () => {
	it('returns the overview when no topic is given', () => {
		const result = handleGetHelp(undefined) as { title: string };
		expect(result.title).toBe('TULLAMORE User Guide');
	});

	it.each(TOPICS)('returns content for topic "%s"', (topic) => {
		const result = handleGetHelp({ topic }) as { title: string };
		expect(result.title).toBeTruthy();
	});

	it('throws for an unknown topic', () => {
		expect(() => handleGetHelp({ topic: 'not_a_real_topic' })).toThrow();
	});

	it('overview links to report-create and kpi as front-facing pages', () => {
		const result = handleGetHelp(undefined) as { relatedPages: { href: string }[] };
		const hrefs = result.relatedPages.map((p) => p.href);
		expect(hrefs).toContain('/report-create');
		expect(hrefs).toContain('/kpi');
	});
});
