import type { Context, Next } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './config.js';
import { HttpError } from './errors.js';

export type AppVariables = {
  userId: string;
};

const tokenTtlSeconds = 60 * 60 * 24 * 7;

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string) {
  return createHmac('sha256', env.SESSION_SECRET).update(data).digest('base64url');
}

export function createSessionToken(username: string) {
  const payload = {
    sub: username,
    exp: Math.floor(Date.now() / 1000) + tokenTtlSeconds
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(token: string) {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    throw new HttpError(401, 'Invalid session');
  }

  const expected = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new HttpError(401, 'Invalid session');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    sub?: string;
    exp?: number;
  };

  if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'Session expired');
  }

  return payload.sub;
}

export async function requireUser(c: Context<{ Variables: AppVariables }>, next: Next) {
  const authorization = c.req.header('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;

  if (!token) {
    throw new HttpError(401, 'Missing authorization token');
  }

  const userId = verifySessionToken(token);
  c.set('userId', userId);
  await next();
}
