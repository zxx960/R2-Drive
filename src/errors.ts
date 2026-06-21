import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    message: string
  ) {
    super(message);
  }
}

export function assertFound<T>(value: T | null | undefined, message = 'Not found'): T {
  if (!value) {
    throw new HttpError(404, message);
  }

  return value;
}
