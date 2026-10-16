# Footer kernel baseline version

- Executor: Codex/root; TASK-20261015-007; 2026-10-15.
- Source: detached .worktrees/kernel-version from main ee47590. Main-only owner-authorized integration; exact source/main commit references are recorded in the authoritative coordination index after freezing. Release/adobe remain unchanged.
- VersionFooter displays Kernel version 0.90 beside the existing Git version. The source-owned string preserves its trailing zero and is independent of branch/SHA/custom labels/API availability. Existing Git polling and refresh behavior is unchanged. Footer wraps as needed to accommodate labels and the update action.
- Frontend service/contract and human runtime guide synchronized. No backend/API/package/runtime/auth/data changes, new dependencies or unit tests for this small display change.
- Verification: project-local TypeScript/Vite production build passes. Actual compiled frontend browser preview displays Kernel version 0.90 with Git metadata, then still displays 0.90 after a synthetic Git503 on initial load. Screenshot is ignored original-root .cache/kernel-version/footer-proof.png. Synthetic core transports only; no model calls or real user data. Preview process and temporary browser tab closed. Human acceptance not claimed.
