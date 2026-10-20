import { useState } from 'react';
import { attachmentAdapter, completeAttachment } from './attachments';
import { AttachmentDropzone, AttachFilesButton, ComposerAttachments, MessageAttachment } from './AttachmentControls';
import { RestartDraft } from './RestartDraft';
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react';
import { escapeCurrencyDollars, MarkdownTextPrimitive, normalizeMathDelimiters } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ConversationControls } from './ConversationControls';
import { ContextUsageCounter } from '../features/context-usage/ContextUsageCounter';
import { ArrowUp, Check, LoaderCircle, RotateCcw, Square, Wrench } from 'lucide-react';
import { useSeedRuntime } from './useSeedRuntime';
import type { Message } from './runtime-api';

const convertMessage = (message: Message): ThreadMessageLike => ({
  id: message.id, role: message.role, ...(message.attachments?.length ? { attachments: message.attachments.map(completeAttachment) } : {}), content: [{ type: 'text', text: message.text }],
  ...(message.role === 'assistant' && { status: message.status === 'streaming' ? { type: 'running' as const } : message.status === 'interrupted' ? { type: 'incomplete' as const, reason: 'cancelled' as const } : message.status === 'failed' ? { type: 'incomplete' as const, reason: 'error' as const } : { type: 'complete' as const, reason: 'stop' as const } }),
});
const preprocessMarkdown = (text: string) => escapeCurrencyDollars(normalizeMathDelimiters(text));
function MarkdownText() {
  return <MarkdownTextPrimitive className="markdown-text" defer preprocess={preprocessMarkdown} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false }]]} components={{
    a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ alt }) => <span className="image-description">{alt || 'Image'}</span>,
  }} />;
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="message assistant-message"><span className="message-author">Saplingagent</span><div className="message-text"><MessagePrimitive.Parts components={{ Text: MarkdownText }} /></div></MessagePrimitive.Root>;
}
function UserMessage() {
  return <MessagePrimitive.Root className="message user-message"><div className="message-text"><div className="chat-attachments"><MessagePrimitive.Attachments components={{ Attachment: MessageAttachment }} /></div><MessagePrimitive.Parts /></div></MessagePrimitive.Root>;
}

const toolLabel = (name: string) => {
  const labels: Record<string, string> = { page_read: 'Inspect current page', list_files: 'Browse project files', read_file: 'Read file', propose_change: 'Record page change', apply_change: 'Apply page change', rollback_change: 'Restore page version', get_preferences: 'Read preferences', set_preference: 'Save preference', search_web: 'Search sources' };
  return labels[name.split(/[./]/).at(-1) || ''] || (name.includes('command') ? 'Run project command' : 'Use project tool');
};
const decisionLabel = (decision: string) => ({ accept: 'Allow', decline: 'Decline', acceptForSession: 'Allow for this session', cancel: 'Cancel' }[decision] || decision);

export function ChatPanel() {
  const agent = useSeedRuntime();
  const [changingSession, setChangingSession] = useState(false);
  const runtime = useExternalStoreRuntime({ messages: agent.messages, convertMessage, onNew: agent.onNew, onCancel: agent.onCancel, isRunning: agent.isRunning, isLoading: agent.isLoading, isSendDisabled: changingSession || agent.isLoading || !agent.engineReady, adapters: { attachments: attachmentAdapter } });
  const selectedEngine = agent.engines.find(engine => engine.id === agent.selection.engine);
  const selectedProvider = selectedEngine?.providers?.find(provider => provider.id === agent.selection.providerId);
  const offline = !agent.isLoading && !agent.engineReady;
  const caption = agent.isLoading ? 'Connecting to local Agent…' : offline ? agent.engineError || selectedEngine?.error || 'Selected engine is not ready' : agent.activity || (agent.selection.engine !== 'codex' ? selectedProvider?.models.find(model => model.id === agent.selection.modelId)?.label : agent.status?.model) || 'Local Agent';
  const selectEngine = (engine: 'codex' | 'opencode' | 'claude') => {
    if (engine === 'codex') return agent.setSelection({ engine, providerId: null, modelId: null });
    const provider = agent.engines.find(item => item.id === engine)?.providers?.[0];
    agent.setSelection({ engine, providerId: provider?.id || null, modelId: provider?.defaultModelId || provider?.models[0]?.id || null });
  };
  const selectProvider = (providerId: string) => {
    const provider = agent.engines.find(item => item.id === agent.selection.engine)?.providers?.find(item => item.id === providerId);
    agent.setSelection({ engine: agent.selection.engine, providerId, modelId: provider?.defaultModelId || provider?.models[0]?.id || null });
  };

  return <AssistantRuntimeProvider runtime={runtime}>
    <ConversationControls agent={agent} composer={runtime.thread.composer} onChanging={setChangingSession} />
    <ContextUsageCounter usage={agent.contextUsage} />
    <AttachmentDropzone><ThreadPrimitive.Root className={`conversation ${agent.messages.length === 0 ? 'conversation-empty' : ''}`}>
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
        <ComposerPrimitive.Root className="composer"><RestartDraft sessionId={agent.activeSessionId} /><ComposerAttachments />
          <ComposerPrimitive.Input addAttachmentOnPaste={false} className="composer-input" placeholder="Describe your idea…" aria-label="Chat with Saplingagent" rows={2} autoFocus />
          <div className="composer-bottom"><div className="composer-meta"><AttachFilesButton />{agent.canSelectEngine && <div className="engine-picker">
            <select aria-label="Agent engine" value={agent.selection.engine} onChange={event => selectEngine(event.target.value as 'codex' | 'opencode' | 'claude')}><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="claude">Claude Agent</option></select>
            {agent.selection.engine !== 'codex' && <><select aria-label="Agent provider" value={agent.selection.providerId || ''} onChange={event => selectProvider(event.target.value)} disabled={!selectedEngine?.providers?.length}><option value="" disabled>Select provider</option>{selectedEngine?.providers?.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select><select aria-label="Agent model" value={agent.selection.modelId || ''} onChange={event => agent.setSelection({ ...agent.selection, modelId: event.target.value })} disabled={!selectedProvider?.models.length}><option value="" disabled>Select model</option>{selectedProvider?.models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select></>}
          </div>}<span className="input-hint">Enter to send · Shift + Enter for a new line</span></div>{agent.isRunning ? <ComposerPrimitive.Cancel className="send-button stop-button" aria-label="Stop response"><Square size={14} fill="currentColor" /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="send-button" aria-label="Send message"><ArrowUp size={19} /></ComposerPrimitive.Send>}</div>
        </ComposerPrimitive.Root>
        <div className="runtime-footer"><span className={`runtime-caption ${offline ? 'runtime-offline' : ''}`} role="status">{agent.isRunning || agent.isLoading ? <LoaderCircle size={11} className="spinning" /> : <span className="connection-dot" />}{caption}</span>
          <div className="conversation-actions">{offline && <button type="button" title="Reconnect to local Agent" onClick={() => { void agent.refreshStatus(); void agent.refreshEngines(); }}><RotateCcw size={12} />Reconnect</button>}</div>
        </div>
      </div>
    </ThreadPrimitive.Root></AttachmentDropzone>
  </AssistantRuntimeProvider>;
}
