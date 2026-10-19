# Codex conversation relocation references

Task: TASK-20261019-020. Checked2026-10-19 by Codex. No account or model request was
used for documentation/protocol verification.

| Information | Official source | Purpose and access | Applicable version |
| --- | --- | --- | --- |
| App Server threads and resume | https://learn.chatgpt.com/docs/app-server | Public OpenAI documentation; confirms thread-ID resume, experimental opt-in and effective per-thread configuration. No login required to read. | Current documentation; local implementation pins0.146.1. |
| Exact native resume path field | `codex app-server generate-json-schema --experimental --out DIR`, generated `v2/ThreadResumeParams.json` | Official pinned local executable. `path` is marked unstable; a nonempty path overrides threadId for a nonrunning thread, requiring independent ID checks. Generation needs no account or model request. Generated files are verification cache, not shipped source. | codex-cli0.146.1 |

The public documentation does not promise a stable project-directory relocation
or SQLite-editing API. Compatibility therefore uses native resume and verifies the
result. The isolated native test establishes path persistence for the pinned
version without modifying the database or historical JSONL itself. Update this
test and compatibility review before changing the Codex dependency version.
