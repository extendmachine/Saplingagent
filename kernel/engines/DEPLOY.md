# Deploy and check engine adapters

Run the existing project installer and configure a scheme in its local setup page.
The owner may manually create a subscription token through the official
`claude setup-token` flow and save it in the local project. The adapter only reads
the shared typed configuration; it does not copy browser cookies, keychain entries,
global credential files or another user's account. Restart the app to load changes.

The subscription option uses the owner's own account locally through the unmodified
official SDK/CLI. Saving is not a token, billing or plan validation. Anthropic's
current account and product terms apply; this implementation is not permission
for third-party account mediation or a promise of free/unlimited usage. See the
dated sources in REFERENCES.md. API/custom endpoint schemes remain independent.

The runtime and dependencies are project-local: `.runtime/node-*` and
`kernel/node_modules/`; version pins come from the kernel package and lock. Tests
write synthetic state under `.cache/claude-tests/`. They never use real credentials
or perform a model request to a real provider. Native API compatibility tests use
a loopback synthetic server; the new subscription checks inject fake SDK queries.

Run with the project's Node:

```sh
node --test kernel/engines/test/claude.test.mjs kernel/engines/test/claude-subscription.test.mjs
```

Expired/revoked tokens need an explicit new official token and a setup save/restart.
There is no automatic refresh, credential fallback, conversation replay or rollback.
Restore known source only on an explicit request; preserve private credentials and
session history. Native Windows and real subscription acceptance are separate.
