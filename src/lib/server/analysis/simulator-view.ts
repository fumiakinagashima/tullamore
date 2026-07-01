import type { DataSource, Simulator } from '../db/schema';
import { parseModel } from '../db/simulator-service';
import { parseSchema } from '../db/data-source-service';
import type { SimulatorContent } from '$lib/types/chat';

/** シミュレーターDB行 + データソースのスキーマから、UI表示に必要なラベル付きの形に変換する */
export function toSimulatorContent(simulator: Simulator, dataSource: DataSource): SimulatorContent {
	const model = parseModel(simulator.modelJson);
	const columns = parseSchema(dataSource.schemaJson);
	const labelByKey = new Map(columns.map((c) => [c.key, c.label]));
	const targetLabel = labelByKey.get(simulator.targetColumn) ?? simulator.targetColumn;

	return {
		type: 'simulator',
		simulatorId: simulator.id,
		name: simulator.name,
		description: simulator.description ?? undefined,
		targetLabel,
		intercept: model.intercept,
		features: model.featureColumns.map((key, i) => ({
			key,
			label: labelByKey.get(key) ?? key,
			coefficient: model.coefficients[i],
			min: model.featureRanges[key]?.min ?? 0,
			max: model.featureRanges[key]?.max ?? 0,
			mean: model.featureRanges[key]?.mean ?? 0
		})),
		metrics: model.metrics
	};
}
