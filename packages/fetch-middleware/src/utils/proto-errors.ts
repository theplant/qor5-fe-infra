import { fromBinary } from "@bufbuild/protobuf";
import type { ValidationError as TValidationError } from "../proto/spec_pb";
import { ValidationErrorSchema } from "../proto/spec_pb";
import { ConnectError } from "@connectrpc/connect";
import {
  ErrorInfoSchema,
  BadRequestSchema,
  LocalizedMessageSchema,
} from "../proto/google/rpc/error_details_pb";

/**
 * Base class for HTTP errors with ValidationError details
 * These errors are thrown by the middleware and will be wrapped by ConnectError
 */

/**
 * HTTP error with status code and ValidationError details
 */
export class HttpError extends Error {
  readonly errors: TValidationError;

  constructor(
    readonly status: number,
    url: string,
    responseBody: Uint8Array,
  ) {
    super(`HTTP error on ${url}: ${status}`);
    this.name = "HttpError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/**
 * 401 - Unauthorized error
 */
export class UnauthorizedError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Unauthorized error on ${url}`);
    this.name = "UnauthorizedError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * 403 - Authentication error
 */
export class AuthenticationError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Authentication error on ${url}`);
    this.name = "AuthenticationError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * 404 - Not found error
 */
export class NotFoundError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Not found error on ${url}`);
    this.name = "NotFoundError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 422 - Validation error with protobuf details
 */
export class ValidationError extends Error {
  readonly errors: TValidationError;

  constructor(responseBody: Uint8Array, url: string) {
    super(`Validation error on ${url}`);
    this.name = "ValidationError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * >= 500 - Service error
 */
export class ServiceError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Service error on ${url}`);
    this.name = "ServiceError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

/**
 * Generic application error
 */
export class AppError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`App error on ${url}`);
    this.name = "AppError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Network error
 */
export class NetworkError extends Error {
  constructor(
    readonly cause: Error,
    url: string,
  ) {
    super(`Network error on ${url}: ${cause.message}`);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Parse ConnectError into structured error information
 * Similar to the error handling in ConnectComponent.tsx
 *
 * For Proto errors (ProTTP): Extracts ValidationError from custom error classes
 * For JSON errors (Connect): Uses ConnectError.findDetails to extract error info
 *
 * @example
 * ```ts
 * try {
 *   await client.login(credentials)
 * } catch (err) {
 *   const parsed = parseConnectError(err)
 *   console.log(parsed.code)              // Connect error code
 *   console.log(parsed.message)           // Error message
 *   console.log(parsed.validationError)   // ValidationError (if available)
 * }
 * ```
 */
export function parseConnectError(err: any) {
  // Convert any error to ConnectError
  // This wraps our custom errors and preserves them in the cause chain
  const connectErr = ConnectError.from(err);
  return {
    code: connectErr.code,
    message: connectErr.message,
    localizedMessage: connectErr.findDetails(LocalizedMessageSchema)[0]
      ?.message,
    errorInfo: connectErr.findDetails(ErrorInfoSchema)[0],
    badRequest: connectErr.findDetails(BadRequestSchema)[0],
    cause: connectErr.cause,
  };
}
