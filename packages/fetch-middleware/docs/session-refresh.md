# Session Refresh Middleware

`createSessionRefreshMiddleware` is a high-level middleware factory that handles automatic session/token refresh on 401 responses with single-flight deduplication. It is built on top of [Request Queue Middleware](./request-queue.md).

## Use Case

When your API returns 401 Unauthorized (e.g., expired access token), this middleware will:

1. Pause all pending requests
2. Call your refresh function (single-flight, no duplicate refresh calls)
3. On success: retry all paused requests with the new session
4. On failure: call your invalid session handler (e.g., redirect to login)

## API

```typescript
function createSessionRefreshMiddleware(
  requestQueueMiddleware: RequestQueueMiddlewareFn,
): (options: SessionRefreshMiddlewareOptions) => Middleware;
```

### SessionRefreshMiddlewareOptions

```typescript
interface SessionRefreshMiddlewareOptions {
  /**
   * Function to refresh the session.
   * Should call the IAM refresh endpoint and return a promise.
   * Tip: Use a fetch client with httpErrorMiddleware to handle non-401 errors (e.g., show toast).
   */
  refreshSessionFn: () => Promise<unknown>;

  /**
   * Callback when session refresh fails or is invalid (401 or network error).
   * Use this to clear global auth state or redirect to login.
   */
  onSessionInvalid: (next: (success: boolean) => void) => void;

  /**
   * Optional function to determine if a request should be ignored by the refresh logic.
   * Return true to skip refresh handling for this request.
   */
  ignoreRequest?: (request: unknown) => boolean;

  /**
   * URL pattern to ignore for refresh (prevents infinite loops on refresh endpoint).
   * This is required to prevent infinite loops when the refresh endpoint returns 401.
   */
  refreshEndpointPattern: string;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}
```

## Usage Examples

### Basic Usage

```typescript
import {
  createFetchClient,
  requestQueueMiddleware,
  createSessionRefreshMiddleware,
} from "@theplant/fetch-middleware";

// Create the session refresh middleware
const sessionRefreshMiddleware = createSessionRefreshMiddleware(
  requestQueueMiddleware,
)({
  refreshSessionFn: () =>
    fetch("/iam/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    }),

  onSessionInvalid: (next) => {
    // Clear auth state
    useAuthStore.getState().clearAuth();
    // Signal failure to reject queued requests
    next(false);
    // Redirect to login
    window.location.href = "/sign-in";
  },

  // Required: URL pattern to ignore for refresh endpoint
  refreshEndpointPattern: "/auth/refresh",
});

// Create fetch client with the middleware
const client = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: { credentials: "include" },
  middlewares: [sessionRefreshMiddleware],
});
```

### With Request Filtering

Use `ignoreRequest` to skip refresh handling for certain requests (e.g., public endpoints):

```typescript
const sessionRefreshMiddleware = createSessionRefreshMiddleware(
  requestQueueMiddleware,
)({
  refreshSessionFn: () =>
    fetch("/iam/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    }),

  onSessionInvalid: (next) => {
    useAuthStore.getState().clearAuth();
    next(false);
    window.location.href = "/sign-in";
  },

  // Only handle refresh for protected requests
  ignoreRequest: (req) => !req._meta?.isProtected,

  // Required: URL pattern to ignore for refresh endpoint
  refreshEndpointPattern: "/auth/refresh",
});

// Usage
const client = createFetchClient({
  middlewares: [sessionRefreshMiddleware],
});

// This request will trigger refresh on 401
await client.get("/api/user", { _meta: { isProtected: true } });

// This request will NOT trigger refresh on 401
await client.get("/api/public");
```

### With Connect-RPC

For Connect-RPC clients, combine with [Tag Session Middleware](./tag-session.md) to auto-tag protected endpoints:

```typescript
import {
  createFetchClient,
  requestQueueMiddleware,
  createSessionRefreshMiddleware,
  tagSessionMiddleware,
} from "@theplant/fetch-middleware";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";

const sessionRefreshMiddleware = createSessionRefreshMiddleware(
  requestQueueMiddleware,
)({
  refreshSessionFn: () =>
    fetch("/iam/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    }),

  onSessionInvalid: (next) => {
    useAuthStore.getState().clearAuth();
    next(false);
    window.location.href = "/sign-in";
  },

  ignoreRequest: (req) => !req._meta?.isProtected,

  // Required: URL pattern to ignore for refresh endpoint
  refreshEndpointPattern: "/auth/refresh",
});

const fetchClient = createFetchClient({
  middlewares: [
    // 1. Session refresh middleware (uses _meta.isProtected)
    sessionRefreshMiddleware,

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

// Calls to UserService will auto-refresh on 401
await client.getUser({ id: "123" });
```

### Custom Refresh Endpoint Pattern

The `refreshEndpointPattern` is required to prevent infinite loops. Set it to match your refresh endpoint:

```typescript
const sessionRefreshMiddleware = createSessionRefreshMiddleware(
  requestQueueMiddleware,
)({
  refreshSessionFn: () => fetch("/api/token/renew", { method: "POST" }),

  onSessionInvalid: (next) => {
    next(false);
    window.location.href = "/login";
  },

  // Custom refresh endpoint pattern
  refreshEndpointPattern: "/api/token/renew",
});
```

## How It Works

1. When a request returns 401, the middleware checks if it should be ignored
2. If not ignored, it triggers the request queue:
   - Pauses all pending requests (single-flight)
   - Calls `refreshSessionFn` to refresh the session
3. If refresh succeeds: all queued requests are retried automatically
4. If refresh fails: `onSessionInvalid` is called to handle the failure

## Notes

- The refresh endpoint is automatically ignored to prevent infinite loops
- Uses [Request Queue Middleware](./request-queue.md) internally for single-flight deduplication
- Combine with [Tag Session Middleware](./tag-session.md) for Connect-RPC clients
- Use `debug: true` for troubleshooting refresh flow issues
