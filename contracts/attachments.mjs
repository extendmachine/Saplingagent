export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const ATTACHMENT_JSON_BYTES = 32 * 1024 * 1024;
export class AttachmentError extends Error {
  constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); }
}
export function attachmentId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) throw new AttachmentError('INVALID_ATTACHMENT', 'Invalid attachment identifier.');
  return value.toLowerCase();
}
export function attachmentIds(value = []) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new AttachmentError('INVALID_ATTACHMENT', `Attach up to ${MAX_ATTACHMENTS} files per message.`);
  const ids = value.map(attachmentId);
  if (new Set(ids).size !== ids.length) throw new AttachmentError('INVALID_ATTACHMENT', 'Attachment identifiers must be unique.');
  return ids;
}
export function attachmentSummary(value) {
  if (!value || typeof value !== 'object') throw new AttachmentError('INVALID_ATTACHMENT', 'Invalid attachment metadata.');
  const id = attachmentId(value.id);
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 240 || /[\0\r\n]/.test(value.name)) throw new AttachmentError('INVALID_ATTACHMENT', 'File name must contain 1 to 240 characters.');
  if (!Number.isInteger(value.size) || value.size < 0 || value.size > MAX_ATTACHMENT_BYTES || !['image', 'file'].includes(value.kind) || typeof value.contentType !== 'string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value.contentType)) throw new AttachmentError('INVALID_ATTACHMENT', 'Invalid attachment type or size.');
  if (value.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(value.sha256)) throw new AttachmentError('INVALID_ATTACHMENT', 'Invalid attachment digest.');
  return { id, name: value.name, contentType: value.contentType, size: value.size, kind: value.kind, ...(value.sha256 ? { sha256: value.sha256 } : {}) };
}
