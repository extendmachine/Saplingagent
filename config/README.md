# Application configuration

`runtime.json` declares public local ports, preferred Codex model/reasoning and progress/timeout settings. Runtime uses the actual model catalog. Services bind loopback, and internal tokens are read from private files; never put credentials in public config or VITE_ variables.

After installation, `bash Saplingagent.sh configure` opens an independent AI setup page. Saved schemes choose the startup engine/provider/model, including a custom API Base URL. Scheme metadata and private API-key references live in `local-secrets/ai-config/`; key files and Codex sign-in credentials are also project-local under local-secrets. Public runtime.json is not rewritten by the wizard. See docs/ai-configuration.html and kernel/contracts/ai-configuration.mjs.

Restart after changing the default scheme and create a new conversation. No saved scheme preserves the legacy manual project Codex/OpenCode configuration. Canonical installer defaults are kernel/config/macos.json and kernel/config/windows.json. The two JSON files in this directory contain only Node-version compatibility metadata for older native launchers, not editable installer settings. Moving/copying the complete application keeps source together; clean source packaging initializes fresh recipient records and excludes credentials/runtime data.

`release.json` is a deprecated source-package compatibility mirror, not an independent product version. Runtime uses `kernel/manifest.json`; the maintainer generator checks/synchronizes mirrors. Kernel0.9.5 is the sole current Saplingagent version. Existing customer compatibility files may retain an older snapshot value after kernel-only maintenance; current displays do not read them.
