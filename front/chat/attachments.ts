import type { AttachmentAdapter, PendingAttachment, CompleteAttachment } from '@assistant-ui/react';
import type { AttachmentMetadata } from './runtime-api';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const attachmentUrl = (id: string) => `/api/attachments/${encodeURIComponent(id)}/content`;
export function completeAttachment(value: AttachmentMetadata): CompleteAttachment {
  const url = attachmentUrl(value.id);
  return { id: value.id, name: value.name, type: value.kind === 'image' ? 'image' : 'file', contentType: value.contentType, status: { type: 'complete' }, content: value.kind === 'image' ? [{ type: 'image', image: url, filename: value.name }] : [{ type: 'file', data: url, mimeType: value.contentType, filename: value.name, sourceType: 'url' }] };
}
const uploaded = new Map<string, AttachmentMetadata>();
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('The file could not be read. Select it again.')); reader.onabort = () => reject(new Error('File reading was cancelled.'));
    reader.readAsDataURL(file);
  });
}
export const attachmentAdapter: AttachmentAdapter = {
  accept: '*',
  async *add({ file }) {
    const id = crypto.randomUUID();
    const base = { id, file, name: file.name || 'clipboard-file', type: file.type.startsWith('image/') ? 'image' : 'file', contentType: file.type || 'application/octet-stream' };
    yield { ...base, status: { type: 'running', reason: 'uploading', progress: 0 } };
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Each file must be at most 20 MiB.');
      const data = await fileBase64(file);
      const response = await fetch('/api/attachments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: base.name, contentType: base.contentType, data }), signal: AbortSignal.timeout(60000) });
      const body = await response.json();
      if (!response.ok || !body.attachment) throw new Error(body.error?.message || 'Upload failed. Remove the file and try again.');
      const metadata = body.attachment as AttachmentMetadata; uploaded.set(id, metadata);
      const complete = completeAttachment(metadata);
      yield { ...base, type: complete.type, contentType: metadata.contentType, content: complete.content, status: { type: 'requires-action', reason: 'composer-send' } };
    } catch (error) {
      yield { ...base, status: { type: 'incomplete', reason: 'error', message: error instanceof Error ? error.message : 'Upload failed. Remove the file and try again.' } };
    }
  },
  async send(attachment: PendingAttachment, options) {
    if (options?.signal?.aborted) throw new Error('Sending was cancelled.');
    const metadata = uploaded.get(attachment.id);
    if (!metadata) throw new Error('A file did not finish uploading. Remove it and try again.');
    return completeAttachment(metadata);
  },
  async remove(attachment) { uploaded.delete(attachment.id); },
};
