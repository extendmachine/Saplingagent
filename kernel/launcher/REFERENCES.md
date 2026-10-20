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

## Native startup progress (TASK-20261019-049)

Checked2026-10-19; public documentation, no account or additional app permission.
The launcher uses system AppKit on macOS and system Win32 on Windows10/11,
without a browser runtime bundle or another persistent service.

- Apple NSWindow: https://developer.apple.com/documentation/appkit/nswindow.
  The official Markdown representation was also fetched successfully at
  https://developer.apple.com/tutorials/data/documentation/appkit/nswindow.md.
  Used for the small native startup window, text labels, hide and reuse behavior.
- Microsoft CreateWindowExW:
  https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createwindowexw.
  Used for a small system window and static text controls without external GUI
  dependencies; the window lives on its own locked OS message thread.
- Microsoft WM_CLOSE:
  https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-close.
  The app handles Close by hiding its progress window; it does not destroy the
  startup worker or claim that the project has stopped.
- Microsoft message queues:
  https://learn.microsoft.com/en-us/windows/win32/winmsg/using-messages-and-message-queues.
  Used for posted progress updates and final window teardown on the owning thread.
- Microsoft console process groups:
  https://learn.microsoft.com/en-us/windows/console/console-process-groups.
  The actual Node process retains its existing detached group. No console/tail
  process is added, and closing the display does not send a console control event.

Actual macOS native checks and Windows x64/ARM64 cross-compilation are separate
from Windows hardware/GUI/file-lock acceptance, which remains unverified here.

## Finder process identity locale (TASK-20261019-052)

Checked2026-10-19 against the installed Apple system manuals
`/usr/share/man/man1/ps.1` (`comm`, `lstart`) and
`/usr/share/man/man1/locale.1` (`LANG`, `LC_ALL`, `LC_CTYPE`, `LC_TIME`).
The latter documents C as the unset default and `LC_ALL` overriding category
settings. `locale -a` confirms `en_US.UTF-8` and `fr_FR.UTF-8` on the test Mac.
Actual child-process regression verifies Unicode executable paths and stable
timestamps in unset, C and French environments. Only the `ps` child receives the
fixed locale; no system setting or parent environment is changed.
