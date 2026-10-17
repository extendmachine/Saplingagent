# Kernel update sources

Checked2026-10-16, TASK-20261016-001. Public sources need no authentication. Updater never reads/publishes API keys, sends model prompts or creates repository history/remotes.

- https://docs.github.com/en/rest/commits/commits#get-a-commit — resolve the fixed public release branch to one commit SHA; GitHub REST response/status/rate limits. Public access is bounded by network/service availability; errors are not an update result.
- https://docs.github.com/en/rest/repos/contents#get-repository-content — official repository content/ref/raw-content API. Files are downloaded from this repository's HTTPS raw content endpoint at the resolved immutable SHA and checked against manifest digests/size.
- https://github.com/extendmachine/Saplingagent/tree/release — existing public distribution channel. No token or automatic publication. A manifest must be present before an installed customer can update it.

Uses existing Node24.21.0 built-ins fs/crypto/fetch/process; no additional package dependency. SHA-256 validates package consistency, not a separate signing authority or a compatibility guarantee. Manifest and release instructions are data, not commands supplied to a shell.
