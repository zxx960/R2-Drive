const tokenKey = 'r2-drive-token';

const els = {
  loginForm: document.querySelector('#loginForm'),
  usernameInput: document.querySelector('#usernameInput'),
  passwordInput: document.querySelector('#passwordInput'),
  loginNotice: document.querySelector('#loginNotice')
};

function showLoginNotice(message) {
  els.loginNotice.textContent = message;
  els.loginNotice.hidden = false;
}

async function login(event) {
  event.preventDefault();
  els.loginNotice.hidden = true;

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: els.usernameInput.value.trim(),
        password: els.passwordInput.value
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || '登录失败');
    }

    localStorage.setItem(tokenKey, payload.token);
    window.location.href = '/';
  } catch (error) {
    showLoginNotice(error.message);
  }
}

if (localStorage.getItem(tokenKey)) {
  window.location.replace('/');
}

els.loginForm.addEventListener('submit', login);
