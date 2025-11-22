/**
 * Tests for auth-refresh middleware helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RequestQueueOptions } from "./request-queue";
import type { RefreshableAuthHandler } from "./auth-refresh";

// We will capture the options passed into requestQueueMiddleware
let capturedOptions: RequestQueueOptions | null = null;

vi.mock("./request-queue", async () => {
  const actual =
    await vi.importActual<typeof import("./request-queue")>("./request-queue");

  return {
    ...actual,
    // Intercept requestQueueMiddleware to capture its options
    requestQueueMiddleware: (options: RequestQueueOptions) => {
      capturedOptions = options;
      // Return a no-op middleware for the purpose of these tests
      return async (req: any, next: any, ctx: any) => next(req, ctx);
    },
  };
});

import { createSessionRefreshMiddleware } from "./auth-refresh";

describe("createSessionRefreshMiddleware", () => {
  beforeEach(() => {
    capturedOptions = null;
  });

  afterEach(() => {
    capturedOptions = null;
  });

  function createAuthHandler(
    session: { expiresAt?: number } = {},
  ): RefreshableAuthHandler {
    return {
      refreshSession: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue({ session }),
    };
  }

  function createProtectedRequest(): any {
    return {
      url: "/api/protected",
      method: "GET",
      headers: {},
      body: null,
      _meta: { isProtected: true },
    };
  }

  function createResponse(status: number): Response {
    return new Response(null, { status });
  }

  it("should trigger queue for protected 401 request when ignoreRequest matches _meta.isProtected", async () => {
    const authHandler = createAuthHandler({
      // Not expired yet
      expiresAt: Date.now() + 60_000,
    });
    const onSessionInvalid = vi.fn();

    createSessionRefreshMiddleware({
      getAuthHandler: () => authHandler,
      onSessionInvalid,
      // Same pattern as qor5-ec-demo index.ts (42-46)
      ignoreRequest: (request) => !request._meta?.isProtected,
    });

    expect(capturedOptions).not.toBeNull();
    const options = capturedOptions as RequestQueueOptions;

    // 1) ignoreRequest: protected request should not be ignored
    const protectedReq = createProtectedRequest();
    expect(options.ignore?.(protectedReq)).toBe(false);

    // 2) queueTrigger: For a 401 response, should return true (should be captured)
    const shouldTrigger = await options.queueTrigger({
      response: createResponse(401),
      request: protectedReq,
      ctx: {} as any,
    });

    expect(shouldTrigger).toBe(true);
  });

  it("should trigger queue for protected request when session already expired", async () => {
    const authHandler = createAuthHandler({
      // Expired one minute ago
      expiresAt: Date.now() - 60_000,
    });
    const onSessionInvalid = vi.fn();

    createSessionRefreshMiddleware({
      getAuthHandler: () => authHandler,
      onSessionInvalid,
      ignoreRequest: (request) => !request._meta?.isProtected,
    });

    expect(capturedOptions).not.toBeNull();
    const options = capturedOptions as RequestQueueOptions;

    const protectedReq = createProtectedRequest();

    // For non-401 status, expired session should still trigger queue
    const shouldTrigger = await options.queueTrigger({
      response: createResponse(200),
      request: protectedReq,
      ctx: {} as any,
    });

    expect(shouldTrigger).toBe(true);
  });
});
