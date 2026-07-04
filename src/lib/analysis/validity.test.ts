import { describe, it, expect } from 'vitest';
import { assessFitQuality, assessSampleSizeAdequacy, combineOverall } from './validity';

describe('assessFitQuality', () => {
	it('classifies R² thresholds correctly', () => {
		expect(assessFitQuality(0.9).level).toBe('good');
		expect(assessFitQuality(0.8).level).toBe('good');
		expect(assessFitQuality(0.6).level).toBe('good');
		expect(assessFitQuality(0.5).level).toBe('good');
		expect(assessFitQuality(0.4).level).toBe('caution');
		expect(assessFitQuality(0.3).level).toBe('caution');
		expect(assessFitQuality(0.2).level).toBe('poor');
	});
});

describe('assessSampleSizeAdequacy', () => {
	it('classifies sample size relative to parameter count', () => {
		expect(assessSampleSizeAdequacy(100, 2).level).toBe('good'); // ideal = 30
		expect(assessSampleSizeAdequacy(20, 2).level).toBe('caution'); // marginal = 15, ideal = 30
		expect(assessSampleSizeAdequacy(5, 2).level).toBe('poor');
	});
});

describe('combineOverall', () => {
	it('returns poor if any check is poor', () => {
		const result = combineOverall(
			[
				{ label: 'a', level: 'good', comment: '' },
				{ label: 'b', level: 'poor', comment: '' }
			],
			'all good'
		);
		expect(result.overallLevel).toBe('poor');
	});

	it('returns caution if any check is caution (and none poor)', () => {
		const result = combineOverall(
			[
				{ label: 'a', level: 'good', comment: '' },
				{ label: 'b', level: 'caution', comment: '' }
			],
			'all good'
		);
		expect(result.overallLevel).toBe('caution');
	});

	it('returns good with the provided comment when all checks are good', () => {
		const result = combineOverall([{ label: 'a', level: 'good', comment: '' }], 'all good');
		expect(result.overallLevel).toBe('good');
		expect(result.overallComment).toBe('all good');
	});
});
