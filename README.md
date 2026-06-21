# R2 Drive

A small cloud drive API built with Hono, MongoDB, and Cloudflare R2.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Start MongoDB locally or use an existing MongoDB instance, then fill `DATABASE_URL`.

   Local default:

   ```text
   DATABASE_URL=mongodb://localhost:27017/r2_drive
   ```

4. Create a Cloudflare R2 bucket and R2 API token, then fill:

   ```text
   R2_ACCOUNT_ID
   R2_ACCESS_KEY_ID
   R2_SECRET_ACCESS_KEY
   R2_BUCKET
   ```

5. Create database indexes:

   ```bash
   npm run db:migrate
   ```

6. Start the API:

   ```bash
   npm run dev
   ```

## Auth placeholder

The MVP uses `x-user-id` as a temporary identity header.

```bash
curl http://localhost:3000/items -H "x-user-id: demo-user"
```

Replace `src/auth.ts` with JWT/session validation before production.

## API overview

Create a folder:

```bash
curl -X POST http://localhost:3000/folders \
  -H "content-type: application/json" \
  -H "x-user-id: demo-user" \
  -d "{\"name\":\"Photos\"}"
```

Initialize an upload:

```bash
curl -X POST http://localhost:3000/uploads/init \
  -H "content-type: application/json" \
  -H "x-user-id: demo-user" \
  -d "{\"name\":\"hello.txt\",\"size\":12,\"mimeType\":\"text/plain\"}"
```

Upload the file bytes using the returned signed PUT URL. Then complete the upload:

```bash
curl -X POST http://localhost:3000/uploads/{fileId}/complete \
  -H "x-user-id: demo-user"
```

List items:

```bash
curl http://localhost:3000/items -H "x-user-id: demo-user"
```

Get a signed download URL:

```bash
curl http://localhost:3000/files/{fileId}/download -H "x-user-id: demo-user"
```

Create a share link token:

```bash
curl -X POST http://localhost:3000/files/{fileId}/share \
  -H "content-type: application/json" \
  -H "x-user-id: demo-user" \
  -d "{\"expiresInSeconds\":86400}"
```

Resolve a share token:

```bash
curl http://localhost:3000/shares/{token}
```
