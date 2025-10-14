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
let categories = [];
let categoryCounts = {};
let suppliers = ['Beauty Supplies Inc.', 'Cosmetic World', 'Hair Care Solutions', 'Nail Art Supplies', 'Skincare Essentials'];
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
        document.getElementById('logoutUsername').textContent = currentUser.fullName;
      } else {
        currentUser = {
          uid: user.uid,
          fullName: user.email || 'User',
          email: user.email
        };
        document.getElementById('userDisplayName').textContent = currentUser.fullName;
        document.getElementById('logoutUsername').textContent = currentUser.fullName;
      }
    } catch (error) {
      // Silent error handling
    }
  } else {
    window.location.href = 'index.html';
  }
});

// Clock out function
async function handleClockOut() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const today = new Date().toLocaleDateString();
    const logsRef = db.collection('staffLogs').doc(user.uid).collection('history');
    
    const todayQuery = logsRef.where('date', '==', today);
    const todaySnap = await todayQuery.get();
    
    if (!todaySnap.empty) {
      const activeLog = todaySnap.docs.find(doc => !doc.data().clockOut);
      if (activeLog) {
        await logsRef.doc(activeLog.id).set({
          clockOut: new Date().toLocaleString()
        }, { merge: true });
      }
    }

    const staffRef = db.collection('users').doc(user.uid);
    await staffRef.update({ 
      availability: false,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    // Silent error handling
  }
}

// Logout modal functions
function showLogoutModal() {
  document.getElementById('logoutModal').classList.add('show');
}

function hideLogoutModal() {
  document.getElementById('logoutModal').classList.remove('show');
}

async function confirmLogout() {
  const confirmBtn = document.getElementById('confirmLogoutBtn');
  confirmBtn.classList.add('loading');
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner"></i> Logging out...';

  try {
    await handleClockOut();
    localStorage.removeItem('currentUserEmail');
    localStorage.removeItem('currentUserRole');
    localStorage.removeItem('currentUsername');
    localStorage.removeItem('currentUserFullName');
    await auth.signOut();
    window.location.href = "index.html";
  } catch (error) {
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    alert("An error occurred during logout. Please try again.");
    await auth.signOut();
    window.location.href = "index.html";
  }
}

// Notification System - matching exact design
function loadNotifications() {
  const notificationList = document.getElementById('notificationList');
  const badge = document.getElementById('notificationBadge');
  
  db.collection('notifications')
    .orderBy('timestamp', 'desc')
    .limit(20)
    .onSnapshot((snapshot) => {
      let unreadCount = 0;
      notificationList.innerHTML = '';
      
      if (snapshot.empty) {
        notificationList.innerHTML = `
          <div class="notification-empty">
            <i class="fa-solid fa-bell-slash"></i>
            <p>No notifications yet</p>
          </div>
        `;
        badge.style.display = 'none';
        return;
      }
      
      snapshot.forEach((doc) => {
        const notification = doc.data();
        notification.id = doc.id;
        
        if (!notification.read) unreadCount++;
        
        const item = document.createElement('div');
        item.className = `notification-item ${notification.read ? '' : 'unread'}`;
        item.onclick = () => viewNotification(notification.id, notification);
        
        const time = notification.timestamp?.toDate?.() || new Date();
        const timeStr = time.toLocaleString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        
        let displayMessage = notification.title || 'Notification';
        let displayDetails = notification.message || '';
        
        if (notification.type === 'appointment') {
          displayMessage = 'New Appointment Request';
          displayDetails = `${notification.details.service} - ${notification.details.date} at ${notification.details.time}`;
        } else if (notification.type === 'purchase_order') {
          displayMessage = 'New Purchase Order';
          displayDetails = `${notification.details.productName} - Qty: ${notification.details.quantity}`;
        } else if (notification.type === 'low_stock' || notification.type === 'out_of_stock') {
          displayMessage = notification.type === 'out_of_stock' ? '⚠️ Out of Stock Alert' : '⚠️ Low Stock Alert';
          displayDetails = `${notification.details.productName} - ${notification.details.quantity} units remaining`;
        }
        
        item.innerHTML = `
          <div class="flex justify-between items-start mb-1">
            <strong class="text-[#da5c73]">${displayMessage}</strong>
            ${!notification.read ? '<span class="w-2 h-2 bg-red-500 rounded-full"></span>' : ''}
          </div>
          <p class="text-sm text-gray-600">${displayDetails}</p>
          <p class="text-xs text-gray-400 mt-1">${timeStr}</p>
        `;
        
        notificationList.appendChild(item);
      });
      
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });
}

