const GAS_URL = 'https://script.google.com/macros/s/AKfycbzFW4E0x7v77EzpFC6_A5iUIZbOhVKUdG5R5Fufdv2kiisO-pY-Tg4mn88gDJ5gzzfdxw/exec';
let role = '';
let sessionId = '';
let inventoryData = [];

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

function callGasFunction(functionName, data) {
  console.log(`Calling GAS function: ${functionName}`, data);
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonpCallback_' + Math.random().toString(36).substr(2);
    window[callbackName] = function(response) {
      delete window[callbackName];
      document.body.removeChild(script);
      if (response.error) {
        console.error(`Error in ${functionName}:`, response.error);
        reject(new Error(response.error));
      } else {
        console.log(`Response from ${functionName}:`, response);
        resolve(response.data);
      }
    };
    const script = document.createElement('script');
    const url = `${GAS_URL}?callback=${callbackName}&functionName=${encodeURIComponent(functionName)}&data=${encodeURIComponent(JSON.stringify(data))}`;
    script.src = url;
    script.onerror = () => {
      delete window[callbackName];
      document.body.removeChild(script);
      console.error(`Error in ${functionName}: Script load failed`);
      reject(new Error('Script load failed'));
    };
    document.body.appendChild(script);
  });
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
      document.getElementById('nav-bar').classList.add('active');
      if (role === 'Admin') {
        document.getElementById('inventory-btn').style.display = 'block';
      }
      showSection('inventory-section');
      showToast('Login successful');
      loadInventory();
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
  inventoryData = [];
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('nav-bar').classList.remove('active');
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  showToast('Logged out successfully');
}

function showSection(sectionId) {
  document.querySelectorAll('#main-app > div').forEach(section => section.classList.add('hidden'));
  document.getElementById(sectionId).classList.remove('hidden');
  if (sectionId === 'inventory-section') {
    loadInventory();
  }
}

async function loadInventory() {
  if (!sessionId) {
    showModal('Error', 'Session expired. Please log in.');
    logout();
    return;
  }
  showLoading(true);
  try {
    const result = await callGasFunction('getInventory', { sessionId });
    showLoading(false);
    if (result.success) {
      inventoryData = result.data;
      updateInventoryTable();
    } else {
      showModal('Error', result.message || 'Failed to load inventory');
      if (result.message === 'Invalid session') logout();
    }
  } catch (error) {
    showLoading(false);
    showModal('Error', error.message || 'Failed to load inventory');
    console.error('Inventory load error:', error);
  }
}

function updateInventoryTable() {
  const tbody = document.getElementById('inventory-table').getElementsByTagName('tbody')[0];
  tbody.innerHTML = '';
  inventoryData.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.unitPrice.toFixed(2)}</td>
      <td>${item.stock}</td>
    `;
    tbody.appendChild(row);
  });
}

async function addMedicine() {
  if (!sessionId) {
    showModal('Error', 'Session expired. Please log in.');
    logout();
    return;
  }
  const name = document.getElementById('medicine-name').value.trim();
  const unitPrice = parseFloat(document.getElementById('unit-price').value) || 0;
  const stock = parseInt(document.getElementById('stock-level').value) || 0;
  if (!name || unitPrice <= 0 || stock < 0) {
    showToast('Enter valid medicine name, price, and stock');
    return;
  }
  showLoading(true);
  try {
    const result = await callGasFunction('addMedicine', {
      sessionId,
      data: { name, unitPrice, stock }
    });
    showLoading(false);
    if (result.success) {
      showModal('Success', 'Medicine added/updated');
      document.getElementById('medicine-name').value = '';
      document.getElementById('unit-price').value = '';
      document.getElementById('stock-level').value = '';
      loadInventory();
    } else {
      showModal('Error', result.message || 'Failed to add medicine');
      if (result.message === 'Invalid session') logout();
    }
  } catch (error) {
    showLoading(false);
    showModal('Error', error.message || 'Failed to add medicine');
    console.error('Add medicine error:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('inventory-btn').addEventListener('click', () => showSection('inventory-section'));
  document.getElementById('sales-btn').addEventListener('click', () => showSection('sales-section'));
  document.getElementById('reports-btn').addEventListener('click', () => showSection('reports-section'));
  document.getElementById('add-medicine-btn').addEventListener('click', addMedicine);
  document.getElementById('modal-buttons').addEventListener('click', (e) => {
    if (e.target.id === 'modal-ok') closeModal();
  });
  document.getElementById('inventory-btn').style.display = 'none';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/MSS/service-worker.js')
    .then(() => console.log('Service Worker Registered'))
    .catch(err => console.error('Service Worker Error:', err));
}
