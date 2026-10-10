# 07. Microservice contract and service description

## Target

Each microservice must have an independent Markdown documentation document that records service responsibilities, directory structure, interface, startup method, log location and dependent services. Before AI modifies the microservice, you must read the instructions in the service catalog.

## Required documents

The suggestions in each microservice catalog include:

```text
services/
└── service-a/
    ├── SERVICE.md
    ├── CONTRACT.md
    ├── DEPLOY.md
    ├── REFERENCES.md
    └── ai-tasks/
```

## SERVICE.md must contain

1. Service name.
2. Service responsibilities.
3. Catalog structure.
4. Start-up method.
5. Log location.
6. Rely on the service.
7. Deployment and rollback instructions entrance.

## CONTRACT.md must contain

1. External interface name.
2. Call methods, such as HTTP, message queue, file, database reading and writing, etc.
3. Enter the parameters.
4. Output the result.
5. Error code or error description.
6. Dependent upstream and downstream services.
7. Compatibility notes.

## REFERENCES.md must contain

1. External platform or data name.
2. Official website and purpose.
3. Applicable interface, SDK, certificate or version.
4. Do you need to log in or have permission?
5. Finally, check the date.

## AI execution rules

1. Before modifying a microservice, read the `SERVICE.md` and `CONTRACT.md` of the service.
2. When changing the interface, `CONTRACT.md` must be updated synchronously.
3. When changing the startup method, log location, and dependent services, `SERVICE.md` must be updated synchronously.
4. Cross-service direct reference to internal implementation is not allowed, and must communicate according to the contract.
5. If the service description is missing, AI should supplement the service description first and then continue to develop.
6. When involving third-party platforms, SDKs, public keys or certificates, `REFERENCES.md` must be read and updated.
7. When continuing tasks across AI or cross-dialogues, you must first read the corresponding handover file under the service `ai-tasks/`.
8. When creating a new service description, directly create a file in the microservice directory in the above format; the inapplicable content should be clearly marked or deleted, and false placeholding information should not be retained.

## SERVICE.md fill in the format

```markdown
# <SERVICE_NAME> Service Description

## Basic information

- Service name: `<SERVICE_NAME>`
- Service directory: `services/<service-name>/`
- Service Manager: <User / AI / Team>
- Current status: <Planning / Developing / Pending manual verification / Enabled / Disabled>

## Service responsibilities

<It describes the business capabilities that the service is solely responsible for. >

## Unresponsible content

- <Clarify the boundaries to avoid other functions being stuffed into this service>

## Catalog structure

<List the actual directory and files of this service. >

## Start-up method

- Running environment: <Python / Node / Docker / Other>
- Environmental location: <path in the project>
- Start command: `<COMMAND>`
- Stop command: `<COMMAND>`
- Health check: <address, order or manual check method>

## Daily record

- Log directory: `logs/<service-name>/`
- File format: `<service-name>-YYYY-MM-DD.log`
- Retention time: 30 days
- Cleaning method: <way>

## Dependent service

|Service|Dependent method|Purpose|Deal with it when it is not available|
| --- | --- | --- | --- |
| `<service-name>` | `<HTTP/MQ/contract>` | `<purpose>` | `<behavior>` |

## Data management

- Whether to directly manage the database: <Yes / No>
- Management scheme: <database service, independent storage or other schemes>
- Data change entrance: <migrate file or description path>

## Document entrance

- Interface contract: `CONTRACT.md`
- Deployment rollback: `DEPLOY.md`
- Official information: `REFERENCES.md`
- AI task handover: `ai-tasks/`
```

## CONTRACT.md Fill in the format

```markdown
# <SERVICE_NAME> Interface Contract

## Contract information

- Contract version: `<VERSION>`
- Service name: `<SERVICE_NAME>`
- Last update: `<YYYY-MM-DD>`
- Corresponding task: `<TASK-ID>`

## Interface list

|Interface ID|Interface name|Call method|Address or theme|Caller|State|
| --- | --- | --- | --- | --- | --- |
| `<INTERFACE-ID>` | `<NAME>` | `<HTTP/MQ/File/DB>` | `<PATH-OR-TOPIC>` | `<CALLER>` | `<STATUS>` |

## <INTERFACE-ID>: <INTERFACE NAME>

- Purpose: <Business Content>
- Call method: <HTTP method, message subject, file path or other contract>
- Address: `<METHOD /api/path>`
- Authentication: <Authentication method, no real credentials>

### Input

|Field|Type|Required|Explain|
| --- | --- | --- | --- |
| `<field>` | `<type>` |Yes| `<description>` |

### Successful output

- Status code or result: `<CODE>`

|Field|Type|Explain|
| --- | --- | --- |
| `<field>` | `<type>` | `<description>` |

### Failure output

|Error code|Trigger conditions|Handled by the caller|
| --- | --- | --- |
| `<ERROR_CODE>` | `<condition>` | `<action>` |

## Service dependence and compatibility

- Upstream services: <services and interfaces>
- Downstream services: <services and interfaces>
- Compatibility requirements: <version, discard policy and migration instructions>
- Manual adjustment status: <to be verified / verified, and indicate the submission number>
```
