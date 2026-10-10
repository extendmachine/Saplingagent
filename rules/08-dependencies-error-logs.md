# 08. Dependent management, error handling and log level

## Target

Each microservice can manage dependencies independently, but the new dependencies must have a clear reason. Error handling and log output should be troublesable and maintainable, and it is forbidden to write sensitive information.

## Dependent management

1. The microservice dependent file should be placed in the microservice directory.
2. Before adding a dependency, confirm whether the dependency is really necessary.
3. Do not introduce dependence on large size, high maintenance cost or unclear use for small functions.
4. After adding dependencies, the purpose must be recorded in the `SERVICE.md` of the microservice.
5. Different microservices can have different dependencies, and the unified technology stack is not forced.

## Error handling

1. The error message must help locate the problem.
2. External errors should be kept clear and sensitive information should not be exposed.
3. It is recommended that the microservice interface have a stable error code or error description.
4. When a cross-service error occurs, it should be able to see which service, which interface and which step failed.

## Log level

It is recommended to use the following levels:

1. `info`: normal operation information.
2. `warn`: issues that can be restored or need attention.
3. `error`: Execution failure, interface failure, data abnormality and other problems that need to be dealt with.

## Log security

1. It is forbidden to write passwords, tokens, API keys, SSH keys and server login keys in the log.
2. It is forbidden to output the complete local sensitive information file content in the log.
3. Customer content is not regarded as sensitive content by default, but if the business clearly requires desensitization, it should be handled according to business rules.
4. Logs should be stored and cleaned up according to `rules/03-logging-structure.md`.
