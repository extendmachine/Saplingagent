export async function readCredentialFile(file: Pick<File, 'size' | 'text'>): Promise<string> {
  if (file.size > 32768) throw Object.assign(new Error('Credential files must be no larger than 32 KiB.'),{code:'CREDENTIALS_TOO_LARGE'});
  let text: string;
  try { text = await file.text(); } catch { throw Object.assign(new Error('Could not read the selected file. Choose it again.'),{code:'LOCAL_AUTH_UNREADABLE'}); }
  if (new TextEncoder().encode(text).length > 32768) throw Object.assign(new Error('Credential files must be no larger than 32 KiB.'),{code:'CREDENTIALS_TOO_LARGE'});
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw Object.assign(new Error('The selected file is not valid credential JSON.'),{code:'INVALID_CREDENTIALS'}); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Credentials must be a JSON object.'),{code:'INVALID_CREDENTIALS'});
  return text;
}
