// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD2Yh7L4Wl9XRlOgxnzZyo8xxds6a02UJY",
  authDomain: "skinship-1ff4b.firebaseapp.com",
  projectId: "skinship-1ff4b",
  storageBucket: "skinship-1ff4b.appspot.com",
  messagingSenderId: "963752770497",
  appId: "1:963752770497:web:8911cc6a375acdbdcc8d40"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let editingIndex = -1;
let purchaseOrders = [];
let inventoryItems = [];
let currentUser = null;
let currentProductMode = 'existing';
let selectedProduct = null;

// Load current user
auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        currentUser = {
          uid: user.uid,
          fullName: userData.fullName || userData.email || 'User',
          email: userData.email || user.email
        };
        document.getElementById('userDisplayName').textContent = currentUser.fullName;
      } else {
        currentUser = {
          uid: user.uid,
          fullName: user.email || 'User',
          email: user.email
        };
        document.getElementById('userDisplayName').textContent = currentUser.fullName;
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  } else {
    window.location.href = 'Login.html';
  }
});

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
  await loadInventoryItems();
  await loadPurchaseOrders();
  updateStats();
  renderTable();
  generatePONumber();
  
  // Set today's date as default
  document.getElementById('poDate').value = new Date().toISOString().split('T')[0];
  
  // Setup logout
  document.getElementById('logoutBtn').addEventListener('click', function() {
    auth.signOut().then(() => {
      window.location.href = 'Login.html';
    });
  });
});

// Load inventory items
async function loadInventoryItems() {
  try {
    const snapshot = await db.collection('inventory').get();
    inventoryItems = [];
    
    snapshot.forEach(doc => {
      const item = doc.data();
      item.firebaseId = doc.id;
      inventoryItems.push(item);
    });
    
    console.log('Loaded inventory items:', inventoryItems.length);
    populateProductDropdown();
  } catch (error) {
    console.error('Error loading inventory:', error);
  }
}

