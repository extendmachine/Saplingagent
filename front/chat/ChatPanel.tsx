import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Check, LoaderCircle, Plus, RotateCcw, Square, Wrench } from 'lucide-react';
import { useSeedRuntime } from './useSeedRuntime';
import type { Message } from './runtime-api';

const convertMessage = (message: Message): ThreadMessageLike => ({
  id: message.id, role: message.role, content: [{ type: 'text', text: message.text }],
  ...(message.role === 'assistant' && { status: message.status === 'streaming' ? { type: 'running' as const } : message.status === 'interrupted' ? { type: 'incomplete' as const, reason: 'cancelled' as const } : message.status === 'failed' ? { type: 'incomplete' as const, reason: 'error' as const } : { type: 'complete' as const, reason: 'stop' as const } }),
});
function MarkdownText() {
  return <MarkdownTextPrimitive className="markdown-text" defer remarkPlugins={[remarkGfm]} components={{
    a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ alt }) => <span className="image-description">{alt || '图片'}</span>,
  }} />;
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="message assistant-message"><span className="message-author">Seed</span><div className="message-text"><MessagePrimitive.Parts components={{ Text: MarkdownText }} /></div></MessagePrimitive.Root>;
}
function UserMessage() {
  return <MessagePrimitive.Root className="message user-message"><div className="message-text"><MessagePrimitive.Parts /></div></MessagePrimitive.Root>;
}

const toolLabel = (name: string) => {
  const labels: Record<string, string> = { list_files: '查看项目文件', read_file: '阅读文件', propose_change: '验证页面变更', apply_change: '应用页面变更', rollback_change: '恢复页面版本', get_preferences: '读取偏好', set_preference: '记录偏好', search_web: '检索资料' };
  return labels[name.split(/[./]/).at(-1) || ''] || (name.includes('command') ? '执行项目检查' : '使用项目工具');
};
const decisionLabel = (decision: string) => ({ accept: '允许执行', decline: '拒绝', acceptForSession: '本次会话允许', cancel: '取消' }[decision] || decision);

export function ChatPanel() {
  const agent = useSeedRuntime();
  const runtime = useExternalStoreRuntime({ messages: agent.messages, convertMessage, onNew: agent.onNew, onCancel: agent.onCancel, isRunning: agent.isRunning, isLoading: agent.isLoading, isSendDisabled: agent.isLoading || !agent.status?.ready });
  const offline = agent.status && !agent.status.ready;
  const caption = agent.isLoading ? '连接本地 Agent…' : offline ? agent.status?.error || (agent.status?.authenticated ? 'Agent 暂未就绪' : '请先登录本机 Codex') : agent.activity || agent.status?.model || '本地 Agent';

  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className={`conversation ${agent.messages.length === 0 ? 'conversation-empty' : ''}`}>
      <ThreadPrimitive.Viewport className="message-viewport">
        {agent.messages.length === 0 && <div className="welcome"><h1>从一句话开始。</h1><p>告诉 Seed，你想构建什么。</p></div>}
        <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage }} />
        {agent.tools.length > 0 && <div className="tool-activity" aria-label="执行进展">{agent.tools.map(tool => <div key={tool.id} className="tool-step">{['completed', 'complete', 'succeeded'].includes(tool.status) ? <Check size={13} /> : ['failed', 'error'].includes(tool.status) ? <Wrench size={13} /> : <LoaderCircle size={13} className="spinning" />}<span>{toolLabel(tool.name)}</span>{['failed', 'error'].includes(tool.status) && <span>未完成</span>}</div>)}</div>}
        {agent.approvals.map(approval => <div className="approval-message" key={approval.id}>
          <p>{approval.description}</p>
          <div className="approval-actions">{(approval.choices?.length ? approval.choices : ['accept', 'decline']).map(choice => {
            const decision = typeof choice === 'string' ? choice : choice.value || choice.decision || '';
            const label = typeof choice === 'string' ? decisionLabel(choice) : choice.label || decisionLabel(decision);
            return <button key={decision} type="button" disabled={agent.approvalBusy || !decision} onClick={() => { void agent.respondApproval(approval.id, decision); }}>{label}</button>;
          })}</div>
        </div>)}
      </ThreadPrimitive.Viewport>
      <div className="composer-area">
        {agent.error && <div className="chat-error" role="alert"><span>{agent.error}</span>{agent.retryable && <button type="button" disabled={agent.isRunning} onClick={() => { void agent.retry(); }}><RotateCcw size={12} />重试</button>}</div>}
        <ComposerPrimitive.Root className="composer">
          <ComposerPrimitive.Input className="composer-input" placeholder="描述你的想法…" aria-label="与 Seed 对话" rows={2} autoFocus />
          <div className="composer-bottom"><span className="input-hint">Enter 发送 · Shift + Enter 换行</span>{agent.isRunning ? <ComposerPrimitive.Cancel className="send-button stop-button" aria-label="停止回复"><Square size={14} fill="currentColor" /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="send-button" aria-label="发送消息"><ArrowUp size={19} /></ComposerPrimitive.Send>}</div>
        </ComposerPrimitive.Root>
        <div className="runtime-footer"><span className={`runtime-caption ${offline ? 'runtime-offline' : ''}`} role="status">{agent.isRunning || agent.isLoading ? <LoaderCircle size={11} className="spinning" /> : <span className="connection-dot" />}{caption}</span>
          <div className="conversation-actions">{offline && <button type="button" title="重连本地 Agent" onClick={() => { void agent.refreshStatus(); }}><RotateCcw size={12} />重连</button>}<button type="button" disabled={agent.isRunning || agent.isLoading} onClick={() => { agent.startNew(); runtime.thread.composer.setText(''); }}><Plus size={12} />新对话</button></div>
        </div>
      </div>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
