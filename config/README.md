# Application configuration

`runtime.json` declares public local ports, preferred Codex model/reasoning and progress/timeout settings. Runtime uses the actual model catalog. Services bind loopback, and internal tokens are read from private files; never put credentials in public config or VITE_ variables.

After installation, `bash Saplingagent.sh configure` opens an independent AI setup page. Saved schemes choose the startup engine/provider/model, including a custom API Base URL. Scheme metadata and private API-key references live in `local-secrets/ai-config/`; key files and Codex sign-in credentials are also project-local under local-secrets. Public runtime.json is not rewritten by the wizard. See docs/ai-configuration.html and contracts/ai-configuration.mjs.

Restart after changing the default scheme and create a new conversation. No saved scheme preserves the legacy manual project Codex/OpenCode configuration. macos.json/windows.json pin local installers. Moving/copying the complete application keeps source together; clean source packaging initializes fresh recipient records and excludes credentials/runtime data.
