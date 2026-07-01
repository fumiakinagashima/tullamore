import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Db } from '../db';
import * as bi from './bi';
import * as communication from './communication';
import * as integrations from './integrations';
import * as help from './help';

export type { ToolEnv } from './shared';

export type ToolName =
	| 'list_data_sources'
	| 'execute_sql'
	| 'preview_data'
	| 'list_integrations'
	| 'call_external_api'
	| 'send_notification'
	| 'send_slack_notification'
	| 'delete_read_notifications'
	| 'send_email'
	| 'get_help';

export const tools: Tool[] = [
	...bi.tools,
	...integrations.tools,
	...communication.tools,
	...help.tools
];

export async function dispatchTool(
	db: Db,
	name: ToolName,
	input: unknown,
	env?: import('./shared').ToolEnv,
	_ctx?: ExecutionContext
) {
	switch (name) {
		case 'list_data_sources':         return bi.handleListDataSources(db);
		case 'execute_sql':               return bi.handleExecuteSql(db, input, env);
		case 'preview_data':              return bi.handlePreviewData(db, input, env);
		case 'list_integrations':         return integrations.handleListIntegrations(db);
		case 'call_external_api':         return integrations.handleCallExternalApi(db, input);
		case 'send_notification':         return communication.handleSendNotification(db, input, env);
		case 'send_slack_notification':   return communication.handleSendSlackNotification(db, input, env);
		case 'delete_read_notifications': return communication.handleDeleteReadNotifications(db, input, env);
		case 'send_email':                return communication.handleSendEmail(db, input, env);
		case 'get_help':                  return help.handleGetHelp(input);
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}
