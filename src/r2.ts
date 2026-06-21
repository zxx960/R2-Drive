import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, r2Endpoint } from './config.js';

export const s3 = new S3Client({
  region: 'auto',
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  }
});

export async function createUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType
  });

  return getSignedUrl(s3, command, {
    expiresIn: env.PRESIGNED_UPLOAD_TTL_SECONDS
  });
}

export async function uploadObject(key: string, contentType: string, body: Uint8Array) {
  return s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      Body: body
    })
  );
}

export async function createDownloadUrl(key: string, filename: string) {
  const safeFilename = filename.replaceAll('"', '');
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`
  });

  return getSignedUrl(s3, command, {
    expiresIn: env.PRESIGNED_DOWNLOAD_TTL_SECONDS
  });
}

export async function headObject(key: string) {
  return s3.send(
    new HeadObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key
    })
  );
}

export async function deleteObject(key: string) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key
    })
  );
}
