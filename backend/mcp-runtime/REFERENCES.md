# Mcp-runtime official information

|Information|Official website|Organization/domain name|Purpose|Login requirements|Applicable version|Check the date|Task|
| --- | --- | --- | --- | --- | --- | --- | --- |
|MCP build service documents| https://modelcontextprotocol.io/docs/develop/build-server | MCP / modelcontextprotocol.io |Stdio protocol and stdout restrictions|No need to log in to publish|The current document example adopts the split SDK server 2.x; this implementation is fixedly compatible with SDK 1.x, see the next item.| 2026-10-09 | TASK-20261009-006 |
|Official TypeScript SDK 1.x server| https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md | MCP / github.com/modelcontextprotocol | McpServer registerTool、StdioServerTransport、annotations、structuredContent |No need to log in to publish|Actual @modelcontextprotocol/sdk 1.32.1, MIT| 2026-10-09 | TASK-20261009-006 |
|Official TypeScript SDK 1.x client| https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/client.md | MCP / github.com/modelcontextprotocol |StdioClientTransport, Client tools/list/call of protocol testing|No need to log in to publish| 1.32.1 | 2026-10-09 | TASK-20261009-006 |
| Zod schema API | https://zod.dev/api | Zod / zod.dev |Parameters, JSON value and bounded schema|No need to log in to publish|Actual zod 4.6.5, MIT| 2026-10-09 | TASK-20261009-006 |
|YAML Official API| https://eemeli.org/yaml/ |YAML Author / eemeli.org|Correctly read Skill YAML frontmatter, alias and repeat key boundaries|No need to log in to publish|Actual yaml 2.9.1, ISC| 2026-10-09 | TASK-20261009-006 |

The above checked the accessible page and purpose on 2026-10-09, and checked the actual accurate installation version through the npm registry. The official SDK protocol check of server/client has been executed; the actual construction and model integration of the candidate code are verified by each corresponding service and coordination task. This service does not call the model, nor does it publish the cloud.

Project Skills uses local skill-creator: `/Users/xty/.codex/skills/.system/skill-creator/SKILL.md`; through its init_skill.py creation and quick_validate.py verification, the verification environment is in this service `.venv/`, PyYAML 6.0.3. This absolute path is the source record of the local tool this time, not the operation dependency of the delivery application.

TASK-20261009-011 Follow the above actual dependencies and protocol interfaces, and there are no new external dependencies. The current permission/HTTP is based on the user's clear complete access authorization, root disclosure contracts/runtime-api.md v2 and tool fingerprint contracts/agent-tools.mjs; it is not a declaration that the MCP specification automatically grants root or can revert all commands. The new version of 15 tools uses the locally installed SDK to complete the isolation protocol test; the skill format review and independent read-only behavior evaluation are completed, and the real new model/back-end integration is recorded by the coordinator.

## Native page image content (TASK-20261015-013)

Existing official @modelcontextprotocol/sdk1.32.1 installed protocol types validate CallToolResult content with separate text and image {data,mimeType} blocks. The stdio client/protocol test and real connected-page call verify this exact pinned schema; structuredContent retains only snapshot metadata. No SDK version change or new external platform.
