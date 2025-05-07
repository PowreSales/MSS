let itemData = [];
let inventoryData = [];
let itemRows = 1;
let selectedItemIndex = null;
let isLoggedIn = true;
let currentUserRole = "Manager";

function sanitizeInput(input) {
  if (!input) return '';
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

function stripHtml(html) {
  let doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms))
  ]);
}

function showMainInterface() {
  const contentDiv = document.getElementById('content');
  document.getElementById('salesBtn').classList.remove('btn-active');
  document.getElementById('inventoryBtn').classList.remove('btn-active');
  document.getElementById('salesReportsBtn').classList.remove('btn-active');
  contentDiv.innerHTML = '<p style="text-align: center; font-weight: bold; font-size: 24px;">Welcome to the Medicine Sales System. Use the navigation above to get started.</p>';
}

function showSales() {
  document.getElementById('salesBtn').classList.add('btn-active');
  document.getElementById('inventoryBtn').classList.remove('btn-active');
  document.getElementById('salesReportsBtn').classList.remove('btn-active');
  document.getElementById('content').innerHTML = '<p>Loading sales form...</p><div class="spinner" style="display: block;"></div>';
  document.getElementById('error').innerHTML = "";
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    // Fallback for when google.script.run is not available
    showModal('salesModal', 'Cannot connect to server. Using mock data for testing.', 5000);
    inventoryData = [
      { row: 1, name: 'Paracetamol', price: 2.50, cost: 1.80, stock: 100, reorderLevel: 20, purchaseDate: '2025-05-01' },
      { row: 2, name: 'Ibuprofen', price: 3.00, cost: 2.20, stock: 50, reorderLevel: 15, purchaseDate: '2025-05-02' }
    ];
    displaySalesForm();
    return;
  }
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getInventoryData();
    }),
    10000
  )
    .then((result) => {
      if (result.success) {
        inventoryData = result.data.map(item => ({
          row: item.row,
          name: item.name,
          price: parseFloat(item.unitPrice) || 0,
          cost: parseFloat(item.costPrice) || 0,
          stock: parseInt(item.stock) || 0,
          reorderLevel: parseInt(item.reorderLevel) || 0,
          purchaseDate: item.purchaseDate
        }));
        displaySalesForm();
      } else {
        showModal('salesModal', result.message || 'Failed to load inventory data.', 5000);
        document.getElementById('content').innerHTML = '<p>Failed to load sales form. Please try again or add items via the Inventory tab.</p>';
      }
    })
    .catch((error) => {
      showModal('salesModal', error.message || 'Failed to load inventory data. Server may be unreachable.', 5000);
      document.getElementById('content').innerHTML = '<p>Failed to load sales form. Please try again or add items via the Inventory tab.</p>';
    });
}

function displaySalesForm() {
  if (!inventoryData || inventoryData.length === 0) {
    document.getElementById('content').innerHTML = "<p>No items found in inventory. Please add items via the Inventory tab.</p>";
    return;
  }
  inventoryData.sort((a, b) => stripHtml(a.name).localeCompare(stripHtml(b.name)));
  const today = new Date().toISOString().split('T')[0];
  let html = `
    <div class="sales-form">
      <div class="sales-header">
        <h2>Record Sale</h2>
        <div>
          <button class="btn header-btn" onclick="showTodaysSalesBreakdown()">Today's Sales</button>
          <button class="btn header-btn btn-danger" onclick="confirmDeleteLastSale()">Delete Last Sale</button>
        </div>
      </div>
      <div class="form-group">
        <label>Date:</label>
        <input type="date" id="saleDate" value="${today}" max="${today}">
      </div>
      <div id="item-rows">
        ${createItemRow(1)}
      </div>
      <button class="btn" onclick="addItemRow()">Add Another Item</button>
      <div class="summary" id="purchaseSummary">
        <h3>Purchase Summary</h3>
        <div id="summaryItems"></div>
        <div class="summary-total" id="grandTotal">Grand Total: GHC 0.00</div>
      </div>
      <div class="form-group">
        <label>Payment Method:</label>
        <select id="paymentMethod">
          <option value="Cash" selected>Cash</option>
          <option value="Momo">Momo</option>
        </select>
      </div>
      <button class="btn submit-sale-btn" onclick="submitSale()">Submit Sale</button>
      <div id="result" style="font-size: 32px; color: white; font-weight: bold; margin-top: 10px; text-align: center;"></div>
    </div>
  `;
  document.getElementById('content').innerHTML = html;
  updatePrice(1);
  updateSummary();
}

