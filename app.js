const GAS_URL = 'https://script.google.com/macros/s/AKfycbzFW4E0x7v77EzpFC6_A5iUIZbOhVKUdG5R5Fufdv2kiisO-pY-Tg4mn88gDJ5gzzfdxw/exec';
let role = '';
let sessionId = '';

function showModal(title, message) {
  if (document.getElementById('modal').style.display === 'flex') return;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-buttons').innerHTML = '<button id="modal-ok">OK</button>';
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', duration);
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  if (show && !loading) {
    const div = document.createElement('div');
    div.id = 'loading';
    div.textContent = 'Loading...';
    document.body.appendChild(div);
    setTimeout(() => showLoading(false), 10000);
  } else if (!show && loading) {
    loading.remove();
  }
}

async function callGasFunction(functionName, data) {
  console.log(`Calling GAS function: ${functionName}`, data);
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionName, data }),
      mode: 'cors',
      credentials: 'include'
    });
    console.log(`Response status: ${response.status}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}...`);
    }
    const result = await response.json();
    console.log(`Response from ${functionName}:`, result);
    if (result.error) throw new Error(result.error);
    return result.data;
  } catch (error) {
    console.error(`Error in ${functionName}:`, error);
    throw error;
  }
}

async function login() {
  const loginBtn = document.getElementById('login-btn');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) {
    showToast('Please enter username and password');
    return;
  }
  loginBtn.disabled = true;
  showLoading(true);
  try {
    console.log('Login attempt:', { username, password });
    const result = await callGasFunction('validateUser', { username, password });
    showLoading(false);
    if (result.success) {
      role = result.role;
      sessionId = result.sessionId;
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('main-app').style.display = 'block';
      document.getElementById('user-role').textContent = role;
      showToast('Login successful');
    } else {
      showModal('Error', result.message || 'Login failed');
    }
  } catch (error) {
    showLoading(false);
    showModal('Error', error.message || 'Failed to connect to server');
    console.error('Login error:', error);
  } finally {
    loginBtn.disabled = false;
  }
}

function logout() {
  role = '';
  sessionId = '';
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  showToast('Logged out successfully');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('modal-buttons').addEventListener('click', (e) => {
    if (e.target.id === 'modal-ok') closeModal();
  });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/MSS/service-worker.js')
    .then(() => console.log('Service Worker Registered'))
    .catch(err => console.error('Service Worker Error:', err));
}
