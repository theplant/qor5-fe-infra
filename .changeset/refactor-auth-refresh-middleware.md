---
"@theplant/fetch-middleware": minor
---

Refactor: Unified auth refresh middleware logic.

- **BREAKING**: Removed `createConnectSessionRefreshMiddleware`. Use `createSessionRefreshMiddleware` instead.
- **Enhancement**: `createSessionRefreshMiddleware` now respects `ignoreRequest` for queue triggering, allowing better control for Connect-RPC integration.
