import { MASKED_SECRET } from '$lib/types/integration';

const SECRET_FIELDS = ['value', 'password'] as const;

// Shared not only by integrations.authConfig (always Record<string,string>) but also by db_connections.config
// (which for tcp_socket also mixes in port:number/ssl:boolean etc.), so the value type is loosely typed as unknown
type AnyConfig = Record<string, unknown>;

// Masks secret fields (tokens, passwords) before sending them to the client
export function maskAuthConfig(authConfig: AnyConfig): AnyConfig {
	const masked = { ...authConfig };
	for (const key of SECRET_FIELDS) {
		if (masked[key]) masked[key] = MASKED_SECRET;
	}
	return masked;
}

// On PATCH, keeps the existing value if a secret field is still the masked value (i.e. unchanged)
export function mergeAuthConfig(existing: AnyConfig, incoming: AnyConfig): AnyConfig {
	const merged = { ...incoming };
	for (const key of SECRET_FIELDS) {
		if (merged[key] === MASKED_SECRET) {
			merged[key] = existing[key] ?? '';
		}
	}
	return merged;
}