function toggleNotifications() {
  const dropdown = document.getElementById('notificationDropdown');
  dropdown.classList.toggle('show');
}

async function viewNotification(id, notification) {
  await db.collection('notifications').doc(id).update({ read: true });
  
  const modal = document.getElementById('notificationModal');
  const modalBody = document.getElementById('modalBody');
  
  if (notification.type === 'appointment') {
    const time = notification.timestamp?.toDate?.() || new Date();
    const timeStr = time.toLocaleString('en-US', { 
      dateStyle: 'full', 
      timeStyle: 'short' 
    });
    
    modalBody.innerHTML = `
      <h2 class="text-2xl font-bold text-[#da5c73] mb-4">Appointment Request</h2>
      <div class="space-y-3">
        <div><strong>Customer Name:</strong> ${notification.details.fullName || 'N/A'}</div>
        <div><strong>Email:</strong> ${notification.details.email || 'N/A'}</div>
        <div><strong>Phone:</strong> ${notification.details.phone || 'N/A'}</div>
        <div><strong>Service:</strong> ${notification.details.service || 'N/A'}</div>
        <div><strong>Preferred Date:</strong> ${notification.details.date || 'N/A'}</div>
        <div><strong>Preferred Time:</strong> ${notification.details.time || 'N/A'}</div>
        ${notification.details.message ? `<div><strong>Message:</strong> ${notification.details.message}</div>` : ''}
        <div class="text-sm text-gray-500"><strong>Submitted:</strong> ${timeStr}</div>
      </div>
      <div class="mt-6 flex gap-3">
        <button onclick="handleAppointmentAction('${id}', 'confirmed', ${JSON.stringify(notification.details).replace(/"/g, '&quot;')})" 
                class="flex-1 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
          <i class="fa-solid fa-check mr-2"></i>Accept
        </button>
        <button onclick="handleAppointmentAction('${id}', 'pending', ${JSON.stringify(notification.details).replace(/"/g, '&quot;')})" 
                class="flex-1 bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">
          <i class="fa-solid fa-clock mr-2"></i>Later
        </button>
        <button onclick="handleAppointmentAction('${id}', 'cancelled', ${JSON.stringify(notification.details).replace(/"/g, '&quot;')})" 
                class="flex-1 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
          <i class="fa-solid fa-times mr-2"></i>Decline
        </button>
      </div>
    `;
  } else if (notification.type === 'purchase_order') {
    const time = notification.timestamp?.toDate?.() || new Date();
    const timeStr = time.toLocaleString('en-US', { 
      dateStyle: 'full', 
      timeStyle: 'short' 
    });
    
    modalBody.innerHTML = `
      <h2 class="text-2xl font-bold text-[#da5c73] mb-4">Purchase Order Created</h2>
      <div class="space-y-3">
        <div><strong>PO Number:</strong> ${notification.details.poNumber || 'N/A'}</div>
        <div><strong>Product:</strong> ${notification.details.productName || 'N/A'}</div>
        <div><strong>Quantity:</strong> ${notification.details.quantity || 'N/A'}</div>
        <div><strong>Supplier:</strong> ${notification.details.supplier || 'N/A'}</div>
        <div><strong>Total Value:</strong> ₱${(notification.details.totalValue || 0).toFixed(2)}</div>
        <div><strong>Created By:</strong> ${notification.details.createdBy || 'N/A'}</div>
        <div class="text-sm text-gray-500"><strong>Created:</strong> ${timeStr}</div>
      </div>
      <div class="mt-6 flex gap-3">
        <button onclick="closeNotificationModal()" 
                class="flex-1 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
          <i class="fa-solid fa-times mr-2"></i>Close
        </button>
      </div>
    `;
  } else if (notification.type === 'low_stock' || notification.type === 'out_of_stock') {
    const time = notification.timestamp?.toDate?.() || new Date();
    const timeStr = time.toLocaleString('en-US', { 
      dateStyle: 'full', 
      timeStyle: 'short' 
    });
    
    const isOutOfStock = notification.type === 'out_of_stock';
    const alertColor = isOutOfStock ? 'text-red-600' : 'text-yellow-600';
    const alertBg = isOutOfStock ? 'bg-red-50' : 'bg-yellow-50';
    const alertBorder = isOutOfStock ? 'border-red-200' : 'border-yellow-200';
    
    modalBody.innerHTML = `
      <h2 class="text-2xl font-bold ${alertColor} mb-4">
        <i class="fa-solid fa-triangle-exclamation mr-2"></i>${isOutOfStock ? 'Out of Stock Alert' : 'Low Stock Alert'}
      </h2>
      <div class="${alertBg} border ${alertBorder} rounded-lg p-4 mb-4">
        <p class="font-semibold ${alertColor}">
          ${isOutOfStock ? 'This item is completely out of stock!' : 'This item is running low on stock!'}
        </p>
      </div>
      <div class="space-y-3">
        <div><strong>Product Name:</strong> ${notification.details.productName || 'N/A'}</div>
        <div><strong>Product ID:</strong> ${notification.details.productId || 'N/A'}</div>
        <div><strong>Category:</strong> ${notification.details.category || 'N/A'}</div>
        <div><strong>Current Quantity:</strong> <span class="${alertColor} font-bold">${notification.details.quantity || 0} units</span></div>
        <div><strong>Minimum Stock Level:</strong> ${notification.details.minStock || 10} units</div>
        ${notification.details.supplier ? `<div><strong>Supplier:</strong> ${notification.details.supplier}</div>` : ''}
        <div class="text-sm text-gray-500"><strong>Alert Time:</strong> ${timeStr}</div>
      </div>
      <div class="mt-6 flex gap-3">
        <button onclick="createPOFromNotification('${notification.details.productId}')" 
                class="flex-1 bg-[#da5c73] text-white px-4 py-2 rounded hover:bg-[#c54d63]">
          <i class="fa-solid fa-plus mr-2"></i>Create Purchase Order
        </button>
        <button onclick="closeNotificationModal()" 
                class="flex-1 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
          <i class="fa-solid fa-times mr-2"></i>Close
        </button>
      </div>
    `;
  } else {
    modalBody.innerHTML = `
      <h2 class="text-2xl font-bold text-[#da5c73] mb-4">${notification.title || 'Notification'}</h2>
      <p class="mb-4">${notification.message}</p>
      <button onclick="closeNotificationModal()" 
              class="w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
        Close
      </button>
    `;
  }
  
  modal.classList.add('show');
}