function createItemRow(rowId) {
  const inStockItems = inventoryData.filter(item => item.stock > 0);
  const options = inStockItems.length > 0
    ? inStockItems.map(m => `<option value="${sanitizeInput(stripHtml(m.name).trim())}" data-price="${m.price}">${sanitizeInput(stripHtml(m.name).trim())} (Stock: ${m.stock})</option>`).join('')
    : `<option value="" disabled>No items in stock</option>`;
  return `
    <div id="row-${rowId}">
      <div class="form-group">
        <label>Item:</label>
        <select id="item-${rowId}" class="item-input" onchange="updatePrice(${rowId})">
          <option value="">Select item...</option>
          ${options}
        </select>
      </div>
      <div class="form-group">
        <label>Unit Price (GHC):</label>
        <input type="number" id="unitPrice-${rowId}" readonly step="0.01">
      </div>
      <div class="form-group">
        <label>Quantity (Available: <span id="stock-${rowId}">0</span>):</label>
        <input type="number" id="quantity-${rowId}" min="1" value="1" oninput="validateQuantity(${rowId}); updateSummary()">
      </div>
      ${itemRows > 1 ? `<button class="btn btn-danger" onclick="removeItemRow(${rowId})">Remove</button>` : ''}
    </div>
  `;
}

function addItemRow() {
  itemRows++;
  const newRow = createItemRow(itemRows);
  document.getElementById('item-rows').insertAdjacentHTML('beforeend', newRow);
  updatePrice(itemRows);
  updateSummary();
}

function removeItemRow(rowId) {
  if (itemRows <= 1) return;
  const row = document.getElementById(`row-${rowId}`);
  if (row) {
    row.remove();
    itemRows--;
    updateSummary();
  }
}

function updatePrice(rowId) {
  const inputElement = document.getElementById(`item-${rowId}`);
  const priceElement = document.getElementById(`unitPrice-${rowId}`);
  const stockElement = document.getElementById(`stock-${rowId}`);
  const quantityElement = document.getElementById(`quantity-${rowId}`);
  if (!inputElement || !priceElement || !stockElement || !quantityElement) return;
  const value = sanitizeInput(inputElement.value.trim());
  if (!value) {
    priceElement.value = '';
    stockElement.textContent = '0';
    quantityElement.value = '1';
    updateSummary();
    return;
  }
  let item = inventoryData.find(m => stripHtml(m.name).trim().toLowerCase() === value.toLowerCase());
  if (!item) {
    inputElement.value = "";
    priceElement.value = '';
    stockElement.textContent = '0';
    quantityElement.value = '1';
  } else {
    const price = Number(item.price) || 0;
    priceElement.value = price ? price.toFixed(2) : '';
    stockElement.textContent = item.stock;
    if (quantityElement.value > item.stock) {
      quantityElement.value = item.stock;
    }
  }
  updateSummary();
}

function validateQuantity(rowId) {
  const quantityElement = document.getElementById(`quantity-${rowId}`);
  const stockElement = document.getElementById(`stock-${rowId}`);
  const quantity = parseInt(quantityElement.value) || 0;
  const stock = parseInt(stockElement.textContent) || 0;
  if (quantity > stock) {
    quantityElement.value = stock;
  }
  if (quantity < 1) {
    quantityElement.value = 1;
  }
}

function updateSummary() {
  let items = [];
  let grandTotal = 0;
  for (let i = 1; i <= itemRows; i++) {
    const itemName = sanitizeInput(document.getElementById(`item-${i}`)?.value.trim());
    if (itemName && document.getElementById(`row-${i}`)) {
      const qty = parseInt(document.getElementById(`quantity-${i}`).value) || 0;
      const price = parseFloat(document.getElementById(`unitPrice-${i}`).value) || 0;
      const subtotal = qty * price;
      items.push({
        name: itemName,
        qty: qty,
        price: price,
        subtotal: subtotal
      });
      grandTotal += subtotal;
    }
  }
  let summaryHtml = items.length > 0
    ? items.map(item => `
        <div class="summary-item">
          <span>${sanitizeInput(item.name)} (${item.qty} x GHC${item.price.toFixed(2)})</span>
          <span>GHC${item.subtotal.toFixed(2)}</span>
        </div>
      `).join('')
    : '<p>No items selected.</p>';
  document.getElementById('summaryItems').innerHTML = summaryHtml;
  document.getElementById('grandTotal').innerHTML = `Grand Total: GHC${grandTotal.toFixed(2)}`;
}

