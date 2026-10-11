# Application function area

`git-version/`: TASK-20261010-005 New Git version monitoring and security switching panel. It reads the current project status through the Agent public HTTP interface and does not execute Git in the browser or save the local path/credentials. Other business components continue to be created by users through subsequent dialogues.

`version/`: the current version bar at the bottom of the page. It reads the same Git interface polling status fingerprints, and provides a clear refresh button when new modifications are found after the page is loaded; it does not automatically refresh and does not perform Git operations.

## Version panel update (2026-10-11)

The panel lists historical commits with optional custom names and permits loading a selected commit in detached HEAD. Named branch tips stay unchanged by historical checkout, except an explicit pre-checkout save of pending named-branch work. Saving detached work creates a retained refs/saplingagent/saved/<sha> recovery ref; users can return to an available branch. Save version still excludes known private data, credentials and local runtime/build artifacts even when old source lacks ignore rules; explicitly staged private files return GIT_PRIVATE_FILES (409). No filesystem access restrictions are added.

Select a commit, edit Version name and choose Save name. Empty text clears its alias. Aliases are local repository metadata in the common Git directory (saplingagent/version-labels.json), survive branch changes/restarts and preserve the SHA and original subject. Names are not included in a Git push or source ZIP. A failed writer lock may require removing version-labels.json.lock only after checking that no writer is alive. Malformed labels must be repaired from backup; they are never silently overwritten.

The starting page remains chat with Git controls/footer. The earlier uncommitted clock was explicitly reverted by the user. Checkout reloads frontend source, while changed backend code/dependencies require a service restart; old commits may lack the panel, in which case git switch main from Terminal restores its source. Do not reset sessions/authentication to restore source. No new dependency or login change.
