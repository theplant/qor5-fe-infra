# Fetch Middleware

一个灵活且可组合的 `fetch` API 中间件系统，支持 REST 和 Connect-RPC。

## 特性

- 🎯 **中间件链**：组合多个中间件进行请求/响应处理
- 🔄 **原生 Response**：保持原始 Response 对象完整，仅添加属性
- ⚡ **类型安全**：完整的 TypeScript 支持，全泛型支持
- 🎨 **灵活**：易于自定义和扩展
- 🔌 **Connect-RPC 就绪**：内置对 Connect-RPC 和 Protobuf 错误的支持
- 🚀 **最小依赖**：轻量级实现

## 安装

### 从 GitHub Packages 安装

> 如果是第一次集成，请先创建个人的 github PAT(personal access token) 避免拉取权限报错，github 上的 package 是强制用户得用 PAT 拉取包。
>
> 1. [配置有权限读取 github package 的个人 PAT](https://github.com/theplant/qor5-fe-infra/wiki/Fixing-401-Unauthorized-Errors-When-Installing-Private-GitHub-Packages#-solution-1-authenticate-via-npm-login)

如果你已经搞定，请看下面的步骤, 在你的业务项目里执行以下命令

```bash
# 1. 安装
echo "@theplant:registry=https://npm.pkg.github.com" >> .npmrc
pnpm add @theplant/fetch-middleware
```

## 核心概念

### 中间件

中间件是一个拦截请求和响应的函数：

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

const myMiddleware: Middleware = async (req, next, ctx) => {
  // 请求前
  console.log("Request:", req.url);

  // 调用下一个中间件
  const res = await next(req);

  // 响应后
  console.log("Response:", res.status);

  return res;
};
```

## 内置中间件

本库包含多个内置中间件。点击下方链接查看详细文档（英文）：

- **[Request Queue Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/request-queue.md)**：底层请求队列引擎，适合高级/自定义场景。
- **[JSON Response Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/json-response.md)**：解析 JSON 响应并附加到 `_body` 属性。
- **[Extract Body Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/extract-body.md)**：从 Response 中提取 `_body` 并将其作为最终结果返回。
- **[HTTP Error Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/http-error.md)**：使用简单的回调处理 HTTP 错误。
- **[Format Proto Error Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/format-proto-error.md)**：处理 Protobuf 和 Connect 错误响应。
- **[Headers Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/headers.md)**：添加或修改请求头。
- **[Tag Session Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/tag-session.md)**：根据 URL 白名单自动为请求添加元数据标签。
- **[Session Refresh Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/session-refresh.md)**：高级中间件，用于在 401 响应时自动刷新会话/令牌，支持单次请求去重。

## 快速开始

### REST 客户端

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
  httpErrorMiddleware,
} from "@theplant/fetch-middleware";

// 创建 REST 客户端
const client = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    extractBodyMiddleware(), // 提取 _body 作为最终结果
    jsonResponseMiddleware(), // 解析 JSON 并附加到 _body
    httpErrorMiddleware(), // 处理 HTTP 错误
  ],
});

// 使用客户端

// GET 请求
// get<T>(path: string, options?: RestRequestOptions)
const users = await client.get<User[]>("/users", {
  // RestRequestOptions
  query: { page: 1, role: "admin" }, // 查询参数
  headers: { "X-Custom": "value" }, // 自定义头
  _meta: { isProtected: true }, // 元数据（仅供中间件使用，不会发送到服务器）
});

// POST 请求
// post<T>(path: string, body?: JsonLike | Uint8Array | FormData | null, options?: RestRequestOptions)
const newUser = await client.post<User>("/users", {
  name: "John",
  email: "john@example.com",
});

// PUT 请求
// put<T>(path: string, body?: JsonLike | Uint8Array | FormData | null, options?: RestRequestOptions)
await client.put("/users/123", { name: "John Updated" });

// PATCH 请求
// patch<T>(path: string, body?: JsonLike | Uint8Array | FormData | null, options?: RestRequestOptions)
await client.patch("/users/123", { status: "active" });

// DELETE 请求
// delete<T>(path: string, options?: RestRequestOptions)
await client.delete("/users/123");
```

### Connect-RPC 客户端

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
  tagSessionMiddleware,
} from "@theplant/fetch-middleware";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// 为 Connect-RPC 创建 fetch 客户端
const fetchClient = createFetchClient({
  middlewares: [
    // 由于 Connect 客户端无法直接传递 _meta，使用 tagSessionMiddleware 根据 URL 自动标记
    tagSessionMiddleware(["/api.UserService/", "/api.AdminService/"], {
      isProtected: true,
    }),
    formatProtoErrorMiddleware(),
  ],
});