function submitSale() {
  const saleDate = document.getElementById('saleDate').value;
  if (!saleDate || !/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    showModal('salesModal', "Please select a valid date.", 3000);
    return;
  }
  const paymentMethod = document.getElementById('paymentMethod').value;
  if (!['Cash', 'Momo'].includes(paymentMethod)) {
    showModal('salesModal', "Please select a valid payment method.", 3000);
    return;
  }
  const items = [];
  for (let i = 1; i <= itemRows; i++) {
    const itemNameElement = document.getElementById(`item-${i}`);
    if (!itemNameElement || !document.getElementById(`row-${i}`)) continue;
    const itemName = sanitizeInput(itemNameElement.value.trim());
    if (!itemName) {
      showModal('salesModal', `Please select an item for row ${i}.`, 3000);
      return;
    }
    const quantity = parseInt(document.getElementById(`quantity-${i}`).value) || 0;
    const stock = parseInt(document.getElementById(`stock-${i}`).textContent) || 0;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      showModal('salesModal', `Invalid quantity for "${itemName}" in row ${i}.`, 3000);
      return;
    }
    if (quantity > stock) {
      showModal('salesModal', `Quantity for "${itemName}" exceeds available stock (${stock}).`, 3000);
      return;
    }
    const unitPrice = parseFloat(document.getElementById(`unitPrice-${i}`).value) || 0;
    if (isNaN(unitPrice) || unitPrice <= 0) {
      showModal('salesModal', `Invalid unit price for "${itemName}" in row ${i}.`, 3000);
      return;
    }
    items.push({
      medicine: itemName,
      quantity: quantity,
      unitPrice: unitPrice
    });
  }
  if (items.length === 0) {
    showModal('salesModal', "Please select at least one item.", 3000);
    return;
  }
  const saleData = {
    date: saleDate,
    items: items,
    paymentMethod: paymentMethod,
    grandTotal: items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  };
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    showModal('salesModal', 'Cannot connect to server. Sale submission disabled in demo mode.', 5000);
    return;
  }
  document.getElementById('result').innerHTML = "Submitting...";
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .submitSale(saleData);
    }),
    10000
  )
    .then((result) => {
      document.getElementById('result').innerHTML = result.message || "Sale recorded successfully!";
      setTimeout(() => {
        document.getElementById('result').innerHTML = "";
        itemRows = 1;
        showSales();
      }, 2000);
    })
    .catch((error) => {
      showModal('salesModal', error.message || "Failed to submit sale.", 5000);
      document.getElementById('result').innerHTML = "";
    });
}

function showTodaysSalesBreakdown() {
  showModal('salesModal', "Fetching today's sales breakdown...");
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    showModal('salesModal', 'Cannot connect to server. Demo mode: No sales data available.', 5000);
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getSalesReport(today, today);
    }),
    10000
  )
    .then((result) => {
      if (result.success) {
        const summary = result.summary || { cashTotal: 0, momoTotal: 0, totalSales: 0 };
        const message = `
          Today's Sales Breakdown:<br>
          Sales Cash: GHC${summary.cashTotal.toFixed(2)}<br>
          Sales Momo: GHC${summary.momoTotal.toFixed(2)}<br>
          Total Sales: GHC${summary.totalSales.toFixed(2)}
        `;
        showModal('salesModal', message, 5000);
      } else {
        showModal('salesModal', result.message, 5000);
      }
    })
    .catch((error) => {
      showModal('salesModal', error.message || "Unable to fetch sales breakdown.", 5000);
    });
}

function confirmDeleteLastSale() {
  showConfirmModal("Are you sure you want to delete the last sale?", deleteLastSale);
}

