import {
  composeMiddlewares,
  type CancelablePromise,
  type Middleware,
  type Request,
} from "./middleware";

export type JsonLike = object | string | number | boolean | null;

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type FetchClientOptions = {
  baseUrl?: string;
  middlewares?: Middleware[];
  fetcher?: Fetcher;
  fetchInit?: RequestInit;
};

export type RestRequestOptions = {
  headers?: HeadersInit;
  query?: Record<string, string | number | boolean | undefined>;
  _meta?: Record<string, any>; // Internal metadata for middlewares
};

/**
 * Fetch handler function that can be used with any fetch-compatible API
 * This is the function signature returned by createFetchClient
 */
export type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * REST client with convenience methods for HTTP verbs
 * Also acts as a fetch handler that can be passed to connect-es or other libraries
 */
export type FetchClient = FetchHandler & {
  get<T = unknown>(
    path: string,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  post<T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  put<T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  patch<T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  delete<T = unknown>(
    path: string,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
};

function joinUrl(baseUrl: string | undefined, path: string): string {
  if (!baseUrl) return path;
  if (/^https?:/i.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function toQueryString(query?: RestRequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * Create a fetch client with middlewares
 *
 * Returns a hybrid function that can be:
 * 1. Called as a function for raw fetch operations (compatible with connect-es)
 * 2. Used as an object with convenience methods (get, post, put, patch, delete)
 *
 * @example
 * ```ts
 * import { createFetchClient, jsonResponseMiddleware } from 'fetch-middleware'
 *
 * const client = createFetchClient({
 *   middlewares: [jsonResponseMiddleware()],
 *   fetchInit: {
 *     credentials: 'include',
 *   },
 * })
 *
 * // Use as fetch handler (for connect-es, etc.)
 * const response = await client('https://api.example.com/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ key: 'value' }),
 * })
 *
 * // Use as REST client
 * const data = await client.post('/api/users', { name: 'John' })
 * const user = await client.get('/api/users/123')
 * ```
 */
export function createFetchClient(
  options: FetchClientOptions = {},
): FetchClient {
  const handler = composeMiddlewares(options.middlewares ?? [], {
    fetcher: (input, init) => {
      const baseFetcher = options.fetcher ?? fetch;
      const mergedInit = mergeRequestInit(options.fetchInit, init);
      return baseFetcher(input, mergedInit);
    },
  });

  // Create the base fetch handler function
  const fetchHandler = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    return handler({
      url: typeof input === "string" ? input : String(input),
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body ?? null,
      signal: init?.signal ?? undefined,
    }) as Promise<Response>;
  };

  const run = <T>(request: Request) => {
    const responsePromise = handler(request);
    const cancelable = responsePromise as CancelablePromise<Response>;

    // Cast the response to T
    // Middlewares are responsible for transforming Response to the desired type
    const dataPromise = responsePromise as unknown as CancelablePromise<T>;
    dataPromise.cancel = cancelable.cancel;
    dataPromise.controller = cancelable.controller;
    dataPromise.signal = cancelable.signal;

    return dataPromise;
  };

  // Attach REST methods to the fetch handler function
  const client = fetchHandler as FetchClient;

  client.get = function <T = unknown>(path: string, opts?: RestRequestOptions) {
    const url = joinUrl(
      options.baseUrl,
      `${path}${toQueryString(opts?.query)}`,
    );
    return run<T>({
      url,
      method: "GET",
      headers: opts?.headers,
      _meta: opts?._meta,
    });
  };

  client.post = function <T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "POST",
      joinUrl(options.baseUrl, path),
      body,
      opts?.headers,
      opts?._meta,
    );
    return run<T>(request);
  };

  client.put = function <T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "PUT",
      joinUrl(options.baseUrl, path),
      body,
      opts?.headers,
      opts?._meta,
    );
    return run<T>(request);
  };

  client.patch = function <T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "PATCH",
      joinUrl(options.baseUrl, path),
      body,
      opts?.headers,
      opts?._meta,
    );
    return run<T>(request);
  };

  client.delete = function <T = unknown>(
    path: string,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "DELETE",
      joinUrl(options.baseUrl, path),
      null,
      opts?.headers,
      opts?._meta,
    );
    return run<T>(request);
  };

  return client;
}

function mergeRequestInit(
  base?: RequestInit,
  incoming?: RequestInit,
): RequestInit | undefined {
  if (!base && !incoming) return undefined;

  const mergedHeaders = new Headers();
  if (base?.headers) {
    new Headers(base.headers).forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }
  if (incoming?.headers) {
    new Headers(incoming.headers).forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }

  const method = incoming?.method ?? base?.method ?? "POST";
  // Removed: headersMethodOverride - X-HTTP-Method-Override header causes CORS issues
  // Modern servers support PUT/PATCH/DELETE directly, no need for method override

  return {
    ...base,
    ...incoming,
    method,
    headers: mergedHeaders,
  };
}

/**
 * Strip properties starting with underscore from object (first level only)
 */
function stripInternalProperties(obj: any): any {
  if (!obj || typeof obj !== "object" || obj.constructor !== Object) {
    return obj;
  }
  const cleaned: any = {};
  for (const key in obj) {
    if (!key.startsWith("_")) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

function buildRequest(
  method: string,
  url: string,
  body: JsonLike | Uint8Array | FormData | null | undefined,
  headersInit?: HeadersInit,
  _meta?: Record<string, any>,
): Request {
  const headers = new Headers(headersInit);
  let payload: BodyInit | null = null;

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof Uint8Array
  ) {
    payload = body as BodyInit;
  } else if (body == null) {
    payload = null;
  } else {
    // Strip internal properties (starting with _) before stringifying
    const cleanedBody = stripInternalProperties(body);
    payload = JSON.stringify(cleanedBody);
    // Set Content-Type for JSON payloads if not already set
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  return {
    url,
    method,
    headers,
    body: payload,
    _meta,
  };
}