async function handleAppointmentAction(notificationId, status, details) {
  try {
    const statusMessages = {
      confirmed: 'Appointment accepted successfully!',
      pending: 'Appointment marked as pending.',
      cancelled: 'Appointment declined.'
    };
    
    // Find customer by email or phone
    const customersRef = db.collection('customers');
    let customerQuery = customersRef.where('email', '==', details.email);
    let customerSnap = await customerQuery.get();
    
    if (customerSnap.empty && details.phone) {
      customerQuery = customersRef.where('phone', '==', details.phone);
      customerSnap = await customerQuery.get();
    }
    
    if (!customerSnap.empty) {
      // Update existing customer
      const customerDoc = customerSnap.docs[0];
      await customerDoc.ref.update({ status: status });
    } else {
      // Create new customer if not exists
      await customersRef.add({
        name: details.fullName,
        email: details.email,
        phone: details.phone,
        service: details.service,
        date: details.date,
        time: details.time,
        appointment: `${details.date} ${details.time}`,
        status: status,
        staff: 'Unassigned',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        archived: false
      });
    }
    
    // Delete notification if confirmed or cancelled
    if (status !== 'pending') {
      await db.collection('notifications').doc(notificationId).delete();
    } else {
      await db.collection('notifications').doc(notificationId).update({ read: true });
    }
    
    closeNotificationModal();
    alert(statusMessages[status]);
  } catch (error) {
    alert('Error processing appointment. Please try again.');
  }
}

function closeNotificationModal() {
  document.getElementById('notificationModal').classList.remove('show');
}

function markAllRead() {
  db.collection('notifications').get().then((snapshot) => {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });
    return batch.commit();
  });
}

function clearAllNotifications() {
  if (confirm('Clear all notifications?')) {
    db.collection('notifications').get().then((snapshot) => {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      return batch.commit();
    });
  }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
  await loadInventoryItemsAndCategories();
  await loadPurchaseOrders();
  updateStats();
  renderTable();
  generatePONumber();
  updateSupplierDropdown();
  loadNotifications();
  
  document.getElementById('poDate').value = new Date().toISOString().split('T')[0];
  
  document.getElementById('logoutBtn').addEventListener('click', function() {
    showLogoutModal();
  });
  
  document.getElementById('supplier').addEventListener('change', handleSupplierSelectChange);
});

