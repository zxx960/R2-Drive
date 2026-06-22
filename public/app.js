const tokenKey = 'r2-drive-token';

const state = {
  token: localStorage.getItem(tokenKey) || '',
  currentFolderId: null,
  path: [{ id: null, name: '根目录' }]
};

if (!state.token) {
  window.location.replace('/login');
}

const els = {
  trashButton: document.querySelector('#trashButton'),
  logoutButton: document.querySelector('#logoutButton'),
  fileInput: document.querySelector('#fileInput'),
  uploadProgress: document.querySelector('#uploadProgress'),
  uploadProgressName: document.querySelector('#uploadProgressName'),
  uploadProgressPercent: document.querySelector('#uploadProgressPercent'),
  uploadProgressBar: document.querySelector('#uploadProgressBar'),
  folderForm: document.querySelector('#folderForm'),
  folderNameInput: document.querySelector('#folderNameInput'),
  breadcrumbs: document.querySelector('#breadcrumbs'),
  summary: document.querySelector('#summary'),
  notice: document.querySelector('#notice'),
  items: document.querySelector('#items'),
  previewDialog: document.querySelector('#previewDialog'),
  previewTitle: document.querySelector('#previewTitle'),
  previewImage: document.querySelector('#previewImage'),
  previewCloseButton: document.querySelector('#previewCloseButton'),
  videoDialog: document.querySelector('#videoDialog'),
  videoTitle: document.querySelector('#videoTitle'),
  videoPlayer: document.querySelector('#videoPlayer'),
  videoCloseButton: document.querySelector('#videoCloseButton')
};

function headers(extra = {}) {
  const result = {
    'content-type': 'application/json',
    authorization: `Bearer ${state.token}`,
    ...extra
  };

  for (const [key, value] of Object.entries(result)) {
    if (value === undefined) {
      delete result[key];
    }
  }

  return result;
}

function logout() {
  state.token = '';
  localStorage.removeItem(tokenKey);
  window.location.href = '/login';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      logout();
    }
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function showNotice(message, isError = false) {
  els.notice.textContent = message;
  els.notice.classList.toggle('error', isError);
  els.notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    els.notice.hidden = true;
  }, 4200);
}

function setUploadProgress(name, percent, label) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  els.uploadProgress.hidden = false;
  els.uploadProgressName.textContent = name;
  els.uploadProgressPercent.textContent = label || `${safePercent}%`;
  els.uploadProgressBar.style.width = `${safePercent}%`;
}

function hideUploadProgress() {
  els.uploadProgress.hidden = true;
  els.uploadProgressName.textContent = '';
  els.uploadProgressPercent.textContent = '0%';
  els.uploadProgressBar.style.width = '0%';
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function renderBreadcrumbs() {
  els.breadcrumbs.replaceChildren();

  state.path.forEach((part, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crumb';
    button.textContent = part.name;
    button.addEventListener('click', () => {
      state.path = state.path.slice(0, index + 1);
      state.currentFolderId = part.id;
      loadItems();
    });
    els.breadcrumbs.append(button);

    if (index < state.path.length - 1) {
      const separator = document.createElement('span');
      separator.textContent = '/';
      els.breadcrumbs.append(separator);
    }
  });
}

function renderItems(payload) {
  renderBreadcrumbs();
  els.items.replaceChildren();

  const folders = payload.folders || [];
  const files = payload.files || [];
  els.summary.textContent = `${folders.length} 个文件夹，${files.length} 个文件`;

  if (!folders.length && !files.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '这个目录还是空的';
    els.items.append(empty);
    return;
  }

  for (const folder of folders) {
    els.items.append(createItem({
      type: 'folder',
      name: folder.name,
      meta: '文件夹',
      onOpen: () => {
        state.currentFolderId = folder.id;
        state.path.push({ id: folder.id, name: folder.name });
        loadItems();
      },
      actions: [['删除', () => deleteFolder(folder.id, folder.name)]]
    }));
  }

  for (const file of files) {
    const isImage = file.mimeType?.startsWith('image/');
    const isVideo = file.mimeType?.startsWith('video/');
    const fileActions = isImage || isVideo
      ? [
          ['下载', () => downloadFile(file.id)],
          ['分享', () => shareFile(file.id)],
          ['删除', () => deleteFile(file.id)]
        ]
      : [
          ['下载', () => downloadFile(file.id)],
          ['分享', () => shareFile(file.id)],
          ['删除', () => deleteFile(file.id)]
        ];

    const item = createItem({
      type: 'file',
      name: file.name,
      file,
      meta: `${formatBytes(file.size)} · ${file.mimeType || 'unknown'}`,
      onOpen: isImage ? () => previewImage(file) : isVideo ? () => playVideo(file) : undefined,
      actions: fileActions
    });
    els.items.append(item);
    loadThumbnail(item, file);
  }
}

function createItem({ type, name, meta, onOpen, actions = [] }) {
  const row = document.createElement('div');
  row.className = 'item';

  const icon = document.createElement('div');
  icon.className = 'item-icon';
  icon.textContent = type === 'folder' ? '□' : '◆';

  const title = document.createElement(type === 'folder' ? 'button' : 'div');
  title.className = 'item-name';
  title.textContent = name;
  if (type === 'folder') {
    title.type = 'button';
    title.addEventListener('click', onOpen);
  } else if (onOpen) {
    title.tabIndex = 0;
    title.role = 'button';
    title.addEventListener('click', onOpen);
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen();
      }
    });
  }

  const detail = document.createElement('div');
  detail.className = 'item-meta';
  detail.textContent = meta;

  const actionBox = document.createElement('div');
  actionBox.className = 'item-actions';
  for (const [label, handler] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', handler);
    actionBox.append(button);
  }

  row.append(icon, title, detail, actionBox);
  return row;
}

