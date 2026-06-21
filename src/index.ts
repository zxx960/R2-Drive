import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSessionToken, requireUser, type AppVariables } from './auth.js';
import { env } from './config.js';
import { collections, publicFile, publicFolder } from './db.js';
import { assertFound, HttpError } from './errors.js';
import { createDownloadUrl, createUploadUrl, deleteObject, headObject, uploadObject } from './r2.js';

const app = new Hono<{ Variables: AppVariables }>();

app.use('*', logger());
app.use('*', cors());
app.get('/static/app.css', serveStatic({ path: './public/app.css' }));
app.get('/static/app.js', serveStatic({ path: './public/app.js' }));
app.get('/static/login.js', serveStatic({ path: './public/login.js' }));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status);
  }

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  if (err instanceof z.ZodError) {
    return c.json({ error: 'Invalid request', details: err.flatten() }, 400);
  }

  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));
app.get('/', serveStatic({ path: './public/index.html' }));
app.get('/login', serveStatic({ path: './public/login.html' }));

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

app.post('/auth/login', async (c) => {
  const body = loginSchema.parse(await c.req.json());

  if (body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) {
    throw new HttpError(401, 'Invalid username or password');
  }

  return c.json({
    token: createSessionToken(body.username),
    user: {
      username: body.username
    }
  });
});

app.get('/auth/me', requireUser, (c) => {
  return c.json({
    user: {
      username: c.get('userId')
    }
  });
});

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.string().uuid().nullable().optional()
});

app.post('/folders', requireUser, async (c) => {
  const userId = c.get('userId');
  const body = createFolderSchema.parse(await c.req.json());
  const { folders } = await collections();
  const now = new Date();

  if (body.parentId) {
    const parent = await folders.findOne({
      id: body.parentId,
      ownerId: userId,
      deletedAt: null
    });
    assertFound(parent, 'Parent folder not found');
  }

  const folder = {
    id: randomUUID(),
    ownerId: userId,
    parentId: body.parentId ?? null,
    name: body.name,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };

  await folders.insertOne(folder);

  return c.json({ folder: publicFolder(folder) }, 201);
});

app.get('/items', requireUser, async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.query('folderId') ?? null;
  const { folders, files } = await collections();

  if (folderId) {
    const folder = await folders.findOne({
      id: folderId,
      ownerId: userId,
      deletedAt: null
    });
    assertFound(folder, 'Folder not found');
  }

  const folderRows = await folders
    .find({ ownerId: userId, parentId: folderId, deletedAt: null })
    .sort({ name: 1 })
    .toArray();

  const fileRows = await files
    .find({ ownerId: userId, folderId, deletedAt: null, status: 'active' })
    .sort({ name: 1 })
    .toArray();

  return c.json({
    folderId,
    folders: folderRows.map(publicFolder),
    files: fileRows.map(publicFile)
  });
});

const initUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  folderId: z.string().uuid().nullable().optional(),
  size: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1).max(255).default('application/octet-stream')
});

const uuidParam = z.string().uuid();

app.post('/uploads/init', requireUser, async (c) => {
  const userId = c.get('userId');
  const body = initUploadSchema.parse(await c.req.json());
  const { folders, files } = await collections();
  const id = randomUUID();
  const key = `users/${userId}/objects/${id}`;
  const now = new Date();

  if (body.folderId) {
    const folder = await folders.findOne({
      id: body.folderId,
      ownerId: userId,
      deletedAt: null
    });
    assertFound(folder, 'Folder not found');
  }

  const uploadUrl = await createUploadUrl(key, body.mimeType);
  const file = {
    id,
    ownerId: userId,
    folderId: body.folderId ?? null,
    name: body.name,
    r2Key: key,
    size: body.size,
    mimeType: body.mimeType,
    etag: null,
    status: 'pending' as const,
    createdAt: now,
    uploadedAt: null,
    updatedAt: now,
    deletedAt: null
  };

  await files.insertOne(file);

  return c.json(
    {
      file: publicFile(file),
      upload: {
        method: 'PUT',
        url: uploadUrl,
        expiresIn: env.PRESIGNED_UPLOAD_TTL_SECONDS,
        headers: {
          'content-type': body.mimeType
        }
      }
    },
    201
  );
});

app.post('/uploads/server', requireUser, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.parseBody();
  const uploaded = body.file;
  const folderIdValue = body.folderId;
  const folderId =
    typeof folderIdValue === 'string' && folderIdValue.length > 0 ? z.string().uuid().parse(folderIdValue) : null;

  if (!(uploaded instanceof File)) {
    throw new HttpError(400, 'Missing file');
  }

  const { folders, files } = await collections();
  const id = randomUUID();
  const key = `users/${userId}/objects/${id}`;
  const now = new Date();

  if (folderId) {
    const folder = await folders.findOne({
      id: folderId,
      ownerId: userId,
      deletedAt: null
    });
    assertFound(folder, 'Folder not found');
  }

  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  const mimeType = uploaded.type || 'application/octet-stream';
  const object = await uploadObject(key, mimeType, bytes);

  const file = {
    id,
    ownerId: userId,
    folderId,
    name: uploaded.name,
    r2Key: key,
    size: uploaded.size,
    mimeType,
    etag: object.ETag ?? null,
    status: 'active' as const,
    createdAt: now,
    uploadedAt: now,
    updatedAt: now,
    deletedAt: null
  };

  await files.insertOne(file);

  return c.json({ file: publicFile(file) }, 201);
});

