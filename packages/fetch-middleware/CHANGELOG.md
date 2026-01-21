# @theplant/fetch-middleware

## 0.5.0

### Minor Changes

- [#57](https://github.com/theplant/qor5-fe-infra/pull/57) [`4f05c0f`](https://github.com/theplant/qor5-fe-infra/commit/4f05c0fb3fa61921690f14f977373a20915bc371) Thanks [@danni-cool](https://github.com/danni-cool)! - Add `createSessionRefreshMiddleware` for automatic session/token refresh on 401 responses with single-flight deduplication. This high-level middleware is built on top of `requestQueueMiddleware` and provides:
  - Automatic session refresh when API returns 401 Unauthorized
  - Single-flight deduplication (only one refresh request at a time)
  - Automatic retry of queued requests after successful refresh
  - Configurable ignore patterns for public endpoints
  - Built-in protection against infinite loops on refresh endpoint

  **Breaking Change**: Removed `X-HTTP-Method-Override` header logic from `createFetchClient`. The header was causing CORS issues, and modern servers support PUT/PATCH/DELETE directly without method override.

## 0.4.4

### Patch Changes

- [#55](https://github.com/theplant/qor5-fe-infra/pull/55) [`bee8012`](https://github.com/theplant/qor5-fe-infra/commit/bee80126af43be5403ac2948d0d808d1e8a9ce86) Thanks [@danni-cool](https://github.com/danni-cool)! - Switch from tsc to tsup for ESM/CJS bundling
  - Fixed ESM module resolution issue where relative imports were missing `.js` extension in compiled output
  - Added tsup as bundler to produce bundled ESM and CJS files, eliminating relative import path issues
  - Build now uses `tsup` for JS bundling and `tsc --emitDeclarationOnly` for type declarations

## 0.4.3

### Patch Changes

- [#53](https://github.com/theplant/qor5-fe-infra/pull/53) [`d3e3406`](https://github.com/theplant/qor5-fe-infra/commit/d3e3406da443f4f5dfd8b23edb7722271a08be8c) Thanks [@danni-cool](https://github.com/danni-cool)! - Change package entry points to use compiled dist files instead of source files

## 0.4.2

### Patch Changes

- [#39](https://github.com/theplant/qor5-fe-infra/pull/39) [`db1180a`](https://github.com/theplant/qor5-fe-infra/commit/db1180a40336042913f9c9f3309705d56fc4946b) Thanks [@danni-cool](https://github.com/danni-cool)! - `parseConnectError` now supports Connect JSON body input (from `httpErrorMiddleware` `onError` callback), in addition to `ConnectError` objects.

  Uses connect-es official `errorFromJson` and `codeFromString` to properly parse Connect JSON format with base64-encoded details.

  `tagSessionMiddleware` now supports `['*']` in endpoints array to match all URLs. This is useful when you want to tag all requests (e.g., mark all as protected) without specifying individual endpoint patterns.

## 0.4.1

### Patch Changes

- [#37](https://github.com/theplant/qor5-fe-infra/pull/37) [`08b9e84`](https://github.com/theplant/qor5-fe-infra/commit/08b9e84552438edf04e67645641977d761e89a28) Thanks [@danni-cool](https://github.com/danni-cool)! - ### @theplant/proto-to-ts

  Significant feature enhancements: added method extraction, import resolution, interface generation, and other functional improvements. This update goes beyond code style formatting and introduces new capabilities to the package.

  ### @theplant/fetch-middleware

  Documentation cleanup: removed deprecated auth-refresh middleware documentation and references.

  **Breaking changes:**
  - Removed `rawMessage` and `validationError` from the `parseConnectError` return type.
  - Renamed types: `RestClientOptions` → `FetchClientOptions`, `RestClient` → `FetchClient`.

## 0.4.0

### Minor Changes

- [#34](https://github.com/theplant/qor5-fe-infra/pull/34) [`fe18d2c`](https://github.com/theplant/qor5-fe-infra/commit/fe18d2c30677a96e504aec33095e4aad8420dd27) Thanks [@danni-cool](https://github.com/danni-cool)! - feat: add requestQueueMiddleware for handling authentication refresh and retries
  feat: add support for _meta property in Request and RestRequestOptions
  feat: strip internal properties (starting with _) from JSON request body
  feat: add CIAM auth helpers

## 0.3.1

### Patch Changes

- [#27](https://github.com/theplant/qor5-fe-infra/pull/27) [`9a2add9`](https://github.com/theplant/qor5-fe-infra/commit/9a2add98a21fbe76cfdf34d55b474cd7bd478945) Thanks [@danni-cool](https://github.com/danni-cool)! - change the pkg name and move pkg to @theplant

## 0.3.0

### Minor Changes

- [#22](https://github.com/theplant/qor5-fe-infra/pull/22) [`d8a766e`](https://github.com/theplant/qor5-fe-infra/commit/d8a766eaf6d484e8b3ce9b169f3a129936dc1779) Thanks [@danni-cool](https://github.com/danni-cool)! - add support middleware and errorhandler for protobuf

### Patch Changes

- [#26](https://github.com/theplant/qor5-fe-infra/pull/26) [`42460c7`](https://github.com/theplant/qor5-fe-infra/commit/42460c773f4622e4fecf9824c8da99f97953828a) Thanks [@danni-cool](https://github.com/danni-cool)! - update the fetch-middleware readme

## 0.2.0

### Minor Changes

- [#19](https://github.com/theplant/qor5-fe-infra/pull/19) [`0d8477f`](https://github.com/theplant/qor5-fe-infra/commit/0d8477f7361dbd845d8b21ea12bc76454ace205d) Thanks [@danni-cool](https://github.com/danni-cool)! - add fetch-middlware and rename all the module name
