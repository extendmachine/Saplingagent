# Agent engine adapters

`rpc.mjs` extends the shared `kernel/contracts/codex-rpc.mjs` transport only for
the Agent's persistent Codex conversation recovery. Account configuration continues
to use the unmodified shared transport. Ordinary calls and native errors pass
through unchanged.

## Moving an existing project folder

The pinned Codex0.146.1 stores absolute rollout paths in its private state database.
Moving the complete project folder can leave an existing thread ID pointing at the
old path, even though its JSONL history is present in the new local Codex home.

After the exact native missing-rollout error, the adapter searches the current
project's `local-secrets/codex/sessions/` and `archived_sessions/`. It reads a bounded
first `session_meta` record, verifies the requested thread identity, refuses
duplicate or linked/invalid candidates, and retries **only that resume** once with
the verified current path and current project `cwd`. All model, provider,
instructions and Full Access options remain unchanged. It checks the returned
thread ID before the application may start a user turn. It never creates a new
thread, supplies synthetic history, rewrites JSONL, edits/deletes SQLite, copies
credentials, follows the old folder through a symlink or resends a user turn.
The bounded local lookup is a recovery choice, not a restriction on native tools.

`thread/resume.path` is an **unstable** native protocol field. This compatibility
path requires `initialize.capabilities.experimentalApi:true`, as already used by
the Agent. Explicit caller-provided `path`/`history`, external Codex homes and
unrelated native failures are not intercepted. A failed recovery stays visible.
Concurrent identical resumes share one pending operation; conflicting options
fail with `CODEX_RESUME_BUSY`. Close, `turn/interrupt`, `cancelResume(threadId)` and
the optional `call(method,params,timeoutMs,{signal})` AbortSignal stop pending recovery. The original
request deadline covers the initial request, lookup and retry together.

The native integration check reproduces the stale index in an isolated synthetic
home, resumes the same thread by its moved path, and verifies that **Codex itself**
persists its new rollout path. A fresh unadapted native process can then resume by
ID. Historical JSONL hashes remain unchanged, and a local provider receives zero
requests. Native `thread.cwd` still reports the historical session metadata;
top-level response `cwd` reports the effective current directory. This result is
verified for pinned0.146.1; it does not promise future private-schema behavior.

Run focused checks with project-local Node:

```bash
node --test kernel/engines/test/session-relocation.test.mjs
SAPLING_TEST_CODEX_BIN=/absolute/path/to/pinned/codex \
  node --test kernel/engines/test/session-relocation-native.test.mjs
```

The native test skips unless explicitly supplied the pinned executable. It sends
no model prompt and uses only generated local data. Real customer conversation,
provider quota and Windows native execution remain separate acceptance.

See `REFERENCES.md` for the official documentation and generated schema evidence.

## Claude authentication

Claude API and the owner's personal subscription-token profiles share the existing
official SDK adapter. `kind` selects mutually exclusive authentication; a missing
subscription token cannot fall back to a key or an inherited account. Setup and
credential persistence belong to the configuration service. See CONTRACT.md,
DEPLOY.md and the dated Claude entries in REFERENCES.md for the precise boundary
and tests. Saved credentials/local startup do not prove model access or quota.
