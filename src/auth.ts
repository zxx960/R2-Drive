import type { Context, Next } from 'hono';
import { HttpError } from './errors.js';

export type AppVariables = {
  userId: string;
};

export async function requireUser(c: Context<{ Variables: AppVariables }>, next: Next) {
  const userId = c.req.header('x-user-id');

  if (!userId) {
    throw new HttpError(401, 'Missing x-user-id header');
  }

  c.set('userId', userId);
  await next();
}
