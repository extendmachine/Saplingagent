export const CHAT_LAUNCHER_KEY = 'saplingagent:chat-launcher:top';
export const clampChatLauncherTop = (top: number, height: number) => Math.max(80, Math.min(top, Math.max(80, height - 110)));
export function readChatLauncherTop(storage: Pick<Storage, 'getItem'>, height: number) {
  try { const value = Number(storage.getItem(CHAT_LAUNCHER_KEY)); return Number.isFinite(value) && value > 0 ? clampChatLauncherTop(value, height) : null; }
  catch { return null; }
}
