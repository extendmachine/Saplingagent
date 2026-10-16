import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { safePath } from './store.mjs';
import { AttachmentError, attachmentId, attachmentSummary, MAX_ATTACHMENT_BYTES } from '../../contracts/attachments.mjs';

function imageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['image/png', '.png'];
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ['image/jpeg', '.jpg'];
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) return ['image/gif', '.gif'];
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return ['image/webp', '.webp'];
  return null;
}
export async function createAttachmentStore(root) {
  await safePath(root, 'data/attachments', true);
  let queue = Promise.resolve();
  const serial = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
  async function get(id, { data = false } = {}) {
    id = attachmentId(id);
    let record;
    try {
      const file = await safePath(root, `data/attachments/${id}/metadata.json`);
      const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { if ((await handle.stat()).size > 16384) throw new Error('Metadata too large'); record = JSON.parse(await handle.readFile('utf8')); }
      finally { await handle.close(); }
    } catch (error) {
      if (error.code === 'ENOENT') throw new AttachmentError('ATTACHMENT_NOT_FOUND', 'The attachment is no longer available.', 404);
      throw new AttachmentError('CORRUPT_ATTACHMENT', 'Attachment metadata requires recovery.', 500);
    }
    try {
      attachmentSummary(record);
      if (record.id !== id || typeof record.path !== 'string' || !new RegExp(`^data/attachments/${id}/payload(?:\\.[a-z0-9]{1,16})?$`, 'i').test(record.path)) throw new Error('Invalid stored path');
      const file = await safePath(root, record.path);
      const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if ((await handle.stat()).size !== record.size) throw new Error('Stored size mismatch');
        if (data) {
          const bytes = await handle.readFile();
          if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('Stored digest mismatch');
          return { attachment: record, data: bytes.toString('base64') };
        }
      } finally { await handle.close(); }
      return { attachment: record };
    } catch (error) {
      if (error.code === 'ENOENT') throw new AttachmentError('ATTACHMENT_NOT_FOUND', 'The attachment file is no longer available.', 404);
      throw new AttachmentError('CORRUPT_ATTACHMENT', 'The attachment file requires recovery.', 500);
    }
  }
  async function put(input) {
    if (!input || typeof input.data !== 'string' || input.data.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4) throw new AttachmentError('PAYLOAD_TOO_LARGE', 'Each file must be at most 20 MiB.', 413);
    const bytes = Buffer.from(input.data, 'base64');
    if (bytes.toString('base64') !== input.data) throw new AttachmentError('INVALID_ATTACHMENT', 'File content must be canonical base64.');
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentError('PAYLOAD_TOO_LARGE', 'Each file must be at most 20 MiB.', 413);
    const id = input.id === undefined ? randomUUID() : attachmentId(input.id);
    const detected = imageType(bytes);
    const claimedType = typeof input.contentType === 'string' && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.contentType) && !input.contentType.startsWith('image/') ? input.contentType : 'application/octet-stream';
    const record = { ...attachmentSummary({ id, name: input.name, size: bytes.length, kind: detected ? 'image' : 'file', contentType: detected?.[0] || claimedType, sha256: createHash('sha256').update(bytes).digest('hex') }), createdAt: new Date().toISOString() };
    const originalExtension = typeof input.name === 'string' ? path.extname(input.name).toLowerCase() : '';
    const extension = detected?.[1] || (/^\.[a-z0-9]{1,16}$/.test(originalExtension) ? originalExtension : '');
    record.path = `data/attachments/${id}/payload${extension}`;
    return serial(async () => {
      try {
        const { attachment: existing } = await get(id);
        if (existing.sha256 !== record.sha256 || existing.name !== record.name || existing.contentType !== record.contentType) throw new AttachmentError('ATTACHMENT_CONFLICT', 'This upload identifier already belongs to a different file.', 409);
        return { attachment: existing };
      } catch (error) { if (error.code !== 'ATTACHMENT_NOT_FOUND') throw error; }
      await safePath(root, `data/attachments/${id}`, true);
      const file = await safePath(root, record.path), metadata = await safePath(root, `data/attachments/${id}/metadata.json`);
      let handle;
      try {
        handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
        const temporary = metadata + `.${randomUUID()}.tmp`;
        try { await fs.writeFile(temporary, JSON.stringify(record) + '\n', { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, metadata); }
        finally { await fs.rm(temporary, { force: true }); }
      } finally { await handle?.close(); }
      return { attachment: record };
    });
  }
  return { put, get };
}