// Load inventory items and categories
async function loadInventoryItemsAndCategories() {
  try {
    const snapshot = await db.collection('inventory').get();
    
    inventoryItems = [];
    const categorySet = new Set();
    categoryCounts = {};
    
    snapshot.forEach(doc => {
      const item = doc.data();
      item.firebaseId = doc.id;
      inventoryItems.push(item);
      
      if (item.category) {
        categorySet.add(item.category);
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      }
    });
    
    if (categorySet.size === 0) {
      const defaultCategories = ['Hair Products', 'Nail Products', 'Skincare', 'Lash Products', 'Tools'];
      categories = defaultCategories.map(cat => ({ id: cat, name: cat }));
    } else {
      categories = Array.from(categorySet).map(cat => ({ id: cat, name: cat }));
    }
    
    populateProductDropdown();
    updateCategorySelects();
    
  } catch (error) {
    // Silent error handling
  }
}

// Update category select elements
function updateCategorySelects() {
  const select = document.getElementById('newProductCategory');
  const currentValue = select.value;
  
  select.innerHTML = '<option value="">Select Category</option>';
  
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.name;
    option.textContent = cat.name;
    select.appendChild(option);
  });
  
  const addOption = document.createElement('option');
  addOption.value = '__ADD_NEW__';
  addOption.textContent = '+ Add New Category';
  addOption.style.fontWeight = 'bold';
  addOption.style.color = '#da5c73';
  select.appendChild(addOption);
  
  const manageOption = document.createElement('option');
  manageOption.value = '__MANAGE__';
  manageOption.textContent = '⚙️ Manage Categories';
  manageOption.style.fontWeight = 'bold';
  manageOption.style.color = '#da5c73';
  select.appendChild(manageOption);
  
  if (currentValue && currentValue !== '__ADD_NEW__' && currentValue !== '__MANAGE__') {
    select.value = currentValue;
  }
  
  select.removeEventListener('change', handleCategorySelectChange);
  select.addEventListener('change', handleCategorySelectChange);
}

// Handle category select change
function handleCategorySelectChange(event) {
  if (event.target.value === '__ADD_NEW__') {
    openAddCategoryModal();
    setTimeout(() => {
      event.target.value = '';
    }, 100);
  } else if (event.target.value === '__MANAGE__') {
    openManageCategoriesModal();
    setTimeout(() => {
      event.target.value = '';
    }, 100);
  }
}

// Open/Close Add Category Modal
function openAddCategoryModal() {
  document.getElementById('addCategoryModal').classList.add('show');
}

function closeAddCategoryModal() {
  document.getElementById('addCategoryModal').classList.remove('show');
  document.getElementById('addCategoryForm').reset();
}

// Handle Add Category
async function handleAddCategory(event) {
  event.preventDefault();
  
  const categoryName = document.getElementById('newCategoryName').value.trim();
  
  if (!categoryName) {
    alert('Category name cannot be empty!');
    return;
  }
  
  if (categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
    alert('This category already exists! Please choose a different name.');
    return;
  }
  
  try {
    const placeholderItem = {
      id: await generateUniqueItemId(),
      name: `${categoryName} - Sample Item`,
      category: categoryName,
      qty: 0,
      price: 0,
      total: 0,
      date: getCurrentDate(),
      status: 'out-of-stock',
      minStock: 10,
      supplier: '',
      description: 'Placeholder item for category',
      createdBy: currentUser ? currentUser.fullName : 'Unknown',
      createdDate: getCurrentDate(),
      lastEditedBy: currentUser ? currentUser.fullName : 'Unknown',
      isPlaceholder: true
    };

    const docRef = await db.collection('inventory').add(placeholderItem);
    placeholderItem.firebaseId = docRef.id;
    
    inventoryItems.push(placeholderItem);
    categories.push({
      id: categoryName,
      name: categoryName
    });
    categoryCounts[categoryName] = 1;
    
    updateCategorySelects();
    populateProductDropdown();
    closeAddCategoryModal();
    
    const categorySelect = document.getElementById('newProductCategory');
    categorySelect.value = categoryName;
    
    alert(`Category "${categoryName}" added successfully!`);
    
  } catch (error) {
    alert('Error adding category. Please try again.');
  }
}

// Open/Close Manage Categories Modal
async function openManageCategoriesModal() {
  const modal = document.getElementById('manageCategoriesModal');
  if (modal) {
    modal.classList.add('show');
    await loadManageCategoriesList();
  }
}

