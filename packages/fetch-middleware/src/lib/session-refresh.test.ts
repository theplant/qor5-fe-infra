/**
 * Tests for createSessionRefreshMiddleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSessionRefreshMiddleware } from "./session-refresh";
import {
  requestQueueMiddleware,
  _resetRequestQueueState,
} from "./request-queue";
import type { Request, SuitContext } from "../middleware";

// Test utilities
function createMockContext(): SuitContext {
  return {
    controller: new AbortController(),
    signal: new AbortController().signal,
  };
}

function createMockRequest(url: string, _meta?: Record<string, any>): Request {
  return {
    url,
    method: "GET",
    headers: {},
    body: null,
    _meta,
  };
}

function createMockResponse(status: number, body?: any): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Helper to wait for async operations
async function waitFor(ms: number = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("createSessionRefreshMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetRequestQueueState();
  });

  it("should pass through normal 200 responses", async () => {
    const refreshSessionFn = vi.fn();
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockResolvedValue(createMockResponse(200));
    const res = await middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );

    expect(res.status).toBe(200);
    expect(refreshSessionFn).not.toHaveBeenCalled();
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  it("should trigger refresh on 401 response", async () => {
    const refreshSessionFn = vi.fn().mockResolvedValue(undefined);
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockImplementation(async (req: Request) => {
      if (!req._meta?._retryCount) {
        return createMockResponse(401);
      }
      return createMockResponse(200);
    });

    const p = middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );

    await waitFor(100);
    const res = await p;

    expect(res.status).toBe(200);
    expect(refreshSessionFn).toHaveBeenCalledTimes(1);
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  it("should call onSessionInvalid when refresh fails", async () => {
    const refreshSessionFn = vi
      .fn()
      .mockRejectedValue(new Error("Refresh failed"));
    const onSessionInvalid = vi.fn().mockImplementation((next) => next(false));

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockResolvedValue(createMockResponse(401));

    const p = middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );
    const pExpect = expect(p).rejects.toThrow("Authentication refresh failed");

    await waitFor(100);
    await pExpect;

    expect(refreshSessionFn).toHaveBeenCalledTimes(1);
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
  });

  it("should ignore refresh endpoint to prevent infinite loops", async () => {
    const refreshSessionFn = vi.fn();
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockResolvedValue(createMockResponse(401));

    // Request to refresh endpoint should NOT trigger refresh
    const res = await middleware(
      createMockRequest("/iam/api/v1/auth/refresh"),
      next,
      createMockContext(),
    );

    expect(res.status).toBe(401);
    expect(refreshSessionFn).not.toHaveBeenCalled();
  });

  it("should use custom refreshEndpointPattern", async () => {
    const refreshSessionFn = vi.fn();
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/api/token/renew",
    });

    const next = vi.fn().mockResolvedValue(createMockResponse(401));

    // Request to custom refresh endpoint should NOT trigger refresh
    const res = await middleware(
      createMockRequest("/api/token/renew"),
      next,
      createMockContext(),
    );

    expect(res.status).toBe(401);
    expect(refreshSessionFn).not.toHaveBeenCalled();
  });

  it("should respect ignoreRequest option", async () => {
    const refreshSessionFn = vi.fn();
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      ignoreRequest: (req) => !(req as Request)._meta?.isProtected,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockResolvedValue(createMockResponse(401));

    // Request without isProtected should NOT trigger refresh
    const res1 = await middleware(
      createMockRequest("/api/public"),
      next,
      createMockContext(),
    );
    expect(res1.status).toBe(401);
    expect(refreshSessionFn).not.toHaveBeenCalled();

    // Request with isProtected: false should NOT trigger refresh
    const res2 = await middleware(
      createMockRequest("/api/public", { isProtected: false }),
      next,
      createMockContext(),
    );
    expect(res2.status).toBe(401);
    expect(refreshSessionFn).not.toHaveBeenCalled();
  });

  it("should trigger refresh for protected requests", async () => {
    const refreshSessionFn = vi.fn().mockResolvedValue(undefined);
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      ignoreRequest: (req) => !(req as Request)._meta?.isProtected,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockImplementation(async (req: Request) => {
      if (!req._meta?._retryCount) {
        return createMockResponse(401);
      }
      return createMockResponse(200);
    });

    const p = middleware(
      createMockRequest("/api/users", { isProtected: true }),
      next,
      createMockContext(),
    );

    await waitFor(100);
    const res = await p;

    expect(res.status).toBe(200);
    expect(refreshSessionFn).toHaveBeenCalledTimes(1);
  });

  it("should handle concurrent requests with single-flight refresh", async () => {
    const refreshSessionFn = vi.fn().mockImplementation(async () => {
      await waitFor(100);
    });
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockImplementation(async (req: Request) => {
      if (!req._meta?._retryCount) {
        return createMockResponse(401);
      }
      return createMockResponse(200);
    });

    // Start multiple concurrent requests
    const p1 = middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );
    const p2 = middleware(
      createMockRequest("/api/orders"),
      next,
      createMockContext(),
    );
    const p3 = middleware(
      createMockRequest("/api/products"),
      next,
      createMockContext(),
    );

    await waitFor(200);

    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // Refresh should only be called ONCE (single-flight)
    expect(refreshSessionFn).toHaveBeenCalledTimes(1);
  });

  it("should not trigger refresh for non-401 errors", async () => {
    const refreshSessionFn = vi.fn();
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockResolvedValue(createMockResponse(500));

    const res = await middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );

    expect(res.status).toBe(500);
    expect(refreshSessionFn).not.toHaveBeenCalled();
  });

  it("should not trigger refresh for 403 errors", async () => {
    const refreshSessionFn = vi.fn();
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const next = vi.fn().mockResolvedValue(createMockResponse(403));

    const res = await middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );

    expect(res.status).toBe(403);
    expect(refreshSessionFn).not.toHaveBeenCalled();
  });

  it("should retry queued requests after successful refresh", async () => {
    const refreshSessionFn = vi.fn().mockImplementation(async () => {
      await waitFor(50);
    });
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(requestQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    const callOrder: string[] = [];
    const next = vi.fn().mockImplementation(async (req: Request) => {
      callOrder.push(`${req.url}-${req._meta?._retryCount || 0}`);
      if (!req._meta?._retryCount) {
        return createMockResponse(401);
      }
      return createMockResponse(200);
    });

    const p1 = middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );

    await waitFor(20);

    const p2 = middleware(
      createMockRequest("/api/orders"),
      next,
      createMockContext(),
    );

    await waitFor(200);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Verify call order: initial calls, then retries
    expect(callOrder).toContain("/api/users-0");
    expect(callOrder).toContain("/api/users-1");
    expect(callOrder).toContain("/api/orders-1");
  });

  it("should work with factory pattern (injected requestQueueMiddleware)", async () => {
    // Create a mock requestQueueMiddleware to verify it's called correctly
    const mockQueueMiddleware = vi.fn().mockImplementation((options) => {
      return requestQueueMiddleware(options);
    });

    const refreshSessionFn = vi.fn().mockResolvedValue(undefined);
    const onSessionInvalid = vi.fn();

    const middleware = createSessionRefreshMiddleware(mockQueueMiddleware)({
      refreshSessionFn,
      onSessionInvalid,
      refreshEndpointPattern: "/auth/refresh",
    });

    // Verify the factory was called with correct options
    expect(mockQueueMiddleware).toHaveBeenCalledTimes(1);
    expect(mockQueueMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        queueTrigger: expect.any(Function),
        handler: expect.any(Function),
        ignore: expect.any(Function),
      }),
    );

    // Verify the middleware works
    const next = vi.fn().mockResolvedValue(createMockResponse(200));
    const res = await middleware(
      createMockRequest("/api/users"),
      next,
      createMockContext(),
    );
    expect(res.status).toBe(200);
  });
});
