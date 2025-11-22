# Auth Refresh Middleware

The **Auth Refresh Middleware** provides high-level helpers for handling
authentication/session refresh and automatic retry, built on top of the
low-level [`requestQueueMiddleware`](./request-queue.md).

It is the **recommended** way to integrate auth refresh logic for both
REST and Connect-RPC clients.

At its core, the auth-refresh helpers:

- Decide **when** a request should trigger a refresh (401 / expired session).
- Decide **which** requests are managed (via `_meta.isProtected` or `ignoreRequest`).
- Delegate **queueing + retry** mechanics to `requestQueueMiddleware`.

## API Overview

```ts
import {
  createSessionRefreshMiddleware,
  type SessionRefreshMiddlewareOptions,
} from "@theplant/fetch-middleware";
```

### `SessionRefreshMiddlewareOptions`

```ts
export interface SessionRefreshMiddlewareOptions {
  /**
   * Function to get the AuthHandler instance.
   * The handler must provide:
   * - refreshSession(): Promise<void>
   * - getState(): any (should contain session.expiresAt when available)
   */
  getAuthHandler: () => RefreshableAuthHandler;

  /**
   * Callback when session refresh fails or is invalid.
   * Use this to clear global auth state or redirect to login.
   */
  onSessionInvalid: () => void;

  /**
   * Optional function to determine if a request should be ignored by
   * the refresh logic. Return true to skip refresh handling.
   *
   * Example:
   *   // Only handle requests with _meta.isProtected = true
   *   ignoreRequest: (req) => !req._meta?.isProtected
   */
  ignoreRequest?: (request: any) => boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}
```

Internally, the `RefreshableAuthHandler` interface is:

```ts
export interface RefreshableAuthHandler {
  refreshSession: () => Promise<any>;
  getState: () => any;
}
```

## Usage

### Behavior

For each request:

- **Ignored** when `ignoreRequest(request) === true` (if provided).
  - This means the request will pass through immediately without queueing.
  - It also means a 401 response from this request will **NOT** trigger a refresh.
- **Triggers queue** when (provided it's not ignored):
  - Response status is **401**, or
  - Local session is **already expired** (`session.expiresAt < now - 1s`).

When a trigger occurs:

1. `requestQueueMiddleware` queues relevant requests and pauses them.
2. The `handler` calls `auth.refreshSession()`.
3. On success: all queued requests are retried.
4. On failure: `onSessionInvalid()` is called and queued requests are rejected.

### Example (REST + `_meta.isProtected`)

This mirrors the pattern used in typical applications:

```ts
import {
  createFetchClient,
  createSessionRefreshMiddleware,
} from "@theplant/fetch-middleware";

import { useAuthStore } from "@/store/authStore";

// Your auth handler, e.g. ciamHandlers
import type { AuthHandlers } from "@theplant/ciam-next-web-sdk";

let ciamHandlers: AuthHandlers;

const onSessionInvalid = () => {
  useAuthStore.getState().clearAuth();
};

const sessionRefreshMiddleware = createSessionRefreshMiddleware({
  getAuthHandler: () => ciamHandlers,
  onSessionInvalid,
  // Only manage requests explicitly marked as protected
  ignoreRequest: (request) => !request._meta?.isProtected,
});

export const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    // ... your other middlewares
    sessionRefreshMiddleware,
  ],
});
```

### Example (Connect-RPC)

For Connect-RPC, you typically want to:

1. Tag protected requests (e.g. using `tagSessionMiddleware`).
2. Ignore the refresh endpoint itself to avoid deadlocks.
3. Ignore non-protected requests.

```ts
import {
  createFetchClient,
  tagSessionMiddleware,
  createSessionRefreshMiddleware,
} from "@theplant/fetch-middleware";

import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import type { AuthHandlers } from "@theplant/ciam-next-web-sdk";

let ciamHandlers: AuthHandlers;

const onSessionInvalid = () => {
  // e.g. clear global auth store
};

const sessionRefreshMiddleware = createSessionRefreshMiddleware({
  getAuthHandler: () => ciamHandlers,
  onSessionInvalid,
  // Combine logic:
  // 1. Ignore the refresh endpoint itself
  // 2. Only manage protected requests
  ignoreRequest: (req) => {
    if (req.url.includes("/RefreshSession")) return true;
    if (!req._meta?.isProtected) return true;
    return false;
  },
  debug: true,
});

const fetchClient = createFetchClient({
  middlewares: [
    // 1. Queue & refresh logic
    sessionRefreshMiddleware,
    // 2. Tag protected Connect endpoints
    tagSessionMiddleware(["/api.UserService/", "/api.AdminService/"], {
      isProtected: true,
    }),
  ],
});

const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

const client = createClient(YourService, transport);
```

## How It Works Internally

The helper is a **thin wrapper** around `requestQueueMiddleware`:

- It builds a `RequestQueueOptions` object:
  - `queueTrigger` encodes auth-specific conditions (401/expiry) and checks `ignoreRequest`.
  - `handler` calls your `auth.refreshSession()` and maps success/failure.
  - `ignore` delegates to `ignoreRequest`.
- It calls `requestQueueMiddleware(options)` and returns the resulting `Middleware`.