// Populate product dropdown
function populateProductDropdown() {
  const select = document.getElementById('existingProduct');
  select.innerHTML = '<option value="">Choose a product...</option>';
  
  inventoryItems.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} (${item.id}) - ${item.category}`;
    option.dataset.item = JSON.stringify(item);
    select.appendChild(option);
  });
}

// Load product details when selected
function loadProductDetails() {
  const select = document.getElementById('existingProduct');
  const selectedOption = select.options[select.selectedIndex];
  
  if (!selectedOption.value) {
    document.getElementById('productDetails').style.display = 'none';
    selectedProduct = null;
    calculateTotal();
    return;
  }
  
  selectedProduct = JSON.parse(selectedOption.dataset.item);
  
  document.getElementById('detailProductId').textContent = selectedProduct.id;
  document.getElementById('detailCategory').textContent = selectedProduct.category;
  document.getElementById('detailStock').textContent = selectedProduct.qty || 0;
  document.getElementById('detailPrice').textContent = `₱ ${(selectedProduct.price || 0).toFixed(2)}`;
  
  document.getElementById('productDetails').style.display = 'block';
  calculateTotal();
}

// Switch between existing and new product mode
function switchProductMode(mode) {
  currentProductMode = mode;
  
  const existingBtn = document.getElementById('existingProductBtn');
  const newBtn = document.getElementById('newProductBtn');
  const existingSection = document.getElementById('existingProductSection');
  const newSection = document.getElementById('newProductSection');
  
  if (mode === 'existing') {
    existingBtn.classList.add('active');
    newBtn.classList.remove('active');
    existingSection.style.display = 'block';
    newSection.style.display = 'none';
    
    // Make existing product required
    document.getElementById('existingProduct').required = true;
    document.getElementById('newProductName').required = false;
    document.getElementById('newProductCategory').required = false;
    document.getElementById('newProductPrice').required = false;
  } else {
    existingBtn.classList.remove('active');
    newBtn.classList.add('active');
    existingSection.style.display = 'none';
    newSection.style.display = 'block';
    
    // Make new product fields required
    document.getElementById('existingProduct').required = false;
    document.getElementById('newProductName').required = true;
    document.getElementById('newProductCategory').required = true;
    document.getElementById('newProductPrice').required = true;
    
    // Generate new product ID
    generateNewProductId();
  }
  
  calculateTotal();
}

// Generate new product ID
async function generateNewProductId() {
  try {
    const counterRef = db.collection('metadata').doc('inventoryCounter');
    const docSnap = await counterRef.get();
    
    let newNumber = 1;
    if (docSnap.exists) {
      newNumber = (docSnap.data().last || 0) + 1;
    }
    
    const newId = `INV-${String(newNumber).padStart(3, '0')}`;
    document.getElementById('newProductId').value = newId;
  } catch (error) {
    console.error('Error generating product ID:', error);
  }
}

// Calculate total value
function calculateTotal() {
  const qty = parseInt(document.getElementById('quantity').value) || 0;
  let unitPrice = 0;
  
  if (currentProductMode === 'existing' && selectedProduct) {
    unitPrice = selectedProduct.price || 0;
  } else if (currentProductMode === 'new') {
    unitPrice = parseFloat(document.getElementById('newProductPrice').value) || 0;
  }
  
  const total = qty * unitPrice;
  document.getElementById('totalValue').value = `₱ ${total.toFixed(2)}`;
}

// Load purchase orders from Firebase
async function loadPurchaseOrders() {
  try {
    const snapshot = await db.collection('purchaseOrders').orderBy('date', 'desc').get();
    purchaseOrders = [];
    
    snapshot.forEach(doc => {
      const po = doc.data();
      po.firebaseId = doc.id;
      purchaseOrders.push(po);
    });
    
    console.log('Loaded purchase orders:', purchaseOrders.length);
  } catch (error) {
    console.error('Error loading purchase orders:', error);
  }
}

// Generate PO Number
function generatePONumber() {
  const today = new Date();
  const year = today.getFullYear();
  const poCount = purchaseOrders.length + 1;
  document.getElementById('poNumber').value = `PO-${year}-${String(poCount).padStart(3, '0')}`;
}

// Get current date formatted
function getCurrentDate() {
  const today = new Date();
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return today.toLocaleDateString('en-US', options);
}

// Open new PO modal
function openNewPOModal() {
  editingIndex = -1;
  document.getElementById('modalTitle').textContent = 'New Purchase Order';
  document.getElementById('poForm').reset();
  generatePONumber();
  document.getElementById('poDate').value = new Date().toISOString().split('T')[0];
  
  // Reset to existing product mode
  switchProductMode('existing');
  selectedProduct = null;
  document.getElementById('productDetails').style.display = 'none';
  
  document.getElementById('poModal').style.display = 'block';
}

// Close PO modal
function closePOModal() {
  document.getElementById('poModal').style.display = 'none';
}

// Handle form submission
document.getElementById('poForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  let productData = {};
  
  if (currentProductMode === 'existing') {
    // Using existing product
    if (!selectedProduct) {
      alert('Please select a product from inventory.');
      return;
    }
    
    productData = {
      productName: selectedProduct.name,
      productId: selectedProduct.id,
      category: selectedProduct.category,
      unitPrice: selectedProduct.price || 0
    };
  } else {
    // Creating new product
    const name = document.getElementById('newProductName').value.trim();
    const category = document.getElementById('newProductCategory').value;
    const price = parseFloat(document.getElementById('newProductPrice').value);
    const minStock = parseInt(document.getElementById('newProductMinStock').value);
    const description = document.getElementById('newProductDescription').value.trim();
    const productId = document.getElementById('newProductId').value;
    
    if (!name || !category || !price) {
      alert('Please fill in all required fields for the new product.');
      return;
    }
    
    productData = {
      productName: name,
      productId: productId,
      category: category,
      unitPrice: price,
      isNewProduct: true,
      newProductData: {
        minStock: minStock,
        description: description
      }
    };
  }
  
  const quantity = parseInt(document.getElementById('quantity').value);
  const totalValue = quantity * productData.unitPrice;
  
  const formData = {
    id: document.getElementById('poNumber').value,
    date: document.getElementById('poDate').value,
    supplier: document.getElementById('supplier').value,
    ...productData,
    quantity: quantity,
    totalValue: totalValue,
    status: 'pending',
    createdBy: currentUser ? currentUser.fullName : 'Unknown',
    createdDate: getCurrentDate()
  };

  try {
    if (editingIndex === -1) {
      // Add new PO to Firebase
      const docRef = await db.collection('purchaseOrders').add(formData);
      formData.firebaseId = docRef.id;
      purchaseOrders.push(formData);
      alert('Purchase order created successfully!');
    } else {
      // Edit existing PO
      const po = purchaseOrders[editingIndex];
      await db.collection('purchaseOrders').doc(po.firebaseId).update(formData);
      purchaseOrders[editingIndex] = { ...po, ...formData };
      alert('Purchase order updated successfully!');
    }

    updateStats();
    renderTable();
    closePOModal();
  } catch (error) {
    console.error('Error saving purchase order:', error);
    alert('Error saving purchase order. Please try again.');
  }
});

// Render table
function renderTable() {
  const tbody = document.getElementById('poTableBody');
  tbody.innerHTML = '';

  if (purchaseOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-gray-500">No purchase orders found. Click "New Purchase Order" to get started.</td></tr>';
    return;
  }

  purchaseOrders.forEach((po, index) => {
    const row = document.createElement('tr');
    row.className = 'border-b hover:bg-gray-50 transition';
    row.setAttribute('data-status', po.status);
    row.setAttribute('data-date', po.date);
    
    const statusClass = po.status === 'pending' ? 'status-pending' : 
                       po.status === 'received' ? 'status-received' : 'status-cancelled';
    
    row.innerHTML = `
      <td class="py-4 px-4 font-semibold">${po.id}</td>
      <td class="py-4 px-4">${formatDate(po.date)}</td>
      <td class="py-4 px-4">${po.supplier}</td>
      <td class="py-4 px-4">${po.productName}</td>
      <td class="py-4 px-4">${po.productId}</td>
      <td class="py-4 px-4">${po.category || 'N/A'}</td>
      <td class="py-4 px-4 text-center">${po.quantity}</td>
      <td class="py-4 px-4 text-center">₱ ${(po.unitPrice || 0).toFixed(2)}</td>
      <td class="py-4 px-4 text-center font-semibold">₱ ${(po.totalValue || 0).toFixed(2)}</td>
      <td class="py-4 px-4 text-center">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${po.status.charAt(0).toUpperCase() + po.status.slice(1)}</span>
      </td>
      <td class="py-4 px-4 text-center">
        <div class="flex justify-center gap-2">
          ${po.status === 'pending' ? `
            <button onclick="editPO(${index})" class="text-blue-600 hover:text-blue-800" title="Edit">
              <i class="fa-solid fa-edit"></i>
            </button>
            <button onclick="receiveOrder(${index})" class="text-green-600 hover:text-green-800" title="Mark as Received">
              <i class="fa-solid fa-check"></i>
            </button>
            <button onclick="deletePO(${index})" class="text-red-600 hover:text-red-800" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : `
            <button onclick="viewPO(${index})" class="text-blue-600 hover:text-blue-800" title="View Details">
              <i class="fa-solid fa-eye"></i>
            </button>
          `}
        </div>
      </td>
    `;
    
    tbody.appendChild(row);
  });
}

