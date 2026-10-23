import { useLanguage } from '../localization/LanguageProvider';
import { ErrorNotice } from '../localization/ErrorNotice';
import { message, type UiText } from '../localization/messages';
import { useRef, useState, type ReactNode } from 'react';
import { AttachmentPrimitive, ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { File, LoaderCircle, Paperclip, X } from 'lucide-react';
import './attachments.css';

function AttachmentCard({ removable = false }: { removable?: boolean }) {
  const { t } = useLanguage();
  const attachment = useAuiState(state => state.attachment);
  const image = attachment.content?.find(part => part.type === 'image');
  const file = attachment.content?.find(part => part.type === 'file');
  const url = image?.type === 'image' ? image.image : file?.type === 'file' ? file.data : undefined;
  const error = attachment.status.type === 'incomplete' ? attachment.status.message || t('attachment.failed') : '';
  return <AttachmentPrimitive.Root className={`chat-attachment${error ? ' has-error' : ''}`}>
    {image?.type === 'image' ? <img src={image.image} alt={attachment.name} className="chat-attachment-image" /> : <File size={18} aria-hidden="true" />}
    <span className="chat-attachment-description">{url ? <a href={url} target="_blank" rel="noopener noreferrer" download={image ? undefined : attachment.name}>{attachment.name}</a> : <AttachmentPrimitive.Name />}
      {attachment.status.type === 'running' ? <small><LoaderCircle size={11} className="spinning" />{t('attachment.uploading')}</small> : error ? <ErrorNotice error={error} /> : null}
    </span>
    {removable ? <AttachmentPrimitive.Remove aria-label={t('attachment.remove', { name: attachment.name })} className="chat-attachment-remove"><X size={13} /></AttachmentPrimitive.Remove> : null}
  </AttachmentPrimitive.Root>;
}
export const MessageAttachment = () => <AttachmentCard />;
const ComposerAttachment = () => <AttachmentCard removable />;
export function ComposerAttachments() { return <div className="chat-attachments"><ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachment }} /></div>; }
export function AttachFilesButton() {
  const { t } = useLanguage();
  return <ComposerPrimitive.AddAttachment multiple className="attach-files-button" aria-label={t('attachment.add')} title={t('attachment.addHint')}><Paperclip size={16} /></ComposerPrimitive.AddAttachment>;
}
export function AttachmentDropzone({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const aui = useAui(); const depth = useRef(0);
  const [dragging, setDragging] = useState(false), [error, setError] = useState<UiText>('');
  function add(files: File[]) {
    if (aui.composer().getState().attachments.length + files.length > 10) { setError(message('attachment.limit')); return; }
    setError('');
    for (const file of files) void aui.composer().addAttachment(file).catch(error => setError(message('attachment.addError', undefined, error)));
  }
  return <div className={`chat-dropzone${dragging ? ' is-dragging' : ''}`}
    onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); depth.current++; setDragging(true); } }}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
    onDragLeave={event => { if (event.dataTransfer.types.includes('Files')) { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); } }}
    onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); add(Array.from(event.dataTransfer.files)); } }}
    onPasteCapture={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); event.stopPropagation(); add(files); } }}>
    {children}
    {dragging ? <div className="chat-drop-overlay"><Paperclip size={24} /><strong>{t('attachment.drop')}</strong></div> : null}
    {error ? <ErrorNotice className="attachment-input-error" error={error} /> : null}
  </div>;
}