function closeManageCategoriesModal() {
  const modal = document.getElementById('manageCategoriesModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// Load categories list
async function loadManageCategoriesList() {
  const listContainer = document.getElementById('manageCategoriesList');
  
  if (categories.length === 0) {
    listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No categories found.</p>';
    return;
  }
  
  listContainer.innerHTML = '';
  
  categories.forEach(cat => {
    const categoryItem = document.createElement('div');
    categoryItem.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition';
    
    const itemCount = categoryCounts[cat.name] || 0;
    
    categoryItem.innerHTML = `
      <div>
        <span class="font-semibold text-gray-800">${cat.name}</span>
        <span class="text-sm text-gray-500 ml-2">(${itemCount} item${itemCount !== 1 ? 's' : ''})</span>
      </div>
      <button 
        onclick="handleDeleteCategory('${cat.name.replace(/'/g, "\\'")}', ${itemCount})" 
        class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition text-sm"
        title="Delete category"
      >
        <i class="fa-solid fa-trash"></i> Delete
      </button>
    `;
    
    listContainer.appendChild(categoryItem);
  });
}

// Handle Delete Category
async function handleDeleteCategory(categoryName, itemCount) {
  if (itemCount === 0) {
    if (!confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
      return;
    }
  } else {
    if (!confirm(`Warning: The category "${categoryName}" has ${itemCount} item(s).\n\nDeleting this category will also delete all items in it. This action cannot be undone.\n\nAre you sure you want to continue?`)) {
      return;
    }
  }
  
  try {
    const snapshot = await db.collection('inventory').where('category', '==', categoryName).get();
    
    const batches = [];
    let batch = db.batch();
    let operationCount = 0;
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      operationCount++;
      
      if (operationCount === 500) {
        batches.push(batch.commit());
        batch = db.batch();
        operationCount = 0;
      }
    });
    
    if (operationCount > 0) {
      batches.push(batch.commit());
    }
    
    await Promise.all(batches);
    
    categories = categories.filter(c => c.name !== categoryName);
    inventoryItems = inventoryItems.filter(i => i.category !== categoryName);
    delete categoryCounts[categoryName];
    
    updateCategorySelects();
    populateProductDropdown();
    await loadManageCategoriesList();
    updateStats();
    
    alert(`Category "${categoryName}" and its ${itemCount} item(s) have been deleted successfully!`);
  } catch (error) {
    alert('Error deleting category. Please try again.');
  }
}

// Make functions globally accessible
window.openManageCategoriesModal = openManageCategoriesModal;
window.closeManageCategoriesModal = closeManageCategoriesModal;
window.handleDeleteCategory = handleDeleteCategory;
window.handleAppointmentAction = handleAppointmentAction;

// Update supplier dropdown
function updateSupplierDropdown() {
  const select = document.getElementById('supplier');
  const currentValue = select.value;
  
  select.innerHTML = '<option value="">Select Supplier</option>';
  
  suppliers.forEach(supplier => {
    const option = document.createElement('option');
    option.value = supplier;
    option.textContent = supplier;
    select.appendChild(option);
  });
  
  const addOption = document.createElement('option');
  addOption.value = '__ADD_NEW__';
  addOption.textContent = '+ Add New Supplier';
  addOption.style.fontWeight = 'bold';
  addOption.style.color = '#da5c73';
  select.appendChild(addOption);
  
  const manageOption = document.createElement('option');
  manageOption.value = '__MANAGE__';
  manageOption.textContent = '⚙️ Manage Suppliers';
  manageOption.style.fontWeight = 'bold';
  manageOption.style.color = '#da5c73';
  select.appendChild(manageOption);
  
  if (currentValue && currentValue !== '__ADD_NEW__' && currentValue !== '__MANAGE__') {
    select.value = currentValue;
  }
}

// Handle supplier select change
function handleSupplierSelectChange(event) {
  if (event.target.value === '__ADD_NEW__') {
    openAddSupplierModal();
    setTimeout(() => {
      event.target.value = '';
    }, 100);
  } else if (event.target.value === '__MANAGE__') {
    openManageSuppliersModal();
    setTimeout(() => {
      event.target.value = '';
    }, 100);
  }
}

// Open/Close Add Supplier Modal
function openAddSupplierModal() {
  document.getElementById('addSupplierModal').classList.add('show');
}

function closeAddSupplierModal() {
  document.getElementById('addSupplierModal').classList.remove('show');
  document.getElementById('addSupplierForm').reset();
}

// Handle Add Supplier
function handleAddSupplier(event) {
  event.preventDefault();
  
  const supplierName = document.getElementById('newSupplierName').value.trim();
  
  if (!supplierName) {
    alert('Supplier name cannot be empty!');
    return;
  }
  
  if (suppliers.some(s => s.toLowerCase() === supplierName.toLowerCase())) {
    alert('This supplier already exists! Please choose a different name.');
    return;
  }
  
  suppliers.push(supplierName);
  suppliers.sort();
  updateSupplierDropdown();
  closeAddSupplierModal();
  
  const supplierSelect = document.getElementById('supplier');
  supplierSelect.value = supplierName;
  
  alert(`Supplier "${supplierName}" added successfully!`);
}