async function fetchProtectedBlobUrl(path) {
  const response = await fetch(path, {
    headers: {
      authorization: `Bearer ${state.token}`
    }
  });

  if (!response.ok) {
    throw new Error(`预览失败：HTTP ${response.status}`);
  }

  return URL.createObjectURL(await response.blob());
}

async function fetchPreviewBlobUrl(file) {
  return fetchProtectedBlobUrl(`/files/${file.id}/preview`);
}

async function fetchThumbnailBlobUrl(file) {
  return fetchProtectedBlobUrl(`/files/${file.id}/thumbnail`);
}

async function loadThumbnail(row, file) {
  if (!file.mimeType?.startsWith('image/') && !(file.mimeType?.startsWith('video/') && file.hasThumbnail)) return;

  const icon = row.querySelector('.item-icon');
  if (!icon) return;

  try {
    const url = file.mimeType.startsWith('video/') ? await fetchThumbnailBlobUrl(file) : await fetchPreviewBlobUrl(file);
    const image = document.createElement('img');
    image.className = 'item-thumb';
    image.alt = file.name;
    image.src = url;
    image.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    if (file.mimeType.startsWith('image/')) {
      image.addEventListener('click', () => previewImage(file));
    } else if (file.mimeType.startsWith('video/')) {
      image.addEventListener('click', () => playVideo(file));
    }

    icon.replaceWith(image);
  } catch {
    // Keep the generic file icon if preview loading fails.
  }
}

async function previewImage(file) {
  try {
    closePreview();
    const url = await fetchPreviewBlobUrl(file);
    els.previewTitle.textContent = file.name;
    els.previewImage.alt = file.name;
    els.previewImage.src = url;
    els.previewImage.dataset.objectUrl = url;
    els.previewDialog.showModal();
  } catch (error) {
    showNotice(error.message, true);
  }
}

function closePreview() {
  clearPreviewImage();
  if (els.previewDialog.open) {
    els.previewDialog.close();
  }
}

function clearPreviewImage() {
  const url = els.previewImage.dataset.objectUrl;
  if (url) {
    URL.revokeObjectURL(url);
  }
  els.previewImage.removeAttribute('src');
  els.previewImage.removeAttribute('data-object-url');
}

async function playVideo(file) {
  try {
    closeVideo();
    const payload = await api(`/files/${file.id}/stream-token`, {
      method: 'GET',
      headers: { 'content-type': undefined }
    });
    els.videoTitle.textContent = file.name;
    els.videoPlayer.src = payload.url;
    els.videoDialog.showModal();
  } catch (error) {
    showNotice(error.message, true);
  }
}

function closeVideo() {
  clearVideo();
  if (els.videoDialog.open) {
    els.videoDialog.close();
  }
}

function clearVideo() {
  els.videoPlayer.pause();
  els.videoPlayer.removeAttribute('src');
  els.videoPlayer.load();
}