app.post('/uploads/:fileId/complete', requireUser, async (c) => {
  const userId = c.get('userId');
  const fileId = uuidParam.parse(c.req.param('fileId'));
  const { files } = await collections();

  const pendingFile = await files.findOne({
    id: fileId,
    ownerId: userId,
    status: 'pending',
    deletedAt: null
  });
  const file = assertFound(pendingFile, 'Pending upload not found');

  const object = await headObject(file.r2Key);
  const now = new Date();

  await files.updateOne(
    { id: fileId, ownerId: userId },
    {
      $set: {
        status: 'active',
        size: object.ContentLength ?? file.size,
        etag: object.ETag ?? null,
        uploadedAt: now,
        updatedAt: now
      }
    }
  );

  const updated = await files.findOne({ id: fileId, ownerId: userId });

  return c.json({ file: publicFile(assertFound(updated, 'File not found')) });
});

app.get('/files/:fileId/download', requireUser, async (c) => {
  const userId = c.get('userId');
  const fileId = uuidParam.parse(c.req.param('fileId'));
  const { files } = await collections();

  const activeFile = await files.findOne({
    id: fileId,
    ownerId: userId,
    status: 'active',
    deletedAt: null
  });
  const file = assertFound(activeFile, 'File not found');

  return c.json({
    url: await createDownloadUrl(file.r2Key, file.name),
    expiresIn: env.PRESIGNED_DOWNLOAD_TTL_SECONDS
  });
});

const patchFileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional()
});

app.patch('/files/:fileId', requireUser, async (c) => {
  const userId = c.get('userId');
  const fileId = uuidParam.parse(c.req.param('fileId'));
  const body = patchFileSchema.parse(await c.req.json());
  const { folders, files } = await collections();

  if (body.folderId) {
    const folder = await folders.findOne({
      id: body.folderId,
      ownerId: userId,
      deletedAt: null
    });
    assertFound(folder, 'Folder not found');
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (Object.hasOwn(body, 'folderId')) updates.folderId = body.folderId ?? null;

  const result = await files.findOneAndUpdate(
    { id: fileId, ownerId: userId, deletedAt: null },
    { $set: updates },
    { returnDocument: 'after' }
  );

  return c.json({ file: publicFile(assertFound(result, 'File not found')) });
});

app.delete('/files/:fileId', requireUser, async (c) => {
  const userId = c.get('userId');
  const fileId = uuidParam.parse(c.req.param('fileId'));
  const hard = c.req.query('hard') === 'true';
  const { files } = await collections();

  const result = await files.findOneAndUpdate(
    { id: fileId, ownerId: userId, deletedAt: null },
    {
      $set: {
        deletedAt: new Date(),
        status: 'trashed',
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  const file = assertFound(result, 'File not found');

  if (hard) {
    await deleteObject(file.r2Key);
  }

  return c.json({ ok: true, hardDeleted: hard });
});

const createShareSchema = z.object({
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 30).optional()
});

app.post('/files/:fileId/share', requireUser, async (c) => {
  const userId = c.get('userId');
  const fileId = uuidParam.parse(c.req.param('fileId'));
  const body = createShareSchema.parse(await c.req.json().catch(() => ({})));
  const { files, shares } = await collections();
  const token = randomUUID().replaceAll('-', '');

  const activeFile = await files.findOne({
    id: fileId,
    ownerId: userId,
    status: 'active',
    deletedAt: null
  });
  assertFound(activeFile, 'File not found');

  const share = {
    id: randomUUID(),
    fileId,
    token,
    expiresAt: body.expiresInSeconds ? new Date(Date.now() + body.expiresInSeconds * 1000) : null,
    createdAt: new Date()
  };

  await shares.insertOne(share);

  return c.json(
    {
      share: {
        token: share.token,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt
      }
    },
    201
  );
});

app.get('/shares/:token', async (c) => {
  const token = c.req.param('token');
  const { files, shares } = await collections();
  const now = new Date();

  const shareDoc = await shares.findOne({
    token,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  });
  const share = assertFound(shareDoc, 'Share not found or expired');

  const activeFile = await files.findOne({
    id: share.fileId,
    status: 'active',
    deletedAt: null
  });
  const file = assertFound(activeFile, 'Share not found or expired');

  return c.json({
    url: await createDownloadUrl(file.r2Key, file.name),
    expiresIn: env.PRESIGNED_DOWNLOAD_TTL_SECONDS
  });
});

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    console.log(`r2-drive API listening on http://localhost:${info.port}`);
  }
);
