import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseMetadata } from '../contracts/release.mjs';
import { isKernelPath, isContainedKernelPath, validateKernelManifest } from '../contracts/kernel.mjs';

// Read the chosen commit, never an uncommitted version file in the caller's cwd.
export function verifyRelease({ sourceRoot, ref = 'release', main = 'main', version, tag } = {}) {
  const root = sourceRoot || fileURLToPath(new URL('../../', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024, timeout: 30000 });
  const resolve = value => git('rev-parse', '--verify', `${value}^{commit}`).toString().trim();
  const commit = resolve(ref), mainCommit = resolve(main);
  const declaredKernel = validateKernelManifest(JSON.parse(git('show', `${commit}:kernel/manifest.json`)));
  const release = parseReleaseMetadata({schemaVersion:1,version:declaredKernel.version});
  const mirror = parseReleaseMetadata(JSON.parse(git('show', `${commit}:config/release.json`)));
  if(mirror.version!==release.version)throw new Error('Kernel version and compatibility mirror disagree.');
  if(declaredKernel.layoutVersion===1)for(const name of ['kernel/package.json','kernel/package-lock.json']){const pkg=JSON.parse(git('show', `${commit}:${name}`));if(pkg.version!==release.version||(name.endsWith('lock.json')&&pkg.packages?.['']?.version!==release.version))throw new Error('Kernel package version mirror disagrees: '+name);}
  if (!version || version !== release.version) throw new Error('Requested release version does not match committed kernel/manifest.json.');
  git('merge-base', '--is-ancestor', mainCommit, commit);
  const codeChanges = git('diff', '--name-only', '-z', mainCommit, commit).toString().split('\0').filter(Boolean)
    .filter(file => /^(front|backend|contracts|kernel|scripts|config)\//.test(file) || /^(Saplingagent\.sh|install\.sh)$/.test(file));
  if (codeChanges.length) throw new Error('Release code differs from the frozen main source: ' + codeChanges.join(', '));
  const manifest = validateKernelManifest(JSON.parse(git('show', `${commit}:kernel/manifest.json`)));
  const entries = git('ls-tree', '-rz', commit).toString().split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/s);
    if (!match) throw new Error('Release source contains an unsupported entry.');
    return { mode: match[1], path: match[3] };
  });
  const owned = entries.filter(entry => (manifest.layoutVersion === 1 ? isContainedKernelPath(entry.path) : isKernelPath(entry.path)) && entry.path !== 'kernel/manifest.json');
  if (owned.length !== manifest.files.length) throw new Error('Kernel ownership differs from the committed manifest.');
  for (const file of manifest.files) {
    const entry = owned.find(value => value.path === file.path);
    if (!entry || !['100644', '100755'].includes(entry.mode)) throw new Error('Missing or invalid kernel source: ' + file.path);
    const bytes = git('show', `${commit}:${file.path}`);
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256
      || (entry.mode === '100755') !== file.executable) throw new Error('Stale kernel source hash: ' + file.path);
  }
  if (tag && (tag !== `v${release.version}` || resolve(`refs/tags/${tag}`) !== commit)) {
    throw new Error('Release tag/version does not identify the checked source commit.');
  }
  return { version: release.version, commit, mainCommit, kernelVersion: manifest.version, kernelFiles: owned.length, tag: tag || null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    while (args.length) {
      const flag = args.shift(), name = { '--ref': 'ref', '--main': 'main', '--version': 'version', '--tag': 'tag' }[flag];
      if (!name || !args.length || args[0].startsWith('--')) throw new Error('Usage: node scripts/verify-release.mjs --ref release --main MAIN_SHA --version X.Y.Z [--tag vX.Y.Z]');
      options[name] = args.shift();
    }
    console.log(JSON.stringify(verifyRelease(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
