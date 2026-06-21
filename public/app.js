const tokenKey = 'r2-drive-token';

const state = {
  token: localStorage.getItem(tokenKey) || '',
  currentFolderId: null,
  path: [{ id: null, name: '根目录' }],
  view: 'files'
};

if (!state.token) {
  window.location.replace('/login');
}

const els = {
  trashButton: document.querySelector('#trashButton'),
  logoutButton: document.querySelector('#logoutButton'),
  fileInput: document.querySelector('#fileInput'),
  folderForm: document.querySelector('#folderForm'),
  folderNameInput: document.querySelector('#folderNameInput'),
  breadcrumbs: document.querySelector('#breadcrumbs'),
  summary: document.querySelector('#summary'),
  notice: document.querySelector('#notice'),
  items: document.querySelector('#items')
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

  if (state.view === 'trash') {
    els.breadcrumbs.textContent = '回收站';
    return;
  }

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
  els.summary.textContent =
    state.view === 'trash'
      ? `${folders.length} 个已删除文件夹，${files.length} 个已删除文件`
      : `${folders.length} 个文件夹，${files.length} 个文件`;

  els.folderForm.hidden = state.view === 'trash';
  els.fileInput.disabled = state.view === 'trash';

  if (!folders.length && !files.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.view === 'trash' ? '回收站是空的' : '这个目录还是空的';
    els.items.append(empty);
    return;
  }

  for (const folder of folders) {
    const folderActions =
      state.view === 'trash'
        ? [
            ['恢复', () => restoreFolder(folder.id)],
            ['永久删除', () => permanentDeleteFolder(folder.id, folder.name)]
          ]
        : [['删除', () => deleteFolder(folder.id, folder.name)]];

    els.items.append(createItem({
      type: 'folder',
      name: folder.name,
      meta: state.view === 'trash' ? `已删除 · ${formatDate(folder.deletedAt)}` : '文件夹',
      onOpen: () => {
        if (state.view === 'trash') return;
        state.currentFolderId = folder.id;
        state.path.push({ id: folder.id, name: folder.name });
        loadItems();
      },
      actions: folderActions
    }));
  }

  for (const file of files) {
    const fileActions =
      state.view === 'trash'
        ? [
            ['恢复', () => restoreFile(file.id)],
            ['永久删除', () => permanentDeleteFile(file.id, file.name)]
          ]
        : [
            ['下载', () => downloadFile(file.id)],
            ['分享', () => shareFile(file.id)],
            ['删除', () => deleteFile(file.id)]
          ];

    els.items.append(createItem({
      type: 'file',
      name: file.name,
      meta:
        state.view === 'trash'
          ? `${formatBytes(file.size)} · 已删除 · ${formatDate(file.deletedAt)}`
          : `${formatBytes(file.size)} · ${file.mimeType || 'unknown'}`,
      actions: fileActions
    }));
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

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

async function loadItems() {
  try {
    const query = state.currentFolderId ? `?folderId=${encodeURIComponent(state.currentFolderId)}` : '';
    const path = state.view === 'trash' ? '/trash' : `/items${query}`;
    const payload = await api(path, { method: 'GET', headers: { 'content-type': undefined } });
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

async function uploadFiles(files) {
  for (const file of files) {
    try {
      showNotice(`正在上传 ${file.name}`);
      const formData = new FormData();
      formData.append('file', file);
      if (state.currentFolderId) {
        formData.append('folderId', state.currentFolderId);
      }

      const response = await fetch('/uploads/server', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${state.token}`
        },
        body: formData
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || `上传失败：HTTP ${response.status}`);
      }

      showNotice(`${file.name} 已上传`);
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  els.fileInput.value = '';
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
    showNotice('分享链接已复制，有效期 24 小时');
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

async function restoreFile(fileId) {
  try {
    await api(`/files/${fileId}/restore`, { method: 'POST' });
    showNotice('文件已恢复');
    await loadItems();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function permanentDeleteFile(fileId, fileName) {
  if (!window.confirm(`永久删除文件「${fileName}」？R2 中的对象也会一起删除。`)) return;

  try {
    await api(`/files/${fileId}/permanent`, { method: 'DELETE' });
    showNotice('文件已永久删除');
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

async function restoreFolder(folderId) {
  try {
    await api(`/folders/${folderId}/restore`, { method: 'POST' });
    showNotice('文件夹已恢复');
    await loadItems();
  } catch (error) {
    const message =
      error.message === 'A folder with this name already exists' ? '同名文件夹已存在，无法恢复' : error.message;
    showNotice(message, true);
  }
}

async function permanentDeleteFolder(folderId, folderName) {
  if (!window.confirm(`永久删除文件夹「${folderName}」？文件夹必须为空。`)) return;

  try {
    await api(`/folders/${folderId}/permanent`, { method: 'DELETE' });
    showNotice('文件夹已永久删除');
    await loadItems();
  } catch (error) {
    const message = error.message === 'Folder is not empty' ? '文件夹不是空的，请先永久删除里面的内容' : error.message;
    showNotice(message, true);
  }
}

els.trashButton.addEventListener('click', () => {
  state.view = 'trash';
  state.currentFolderId = null;
  state.path = [{ id: null, name: '根目录' }];
  loadItems();
});
els.logoutButton.addEventListener('click', logout);
els.folderForm.addEventListener('submit', createFolder);
els.fileInput.addEventListener('change', () => uploadFiles(Array.from(els.fileInput.files || [])));

loadItems();
