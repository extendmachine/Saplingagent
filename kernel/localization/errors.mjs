// Stable codes remain technical identifiers. This catalog only explains failures.
export const errorMessages = {
  en: {
    unknown: ['The operation could not finish.', 'Try again. If it still fails, open Project status and check the project logs.'],
    network: ['The local service or AI provider could not be reached.', 'Check your connection and Project status. Start or restart the app if its services are unavailable, then retry.'],
    auth: ['The AI account could not be authenticated.', 'Open AI settings, sign in again or update this scheme’s credentials, then retry.'],
    quota: ['The AI provider refused the request because of an account or usage limit.', 'Check this provider’s account, quota and billing, or select another configured AI.'],
    busy: ['Another task is still using this project.', 'Wait for the current operation to finish, or stop the active conversation before trying again.'],
    changed: ['The project or conversation changed while this action was pending.', 'Refresh its status and try again. Your current draft has not been sent again.'],
    credentials: ['The selected credential file could not be imported.', 'Choose a complete supported JSON file, check its size and read permission, or use the official sign-in option.'],
    credentialExists: ['Credentials are already saved for this scheme.', 'Use the saved account, or explicitly select Replace existing credentials before importing again.'],
    missingAuth: ['No supported local login was found.', 'Use official sign-in, upload your own supported credential file, or configure an API scheme.'],
    input: ['Some settings are missing or invalid.', 'Check the highlighted fields, provider URL, model and credentials, then save again.'],
    setup: ['Project configuration has not finished yet.', 'Save the project and AI settings, complete Save & build app, and wait for restart before opening the app.'],
    dependency: ['A required local component could not start or be prepared.', 'Run Install / repair from Saplingagent.sh. Check your network and available disk space, then retry.'],
    permission: ['The operation was denied by the operating system or local access checks.', 'Open the app from its launcher and use its current local address. Check the project folder’s access permissions.'],
    conflict: ['The update overlaps with locally modified kernel files.', 'Review and merge the listed files before retrying. Keep your source backup; application files are preserved.'],
    kernel: ['This kernel package cannot be applied to the current installation.', 'Check the installed version and update source. Use an explicitly selected compatible backup if recovery is needed.'],
    session: ['This saved conversation is no longer available.', 'Keep your draft and select an existing conversation or start a new one. Nothing will be sent automatically.'],
    stopped: ['The project has not confirmed that all its services stopped.', 'Wait briefly, then choose Stop app again. If it still fails, inspect logs/project-launcher and Project status.'],
    attachment: ['The file could not be attached.', 'Check its size and type, then select the file again. Wait for uploads to finish before sending.'],
    storage: ['The project could not save or read a local file.', 'Check available disk space and folder access. Keep this window open and retry saving before closing.']
  },
  zh: {
    unknown: ['操作未能完成。', '请重试；仍然失败时，打开“项目状态”并检查项目日志。'],
    network: ['无法连接本地服务或 AI 服务商。', '检查网络和“项目状态”；如果应用服务未运行，请启动或重启应用后重试。'],
    auth: ['AI 账号认证失败。', '打开 AI 设置，重新登录或更新当前方案的凭据，然后重试。'],
    quota: ['AI 服务商因账号或使用限额拒绝了请求。', '检查该服务商的账号、额度和账单，或选择另一个已配置的 AI。'],
    busy: ['其他任务仍在使用这个项目。', '请等待当前操作完成，或停止正在运行的对话后重试。'],
    changed: ['等待期间项目或对话已发生变化。', '刷新状态后重试。当前草稿不会被自动重新发送。'],
    credentials: ['无法导入所选凭据文件。', '请选择完整且受支持的 JSON 文件，检查大小和读取权限，或使用官方登录。'],
    credentialExists: ['当前方案已保存凭据。', '使用已保存账号；如需重新导入，请先明确勾选“替换已有凭据”。'],
    missingAuth: ['未找到受支持的本机登录。', '请使用官方登录、上传自己的受支持凭据文件，或配置 API 方案。'],
    input: ['部分设置缺失或无效。', '检查提示的字段、服务商网址、模型及凭据，然后重新保存。'],
    setup: ['项目配置尚未完成。', '先保存项目和 AI 设置，再完成“保存并构建应用”；等待重启后打开应用。'],
    dependency: ['所需的本地组件无法启动或准备失败。', '在 Saplingagent.sh 中运行“安装／修复”，检查网络和磁盘空间后重试。'],
    permission: ['操作被系统权限或本地访问检查拒绝。', '请从启动器打开应用并使用当前本机网址，同时检查项目文件夹的访问权限。'],
    conflict: ['此次更新与本地修改的内核文件冲突。', '先检查并合并列出的文件，再重试。保留源码备份；应用文件会保留。'],
    kernel: ['此内核包无法应用到当前安装。', '检查已安装版本和更新来源；需要恢复时，请明确选择兼容的备份。'],
    session: ['这个已保存的对话已不可用。', '保留草稿，选择已有对话或新建对话。系统不会自动发送内容。'],
    stopped: ['项目尚未确认全部服务已停止。', '稍候再点击“停止应用”；仍然失败时，请检查 logs/project-launcher 和“项目状态”。'],
    attachment: ['文件未能添加为附件。', '检查文件大小和类型，重新选择文件，并等待上传完成后再发送。'],
    storage: ['项目无法保存或读取本地文件。', '检查磁盘空间和文件夹权限；关闭窗口前，请保留当前内容并重试保存。']
  }
};
const groups = {
  auth: ['UNAUTHENTICATED','AUTH_REQUIRED','LOGIN_REQUIRED','LOGIN_FAILED','INVALID_API_KEY','TOKEN_EXPIRED','AUTHENTICATION_ERROR'],
  network: ['SERVICE_UNAVAILABLE','MANAGER_UNAVAILABLE','ECONNREFUSED','ENOTFOUND','ETIMEDOUT','NETWORK_ERROR','FETCH_FAILED','ENGINE_UNAVAILABLE','RUNTIME_RESTARTING'],
  credentials: ['INVALID_CREDENTIALS','UNSUPPORTED_AUTH','CREDENTIALS_TOO_LARGE','LOCAL_AUTH_UNREADABLE'],
  credentialExists: ['CREDENTIAL_EXISTS'], missingAuth: ['LOCAL_AUTH_NOT_FOUND','LOCAL_API_NOT_FOUND'],
  setup: ['PROJECT_SETTINGS_REQUIRED','PROJECT_RESTART_REQUIRED','PROJECT_FINALIZATION_REQUIRED','PROJECT_DIRECTORY_REQUIRED'],
  dependency: ['UI_NOT_BUILT','UI_BUILD_FAILED','UI_BUILD_INTERRUPTED','DEPENDENCIES_MISSING','SPAWN_FAILED','ENOENT'],
  permission: ['INVALID_HOST','INVALID_ORIGIN','UNAUTHORIZED','FORBIDDEN','EACCES','EPERM','PROJECT_STORAGE_LOCATION'],
  conflict: ['KERNEL_CONFLICT'], kernel: ['KERNEL_INCOMPATIBLE','INVALID_KERNEL','KERNEL_INTEGRITY'],
  session: ['SESSION_NOT_FOUND'], stopped: ['SERVICE_STOP_FAILED','STOP_UNAVAILABLE'],
  storage: ['ENOSPC','EROFS','SESSION_SAVE_FAILED','WORKSPACE_UNAVAILABLE','LANGUAGE_SAVE_FAILED']
};
export function describeError(error, language = 'en') {
  const issue = error?.error || error;
  const code = typeof issue?.code === 'string' ? issue.code.slice(0,100) : '';
  const message = typeof issue === 'string' ? issue : typeof issue?.message === 'string' ? issue.message : '';
  const details = message.replace(/\b(Bearer\s+)[^\s"']+/gi, '$1[redacted]')
    .replace(/\b(?:sk-|sk-ant-)[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[=:]\s*)[^\s,;&]+/gi, '$1[redacted]').slice(0,4000);
  let group = Object.keys(groups).find(name => groups[name].includes(code)) || 'unknown';
  if (group === 'unknown') {
    if (/Session does not exist/i.test(message)) group = 'session';
    else if (/refresh token|access token|authentication|invalid.*(?:key|token)|unauthenticated|sign in again|401/i.test(message)) group = 'auth';
    else if (/quota|rate.limit|credit|insufficient.balance|429/i.test(message)) group = 'quota';
    else if (/fetch|network|connection|Failed to connect/i.test(message)) group = 'network';
    else if (/Cross-site access denied/i.test(message)) group = 'permission';
    else if (/BUSY|IN_PROGRESS/.test(code)) group = 'busy';
    else if (/CHANGED|STALE|REVISION|CONFLICT/.test(code)) group = 'changed';
    else if (/ATTACHMENT|UPLOAD/.test(code)) group = 'attachment';
    else if (/INVALID|REQUIRED/.test(code)) group = 'input';
  }
  const [summary, action] = errorMessages[language === 'zh' ? 'zh' : 'en'][group];
  return { code, summary, action, details };
}

// Embed the exact shared classifier in standalone pages without remote scripts.
export function browserErrorSource() {
  const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
  return `const errorMessages=${json(errorMessages)},groups=${json(groups)};${describeError.toString()}`;
}