async function loadItems() {
  try {
    const query = state.currentFolderId ? `?folderId=${encodeURIComponent(state.currentFolderId)}` : '';
    const payload = await api(`/items${query}`, { method: 'GET', headers: { 'content-type': undefined } });
    renderItems(payload);
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function createFolder(event) {
  event.preventDefault();
  const name = els.folderNameInput.value.trim();
  if (!name) return;

  try {
    await api('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId: state.currentFolderId })
    });
    els.folderNameInput.value = '';
    showNotice('文件夹已创建');
    await loadItems();
  } catch (error) {
    showNotice(error.message, true);
  }
}

function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('视频缩略图生成失败'));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener('error', onError);
    };

    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

async function createVideoThumbnailBlob(file) {
  if (!file.type.startsWith('video/')) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await waitForEvent(video, 'loadedmetadata');
    const targetTime = Number.isFinite(video.duration) && video.duration > 2 ? 1 : 0;

    if (targetTime > 0) {
      video.currentTime = targetTime;
      await waitForEvent(video, 'seeked');
    } else {
      await waitForEvent(video, 'loadeddata');
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);

    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

function uploadToSignedUrl(upload, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);

    for (const [key, value] of Object.entries(upload.headers || {})) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress((event.loaded / event.total) * 100);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`上传到 R2 失败：HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('上传到 R2 失败：网络错误')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
    xhr.send(body);
  });
}

async function uploadFiles(files) {
  els.fileInput.disabled = true;

  for (const [index, file] of files.entries()) {
    try {
      showNotice(`正在上传 ${file.name}`);
      setUploadProgress(`${index + 1}/${files.length} ${file.name}`, 0);
      const mimeType = file.type || 'application/octet-stream';
      const initPayload = await api('/uploads/init', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          folderId: state.currentFolderId,
          size: file.size,
          mimeType
        })
      });

      await uploadToSignedUrl(initPayload.upload, file, (percent) => {
        const label = percent >= 100 ? '正在确认' : undefined;
        setUploadProgress(`${index + 1}/${files.length} ${file.name}`, percent, label);
      });
      setUploadProgress(`${index + 1}/${files.length} ${file.name}`, 100, '正在确认');

      let thumbnailUploaded = false;
      if (initPayload.thumbnailUpload) {
        try {
          setUploadProgress(`正在处理缩略图：${file.name}`, 100, '处理中');
          const thumbnail = await createVideoThumbnailBlob(file);
          if (thumbnail) {
            await uploadToSignedUrl(initPayload.thumbnailUpload, thumbnail);
            thumbnailUploaded = true;
          }
        } catch {
          thumbnailUploaded = false;
        }
      }

      await api(`/uploads/${initPayload.file.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ thumbnailUploaded })
      });

      showNotice(`${file.name} 已上传`);
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  els.fileInput.disabled = false;
  els.fileInput.value = '';
  hideUploadProgress();
  await loadItems();
}

async function downloadFile(fileId) {
  try {
    const payload = await api(`/files/${fileId}/download`, { method: 'GET', headers: { 'content-type': undefined } });
    window.open(payload.url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function shareFile(fileId) {
  try {
    const payload = await api(`/files/${fileId}/share`, {
      method: 'POST',
      body: JSON.stringify({ expiresInSeconds: 86400 })
    });
    const url = `${window.location.origin}/shares/${payload.share.token}`;
    await navigator.clipboard.writeText(url);
    showNotice('文件链接已复制，有效期 24 小时');
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function deleteFile(fileId) {
  if (!window.confirm('将这个文件移入回收站？')) return;

  try {
    await api(`/files/${fileId}`, { method: 'DELETE' });
    showNotice('文件已移入回收站');
    await loadItems();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function deleteFolder(folderId, folderName) {
  if (!window.confirm(`将文件夹「${folderName}」移入回收站？文件夹必须为空。`)) return;

  try {
    await api(`/folders/${folderId}`, { method: 'DELETE' });
    showNotice('文件夹已移入回收站');
    await loadItems();
  } catch (error) {
    const message = error.message === 'Folder is not empty' ? '文件夹不是空的，请先删除里面的内容' : error.message;
    showNotice(message, true);
  }
}

els.trashButton.addEventListener('click', () => {
  window.location.href = '/trash';
});
els.logoutButton.addEventListener('click', logout);
els.previewCloseButton.addEventListener('click', closePreview);
els.previewDialog.addEventListener('close', clearPreviewImage);
els.videoCloseButton.addEventListener('click', closeVideo);
els.videoDialog.addEventListener('close', clearVideo);
els.folderForm.addEventListener('submit', createFolder);
els.fileInput.addEventListener('change', () => uploadFiles(Array.from(els.fileInput.files || [])));

loadItems();
