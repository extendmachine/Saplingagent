import type { Attachment, ComposerRuntime, CreateAttachment } from '@assistant-ui/react';

export type ConversationDraft = { text: string; attachments: (File | CreateAttachment)[] };
export function captureConversationDraft(state: { text: string; attachments: readonly Attachment[] }): ConversationDraft {
  return { text: state.text, attachments: state.attachments.flatMap<File | CreateAttachment>(attachment => {
    if (attachment.content?.length && ['complete', 'requires-action'].includes(attachment.status.type)) {
      return [{ id: attachment.id, type: attachment.type, name: attachment.name, contentType: attachment.contentType, content: attachment.content }];
    }
    return attachment.file ? [attachment.file] : [];
  }) };
}
export async function restoreConversationDraft(composer: Pick<ComposerRuntime, 'setText' | 'addAttachment'>, draft?: ConversationDraft) {
  composer.setText(draft?.text || '');
  await Promise.all((draft?.attachments || []).map(attachment => composer.addAttachment(attachment)));
}
