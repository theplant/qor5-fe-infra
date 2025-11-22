# Request Queue Middleware

The `requestQueueMiddleware` manages request queues for handling authentication refresh and automatic retry. It supports single or multiple queue configurations with **INDEPENDENT QUEUES**. Each config maintains its own queue state to avoid conflicts.

> **Recommended:** For typical auth/session refresh flows, use
> [`Auth Refresh Middleware`](./auth-refresh.md) instead of wiring
> `requestQueueMiddleware` directly. The auth-refresh helpers build on
> this queue engine and encapsulate common patterns (401 + expiry +
> `_meta` filtering) while still using `requestQueueMiddleware`
> internally.

When a response matches the trigger condition (e.g., 401 unauthorized), this middleware:

1. Cancels all other pending requests that match **THE SAME config** (unless ignored)
2. Adds them to **THE CONFIG'S independent queue** while keeping their promises pending
3. Calls the config's `handler` callback (e.g., to refresh session)
4. If `handler` signals success: retries all requests in **THIS config's queue**
5. If `handler` signals failure: rejects all requests in **THIS config's queue** with error

## Options

```typescript
interface RequestQueueOptions {
  // Determine if the response should trigger queue management
  // Return true to trigger queue management and retry this request
  queueTrigger: (info: QueueTriggerInfo) => boolean | Promise<boolean>;

  // Handler to process the queue trigger (e.g., refresh session)
  // Call next(true) to retry all queued requests after successful refresh
  // Call next(false) to reject all queued requests
  handler: (next: (success: boolean) => void) => void | Promise<void>;

  // Determine if the request should ignore the queue (pass through directly)
  // Return true to skip queue management for this request
  ignore?: (request: Request) => boolean;

  // Maximum number of retries before giving up (default: 1)
  maxRetries?: number;

  // Enable debug logging (default: false)
  debug?: boolean;
}

interface QueueTriggerInfo {
  response: Response;
  request: Request;
  ctx: Context;
}
```

## Usage Examples

### Basic Usage

```typescript
import { requestQueueMiddleware } from "@theplant/fetch-middleware";

const middleware = requestQueueMiddleware({
  // Trigger on 401 Unauthorized
  queueTrigger: ({ response }) => response.status === 401,

  // Handle the refresh
  handler: async (next) => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      // If refresh successful, retry queued requests
      next(res.ok);
    } catch (e) {
      // If refresh failed, reject queued requests
      next(false);
    }
  },
});
```

### With Metadata Filtering (Using `ignore`)

You can use `ignore` to prevent certain requests from being queued or canceled.

#### REST Client with `_meta`

```typescript
const middleware = requestQueueMiddleware({
  // Ignore requests that don't need auth
  ignore: (request) => request._meta?.needAuth === false,

  queueTrigger: ({ response }) => response.status === 401,

  handler: async (next) => {
    // Refresh logic...
    next(true);
  },
});

// Usage in API calls
const fetchClient = createFetchClient({
  middlewares: [middleware],
});

// Managed by queue (default)
await fetchClient.get("/api/user");

// Ignored by queue (needAuth: false)
await fetchClient.get("/api/public", {
  _meta: { needAuth: false },
});
```

> **Note**: The `_meta` property in `RestRequestOptions` is passed to the middleware but stripped before the request is sent to the network.

#### Connect-RPC with Tag Session Middleware

For Connect-RPC clients, you cannot pass `_meta` directly. Use [Tag Session Middleware](./tag-session.md) to automatically tag requests based on URL patterns:

```typescript
import {
  createFetchClient,
  tagSessionMiddleware,
  requestQueueMiddleware,
} from "@theplant/fetch-middleware";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";

const fetchClient = createFetchClient({
  middlewares: [
    // 1. Queue middleware uses the tag to filter requests
    requestQueueMiddleware({
      ignore: (request) => !request._meta?.isProtected,
      queueTrigger: ({ response }) => response.status === 401,
      handler: async (next) => {
        await refreshSession();
        next(true);
      },
    }),

    // 2. Tag protected endpoints (should be last)
    tagSessionMiddleware(["/api.UserService/", "/api.AdminService/"], {
      isProtected: true,
    }),
  ],
});

const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

const client = createClient(UserService, transport);
```

### Recommended: Use Auth Refresh Helpers

For most authentication scenarios, you should not build `RequestQueueOptions`
directly. Instead, prefer the high-level helpers described in
[`auth-refresh.md`](./auth-refresh.md):

- `createSessionRefreshMiddleware` (REST)
- `createConnectSessionRefreshMiddleware` (Connect-RPC)

These helpers:

- Configure `queueTrigger` for you (401 + session expiry).
- Wire the `handler` to your `refreshSession` implementation.
- Provide sensible defaults for `ignore` / `_meta.isProtected`.
- Still use `requestQueueMiddleware` under the hood, so all the behavior
  documented on this page still applies.

Only reach for `requestQueueMiddleware` directly if you have
non-standard triggering logic or need multiple independent queues
outside of authentication.

### Advanced Trigger Logic

```typescript
const middleware = requestQueueMiddleware({
  queueTrigger: async ({ response }) => {
    if (response.status === 401) return true;

    // Check for specific error code in body
    if (response.status === 403) {
      try {
        const body = await response.clone().json();
        return body.code === "SESSION_EXPIRED";
      } catch {
        return false;
      }
    }
    return false;
  },
  // ... handler
});
```

## Execution Flow

Scenario: Concurrent requests A, B, C.

1.  **T0**: A, B, C sent.
2.  **T1**: A returns 401.
    - Middleware detects trigger.
    - Sets `isRefreshing = true`.
    - Cancels B and C (if they are pending and not ignored).
    - Adds A, B, C to the queue.
    - Calls `handler`.
3.  **T2**: `handler` performs refresh (e.g., calls `/refresh` API).
4.  **T3**: Refresh successful. `handler` calls `next(true)`.
5.  **T4**: Middleware processes queue:
    - Retries A, B, C with their original parameters.
    - Resolves original promises with new responses.

If `handler` calls `next(false)`, all queued requests are rejected.
