# 12. Front-end and back-end interface review documents

## Target

The project must maintain a front-end and back-end interface document for manual review in the root directory `docs/`, and centrally display the interface name and complete content used between the front-end and the back-end, so as to check whether the interface is consistent, missing, and incompatible modifications.

`CONTRACT.md` in the microservice catalog is still the interface contract read during AI development and modification; `docs/api-interfaces.html` is a manual review version sorted out according to each microservice contract and does not replace `CONTRACT.md`.

## Required documents

```text
project-root/
├── docs/
│   ├── index.html
│   └── api-interfaces.html
└── services/
    └── service-name/
        └── CONTRACT.md
```

## Each interface must be recorded.

1. Interface name and unique identification.
2. Interface purpose and business content.
3. It belongs to the back-end microservice and the front-end module that calls the interface.
4. Request method and interface address, such as `GET /api/users/{id}`.
5. Request header, path parameter, query parameter and request body, and indicate the field name, type, whether it is required and its meaning.
6. Successfully return the content, including the status code, field name, type and meaning.
7. The failure returns the content, including the error code, trigger conditions and how the front-end should be handled.
8. Authentication and permission requirements, but do not write real accounts, tokens, keys or other sensitive content.
9. Interface status, such as planning, development, pending manual verification, enabled, disabled.
10. Interface version, last update time and the corresponding `CONTRACT.md` location.

## Document organization method

1. `docs/api-interfaces.html` must use HTML, which is convenient to open and review directly.
2. The interface should be grouped by back-end microservices and marked with the corresponding front-end modules.
3. Documents should provide interface directories or quick positioning methods; when there are many interfaces, they should support filtering by service, front-end module or status.
4. Requests and return examples must use fictitious or desensitized data, and local sensitive information, real keys and real login credentials must not appear.
5. Disabled interfaces should not be deleted directly. They should be marked with deactivation time, alternative interfaces and compatibility processing; confirm that they do not need to be traced before they can be moved to the history.

## AI execution rules

1. When adding, modifying or disabling the front-end interface, update the corresponding microservice `CONTRACT.md` first, and then update `docs/api-interfaces.html` synchronously.
2. When only the internal implementation of the interface is modified and the external contract has not changed, it is not required to rewrite the interface content, but it should be checked that the document is still accurate.
3. When the front-end call field is inconsistent with the back-end return field, you should not guess by yourself. You should record the items to be manually confirmed in `TODO.md`.
4. After the interface modification is completed, the content that needs manual tuning and verification should be written to `TODO.md`, and "code has been modified" shall not be directly regarded as "interface verified".
5. It must be checked whether `CONTRACT.md` is consistent with `docs/api-interfaces.html` before submission.
6. When the interface depends on the third-party platform, the microservice `REFERENCES.md` must be updated synchronously and the official interface document URL must be provided.
