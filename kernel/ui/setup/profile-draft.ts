export type Profile = {
  id?: string;
  label: string;
  engine: 'codex' | 'opencode' | 'claude';
  kind: 'api' | 'chatgpt' | 'subscription';
  protocol: 'chat' | 'responses' | 'anthropic';
  baseUrl: string;
  model: string;
  noAuth: boolean;
  contextWindow: number;
  maxOutput: number;
  hasKey?: boolean;
};

export const blankProfile = (): Profile => ({label: '', engine: 'opencode', kind: 'api', protocol: 'chat', baseUrl: '', model: '', noAuth: false, contextWindow: 128000, maxOutput: 16384});

export function changeClaudeAuthentication(profile: Profile, kind: 'api' | 'subscription'): Profile {
  if (profile.engine === 'claude' && profile.kind === kind) return profile;
  return {...profile, engine: 'claude', kind, protocol: 'anthropic', noAuth: false, hasKey: false,
    label: !profile.label || ['Claude API', 'Claude subscription'].includes(profile.label) ? (kind === 'subscription' ? 'Claude subscription' : 'Claude API') : profile.label,
    baseUrl: kind === 'api' ? profile.baseUrl || 'https://api.anthropic.com/v1' : '',
  };
}

export function changeProfileEngine(profile: Profile, engine: Profile['engine']): Profile {
  if (profile.engine === engine && profile.kind === 'api') return profile;
  return {...profile, engine, kind: 'api', hasKey: false, noAuth: false,
    protocol: engine === 'codex' ? 'responses' : engine === 'claude' ? 'anthropic' : profile.protocol,
  };
}

export function sameProviderOrigin(left: string, right: string) {
  try { return new URL(left).origin === new URL(right).origin; }
  catch { return false; }
}

export function canKeepCredential(profile: Profile, saved?: Profile) {
  if (!profile.id || !profile.hasKey || !saved?.hasKey || saved.kind !== profile.kind) return false;
  return profile.kind === 'subscription' || (profile.kind === 'api' && sameProviderOrigin(profile.baseUrl, saved.baseUrl));
}

// Public profile metadata includes hasKey and API defaults; neither belongs to
// the subscription wire format. Credentials never move between auth modes.
export function profilePayload(profile: Profile, credential: string, revision?: number) {
  const common = {...(profile.id ? {id: profile.id} : {}), label: profile.label, model: profile.model, apiKey: credential, revision, activate: true};
  if (profile.kind === 'subscription') return {...common, engine: 'claude', kind: 'subscription'};
  return {...common, engine: profile.engine, kind: 'api', protocol: profile.protocol, baseUrl: profile.baseUrl, noAuth: profile.noAuth, contextWindow: profile.contextWindow, maxOutput: profile.maxOutput};
}
