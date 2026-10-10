# Application function area

`git-version/`: TASK-20261010-005 New Git version monitoring and security switching panel. It reads the current project status through the Agent public HTTP interface and does not execute Git in the browser or save the local path/credentials. Other business components continue to be created by users through subsequent dialogues.

`version/`: the current version bar at the bottom of the page. It reads the same Git interface polling status fingerprints, and provides a clear refresh button when new modifications are found after the page is loaded; it does not automatically refresh and does not perform Git operations.