// Edit PO
function editPO(index) {
  const po = purchaseOrders[index];
  
  if (po.status !== 'pending') {
    alert('Only pending purchase orders can be edited.');
    return;
  }
  
  editingIndex = index;
  
  document.getElementById('modalTitle').textContent = 'Edit Purchase Order';
  document.getElementById('poNumber').value = po.id;
  document.getElementById('poDate').value = po.date;
  document.getElementById('supplier').value = po.supplier;
  document.getElementById('quantity').value = po.quantity;
  
  // Check if it was a new product or existing
  if (po.isNewProduct) {
    switchProductMode('new');
    document.getElementById('newProductName').value = po.productName;
    document.getElementById('newProductCategory').value = po.category;
    document.getElementById('newProductPrice').value = po.unitPrice;
    document.getElementById('newProductId').value = po.productId;
    if (po.newProductData) {
      document.getElementById('newProductMinStock').value = po.newProductData.minStock || 10;
      document.getElementById('newProductDescription').value = po.newProductData.description || '';
    }
  } else {
    switchProductMode('existing');
    // Find and select the product
    const productSelect = document.getElementById('existingProduct');
    for (let i = 0; i < productSelect.options.length; i++) {
      if (productSelect.options[i].value === po.productId) {
        productSelect.selectedIndex = i;
        loadProductDetails();
        break;
      }
    }
  }
  
  calculateTotal();
  document.getElementById('poModal').style.display = 'block';
}

