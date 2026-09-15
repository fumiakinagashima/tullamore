// Mask value used when sending secret fields of authConfig (value / password, etc.) to the client.
// If this value is sent back on a PATCH, the existing value is kept (treated as unchanged).
export const MASKED_SECRET = '********';
