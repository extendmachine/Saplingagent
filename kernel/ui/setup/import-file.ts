export async function readCredentialFile(file: Pick<File, 'size' | 'text'>): Promise<string> {
  if (file.size > 32768) throw new Error('Credential files must be no larger than 32 KiB.');
  let text: string;
  try { text = await file.text(); } catch { throw new Error('Could not read the selected file. Choose it again.'); }
  if (new TextEncoder().encode(text).length > 32768) throw new Error('Credential files must be no larger than 32 KiB.');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('The selected file is not valid credential JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Credentials must be a JSON object.');
  return text;
}
