import type { RequestQueueOptions } from "./request-queue";
import type { Middleware } from "../middleware";

/**
 * Configuration for the session refresh middleware
 */
export interface SessionRefreshMiddlewareOptions {
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
   *
   * @example
   * // Ignore requests that are not marked as protected
   * ignoreRequest: (req) => !req._meta?.isProtected
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

/**
 * Type for the requestQueueMiddleware function
 */
export type RequestQueueMiddlewareFn = (
  options: RequestQueueOptions,
) => Middleware;

/**
 * Factory function that creates session refresh middleware with injected requestQueueMiddleware.
 * This handles automatic token refresh on 401 responses with single-flight deduplication.
 *
 * @example
 * ```ts
 * import { requestQueueMiddleware, createSessionRefreshMiddleware } from '@theplant/fetch-middleware'
 *
 * const sessionRefreshMiddleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
 *   refreshSessionFn: () => fetch('/iam/api/v1/auth/refresh', { method: 'POST' }),
 *   onSessionInvalid: (next) => {
 *     useAuthStore.getState().clearAuth()
 *     next(false)
 *     window.location.href = '/sign-in'
 *   },
 *   ignoreRequest: (req) => !req._meta?.isProtected
 * })
 * ```
 */
export function createSessionRefreshMiddleware(
  requestQueueMiddleware: RequestQueueMiddlewareFn,
) {
  return function (options: SessionRefreshMiddlewareOptions): Middleware {
    const {
      refreshSessionFn,
      onSessionInvalid,
      ignoreRequest,
      refreshEndpointPattern,
      debug = false,
    } = options;

    // Internal ignore check for refresh endpoint to prevent infinite loops
    const shouldIgnoreRequest = (request: unknown): boolean => {
      const req = request as {
        url?: string;
        _meta?: { isProtected?: boolean };
      };
      // Always ignore refresh endpoint to prevent infinite loops
      if (req.url?.includes(refreshEndpointPattern)) return true;
      // Apply custom ignore logic if provided
      if (ignoreRequest && ignoreRequest(request)) return true;
      return false;
    };

    // Build queue options for requestQueueMiddleware
    const queueOptions: RequestQueueOptions = {
      // Trigger on 401 responses (except for ignored requests)
      queueTrigger: (info) => {
        if (shouldIgnoreRequest(info.request)) return false;
        if (info.response.status === 401) return true;
        return false;
      },
      handler: async (next) => {
        try {
          await refreshSessionFn();
          next(true);
        } catch {
          onSessionInvalid(next);
        }
      },
      ignore: shouldIgnoreRequest,
      debug,
    };

    return requestQueueMiddleware(queueOptions);
  };
}