// 创建 Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

// 创建 RPC 客户端
const client = createClient(YourService, transport);

// 调用会自动带上 isProtected 标签
await client.getUser({ id: "123" });
```

> **注意**：Connect-RPC 客户端由于框架限制，无法在调用时直接传递 `_meta` 参数。如需为请求添加元数据标签（例如配合 `requestQueueMiddleware` 使用），请使用 `tagSessionMiddleware` 根据 URL 白名单自动标记。详见 [Tag Session Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/tag-session.md)。

## 错误处理

### REST API 错误

对于标准的 REST/fetch 请求，使用 `httpErrorMiddleware` 来处理 HTTP 错误。它会根据 content-type 自动解析响应体（JSON/Text/Protobuf）并调用你的错误处理器：

```typescript
import {
  createFetchClient,
  httpErrorMiddleware,
} from "@theplant/fetch-middleware";

const client = createFetchClient({
  baseUrl: "https://api.example.com",
  middlewares: [
    httpErrorMiddleware({
      onError: ({ status, body, url }) => {
        const message = body?.message || body?.error || `Error ${status}`;

        switch (status) {
          case 401:
            window.location.href = "/login";
            break;
          case 422:
            // 验证错误
            console.log(body?.errors);
            break;
          case 500:
            console.error("服务器错误:", message);
            break;
        }
      },
      throwError: true, // 默认: 处理后抛出错误
    }),
  ],
});
```

`httpErrorMiddleware` 抛出的错误包含：

- `error.status` - HTTP 状态码
- `error.body` - 解析后的响应体
- `error.response` - 原生 Response 对象
- `error.url` - 请求 URL

#### 在单独 API 调用中捕获错误

除了在中间件中全局处理错误，你也可以在单独的 API 调用处使用 try-catch 捕获错误：

```typescript
// 全局中间件处理通用错误（401 重定向、toast 提示等）
const client = createFetchClient({
  baseUrl: "https://api.example.com",
  middlewares: [
    httpErrorMiddleware({
      onError: ({ status }) => {
        if (status === 401) window.location.href = "/login";
      },
    }),
  ],
});

// 在调用处捕获特定错误进行自定义处理
async function updateUser(id: string, data: UserData) {
  try {
    return await client.put(`/users/${id}`, data);
  } catch (err: any) {
    if (err.status === 422) {
      // 针对此表单处理验证错误
      return { errors: err.body?.errors };
    }
    if (err.status === 409) {
      // 处理冲突错误
      return { conflict: true };
    }
    // 重新抛出其他错误，由全局处理器处理
    throw err;
  }
}
```

> **提示**：使用中间件 `onError` 处理全局错误（认证重定向、toast 提示），在调用处使用 try-catch 处理业务特定的错误。

---

### Connect-RPC 错误

Connect-RPC 支持两种错误响应格式：

- **JSON (Connect)**：标准 Connect 协议，错误由 `connect-es` 自动解析
- **Proto (ProTTP)**：二进制 protobuf 格式，需要 `formatProtoErrorMiddleware` 来获得类型化错误处理

#### JSON 错误 (Connect)

对于 JSON 格式的错误，`connect-es` 会自动处理解析。使用 `parseConnectError` 提取结构化错误信息：

```typescript
import { parseConnectError } from "@theplant/fetch-middleware";