function deleteLastSale() {
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    showModal('salesModal', 'Cannot connect to server. Sale deletion disabled in demo mode.', 5000);
    return;
  }
  document.getElementById('result').innerHTML = "Deleting last sale...";
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .deleteLastSale();
    }),
    10000
  )
    .then((result) => {
      showModal('salesModal', result.message || "Last sale deleted successfully!", 3000);
      document.getElementById('result').innerHTML = "";
      showSales();
    })
    .catch((error) => {
      showModal('salesModal', error.message || "Failed to delete last sale.", 5000);
      document.getElementById('result').innerHTML = "";
    });
}

function showInventory() {
  document.getElementById('inventoryBtn').classList.add('btn-active');
  document.getElementById('salesBtn').classList.remove('btn-active');
  document.getElementById('salesReportsBtn').classList.remove('btn-active');
  document.getElementById('content').innerHTML = '<p>Loading inventory...</p><div class="spinner" style="display: block;"></div>';
  document.getElementById('error').innerHTML = "";
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    // Fallback for when google.script.run is not available
    showModal('inventoryModal', 'Cannot connect to server. Using mock data for testing.', 5000);
    inventoryData = [
      { row: 1, name: 'Paracetamol', price: 2.50, cost: 1.80, stock: 100, reorderLevel: 20, purchaseDate: '2025-05-01' },
      { row: 2, name: 'Ibuprofen', price: 3.00, cost: 2.20, stock: 50, reorderLevel: 15, purchaseDate: '2025-05-02' }
    ];
    displayInventoryForm();
    return;
  }
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getInventoryData();
    }),
    10000
  )
    .then((result) => {
      if (result.success) {
        inventoryData = result.data.map(item => ({
          row: item.row,
          name: item.name,
          price: parseFloat(item.unitPrice) || 0,
          cost: parseFloat(item.costPrice) || 0,
          stock: parseInt(item.stock) || 0,
          reorderLevel: parseInt(item.reorderLevel) || 0,
          purchaseDate: item.purchaseDate
        }));
        displayInventoryForm();
      } else {
        showModal('inventoryModal', result.message || 'Failed to load inventory.', 5000);
        document.getElementById('content').innerHTML = '<p>Failed to load inventory. Please try again or add items using the form below.</p>';
        displayInventoryForm(); // Show form anyway for adding items
      }
    })
    .catch((error) => {
      showModal('inventoryModal', error.message || 'Failed to load inventory. Server may be unreachable.', 5000);
      document.getElementById('content').innerHTML = '<p>Failed to load inventory. Please try again or add items using the form below.</p>';
      displayInventoryForm(); // Show form anyway for adding items
    });
}

function displayInventoryForm() {
  const today = new Date().toISOString().split('T')[0];
  const itemOptions = inventoryData.length > 0
    ? inventoryData.map(item => `<option value="${sanitizeInput(stripHtml(item.name).trim())}">${sanitizeInput(stripHtml(item.name).trim())}</option>`).join('')
    : '';
  let html = `
    <div class="inventory-form">
      <div class="inventory-header">
        <h2>Manage Inventory</h2>
        <button class="btn header-btn" onclick="showShopWorth()">Shop Worth</button>
      </div>
      <div class="form-group">
        <label>Item Name:</label>
        <input list="itemNameList" id="itemName" placeholder="Type to search or add new..." oninput="filterInventoryItems(); checkItemSelection()">
        <datalist id="itemNameList">
          ${itemOptions}
        </datalist>
      </div>
      <div class="form-group">
        <label>Current Quantity:</label>
        <span id="currentQuantity">0</span>
      </div>
      <div class="form-group">
        <label>New Stock Quantity:</label>
        <input type="number" id="quantityAdjustment" min="0" value="0">
      </div>
      <div class="form-group">
        <label>Cost (Unit) (GHC):</label>
        <input type="number" id="costUnit" min="0" step="0.01" value="0.00">
      </div>
      <div class="form-group">
        <label>Price (Unit) (GHC):</label>
        <input type="number" id="priceUnit" min="0" step="0.01" value="0.00">
      </div>
      <div class="form-group">
        <label>Purchase Date:</label>
        <input type="date" id="purchaseDate" value="${today}" max="${today}">
      </div>
      <div class="form-group">
        <label>Reorder Level:</label>
        <input type="number" id="reorderLevel" min="0" value="0">
      </div>
      <div class="button-container" style="display: flex; gap: 10px; margin: 20px 0;">
        <button class="btn" onclick="addItem()">Add Item</button>
        <button class="btn" onclick="updateItem()" id="updateBtn" disabled>Update Item</button>
        <button class="btn btn-danger" onclick="deleteItem()" id="deleteBtn" disabled>Delete Item</button>
      </div>
      <div class="form-group">
        <label>Search:</label>
        <input type="text" id="searchInput" placeholder="Search by item name" oninput="searchItems()">
      </div>
      <div class="form-group">
        <label>Filter by Status:</label>
        <select id="filterStatus" onchange="filterItems()">
          <option value="">All</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
      </div>
      <h3>Inventory List</h3>
      ${inventoryData.length > 0 ? `
        <table id="inventoryTable">
          <tr>
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Cost (Unit)</th>
            <th>Price (Unit)</th>
            <th>Reorder Level</th>
            <th>Status</th>
          </tr>
          ${renderInventoryTable(inventoryData)}
        </table>
      ` : '<p>No items in inventory. Add items using the form above.</p>'}
    </div>
  `;
  document.getElementById('content').innerHTML = html;
}

