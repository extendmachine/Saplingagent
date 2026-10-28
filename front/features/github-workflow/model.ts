// Local prototype state only. No network, filesystem, inference or Git operations.
export type Repository = { owner: string; name: string; url: string };
export function parseRepository(input: string): Repository | null {
  const value = input.trim();
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value.startsWith('git@github.com:')
      ? `https://github.com/${value.slice(15)}` : value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com'
      || url.username || url.password || url.port) return null;
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const [owner, rawName] = parts;
    const name = rawName?.replace(/\.git$/, '');
    if (!owner || !name || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner)
      || !/^[a-z\d_.-]{1,100}$/i.test(name) || name === '.' || name === '..') return null;
    if (parts.length > 2 && !['tree', 'blob', 'issues', 'pull', 'releases', 'wiki', 'actions', 'discussions', 'commit', 'commits'].includes(parts[2])) return null;
    return { owner, name, url: `https://github.com/${owner}/${name}` };
  } catch { return null; }
}
export const exampleUrl = 'https://github.com/heygen-com/hyperframes';
export const featureIds = ['core', 'templates', 'preview', 'export'] as const;
export type FeatureId = typeof featureIds[number];
export const requiredDependencies: Partial<Record<FeatureId, FeatureId[]>> = { preview: ['core'], export: ['core'] };
export function selectFeature(selected: FeatureId[], id: FeatureId): FeatureId[] {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
    for (const feature of featureIds) if (requiredDependencies[feature]?.includes(id)) next.delete(feature);
  } else {
    next.add(id);
    for (const dependency of requiredDependencies[id] || []) next.add(dependency);
  }
  return featureIds.filter(feature => next.has(feature));
}
export function projectPaths(repo: Repository) {
  const root = `projeccts/${repo.owner}--${repo.name}`;
  return { root, source: `${root}/source`, output: `${root}/saplingagent` };
}
