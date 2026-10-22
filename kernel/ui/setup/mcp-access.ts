export type McpSummary = { revision: number; enabled: boolean; externalOnly: boolean; available: boolean };
export type McpSettings = Pick<McpSummary, 'revision' | 'enabled' | 'externalOnly'>;
export type McpState = McpSummary & {
  schemaVersion: 1;
  transport: 'stdio';
  permissionMode: 'full-access';
  configuration: { mcpServers: { saplingagent: { command: string; args: string[] } } } | null;
  warnings: { code: string; message: string }[];
};
export type ConfigRequest = (route: string, body?: unknown) => Promise<any>;

export function aiConnectionReady(activeId: string | null | undefined, mcp?: McpSummary): boolean {
  return !!activeId || !!(mcp?.enabled && mcp.externalOnly);
}

export function mcpSettingsChanged(saved: McpSummary | null, draft: McpSettings | null): boolean {
  return !!saved && !!draft && (saved.enabled !== draft.enabled || saved.externalOnly !== draft.externalOnly);
}

export async function saveMcpSettings(request: ConfigRequest, draft: McpSettings): Promise<McpState> {
  if (draft.externalOnly && !draft.enabled) throw Object.assign(Error('Enable MCP before selecting external-only mode.'), { code: 'MCP_DISABLED' });
  // Send only local choices and the independent MCP revision, never generated paths.
  return request('mcp', { revision: draft.revision, enabled: draft.enabled, externalOnly: draft.externalOnly });
}

export async function exportMcpConfiguration(request: ConfigRequest, write: (json: string) => Promise<void> | void): Promise<McpState> {
  // Resolve at click time: configuration can move the project without reloading B.
  const state: McpState = await request('mcp');
  if (!state.enabled) throw Object.assign(Error('Enable and save MCP access before exporting its configuration.'), { code: 'MCP_DISABLED' });
  if (!state.available || !state.configuration) throw Object.assign(Error('MCP dependencies are unavailable. Repair the kernel before connecting.'), { code: 'MCP_UNAVAILABLE' });
  await write(JSON.stringify(state.configuration, null, 2) + '\n');
  return state;
}