function renderInventoryTable(data) {
  return data.map((item, index) => {
    let status;
    const stock = parseInt(item.stock) || 0;
    if (stock === 0) {
      status = "Out of Stock";
    } else if (stock <= item.reorderLevel) {
      status = "Low Stock";
    } else {
      status = "In Stock";
    }
    const rowClass = status === "Low Stock" ? 'low-stock' : status === "Out of Stock" ? 'out-of-stock' : '';
    return `
      <tr onclick="selectItem(${index})" class="${rowClass}">
        <td>${sanitizeInput(stripHtml(item.name).trim())}</td>
        <td>${stock}</td>
        <td>GHC${parseFloat(item.cost).toFixed(2)}</td>
        <td>GHC${parseFloat(item.price).toFixed(2)}</td>
        <td>${item.reorderLevel}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join('');
}

function selectItem(index) {
  selectedItemIndex = index;
  const item = inventoryData[index];
  document.getElementById('itemName').value = sanitizeInput(stripHtml(item.name).trim());
  document.getElementById('currentQuantity').textContent = item.stock;
  document.getElementById('quantityAdjustment').value = item.stock;
  document.getElementById('costUnit').value = parseFloat(item.cost).toFixed(2);
  document.getElementById('priceUnit').value = parseFloat(item.price).toFixed(2);
  document.getElementById('purchaseDate').value = item.purchaseDate || new Date().toISOString().split('T')[0];
  document.getElementById('reorderLevel').value = item.reorderLevel;
  document.getElementById('updateBtn').disabled = false;
  document.getElementById('deleteBtn').disabled = false;
}

function checkItemSelection() {
  const inputValue = sanitizeInput(document.getElementById('itemName').value.trim());
  const selectedItem = inventoryData.find(item => stripHtml(item.name).trim() === inputValue);
  if (selectedItem) {
    const index = inventoryData.indexOf(selectedItem);
    selectItem(index);
  } else {
    document.getElementById('currentQuantity').textContent = '0';
    document.getElementById('quantityAdjustment').value = '0';
    document.getElementById('costUnit').value = '0.00';
    document.getElementById('priceUnit').value = '0.00';
    document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('reorderLevel').value = '0';
    document.getElementById('updateBtn').disabled = true;
    document.getElementById('deleteBtn').disabled = true;
    selectedItemIndex = null;
  }
}

function clearForm() {
  document.getElementById('itemName').value = '';
  document.getElementById('currentQuantity').textContent = '0';
  document.getElementById('quantityAdjustment').value = '0';
  document.getElementById('costUnit').value = '0.00';
  document.getElementById('priceUnit').value = '0.00';
  document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('reorderLevel').value = '0';
  document.getElementById('updateBtn').disabled = true;
  document.getElementById('deleteBtn').disabled = true;
  selectedItemIndex = null;
}

function filterInventoryItems() {
  const inputElement = document.getElementById('itemName');
  const datalistElement = document.getElementById('itemNameList');
  const filterValue = sanitizeInput(inputElement.value.trim().toLowerCase());
  const filteredOptions = inventoryData
    .filter(item => stripHtml(item.name).trim().toLowerCase().startsWith(filterValue))
    .map(item => `<option value="${sanitizeInput(stripHtml(item.name).trim())}">${sanitizeInput(stripHtml(item.name).trim())}</option>`)
    .join('');
  datalistElement.innerHTML = filteredOptions;
}

function determineStatus(stock, reorderLevel) {
  stock = parseInt(stock) || 0;
  if (stock === 0) {
    return "Out of Stock";
  } else if (stock <= reorderLevel) {
    return "Low Stock";
  } else {
    return "In Stock";
  }
}

function addItem() {
  const itemName = sanitizeInput(document.getElementById('itemName').value.trim());
  if (!itemName) {
    showModal('inventoryModal', "Item name is required.", 3000);
    return;
  }
  const itemExists = inventoryData.some(item => stripHtml(item.name).trim().toLowerCase() === itemName.toLowerCase());
  if (itemExists) {
    showModal('inventoryModal', "Item already exists. Please select it to update.", 3000);
    return;
  }
  const stock = parseInt(document.getElementById('quantityAdjustment').value) || 0;
  if (!Number.isInteger(stock) || stock < 0) {
    showModal('inventoryModal', "Stock must be a non-negative integer.", 3000);
    return;
  }
  const cost = parseFloat(document.getElementById('costUnit').value) || 0;
  if (isNaN(cost) || cost < 0) {
    showModal('inventoryModal', "Cost must be a non-negative number.", 3000);
    return;
  }
  const price = parseFloat(document.getElementById('priceUnit').value) || 0;
  if (isNaN(price) || price <= 0) {
    showModal('inventoryModal', "Price must be a positive number.", 3000);
    return;
  }
  const purchaseDate = document.getElementById('purchaseDate').value;
  if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    showModal('inventoryModal', "Please select a valid purchase date.", 3000);
    return;
  }
  const reorderLevel = parseInt(document.getElementById('reorderLevel').value) || 0;
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
    showModal('inventoryModal', "Reorder level must be a non-negative integer.", 3000);
    return;
  }
  const itemData = {
    name: itemName,
    unitPrice: price,
    costPrice: cost,
    stock: stock,
    reorderLevel: reorderLevel,
    purchaseDate: purchaseDate
  };
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    showModal('inventoryModal', 'Cannot connect to server. Item addition disabled in demo mode.', 5000);
    return;
  }
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .addMedicine(itemData);
    }),
    10000
  )
    .then((result) => {
      showModal('inventoryModal', result.message || "Item added successfully", 2000);
      clearForm();
      showInventory();
    })
    .catch((error) => {
      showModal('inventoryModal', error.message || "Failed to add item.", 5000);
    });
}

function updateItem() {
  if (selectedItemIndex === null) {
    showModal('inventoryModal', "Please select an item to update.", 3000);
    return;
  }
  const itemName = sanitizeInput(document.getElementById('itemName').value.trim());
  if (!itemName) {
    showModal('inventoryModal', "Item name is required.", 3000);
    return;
  }
  const stock = parseInt(document.getElementById('quantityAdjustment').value) || 0;
  if (!Number.isInteger(stock) || stock < 0) {
    showModal('inventoryModal', "Stock must be a non-negative integer.", 3000);
    return;
  }
  const cost = parseFloat(document.getElementById('costUnit').value) || 0;
  if (isNaN(cost) || cost < 0) {
    showModal('inventoryModal', "Cost must be a non-negative number.", 3000);
    return;
  }
  const price = parseFloat(document.getElementById('priceUnit').value) || 0;
  if (isNaN(price) || price <= 0) {
    showModal('inventoryModal', "Price must be a positive number.", 3000);
    return;
  }
  const purchaseDate = document.getElementById('purchaseDate').value;
  if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    showModal('inventoryModal', "Please select a valid purchase date.", 3000);
    return;
  }
  const reorderLevel = parseInt(document.getElementById('reorderLevel').value) || 0;
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
    showModal('inventoryModal', "Reorder level must be a non-negative integer.", 3000);
    return;
  }
  const item = inventoryData[selectedItemIndex];
  const itemData = {
    row: item.row,
    name: itemName,
    unitPrice: price,
    costPrice: cost,
    stock: stock,
    reorderLevel: reorderLevel,
    purchaseDate: purchaseDate
  };
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    showModal('inventoryModal', 'Cannot connect to server. Item update disabled in demo mode.', 5000);
    return;
  }
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .editMedicine(itemData);
    }),
    10000
  )
    .then((result) => {
      showModal('inventoryModal', result.message || "Item updated successfully", 2000);
      clearForm();
      showInventory();
    })
    .catch((error) => {
      showModal('inventoryModal', error.message || "Failed to update item.", 5000);
    });
}

function deleteItem() {
  if (selectedItemIndex === null) {
    showModal('inventoryModal', "Please select an item to delete.", 3000);
    return;
  }
  showConfirmModal("Are you sure you want to delete this item?", () => {
    const item = inventoryData[selectedItemIndex];
    if (typeof google === 'undefined' || !google.script || !google.script.run) {
      showModal('inventoryModal', 'Cannot connect to server. Item deletion disabled in demo mode.', 5000);
      return;
    }
    withTimeout(
      new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          .deleteMedicine(item.row);
      }),
      10000
    )
      .then((result) => {
        showModal('inventoryModal', result.message || "Item deleted successfully", 2000);
        clearForm();
        showInventory();
      })
      .catch((error) => {
        showModal('inventoryModal', error.message || "Failed to delete item.", 5000);
      });
  });
}

function showShopWorth() {
  const totalCost = inventoryData.reduce((sum, item) => {
    const cost = parseFloat(item.cost) || 0;
    const stock = parseInt(item.stock) || 0;
    return sum + (cost * stock);
  }, 0);
  const currentDate = new Date().toISOString().split('T')[0];
  const message = `Your Shop's Worth as at ${currentDate} is GHC${totalCost.toFixed(2)}`;
  showModal('inventoryModal', message, 5000);
}

function searchItems() {
  const searchValue = sanitizeInput(document.getElementById('searchInput').value.trim().toLowerCase());
  const statusFilter = document.getElementById('filterStatus').value;
  const filteredData = inventoryData.filter(item => {
    const matchesSearch = stripHtml(item.name).trim().toLowerCase().includes(searchValue);
    const stock = parseInt(item.stock) || 0;
    let status;
    if (stock === 0) {
      status = "Out of Stock";
    } else if (stock <= item.reorderLevel) {
      status = "Low Stock";
    } else {
      status = "In Stock";
    }
    const matchesStatus = !statusFilter || status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  document.getElementById('inventoryTable').innerHTML = `
    <tr>
      <th>Item Name</th>
      <th>Quantity</th>
      <th>Cost (Unit)</th>
      <th>Price (Unit)</th>
      <th>Reorder Level</th>
      <th>Status</th>
    </tr>
    ${renderInventoryTable(filteredData)}
  `;
}

function filterItems() {
  searchItems();
}

function showSalesReports() {
  document.getElementById('salesReportsBtn').classList.add('btn-active');
  document.getElementById('salesBtn').classList.remove('btn-active');
  document.getElementById('inventoryBtn').classList.remove('btn-active');
  const today = new Date().toISOString().split('T')[0];
  let html = `
    <div class="reports-form">
      <h2>Sales Reports</h2>
      <div class="form-group">
        <label>Start Date:</label>
        <input type="date" id="startDate" value="${today}" max="${today}">
      </div>
      <div class="form-group">
        <label>End Date:</label>
        <input type="date" id="endDate" value="${today}" max="${today}">
      </div>
      <button class="btn" onclick="generateReport()">Generate Report</button>
      <button class="btn" onclick="exportToPDF()">Export to PDF</button>
      <div id="reportResult"></div>
    </div>
  `;
  document.getElementById('content').innerHTML = html;
  document.getElementById('error').innerHTML = "";
  generateReport();
}

function generateReport() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (!startDate || !endDate) {
    showModal('salesModal', "Please select both start and end dates.", 3000);
    return;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) {
    showModal('salesModal', "Start date must be before end date.", 3000);
    return;
  }
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    showModal('salesModal', 'Cannot connect to server. Demo mode: No report data available.', 5000);
    document.getElementById('reportResult').innerHTML = "";
    return;
  }
  document.getElementById('reportResult').innerHTML = "Generating report...";
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getSalesReport(startDate, endDate);
    }),
    10000
  )
    .then((result) => {
      if (result.success) {
        let html = `
          <h3>Sales Report: ${startDate} to ${endDate}</h3>
          <table>
            <tr>
              <th>Date</th>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit Price (GHC)</th>
              <th>Subtotal (GHC)</th>
              <th>Profit (GHC)</th>
              <th>Payment Method</th>
            </tr>
            ${result.data.map(sale => `
              <tr>
                <td>${sanitizeInput(sale.date)}</td>
                <td>${sanitizeInput(sale.medicine)}</td>
                <td>${sale.quantity}</td>
                <td>${(sale.unitPrice || 0).toFixed(2)}</td>
                <td>${((sale.unitPrice || 0) * sale.quantity).toFixed(2)}</td>
                <td class="${sale.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${(sale.profit || 0).toFixed(2)}</td>
                <td>${sanitizeInput(sale.paymentMethod)}</td>
              </tr>
            `).join('')}
          </table>
          <div class="summary">
            <h3>Summary</h3>
            <div class="summary-item">
              <span>Total Sales (Cash):</span>
              <span>GHC${(result.summary.cashTotal || 0).toFixed(2)}</span>
            </div>
            <div class="summary-item">
              <span>Total Sales (Momo):</span>
              <span>GHC${(result.summary.momoTotal || 0).toFixed(2)}</span>
            </div>
            <div class="summary-total">
              <span>Total Sales:</span>
              <span>GHC${(result.summary.totalSales || 0).toFixed(2)}</span>
            </div>
            <div class="summary-total">
              <span>Total Profit:</span>
              <span class="${result.summary.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}">GHC${(result.summary.totalProfit || 0).toFixed(2)}</span>
            </div>
          </div>
        `;
        document.getElementById('reportResult').innerHTML = html;
      } else {
        showModal('salesModal', result.message, 5000);
        document.getElementById('reportResult').innerHTML = "";
      }
    })
    .catch((error) => {
      showModal('salesModal', error.message || "Failed to generate report.", 5000);
      document.getElementById('reportResult').innerHTML = "";
    });
}