// View PO details
function viewPO(index) {
  const po = purchaseOrders[index];
  alert(`Purchase Order Details:\n\nPO #: ${po.id}\nDate: ${formatDate(po.date)}\nSupplier: ${po.supplier}\nProduct: ${po.productName}\nProduct ID: ${po.productId}\nCategory: ${po.category || 'N/A'}\nQuantity: ${po.quantity}\nUnit Price: ₱ ${(po.unitPrice || 0).toFixed(2)}\nTotal Value: ₱ ${(po.totalValue || 0).toFixed(2)}\nStatus: ${po.status}\n\nCreated by: ${po.createdBy || 'Unknown'}\nReceived by: ${po.receivedBy || 'N/A'}`);
}

// Determine status based on quantity
function determineStatus(qty, minStock) {
  if (qty === 0) return 'out-of-stock';
  if (qty <= minStock) return 'low-stock';
  return 'in-stock';
}

// Receive order - Add to inventory
async function receiveOrder(index) {
  const po = purchaseOrders[index];
  
  if (!confirm(`Mark this purchase order as received and add ${po.quantity} units of ${po.productName} to inventory?`)) {
    return;
  }

  try {
    // Check if product already exists in inventory
    const inventorySnapshot = await db.collection('inventory')
      .where('id', '==', po.productId)
      .get();

    if (!inventorySnapshot.empty) {
      // Product exists - update quantity
      const doc = inventorySnapshot.docs[0];
      const existingProduct = doc.data();
      const newQty = existingProduct.qty + po.quantity;
      const newTotal = newQty * existingProduct.price;
      const newStatus = determineStatus(newQty, existingProduct.minStock || 10);

      await db.collection('inventory').doc(doc.id).update({
        qty: newQty,
        total: newTotal,
        status: newStatus,
        date: getCurrentDate(),
        lastEditedBy: currentUser ? currentUser.fullName : 'Unknown',
        supplier: po.supplier
      });

      alert(`✅ Inventory updated!\n\n${po.productName} (${po.productId})\nPrevious Quantity: ${existingProduct.qty}\nAdded: ${po.quantity}\nNew Quantity: ${newQty}\n\nCategory: ${po.category}\nUnit Price: ₱ ${(po.unitPrice || 0).toFixed(2)}`);
    } else {
      // Product doesn't exist - create new inventory item
      if (po.isNewProduct) {
        // Update the counter
        const counterRef = db.collection('metadata').doc('inventoryCounter');
        await db.runTransaction(async (tx) => {
          const docSnap = await tx.get(counterRef);
          const idNumber = parseInt(po.productId.split('-')[1]);
          
          if (docSnap.exists) {
            const currentLast = docSnap.data().last || 0;
            if (idNumber > currentLast) {
              tx.update(counterRef, { last: idNumber });
            }
          } else {
            tx.set(counterRef, { last: idNumber });
          }
        });

        // Create new inventory item with all details
        const newProduct = {
          id: po.productId,
          name: po.productName,
          category: po.category,
          qty: po.quantity,
          price: po.unitPrice,
          total: po.quantity * po.unitPrice,
          date: getCurrentDate(),
          status: determineStatus(po.quantity, po.newProductData?.minStock || 10),
          minStock: po.newProductData?.minStock || 10,
          supplier: po.supplier,
          description: po.newProductData?.description || `Added from Purchase Order ${po.id}`,
          createdBy: currentUser ? currentUser.fullName : 'Unknown',
          createdDate: getCurrentDate(),
          lastEditedBy: currentUser ? currentUser.fullName : 'Unknown'
        };

        await db.collection('inventory').add(newProduct);

        alert(`✅ New product added to inventory!\n\n${po.productName} (${po.productId})\nCategory: ${po.category}\nQuantity: ${po.quantity}\nUnit Price: ₱ ${po.unitPrice.toFixed(2)}\nTotal Value: ₱ ${(po.quantity * po.unitPrice).toFixed(2)}`);
      } else {
        alert('⚠️ Error: Product not found in inventory and no new product data available.');
        return;
      }
    }

    // Update PO status to received
    await db.collection('purchaseOrders').doc(po.firebaseId).update({
      status: 'received',
      receivedDate: getCurrentDate(),
      receivedBy: currentUser ? currentUser.fullName : 'Unknown'
    });

    purchaseOrders[index].status = 'received';
    purchaseOrders[index].receivedDate = getCurrentDate();
    purchaseOrders[index].receivedBy = currentUser ? currentUser.fullName : 'Unknown';

    // Reload inventory to refresh the list
    await loadInventoryItems();
    updateStats();
    renderTable();
  } catch (error) {
    console.error('Error receiving order:', error);
    alert('Error processing the order. Please try again.');
  }
}

