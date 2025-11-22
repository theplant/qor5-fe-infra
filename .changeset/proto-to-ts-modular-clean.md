---
"@theplant/proto-to-ts": patch
---

Feat: Default to modular structure and auto-clean output directories

- **Modular by Default**: The CLI now defaults to the modular generation structure (`moduleName` + `rpcServiceDir`) without prompting, simplifying the workflow for multi-service projects.
- **Clean Output**: Added a pre-cleaning step to remove stale files in the target `generated` and `services` directories before generation, preventing duplicate naming conflicts and leftover files.
- **Enhanced Index Exports**: The generated top-level `index.ts` now exports modules with a `Service` suffix (e.g., `export * as pimService from './pim/services'`) to avoid naming collisions and improve clarity.