function exportToPDF() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (!startDate || !endDate) {
    showModal('salesModal', "Please select both start and end dates.", 3000);
    return;
  }
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    showModal('salesModal', 'Cannot connect to server. PDF export disabled in demo mode.', 5000);
    return;
  }
  withTimeout(
    new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .generateSalesReportPDF(startDate, endDate);
    }),
    10000
  )
    .then((result) => {
      if (result.success) {
        window.open(result.url, '_blank');
        showModal('salesModal', result.message || "Report exported successfully!", 3000);
      } else {
        showModal('salesModal', result.message, 5000);
      }
    })
    .catch((error) => {
      showModal('salesModal', error.message || "Failed to export report.", 5000);
    });
}

function showModal(modalId, message, timeout = 0) {
  const modal = document.getElementById(modalId);
  const modalMessage = modalId === 'salesModal' ? document.getElementById('modalMessage') : document.getElementById('inventoryModalMessage');
  modalMessage.innerHTML = sanitizeInput(message);
  modal.style.display = 'block';
  if (timeout > 0) {
    setTimeout(() => {
      closeModal(modalId);
    }, timeout);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.style.display = 'none';
}

function showConfirmModal(message, onConfirm) {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmModalMessage').textContent = sanitizeInput(message);
  modal.style.display = 'block';
  const yesBtn = document.getElementById('confirmYes');
  const noBtn = document.getElementById('confirmNo');
  const newYesBtn = yesBtn.cloneNode(true);
  const newNoBtn = noBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
  noBtn.parentNode.replaceChild(newNoBtn, noBtn);
  newYesBtn.onclick = () => {
    closeModal('confirmModal');
    onConfirm();
  };
  newNoBtn.onclick = () => {
    closeModal('confirmModal');
  };
}

// Initialize the main interface on page load
showMainInterface();