// Delete PO
async function deletePO(index) {
  if (!confirm('Are you sure you want to delete this purchase order?')) {
    return;
  }

  try {
    const po = purchaseOrders[index];
    await db.collection('purchaseOrders').doc(po.firebaseId).delete();
    purchaseOrders.splice(index, 1);
    
    updateStats();
    renderTable();
    alert('Purchase order deleted successfully!');
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    alert('Error deleting purchase order. Please try again.');
  }
}

// Update statistics
function updateStats() {
  const totalPOs = purchaseOrders.length;
  const pendingPOs = purchaseOrders.filter(po => po.status === 'pending').length;
  const receivedPOs = purchaseOrders.filter(po => po.status === 'received').length;
  
  // Get total unique items count from inventory (number of different products)
  const totalInventoryItems = inventoryItems.length;

  document.getElementById('totalPOs').textContent = totalPOs;
  document.getElementById('pendingPOs').textContent = pendingPOs;
  document.getElementById('receivedPOs').textContent = receivedPOs;
  document.getElementById('totalItems').textContent = totalInventoryItems;
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', function(e) {
  const searchTerm = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#poTableBody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
});

// Filter by status
function filterByStatus(status) {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    if(btn.textContent.includes('All Orders') || btn.textContent.includes('Pending') || 
       btn.textContent.includes('Received') || btn.textContent.includes('Cancelled')) {
      btn.classList.remove('active');
    }
  });
  event.target.classList.add('active');
  
  const rows = document.querySelectorAll('#poTableBody tr');
  rows.forEach(row => {
    if(status === 'all') {
      row.style.display = '';
    } else {
      const rowStatus = row.getAttribute('data-status');
      row.style.display = rowStatus === status ? '' : 'none';
    }
  });
}

// Filter by date range
function filterByDate() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  const rows = document.querySelectorAll('#poTableBody tr');
  
  rows.forEach(row => {
    const rowDate = row.getAttribute('data-date');
    let show = true;
    
    if (dateFrom && rowDate < dateFrom) show = false;
    if (dateTo && rowDate > dateTo) show = false;
    
    row.style.display = show ? '' : 'none';
  });
}

// Export to CSV
function exportToCSV() {
  let csv = 'PO Number,Date,Supplier,Product Name,Product ID,Category,Quantity,Unit Price,Total Value,Status,Created By\n';
  
  purchaseOrders.forEach(po => {
    csv += `${po.id},${po.date},${po.supplier},${po.productName},${po.productId},${po.category || 'N/A'},${po.quantity},${po.unitPrice || 0},${po.totalValue || 0},${po.status},${po.createdBy || 'Unknown'}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'purchase_orders.csv';
  a.click();
}

// Format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const userMenu = document.getElementById('userMenu');
  const userMenuButton = document.getElementById('userMenuButton');
  
  if (userMenu && userMenuButton && !userMenuButton.contains(event.target) && !userMenu.contains(event.target)) {
    userMenu.classList.add('hidden');
  }
});

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('poModal');
  if (event.target === modal) {
    closePOModal();
  }
}