// Open/Close Manage Suppliers Modal
function openManageSuppliersModal() {
  const modal = document.getElementById('manageSuppliersModal');
  if (modal) {
    modal.classList.add('show');
    loadManageSuppliersList();
  }
}

function closeManageSuppliersModal() {
  const modal = document.getElementById('manageSuppliersModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// Load suppliers list for management
function loadManageSuppliersList() {
  const listContainer = document.getElementById('manageSuppliersList');
  
  if (suppliers.length === 0) {
    listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No suppliers found.</p>';
    return;
  }
  
  listContainer.innerHTML = '';
  
  const supplierCounts = {};
  purchaseOrders.forEach(po => {
    if (po.supplier) {
      supplierCounts[po.supplier] = (supplierCounts[po.supplier] || 0) + 1;
    }
  });
  
  suppliers.forEach(supplier => {
    const supplierItem = document.createElement('div');
    supplierItem.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition';
    
    const usageCount = supplierCounts[supplier] || 0;
    
    supplierItem.innerHTML = `
      <div>
        <span class="font-semibold text-gray-800">${supplier}</span>
        <span class="text-sm text-gray-500 ml-2">(${usageCount} order${usageCount !== 1 ? 's' : ''})</span>
      </div>
      <button 
        onclick="handleDeleteSupplier('${supplier.replace(/'/g, "\\'")}', ${usageCount})" 
        class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition text-sm"
        title="Delete supplier"
      >
        <i class="fa-solid fa-trash"></i> Delete
      </button>
    `;
    
    listContainer.appendChild(supplierItem);
  });
}

// Handle Delete Supplier
function handleDeleteSupplier(supplierName, usageCount) {
  if (usageCount === 0) {
    if (!confirm(`Are you sure you want to delete the supplier "${supplierName}"?`)) {
      return;
    }
  } else {
    if (!confirm(`Warning: The supplier "${supplierName}" has been used in ${usageCount} purchase order(s).\n\nDeleting this supplier will not delete the orders, but the supplier name will remain in those historical records.\n\nAre you sure you want to continue?`)) {
      return;
    }
  }
  
  suppliers = suppliers.filter(s => s !== supplierName);
  updateSupplierDropdown();
  loadManageSuppliersList();
  
  alert(`Supplier "${supplierName}" has been deleted successfully!`);
}

// Make supplier functions globally accessible
window.openAddSupplierModal = openAddSupplierModal;
window.closeAddSupplierModal = closeAddSupplierModal;
window.handleAddSupplier = handleAddSupplier;
window.openManageSuppliersModal = openManageSuppliersModal;
window.closeManageSuppliersModal = closeManageSuppliersModal;
window.handleDeleteSupplier = handleDeleteSupplier;

// Create Purchase Order from low stock notification
async function createPOFromNotification(productId) {
  try {
    // Find the product in inventory
    const product = inventoryItems.find(item => item.id === productId);
    
    if (!product) {
      alert('Product not found in inventory.');
      closeNotificationModal();
      return;
    }
    
    // Close notification modal
    closeNotificationModal();
    
    // Open PO modal with pre-filled data
    openNewPOModal();
    
    // Wait for modal to open and populate fields
    setTimeout(() => {
      // Switch to existing product mode
      switchProductMode('existing');
      
      // Select the product
      const productSelect = document.getElementById('existingProduct');
      for (let i = 0; i < productSelect.options.length; i++) {
        if (productSelect.options[i].value === productId) {
          productSelect.selectedIndex = i;
          loadProductDetails();
          break;
        }
      }
      
      // Calculate suggested order quantity (2x minimum stock level)
      const suggestedQty = Math.max(product.minStock * 2, 10);
      document.getElementById('quantity').value = suggestedQty;
      
      // Pre-fill supplier if available
      if (product.supplier) {
        document.getElementById('supplier').value = product.supplier;
      }
      
      calculateTotal();
      
      // Show info message
      alert(`Purchase Order form opened for "${product.name}".\n\nSuggested quantity: ${suggestedQty} units (2x minimum stock level)`);
    }, 300);
    
  } catch (error) {
    alert('Error opening purchase order form. Please try again.');
  }
}

window.createPOFromNotification = createPOFromNotification;

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
    
    document.getElementById('existingProduct').required = true;
    document.getElementById('newProductName').required = false;
    document.getElementById('newProductCategory').required = false;
    document.getElementById('newProductPrice').required = false;
  } else {
    existingBtn.classList.remove('active');
    newBtn.classList.add('active');
    existingSection.style.display = 'none';
    newSection.style.display = 'block';
    
    document.getElementById('existingProduct').required = false;
    document.getElementById('newProductName').required = true;
    document.getElementById('newProductCategory').required = true;
    document.getElementById('newProductPrice').required = true;
    
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
    // Silent error handling
  }
}

