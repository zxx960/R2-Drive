# R2 Drive

一个基于 Hono、MongoDB 和 Cloudflare R2 的个人网盘应用。

## 功能

- 使用环境变量配置单用户登录账号。
- 支持文件夹创建、进入、删除、恢复和彻底删除。
- 支持文件上传、下载、重命名/移动、删除、恢复和彻底删除。
- 首页和回收站页面分离。
- 浏览器通过预签名 `PUT` URL 直接上传文件到 R2。
- 图片支持缩略图和点击预览。
- 视频上传时会尽量在浏览器本地生成缩略图。
- 视频支持在线播放，后端提供短期签名播放地址，并支持 HTTP Range 分段读取。
- 支持创建带过期时间的分享链接。

## 页面入口

- `http://localhost:3000/login` - 登录页
- `http://localhost:3000/` - 网盘首页
- `http://localhost:3000/trash` - 回收站

## 本地启动

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制环境变量文件：

   ```bash
   cp .env.example .env
   ```

3. 启动本地 MongoDB，或者使用已有 MongoDB 实例，然后填写 `DATABASE_URL`。

   ```text
   DATABASE_URL=mongodb://localhost:27017/r2_drive
   ```

4. 创建 Cloudflare R2 存储桶和 R2 API Token，然后填写：

   ```text
   R2_ACCOUNT_ID
   R2_ACCESS_KEY_ID
   R2_SECRET_ACCESS_KEY
   R2_BUCKET
   ```

5. 设置登录账号和会话密钥：

   ```text
   ADMIN_USERNAME=user
   ADMIN_PASSWORD=change-this-password
   SESSION_SECRET=replace-with-a-long-random-string
   ```

6. 创建数据库索引：

   ```bash
   npm run db:migrate
   ```

7. 启动应用：

   ```bash
   npm run dev
   ```

## R2 CORS

浏览器直传 R2 需要在 R2 存储桶上配置 CORS。本地开发可以使用下面的配置：

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

部署到服务器后，把你的正式域名也加入 `AllowedOrigins`。

## 上传流程

正常上传时，文件内容不会经过后端 Node 进程。

1. 前端调用 `POST /uploads/init`。
2. 后端创建一条 `pending` 状态的数据库记录，并返回 R2 预签名 `PUT` URL。
3. 前端直接把文件上传到 R2。
4. 如果是视频，前端会尝试在本地截取缩略图，并使用第二个预签名 URL 上传到 R2。
5. 前端调用 `POST /uploads/{fileId}/complete`。
6. 后端通过 `HeadObject` 校验 R2 对象存在，然后把文件标记为 `active`。

这种方式比把文件先传到后端再转发到 R2 更适合大文件，不会让 Node 进程承受文件内存压力。

## API 概览

登录：

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "content-type: application/json" \
  -d "{\"username\":\"user\",\"password\":\"your-password\"}"
```

列出当前目录：

```bash
curl http://localhost:3000/items \
  -H "authorization: Bearer <token>"
```

创建文件夹：

```bash
curl -X POST http://localhost:3000/folders \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{\"name\":\"Photos\"}"
```

初始化上传：

```bash
curl -X POST http://localhost:3000/uploads/init \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{\"name\":\"hello.txt\",\"size\":12,\"mimeType\":\"text/plain\"}"
```

使用返回的签名 `PUT` URL 上传文件内容，然后完成上传：

```bash
curl -X POST http://localhost:3000/uploads/{fileId}/complete \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{}"
```

获取签名下载地址：

```bash
curl http://localhost:3000/files/{fileId}/download \
  -H "authorization: Bearer <token>"
```

获取签名视频播放地址：

```bash
curl http://localhost:3000/files/{fileId}/stream-token \
  -H "authorization: Bearer <token>"
```

创建分享链接 token：

```bash
curl -X POST http://localhost:3000/files/{fileId}/share \
  -H "content-type: application/json" \
  -H "authorization: Bearer <token>" \
  -d "{\"expiresInSeconds\":86400}"
```

打开分享链接：

```bash
curl http://localhost:3000/shares/{token}
```

## 大文件说明

直传 R2 可以避免后端内存压力，但当前上传仍然是单次 `PUT`。如果文件特别大，上传过程中网络断开时，需要重新上传整个对象。

如果要更稳定地支持几个 GB 甚至更大的文件，下一步建议接入 multipart upload：把文件拆成多个分片独立上传，失败时只重试失败分片，最后再合并完成上传。
