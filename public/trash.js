const tokenKey = 'r2-drive-token';

const state = {
  token: localStorage.getItem(tokenKey) || ''
};

if (!state.token) {
  window.location.replace('/login');
}

const els = {
  homeButton: document.querySelector('#homeButton'),
  logoutButton: document.querySelector('#logoutButton'),
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

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

function renderItems(payload) {
  els.items.replaceChildren();

  const folders = payload.folders || [];
  const files = payload.files || [];
  els.summary.textContent = `${folders.length} 个已删除文件夹，${files.length} 个已删除文件`;

  if (!folders.length && !files.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '回收站是空的';
    els.items.append(empty);
    return;
  }

  for (const folder of folders) {
    els.items.append(createItem({
      type: 'folder',
      name: folder.name,
      meta: `已删除 · ${formatDate(folder.deletedAt)}`,
      actions: [
        ['恢复', () => restoreFolder(folder.id)],
        ['永久删除', () => permanentDeleteFolder(folder.id, folder.name)]
      ]
    }));
  }

  for (const file of files) {
    els.items.append(createItem({
      type: 'file',
      name: file.name,
      meta: `${formatBytes(file.size)} · 已删除 · ${formatDate(file.deletedAt)}`,
      actions: [
        ['恢复', () => restoreFile(file.id)],
        ['永久删除', () => permanentDeleteFile(file.id, file.name)]
      ]
    }));
  }
}

function createItem({ type, name, meta, actions = [] }) {
  const row = document.createElement('div');
  row.className = 'item';

  const icon = document.createElement('div');
  icon.className = 'item-icon';
  icon.textContent = type === 'folder' ? '□' : '◆';

  const title = document.createElement('div');
  title.className = 'item-name';
  title.textContent = name;

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

async function loadTrash() {
  try {
    const payload = await api('/api/trash', { method: 'GET', headers: { 'content-type': undefined } });
    renderItems(payload);
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function restoreFile(fileId) {
  try {
    await api(`/files/${fileId}/restore`, { method: 'POST' });
    showNotice('文件已恢复');
    await loadTrash();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function permanentDeleteFile(fileId, fileName) {
  if (!window.confirm(`永久删除文件「${fileName}」？R2 中的对象也会一起删除。`)) return;

  try {
    await api(`/files/${fileId}/permanent`, { method: 'DELETE' });
    showNotice('文件已永久删除');
    await loadTrash();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function restoreFolder(folderId) {
  try {
    await api(`/folders/${folderId}/restore`, { method: 'POST' });
    showNotice('文件夹已恢复');
    await loadTrash();
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
    await loadTrash();
  } catch (error) {
    const message = error.message === 'Folder is not empty' ? '文件夹不是空的，请先永久删除里面的内容' : error.message;
    showNotice(message, true);
  }
}

els.homeButton.addEventListener('click', () => {
  window.location.href = '/';
});
els.logoutButton.addEventListener('click', logout);

loadTrash();
