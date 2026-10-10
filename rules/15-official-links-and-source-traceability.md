# 15. Official website and source traceability

## Target

When involving third-party platforms, APIs, SDKs, certificates, public keys, consoles, deployment platforms or external technical specifications, AI must provide the official website and usage instructions that can be used directly to avoid users searching by themselves according to vague names, and to avoid different AI using unknown or expired information.

## The scene where the URL must be provided

1. Developer documents, open platforms and management consoles of third-party platforms.
2. API interface, SDK download, version description and sample repository.
3. The official acquisition page of public key, platform certificate, certificate chain and signature configuration.
4. OAuth, callback address, Webhook, permission application and application review page.
5. The deployment configuration page of cloud service, server, database or payment platform.
6. The official version document when there is a risk of version compatibility or abandonment of dependencies.

## Each piece of information must be recorded.

1. Name of the information.
2. The full URL can be clicked.
3. Official institutions or official domain names.
4. What operation is this URL used to complete?
5. Do you need to log in, apply for permissions or select applications?
6. Applicable products, interfaces or versions.
7. AI finally checks the date.
8. Corresponding to the microservice and task number.

## Public key, certificate and key rules

1. When AI mentions the public key, certificate or signature configuration of the platform, it must also provide the URL of the official acquisition or configuration page.
2. For example, when accessing Alipay, the official public key or certificate configuration entrance of the Alipay open platform and the corresponding development documents should be given, instead of just saying "obtaining the Alipay public key".
3. The public key of the platform and the platform certificate can be saved according to business needs, but the source URL, acquisition time, applicable application and validity period must be recorded.
4. Private keys, API keys, login passwords and access tokens are still sensitive information and can only be stored in `local-secrets/` and cannot be displayed in documents, replies, logs and Git.
5. "Public key can be made public" shall not be equiated with "the source can not be verified"; public keys of unknown origin shall not be used in the production environment.

## Example of Alipay

As of 2026-07-26, when it comes to Alipay public key, application key, signature or signature verification, AI should at least provide and check the following official entrance of Alipay open platform:

1. Alipay Open Platform Help Center: <https://open.alipay.com/support/supportCenter.htm>
   - Purpose: Find official instructions such as "public and private key generation upload", "Alipay public key viewing", "parameter signature" and "response to verification".
   - Login requirements: Some application configurations and public key viewing operations require you to log in to the Alipay open platform and select the corresponding application.
2. Alipay developer tool: <https://open.alipay.com/tool>
   - Purpose: Enter the official key management, SDK, signature, signature verification, format conversion and key matching tools.
3. Alipay Open Platform Homepage: <https://open.alipay.com/>
   - Purpose: Log in to the developer console, select the application and enter the development configuration.

These URLs are just standard examples. The actual project should still be rechecked according to the application type, signature mode and the current Alipay page, and the final URL should be written to the `REFERENCES.md` of the corresponding service.

## Source file

Each microservice using an external platform should maintain:

```text
services/
└── service-name/
    └── REFERENCES.md
```

`REFERENCES.md` is the source file read by AI during execution. The data summary for review is maintained in `docs/references.html`, but the key sources must not be saved only in HTML.

## REFERENCES.md fill in the format

```markdown
# <SERVICE_NAME> Official Information

|Name of information|Official website|Official institutions/domain names|Purpose|Login or permission|Applicable version|Final check date|Task number|
| --- | --- | --- | --- | --- | --- | --- | --- |
| `<NAME>` | `<https://official.example/path>` | `<DOMAIN>` | `<PURPOSE>` | `<REQUIREMENT>` | `<VERSION>` | `<YYYY-MM-DD>` | `<TASK-ID>` |

## Check the requirements

1. Only use the official platform, official document or official code repository.
2. The public key, certificate, SDK and console must record the actual entrance and purpose.
3. Private keys, API keys, passwords and Tokens only record the local file path and do not record the actual content in this file.
4. When the network cannot be verified, mark it as "not verified" and write it to the root directory `TODO.md`.
```

## AI execution rules

1. Priority is given to the official domain name and official documents of the platform, and do not replace the official source with search result abstracts, forums, blogs or AI memories.
2. Before providing the URL, you should actually check the page accessibility, page purpose and current content.
3. When the network cannot be connected or the official website cannot be confirmed, it must be clearly marked as "unverified" and written into `TODO.md`, and the website must not be fabricated.
4. When the official website needs to be logged in, it should still provide an entrance and explain the menu or configuration items to be found after logging in.
5. When the external platform interface or configuration is modified, `REFERENCES.md`, relevant contracts, deployment instructions and human review documents will be updated synchronously.
6. When the final reply involves the user's next step, the corresponding official website should be given directly.
