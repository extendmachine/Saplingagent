# Official references

Checked2026-10-18, public documentation without login. Building/downloads require network; no model request.

- https://go.dev/dl/?mode=json — official Go archive filenames and SHA256 checksums; pin go1.27.2, macOS/windows amd64/arm64.
- https://pkg.go.dev/cmd/go — local build,GOOS/GOARCH,CGO_ENABLED,GOCACHE,GOMODCACHE,GOTOOLCHAIN.
- https://developer.apple.com/documentation/bundleresources/information-property-list — local .app bundle display identity and icon. Customer-local compilation is not Developer ID signing or Apple notarization.
- https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-beginupdateresourcew and https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-updateresourcew — native Windows icon resources on staged executable only.
- https://learn.microsoft.com/en-us/troubleshoot/windows-server/performance/copying-exe-files-sharing-violation-error-folder-in-use — file-lock failures require staging/explicit retry; do not erase a live previous launcher.

## Offline setup handoff (2026-10-19)

- Apple Foundation FileManager `moveItem(atPath:toPath:)`: https://developer.apple.com/documentation/foundation/filemanager/moveitem(atpath:topath:). The temporary macOS helper uses `/usr/bin/osascript` with Foundation only, no Finder/System Events automation or project-local executable during the move. Its real isolated lifecycle and destination-race behavior are tested separately from Windows.
- Microsoft System.IO.Directory.Move (Windows PowerShell 5.1/.NET Framework): https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.move?view=netframework-4.8.1. Existing destinations and directories/files in use fail explicitly; the helper preserves the actual folder and resumes management without automatic rollback.

- Windows PowerShell5.1 text encoding: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-5.1. Node writes UTF-8 JSON without BOM; the helper explicitly reads job/status as UTF-8 so Unicode customer paths are retained.

- Windows PowerShell5.1 runspace and process locations: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-location?view=powershell-5.1. The helper changes both its provider location and [Environment]::CurrentDirectory before deleting its own temporary directory.

## Pinned compiler storage audit (2026-10-19)

Go1.27.2 distributed source, `src/cmd/internal/telemetry/telemetry.go` and
`src/cmd/vendor/golang.org/x/telemetry/internal/telemetry/dir.go`, was inspected
locally. The compiler and counters honor `TEST_TELEMETRY_DIR`; its local `mode`
file accepts `off`. Builds use this pinned behavior to avoid both global telemetry
writes and upload subprocesses. No remote account or model invocation was used.

## Ordinary macOS Dock lifetime (TASK-20261019-043)

Checked2026-10-19 against public Apple documentation and the installed macOS
`osacompile` help. No account, Automation access to another application or global
tool installation is required by the launcher. Real local compile/open/reopen/quit
checks are distinct from Windows and real model acceptance.

- AppleScript stay-open application run, idle, reopen and quit handlers:
  https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/conceptual/ASLR_about_handlers.html.
  Normal Quit reaches `on quit`; `continue quit` is used only after owned shutdown
  or explicit configuration handoff.
- Calling command-line tools, quoting and exit/error behavior:
  https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/CallCommandLineUtilities.html.
  The applet invokes only its bundle-relative helper with quoted arguments.
- Ordinary versus UI-element activation:
  https://developer.apple.com/documentation/bundleresources/information-property-list/lsuielement.
  The generated app sets false and stays alive, exposing the native Dock Quit action.
