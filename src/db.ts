import { MongoClient, type Collection, type Db } from 'mongodb';
import { env } from './config.js';

export type FolderDoc = {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type FileDoc = {
  id: string;
  ownerId: string;
  folderId: string | null;
  name: string;
  r2Key: string;
  size: number;
  mimeType: string;
  etag: string | null;
  thumbnailKey?: string | null;
  status: 'pending' | 'active' | 'trashed';
  createdAt: Date;
  uploadedAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ShareDoc = {
  id: string;
  fileId: string;
  token: string;
  expiresAt: Date | null;
  createdAt: Date;
};

const client = new MongoClient(env.DATABASE_URL);
let dbPromise: Promise<Db> | null = null;

function databaseNameFromUrl(url: string) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '').split('?')[0];
  return name || 'r2_drive';
}

export async function getDb() {
  dbPromise ??= client.connect().then(() => client.db(databaseNameFromUrl(env.DATABASE_URL)));
  return dbPromise;
}

export async function collections(): Promise<{
  folders: Collection<FolderDoc>;
  files: Collection<FileDoc>;
  shares: Collection<ShareDoc>;
}> {
  const db = await getDb();

  return {
    folders: db.collection<FolderDoc>('folders'),
    files: db.collection<FileDoc>('files'),
    shares: db.collection<ShareDoc>('shares')
  };
}

export function publicFolder(folder: FolderDoc) {
  return {
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    createdAt: folder.createdAt,
    deletedAt: folder.deletedAt
  };
}

export function publicFile(file: FileDoc) {
  return {
    id: file.id,
    folderId: file.folderId,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    hasThumbnail: Boolean(file.thumbnailKey),
    status: file.status,
    createdAt: file.createdAt,
    uploadedAt: file.uploadedAt,
    deletedAt: file.deletedAt
  };
}
