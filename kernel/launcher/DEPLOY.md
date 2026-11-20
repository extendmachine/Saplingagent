
### Bilingual launcher verification

Set `config/ui-language.json` to English or Chinese, or run `bash Saplingagent.sh --lang en|zh`. Rebuild existing exported apps for the embedded native vocabulary. Test language selection before Node exists, a saved choice on subsequent startup, native startup/failed-stop messages, and the status page. Changing page language must preserve the running project and chat draft. A closed status browser does not stop the application; Stop app and Dock Quit keep their existing confirmed-stop behavior.

### First open from Finder

Rebuild an exported app to include the new first-open progress text and localized
folder access descriptions. For a project under Desktop, Documents or Downloads,
the system may request folder access for this particular app. If access was
denied, review the project directory's permissions and the app's entry under
System Settings → Privacy & Security → Files & Folders. Open the app again.

The automated LaunchServices test opens a freshly compiled bundle using
`/usr/bin/open` inside a disposable synthetic project in the per-user Darwin
temporary directory. It exercises denied local file access, Quit, cold launch,
reopen and configuration handoff. A protected-directory consent dialog requires
a separate human check. Project settings and runtime files keep their usual
locations inside each project.
