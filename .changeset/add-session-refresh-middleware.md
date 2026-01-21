---
"@theplant/fetch-middleware": minor
---

Add `createSessionRefreshMiddleware` for automatic session/token refresh on 401 responses with single-flight deduplication. This high-level middleware is built on top of `requestQueueMiddleware` and provides:

- Automatic session refresh when API returns 401 Unauthorized
- Single-flight deduplication (only one refresh request at a time)
- Automatic retry of queued requests after successful refresh
- Configurable ignore patterns for public endpoints
- Built-in protection against infinite loops on refresh endpoint

**Breaking Change**: Removed `X-HTTP-Method-Override` header logic from `createFetchClient`. The header was causing CORS issues, and modern servers support PUT/PATCH/DELETE directly without method override.
