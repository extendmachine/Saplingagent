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
    img: ({ alt }) => <span className="image-description">{alt || 'Image'}</span>,
  }} />;
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="message assistant-message"><span className="message-author">Saplingagent</span><div className="message-text"><MessagePrimitive.Parts components={{ Text: MarkdownText }} /></div></MessagePrimitive.Root>;
}
function UserMessage() {
  return <MessagePrimitive.Root className="message user-message"><div className="message-text"><MessagePrimitive.Parts /></div></MessagePrimitive.Root>;
}

const toolLabel = (name: string) => {
  const labels: Record<string, string> = { list_files: 'Browse project files', read_file: 'Read file', propose_change: 'Record page change', apply_change: 'Apply page change', rollback_change: 'Restore page version', get_preferences: 'Read preferences', set_preference: 'Save preference', search_web: 'Search sources' };
  return labels[name.split(/[./]/).at(-1) || ''] || (name.includes('command') ? 'Run project command' : 'Use project tool');
};
const decisionLabel = (decision: string) => ({ accept: 'Allow', decline: 'Decline', acceptForSession: 'Allow for this session', cancel: 'Cancel' }[decision] || decision);

export function ChatPanel() {
  const agent = useSeedRuntime();
  const runtime = useExternalStoreRuntime({ messages: agent.messages, convertMessage, onNew: agent.onNew, onCancel: agent.onCancel, isRunning: agent.isRunning, isLoading: agent.isLoading, isSendDisabled: agent.isLoading || !agent.status?.ready });
  const offline = agent.status && !agent.status.ready;
  const caption = agent.isLoading ? 'Connecting to local Agent…' : offline ? agent.status?.error || (agent.status?.authenticated ? 'Agent is not ready' : 'Log in to project Codex first') : agent.activity || agent.status?.model || 'Local Agent';

  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className={`conversation ${agent.messages.length === 0 ? 'conversation-empty' : ''}`}>
      <ThreadPrimitive.Viewport className="message-viewport">
        {agent.messages.length === 0 && <div className="welcome"><h1>Start with a conversation.</h1><p>Tell Saplingagent what you want to build.</p></div>}
        <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage }} />
        {agent.tools.length > 0 && <div className="tool-activity" aria-label="Execution progress">{agent.tools.map(tool => <div key={tool.id} className="tool-step">{['completed', 'complete', 'succeeded'].includes(tool.status) ? <Check size={13} /> : ['failed', 'error'].includes(tool.status) ? <Wrench size={13} /> : <LoaderCircle size={13} className="spinning" />}<span>{toolLabel(tool.name)}</span>{['failed', 'error'].includes(tool.status) && <span>Incomplete</span>}</div>)}</div>}
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
        {agent.error && <div className="chat-error" role="alert"><span>{agent.error}</span>{agent.retryable && <button type="button" disabled={agent.isRunning} onClick={() => { void agent.retry(); }}><RotateCcw size={12} />Retry</button>}</div>}
        <ComposerPrimitive.Root className="composer">
          <ComposerPrimitive.Input className="composer-input" placeholder="Describe your idea…" aria-label="Chat with Saplingagent" rows={2} autoFocus />
          <div className="composer-bottom"><span className="input-hint">Enter to send · Shift + Enter for a new line</span>{agent.isRunning ? <ComposerPrimitive.Cancel className="send-button stop-button" aria-label="Stop response"><Square size={14} fill="currentColor" /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="send-button" aria-label="Send message"><ArrowUp size={19} /></ComposerPrimitive.Send>}</div>
        </ComposerPrimitive.Root>
        <div className="runtime-footer"><span className={`runtime-caption ${offline ? 'runtime-offline' : ''}`} role="status">{agent.isRunning || agent.isLoading ? <LoaderCircle size={11} className="spinning" /> : <span className="connection-dot" />}{caption}</span>
          <div className="conversation-actions">{offline && <button type="button" title="Reconnect to local Agent" onClick={() => { void agent.refreshStatus(); }}><RotateCcw size={12} />Reconnect</button>}<button type="button" disabled={agent.isRunning || agent.isLoading} onClick={() => { agent.startNew(); runtime.thread.composer.setText(''); }}><Plus size={12} />New conversation</button></div>
        </div>
      </div>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