try {
  await client.login(credentials);
} catch (err) {
  const parsed = parseConnectError(err);
  console.log(parsed.code);
  console.log(parsed.message);
}
```

#### Proto 错误 (ProTTP) 与类型化错误类

该库为常见的 HTTP 错误提供类型化错误类。这些错误由 `formatProtoErrorMiddleware` 在处理 Proto (ProTTP) 响应时抛出：

| 错误类                | HTTP 状态码 | 描述                                  |
| --------------------- | ----------- | ------------------------------------- |
| `UnauthorizedError`   | 401         | 需要认证                              |
| `AuthenticationError` | 403         | 权限不足                              |
| `NotFoundError`       | 404         | 资源未找到                            |
| `ValidationError`     | 422         | 验证失败（包含 `errors.fieldErrors`） |
| `ServiceError`        | 500+        | 服务器错误                            |
| `AppError`            | 其他        | 通用应用错误                          |

> **注意**：这些类型化错误只有在使用 `formatProtoErrorMiddleware` 时才会被抛出。请确保在中间件链中包含它。

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  UnauthorizedError,
  ValidationError,
} from "@theplant/fetch-middleware";

// 必须包含 formatProtoErrorMiddleware 才能获得类型化错误
const client = createFetchClient({
  middlewares: [formatProtoErrorMiddleware()],
});

try {
  await fetchData();
} catch (err) {
  if (err instanceof UnauthorizedError) {
    // 处理 401 错误
  } else if (err instanceof ValidationError) {
    // 处理 422 验证错误
    console.log(err.errors.fieldErrors);
  }
}
```

## 高级用法

### 创建自定义中间件

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

const loggingMiddleware = (): Middleware => {
  return async (req, next, ctx) => {
    const start = Date.now();
    console.log(`→ ${req.method} ${req.url}`);
    try {
      const res = await next(req);
      console.log(`← ${res.status} ${req.url} (${Date.now() - start}ms)`);
      return res;
    } catch (error) {
      console.error(`✗ ${req.url}`, error);
      throw error;
    }
  };
};
```

### 中间件顺序很重要

中间件按顺序执行。响应以相反的顺序流动。

```typescript
middlewares: [
  loggingMiddleware(), // 1. 记录请求
  authMiddleware(getToken), // 2. 添加认证头
  extractBodyMiddleware(), // 3. 提取 body（仅 REST）
  jsonResponseMiddleware(), // 4. 解析 JSON
  httpErrorMiddleware({}), // 5. 处理错误
];
```

### 包装现有的自定义 Fetch

如果你的项目中已经有自定义的 fetch 函数，可以使用 `createFetchClient` 包装它来添加中间件支持，同时保持原有的调用方式：

**改造前（没有中间件）：**

```typescript
// 原来的自定义 fetch
function customFetch(url: RequestInfo | URL, options?: RequestInit) {
  const headers = new Headers(options?.headers);
  headers.set("Accept", "application/proto");

  return window
    .fetch(url, {
      ...options,
      headers,
      credentials: "include",
    })
    .catch((err) => {
      throw new NetworkError(err, String(url));
    })
    .then(validateStatus);
}
```

**改造后（支持中间件）：**

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
} from "@theplant/fetch-middleware";

// 创建支持中间件的 fetch 客户端
const fetchClient = createFetchClient({
  middlewares: [
    formatProtoErrorMiddleware(),
    // 根据需要添加更多中间件
  ],
});

// 包装你的自定义 fetch 逻辑
function customFetch(url: RequestInfo | URL, options?: RequestInit) {
  const headers = new Headers(options?.headers);
  headers.set("Accept", "application/proto");

  // 使用 fetchClient 代替 window.fetch
  return fetchClient(url, {
    ...options,
    headers,
    credentials: "include",
  }).catch((err) => {
    throw new NetworkError(err, String(url));
  });
  // 注意：错误处理现在由中间件完成，validateStatus 可能不再需要
}
```

## 设计原则

### 保持 Response 原生

所有中间件都应保留原生 `Response` 对象。

### 双模式支持

`createFetchClient` 函数返回一个混合体，可同时作为 Fetch 处理器（用于库）和 REST 客户端。

## 许可证

ISC
