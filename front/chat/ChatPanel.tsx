import { ErrorNotice } from '../localization/ErrorNotice';
import type { MessageKey } from '../localization/catalog';
import { useLanguage } from '../localization/LanguageProvider';
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
import { EngineControls } from './EngineControls';
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
  const { t } = useLanguage();
  return <MarkdownTextPrimitive className="markdown-text" defer preprocess={preprocessMarkdown} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false }]]} components={{
    a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ alt }) => <span className="image-description">{alt || t('chat.image')}</span>,
  }} />;
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="message assistant-message"><span className="message-author">Saplingagent</span><div className="message-text"><MessagePrimitive.Parts components={{ Text: MarkdownText }} /></div></MessagePrimitive.Root>;
}
function UserMessage() {
  return <MessagePrimitive.Root className="message user-message"><div className="message-text"><div className="chat-attachments"><MessagePrimitive.Attachments components={{ Attachment: MessageAttachment }} /></div><MessagePrimitive.Parts /></div></MessagePrimitive.Root>;
}

const toolLabel = (name: string, t: ReturnType<typeof useLanguage>['t']) => {
  const labels: Record<string, MessageKey> = { page_read: 'tool.page', list_files: 'tool.list', read_file: 'tool.read', propose_change: 'tool.propose', apply_change: 'tool.apply', rollback_change: 'tool.rollback', get_preferences: 'tool.preferencesRead', set_preference: 'tool.preferencesSave', search_web: 'tool.search' };
  return t(labels[name.split(/[./]/).at(-1) || ''] || (name.includes('command') ? 'tool.command' : 'tool.generic'));
};
const decisionLabel = (decision: string, t: ReturnType<typeof useLanguage>['t']) => { const key = ({ accept: 'approval.allow', decline: 'approval.decline', acceptForSession: 'approval.session', cancel: 'common.cancel' } as Record<string, MessageKey>)[decision]; return key ? t(key) : decision; };

export function ChatPanel() {
  const { t } = useLanguage();
  const agent = useSeedRuntime();
  const [changingSession, setChangingSession] = useState(false);
  const runtime = useExternalStoreRuntime({ messages: agent.messages, convertMessage, onNew: agent.onNew, onCancel: agent.onCancel, isRunning: agent.isRunning, isLoading: agent.isLoading, isSendDisabled: changingSession || agent.isLoading || agent.isChangingEngine || agent.isRestarting || !agent.engineReady, adapters: { attachments: attachmentAdapter } });
  const selectedEngine = agent.engines.find(engine => engine.id === agent.selection.engine);
  const selectedProvider = selectedEngine?.providers?.find(provider => provider.id === agent.selection.providerId);
  const offline = !agent.isLoading && !agent.engineReady;
  const caption = agent.isLoading ? t('runtime.connecting') : offline ? t('chat.offline') : agent.activity || (agent.selection.engine !== 'codex' ? selectedProvider?.models.find(model => model.id === agent.selection.modelId)?.label : null) || t('chat.local');

  return <AssistantRuntimeProvider runtime={runtime}>
    <ConversationControls agent={agent} composer={runtime.thread.composer} onChanging={setChangingSession} />
    <ContextUsageCounter usage={agent.contextUsage} />
    <AttachmentDropzone><ThreadPrimitive.Root className={`conversation ${agent.messages.length === 0 ? 'conversation-empty' : ''}`}>
      <ThreadPrimitive.Viewport className="message-viewport">
        {agent.messages.length === 0 && <div className="welcome"><h1>{t('chat.welcome')}</h1><p>{t('chat.idea')}</p></div>}
        <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage }} />
        {agent.tools.length > 0 && <div className="tool-activity" aria-label={t('chat.progress')}>{agent.tools.map(tool => <div key={tool.id} className="tool-step">{['completed', 'complete', 'succeeded'].includes(tool.status) ? <Check size={13} /> : ['failed', 'error'].includes(tool.status) ? <Wrench size={13} /> : <LoaderCircle size={13} className="spinning" />}<span>{toolLabel(tool.name, t)}</span>{['failed', 'error'].includes(tool.status) && <span>{t('chat.incomplete')}</span>}</div>)}</div>}
        {agent.approvals.map(approval => <div className="approval-message" key={approval.id}>
          <p>{approval.description}</p>
          <div className="approval-actions">{(approval.choices?.length ? approval.choices : ['accept', 'decline']).map(choice => {
            const decision = typeof choice === 'string' ? choice : choice.value || choice.decision || '';
            const label = typeof choice === 'string' ? decisionLabel(choice, t) : choice.label || decisionLabel(decision, t);
            return <button key={decision} type="button" disabled={agent.approvalBusy || !decision} onClick={() => { void agent.respondApproval(approval.id, decision); }}>{label}</button>;
          })}</div>
        </div>)}
      </ThreadPrimitive.Viewport>
      <div className="composer-area">
        {offline && agent.engineErrorIssue ? <ErrorNotice error={agent.engineErrorIssue} /> : null}
        <EngineControls agent={agent} composer={runtime.thread.composer} changingSession={changingSession} />
        {agent.error && <div className="chat-error" role="alert"><ErrorNotice error={agent.errorIssue} />{agent.retryable && <button type="button" disabled={agent.isRunning} onClick={() => { void agent.retry(); }}><RotateCcw size={12} />{t('common.retry')}</button>}</div>}
        <ComposerPrimitive.Root className="composer"><RestartDraft sessionId={agent.activeSessionId} /><ComposerAttachments />
          <ComposerPrimitive.Input addAttachmentOnPaste={false} className="composer-input" placeholder={t('chat.placeholder')} aria-label={t('chat.label')} rows={2} autoFocus />
          <div className="composer-bottom"><div className="composer-meta"><AttachFilesButton /><span className="input-hint">{t('chat.enter')}</span></div>{agent.isRunning ? <ComposerPrimitive.Cancel className="send-button stop-button" aria-label={t('chat.stop')}><Square size={14} fill="currentColor" /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="send-button" aria-label={t('chat.send')}><ArrowUp size={19} /></ComposerPrimitive.Send>}</div>
        </ComposerPrimitive.Root>
        <div className="runtime-footer"><span className={`runtime-caption ${offline ? 'runtime-offline' : ''}`} role="status">{agent.isRunning || agent.isLoading ? <LoaderCircle size={11} className="spinning" /> : <span className="connection-dot" />}{caption}</span>
          <div className="conversation-actions">{offline && <button type="button" title={t('chat.reconnectTitle')} onClick={() => { void agent.refreshStatus(); void agent.refreshEngines(); }}><RotateCcw size={12} />{t('chat.reconnect')}</button>}</div>
        </div>
      </div>
    </ThreadPrimitive.Root></AttachmentDropzone>
  </AssistantRuntimeProvider>;
}
