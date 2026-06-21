import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  PRESIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  PRESIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300)
});

export const env = envSchema.parse(process.env);

export const r2Endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
