# Configuration host

A short-lived management service for project identity, AI configuration and local
launcher compilation. Canonical orchestration source is here; shared management
and AI service modules remain under kernel/launcher and kernel/services/ai-config,
with the React source under kernel/ui/setup. The generated small capsule under
kernel/.cache/configuration contains their complete backend import closure and
built frontend. It excludes engine installations, business source, credentials,
Git, histories and node_modules. Node is copied from the project's runtime when
launching the private external copy beside the project at
`../sapling-config-<random>/`. B keeps temporary/XDG/cache output there; persistent
configuration stays project-local. No OS temp/home output selection is used. No new npm dependency or global runtime.

Start through bash Saplingagent.sh configure. Close with Finish setup (A/B cleanup
handshake). Health is GET /health/project-launcher on the selected loopback port.
Persistent event logs use logs/project-launcher/project-launcher-YYYY-MM-DD.log,
30 days via the existing logger; no open log descriptor crosses rename. Sensitive
settings are read/written only in the project's local-secrets. See CONTRACT.md and
DEPLOY.md. This service is temporary management, not a business process in Restart
app; its explicit start/close/cleanup handshake owns its lifetime.

Before saving/building a renamed or replaced app, this service calls the public
launcher native-close contract to release the resident macOS Dock process and any
in-progress startup worker. It then uses the existing runtime stop/drain operation.
Failures preserve settings and the current folder for inspection/retry. The Dock
app is launched by the user after Finish setup; no new application service is added.
