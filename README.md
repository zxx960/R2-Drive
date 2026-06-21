# R2 Drive

A personal cloud drive built with Hono, MongoDB, and Cloudflare R2.

## Features

- Single-user login with credentials from environment variables.
- Folder creation, navigation, deletion, restore, and permanent deletion.
- File upload, download, rename/move, delete, restore, and permanent deletion.
- Trash page separated from the main drive page.
- Browser direct upload to R2 with presigned PUT URLs.
- Image thumbnails and click-to-preview.
- Video thumbnails generated in the browser during upload when possible.
- Video playback through the app with signed short-lived stream URLs and HTTP Range support.
- Share links with optional expiration.

## Pages

- `http://localhost:3000/login` - login page
- `http://localhost:3000/` - main drive
- `http://localhost:3000/trash` - trash

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

5. Set the login credentials:

   ```text
   ADMIN_USERNAME=user
   ADMIN_PASSWORD=change-this-password
   SESSION_SECRET=replace-with-a-long-random-string
   ```

6. Create database indexes:

   ```bash
   npm run db:migrate
   ```

7. Start the app:

   ```bash
   npm run dev
   ```

## R2 CORS

Direct browser uploads require CORS on the R2 bucket. For local development:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Add your production domain to `AllowedOrigins` after deployment.

## Upload Flow

The app does not send file bytes through the backend for normal uploads.

1. The frontend calls `POST /uploads/init`.
2. The backend creates a pending database row and returns a presigned R2 `PUT` URL.
3. The frontend uploads the file directly to R2.
4. For videos, the frontend tries to capture a local thumbnail and uploads it to R2 with a second presigned URL.
5. The frontend calls `POST /uploads/{fileId}/complete`.
6. The backend verifies the object with `HeadObject` and marks the file active.

This is much safer for large files than buffering uploads in the Node process.

## API Overview

Log in:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "content-type: application/json" \
  -d "{\"username\":\"user\",\"password\":\"your-password\"}"
```

List items:

```bash
curl http://localhost:3000/items \
  -H "authorization: Bearer <token>"
```

Create a folder:

```bash
curl -X POST http://localhost:3000/folders \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{\"name\":\"Photos\"}"
```

Initialize an upload:

```bash
curl -X POST http://localhost:3000/uploads/init \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{\"name\":\"hello.txt\",\"size\":12,\"mimeType\":\"text/plain\"}"
```

Upload the file bytes using the returned signed `PUT` URL, then complete the upload:

```bash
curl -X POST http://localhost:3000/uploads/{fileId}/complete \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{}"
```

Get a signed download URL:

```bash
curl http://localhost:3000/files/{fileId}/download \
  -H "authorization: Bearer <token>"
```

Get a signed video stream URL:

```bash
curl http://localhost:3000/files/{fileId}/stream-token \
  -H "authorization: Bearer <token>"
```

Create a share link token:

```bash
curl -X POST http://localhost:3000/files/{fileId}/share \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{\"expiresInSeconds\":86400}"
```

Resolve a share token:

```bash
curl http://localhost:3000/shares/{token}
```

## Large Files

Direct upload avoids backend memory pressure, but the current upload is still a single `PUT`. Very large files can fail if the network disconnects because the whole object must be retried.

For multi-GB files, the next improvement should be multipart upload: split the file into parts, upload parts independently, retry failed parts, then complete the multipart upload.
