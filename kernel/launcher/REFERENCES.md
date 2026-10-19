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