// Generate unique item ID
async function generateUniqueItemId() {
  const counterRef = db.collection('metadata').doc('inventoryCounter');
  let newNumber = 1;

  await db.runTransaction(async (tx) => {
    const docSnap = await tx.get(counterRef);
    if (docSnap.exists) {
      newNumber = (docSnap.data().last || 0) + 1;
      tx.update(counterRef, { last: newNumber });
    } else {
      tx.set(counterRef, { last: 1 });
      newNumber = 1;
    }
  });

  return `INV-${String(newNumber).padStart(3, '0')}`;
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
  } catch (error) {
    // Silent error handling
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
    const name = document.getElementById('newProductName').value.trim();
    const category = document.getElementById('newProductCategory').value;
    const price = parseFloat(document.getElementById('newProductPrice').value);
    const minStock = parseInt(document.getElementById('newProductMinStock').value);
    const description = document.getElementById('newProductDescription').value.trim();
    const productId = document.getElementById('newProductId').value;
    
    if (!name || !category || !price || category === '__ADD_NEW__') {
      alert('Please fill in all required fields for the new product.');
      return;
    }
    
    const duplicateName = inventoryItems.find(item => 
      item.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    
    if (duplicateName) {
      alert(`⚠️ Duplicate Product Name!\n\nA product with the name "${duplicateName.name}" already exists in your inventory.\n\nProduct ID: ${duplicateName.id}\nCategory: ${duplicateName.category}\n\nPlease use the "Existing Product" option to order this item, or choose a different product name.`);
      return;
    }
    
    const duplicateId = inventoryItems.find(item => 
      item.id === productId
    );
    
    if (duplicateId) {
      alert(`⚠️ Duplicate Product ID!\n\nA product with ID "${duplicateId.id}" already exists.\n\nProduct Name: ${duplicateId.name}\nCategory: ${duplicateId.category}\n\nPlease refresh the page to generate a new ID.`);
      await generateNewProductId();
      return;
    }
    
    const duplicateInPO = purchaseOrders.find(po => 
      po.isNewProduct && 
      po.status === 'pending' && 
      po.productName.toLowerCase().trim() === name.toLowerCase().trim()
    );
    
    if (duplicateInPO) {
      const useExisting = confirm(`⚠️ Product Already in Pending Order!\n\nA new product with the name "${duplicateInPO.productName}" is already in a pending purchase order (${duplicateInPO.id}).\n\nThis product will be added to inventory once that order is received.\n\nDo you want to create another purchase order for this same new product?\n\nClick "OK" to proceed anyway, or "Cancel" to go back.`);
      
      if (!useExisting) {
        return;
      }
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
      const docRef = await db.collection('purchaseOrders').add(formData);
      formData.firebaseId = docRef.id;
      purchaseOrders.push(formData);
      
      // Create notification
      await db.collection('notifications').add({
        type: 'purchase_order',
        title: 'New Purchase Order Created',
        message: `PO ${formData.id} has been created for ${formData.productName}`,
        details: {
          poNumber: formData.id,
          productName: formData.productName,
          quantity: formData.quantity,
          supplier: formData.supplier,
          totalValue: formData.totalValue,
          createdBy: formData.createdBy
        },
        read: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      alert('Purchase order created successfully!');
    } else {
      const po = purchaseOrders[editingIndex];
      await db.collection('purchaseOrders').doc(po.firebaseId).update(formData);
      purchaseOrders[editingIndex] = { ...po, ...formData };
      alert('Purchase order updated successfully!');
    }

    updateStats();
    renderTable();
    closePOModal();
  } catch (error) {
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
  alert(`Purchase Order Details:\n\nPO #: ${po.id}\nDate: ${formatDate(po.date)}\nSupplier: ${po.supplier}\nProduct: ${po.productName}\nINV ID: ${po.productId}\nCategory: ${po.category || 'N/A'}\nQuantity: ${po.quantity}\nUnit Price: ₱ ${(po.unitPrice || 0).toFixed(2)}\nTotal Value: ₱ ${(po.totalValue || 0).toFixed(2)}\nStatus: ${po.status}\n\nCreated by: ${po.createdBy || 'Unknown'}\nReceived by: ${po.receivedBy || 'N/A'}`);
}

// Determine status based on quantity
function determineStatus(qty, minStock) {
  if (qty === 0) return 'out-of-stock';
  if (qty <= minStock) return 'low-stock';
  return 'in-stock';
}

// Receive order
async function receiveOrder(index) {
  const po = purchaseOrders[index];
  
  if (!confirm(`Mark this purchase order as received and add ${po.quantity} units of ${po.productName} to inventory?`)) {
    return;
  }

  try {
    const inventorySnapshot = await db.collection('inventory')
      .where('id', '==', po.productId)
      .get();

    if (!inventorySnapshot.empty) {
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

      const localItemIndex = inventoryItems.findIndex(item => item.firebaseId === doc.id);
      if (localItemIndex !== -1) {
        inventoryItems[localItemIndex].qty = newQty;
        inventoryItems[localItemIndex].total = newTotal;
        inventoryItems[localItemIndex].status = newStatus;
        inventoryItems[localItemIndex].date = getCurrentDate();
        inventoryItems[localItemIndex].lastEditedBy = currentUser ? currentUser.fullName : 'Unknown';
        inventoryItems[localItemIndex].supplier = po.supplier;
        populateProductDropdown();
      }

      alert(`✅ Inventory updated!\n\n${po.productName} (${po.productId})\nPrevious Quantity: ${existingProduct.qty}\nAdded: ${po.quantity}\nNew Quantity: ${newQty}\n\nCategory: ${po.category}\nUnit Price: ₱ ${(po.unitPrice || 0).toFixed(2)}`);
    } else {
      if (po.isNewProduct) {
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

        const docRef = await db.collection('inventory').add(newProduct);
        newProduct.firebaseId = docRef.id;

        inventoryItems.push(newProduct);
        
        if (!categoryCounts[po.category]) {
          categories.push({ id: po.category, name: po.category });
          categoryCounts[po.category] = 1;
          updateCategorySelects();
        } else {
          categoryCounts[po.category]++;
        }
        
        populateProductDropdown();

        alert(`✅ New product added to inventory!\n\n${po.productName} (${po.productId})\nCategory: ${po.category}\nQuantity: ${po.quantity}\nUnit Price: ₱ ${po.unitPrice.toFixed(2)}\nTotal Value: ₱ ${(po.quantity * po.unitPrice).toFixed(2)}`);
      } else {
        alert('⚠️ Error: Product not found in inventory and no new product data available.');
        return;
      }
    }

    await db.collection('purchaseOrders').doc(po.firebaseId).update({
      status: 'received',
      receivedDate: getCurrentDate(),
      receivedBy: currentUser ? currentUser.fullName : 'Unknown'
    });

    purchaseOrders[index].status = 'received';
    purchaseOrders[index].receivedDate = getCurrentDate();
    purchaseOrders[index].receivedBy = currentUser ? currentUser.fullName : 'Unknown';

    updateStats();
    renderTable();
  } catch (error) {
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
    alert('Error deleting purchase order. Please try again.');
  }
}

// Update statistics
function updateStats() {
  const totalPOs = purchaseOrders.length;
  const pendingPOs = purchaseOrders.filter(po => po.status === 'pending').length;
  const receivedPOs = purchaseOrders.filter(po => po.status === 'received').length;
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
       btn.textContent.includes('Received')) {
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
  let csv = 'PO Number,Date,Supplier,Product Name,INV ID,Category,Quantity,Unit Price,Total Value,Status,Created By\n';
  
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

  const logoutModal = document.getElementById('logoutModal');
  if (logoutModal && event.target === logoutModal) {
    hideLogoutModal();
  }
  
  if (!event.target.closest('#notificationBtn') && !event.target.closest('#notificationDropdown')) {
    document.getElementById('notificationDropdown').classList.remove('show');
  }
});

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('poModal');
  if (event.target === modal) {
    closePOModal();
  }
  
  const categoryModal = document.getElementById('addCategoryModal');
  if (event.target === categoryModal) {
    closeAddCategoryModal();
  }
  
  const manageCategoriesModal = document.getElementById('manageCategoriesModal');
  if (event.target === manageCategoriesModal) {
    closeManageCategoriesModal();
  }
  
  const supplierModal = document.getElementById('addSupplierModal');
  if (event.target === supplierModal) {
    closeAddSupplierModal();
  }
  
  const manageSuppliersModal = document.getElementById('manageSuppliersModal');
  if (event.target === manageSuppliersModal) {
    closeManageSuppliersModal();
  }
  
  const notificationModal = document.getElementById('notificationModal');
  if (event.target === notificationModal) {
    closeNotificationModal();
  }
}

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
    }
  }
});

// Handle page unload
window.addEventListener("beforeunload", async (e) => {
  await handleClockOut();
});