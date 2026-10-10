# Workspace local run and recovery

Environment Node >=22; no npm depends on the installation steps. The root directory of the application must exist, and the launcher first creates a local token file (permission 600), and the service does not generate or display its value.
From the root node backend/workspace/server.mjs, or this directory npm start; SEED_ROOT can switch independent seed directories, SEED_WORKSPACE_PORT defaults to 4311. Binding fixed 127.0.0.1, Ctrl+C/terminate the unified launcher to stop. Npm test self-built temporary application root in the service directory, end removal, do not pollute the real session.

Check GET http://127.0.0.1:4311/health; business requests are only sent by internal agent/MCP through Bearer. Confirm the session refresh recovery, continuation and preference evidence, and the manual results are recorded by the root TODO.
Restore data: stop service, complete backup data/workspace/; JSON schema current v1, no automatic migration. Damaged JSON clearly reports CORRUPT_STORAGE, which cannot be overwritten with empty data; restore the last trusted backup before starting. Snapshot/code rollback should not be brought back messages or preferences. Only a single process is supported to write to the same storage.
The log is automatically kept for 30 days and belongs to the project logs/workspace/, and the real running log is not saved in the service code directory; all credentials are kept local-secrets, and packaging must be excluded.
No external release, Git/main synchronization or human acceptance record. For official information, please refer to REFERENCES.md.
