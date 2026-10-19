# Kernel maintenance boundary

Read the root AGENTS.md and rules/README.md first. This directory contains the
complete platform implementation and setup website, not application features.

For ordinary customer app development, prefer front/, backend/, application
contracts and config/services.json. Use the existing public interfaces; do not
change this directory merely to add a business service or page. An explicit
kernel/platform maintenance request authorizes the relevant edits. Full Access
remains unchanged: this is guidance, not a sandbox or approval gate.

Read CONTRACT.md and DEPLOY.md before kernel changes, plus the relevant service
contract. Keep all new core code, tests, settings pages, build helpers and device
defaults here. Preserve the finite compatibility adapters listed in compat/paths.mjs;
do not add implementation outside this directory. Application rules, Skills, data,
credentials, business configuration and dependency declarations remain outside.
Never regenerate a recipient's manifest to conceal local edits. Maintainer source
changes must regenerate/check the manifest before publication. Update backups and
legacy updater compatibility must be verified when moving owned source paths.
