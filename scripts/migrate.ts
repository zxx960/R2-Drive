import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { z } from 'zod';

const env = z
  .object({
    DATABASE_URL: z.string().min(1)
  })
  .parse(process.env);

function databaseNameFromUrl(url: string) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '').split('?')[0];
  return name || 'r2_drive';
}

const client = new MongoClient(env.DATABASE_URL);

try {
  await client.connect();
  const db = client.db(databaseNameFromUrl(env.DATABASE_URL));

  await db.collection('folders').createIndexes([
    {
      key: { ownerId: 1, parentId: 1, name: 1 },
      name: 'folders_unique_active_name',
      unique: true,
      partialFilterExpression: { deletedAt: null }
    },
    { key: { ownerId: 1, parentId: 1 }, name: 'folders_owner_parent' }
  ]);

  await db.collection('files').createIndexes([
    { key: { r2Key: 1 }, name: 'files_r2_key_unique', unique: true },
    { key: { ownerId: 1, folderId: 1, status: 1 }, name: 'files_owner_folder_status' }
  ]);

  await db.collection('shares').createIndexes([
    { key: { token: 1 }, name: 'shares_token_unique', unique: true },
    { key: { fileId: 1 }, name: 'shares_file_id' },
    { key: { expiresAt: 1 }, name: 'shares_expires_at' }
  ]);

  console.log('MongoDB indexes created');
} finally {
  await client.close();
}
