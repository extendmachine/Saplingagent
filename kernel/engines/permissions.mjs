import { confirmationContent } from './approval.mjs';

export const permissions = Object.freeze({ mode: 'full-access', sandbox: 'danger-full-access', approvalPolicy: 'never', mcpApproval: 'approve' });
export const threadPermissions = Object.freeze({ sandbox: permissions.sandbox, approvalPolicy: permissions.approvalPolicy });

export function permissionConfigArgs() {
  return ['-c', `sandbox_mode="${permissions.sandbox}"`, '-c', `approval_policy="${permissions.approvalPolicy}"`, '-c', 'features.shell_tool=true', '-c', 'features.unified_exec=true', '-c', 'mcp_servers.seedagent.default_tools_approval_mode="approve"', '-c', 'mcp_servers.seedagent.tool_timeout_sec=3615'];
}

export function automaticApproval(method, params = {}) {
  if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(method)) return { decision: 'accept' };
  if (method === 'item/permissions/requestApproval') return { permissions: params.permissions || {}, scope: 'turn' };
  if (method === 'mcpServer/elicitation/request' && params.serverName === 'seedagent' && params.mode === 'form') {
    const content = confirmationContent(params.requestedSchema);
    if (content !== null) return { action: 'accept', content };
  }
  return null;
}
