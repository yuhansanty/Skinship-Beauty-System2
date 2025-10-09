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

// Global variables
let inventoryData = [];
let editMode = false;
let categories = [];
let currentUser = null;

// Load current user's full name
async function loadCurrentUserName() {
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
        console.error('Error loading user data:', error);
        currentUser = {
          uid: user.uid,
          fullName: user.email || 'User',
          email: user.email
        };
        document.getElementById('userDisplayName').textContent = currentUser.fullName;
        document.getElementById('logoutUsername').textContent = currentUser.fullName;
      }
    } else {
      // User not logged in, redirect to login
      window.location.href = 'Login.html';
    }
  });
}

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

    // Set user as unavailable
    const staffRef = db.collection('users').doc(user.uid);
    await staffRef.update({ 
      availability: false,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log("User clocked out and set to unavailable");
  } catch (error) {
    console.error("Error during clock out:", error);
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
    // Clock out and set unavailable
    await handleClockOut();
    
    // Clear local storage
    localStorage.removeItem('currentUserEmail');
    localStorage.removeItem('currentUserRole');
    localStorage.removeItem('currentUsername');
    localStorage.removeItem('currentUserFullName');
    
    // Sign out
    await auth.signOut();
    
    // Redirect to login page
    window.location.href = "Login.html";
  } catch (error) {
    console.error("Logout error:", error);
    
    // Reset button state
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    
    alert("An error occurred during logout. Please try again.");
    
    // Force sign out even if there's an error
    await auth.signOut();
    window.location.href = "Login.html";
  }
}

// Load categories from inventory collection
async function loadCategories() {
  try {
    const snapshot = await db.collection('inventory').get();
    const categoryOrder = [];
    const categorySet = new Set();
    
    // Preserve order of appearance (first occurrence)
    snapshot.forEach(doc => {
      const product = doc.data();
      if (product.category && !categorySet.has(product.category)) {
        categoryOrder.push(product.category);
        categorySet.add(product.category);
      }
    });

    categories = categoryOrder.map(cat => ({
      id: cat,
      name: cat
    }));

    // If no categories exist, add default ones
    if (categories.length === 0) {
      const defaultCategories = ['Hair Products', 'Nail Products', 'Skincare', 'Lash Products', 'Tools'];
      categories = defaultCategories.map(cat => ({
        id: cat,
        name: cat
      }));
    }

    updateCategorySelects();
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Update all category select elements
function updateCategorySelects() {
  const categorySelects = [
    document.getElementById('itemCategory'),
    document.getElementById('editItemCategory'),
    document.getElementById('categoryFilter')
  ];

  categorySelects.forEach((select, index) => {
    if (!select) return;
    
    const currentValue = select.value;
    
    // Clear existing options
    if (index === 2) {
      // Category filter - no "Add New Category" option
      select.innerHTML = '<option value="all">All Categories</option>';
    } else {
      // Add/Edit modals - include "Add New Category" option
      select.innerHTML = '<option value="">Select Category</option>';
    }
    
    // Add category options (in order of appearance, not alphabetical)
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      select.appendChild(option);
    });
    
    // Add "Add New Category..." and "Manage Categories" options only for Add/Edit modals
    if (index !== 2) {
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
    }
    
    // Restore previous value if it exists
    if (currentValue && currentValue !== 'all' && currentValue !== '' && currentValue !== '__ADD_NEW__' && currentValue !== '__MANAGE__') {
      select.value = currentValue;
    }
  });
  
  // Add event listeners to handle "Add New Category" and "Manage Categories" selection
  const addCategorySelects = [
    document.getElementById('itemCategory'),
    document.getElementById('editItemCategory')
  ];
  
  addCategorySelects.forEach(select => {
    if (!select) return;
    
    // Remove existing listener to prevent duplicates
    select.removeEventListener('change', handleCategorySelectChange);
    select.addEventListener('change', handleCategorySelectChange);
  });
}

// Handle category select change
function handleCategorySelectChange(event) {
  if (event.target.value === '__ADD_NEW__') {
    // Store which select triggered the modal
    event.target.dataset.triggerSelect = 'true';
    openAddCategoryModal();
    // Reset to empty after opening modal
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
  
  // Check for empty category name
  if (!categoryName) {
    alert('Category name cannot be empty!');
    return;
  }
  
  // Check if category already exists (case-insensitive)
  if (categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
    alert('This category already exists! Please choose a different name.');
    return;
  }
  
  try {
    // Create a placeholder item with the new category
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
    inventoryData.push(placeholderItem);
    
    // Add new category to the array (will be at the end/bottom)
    categories.push({
      id: categoryName,
      name: categoryName
    });
    
    updateCategorySelects();
    closeAddCategoryModal();
    
    // Auto-select the newly added category in whichever modal is open
    const addSelect = document.getElementById('itemCategory');
    const editSelect = document.getElementById('editItemCategory');
    
    // Check which modal is currently visible
    const addModal = document.getElementById('addProductModal');
    const editModal = document.getElementById('editProductModal');
    
    if (addModal && addModal.classList.contains('show')) {
      addSelect.value = categoryName;
    } else if (editModal && editModal.classList.contains('show')) {
      editSelect.value = categoryName;
    }
    
    alert(`Category "${categoryName}" added successfully! A placeholder item was created. You can edit or delete it later.`);
    
    // Refresh the table to show the new placeholder item
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    inventoryData.forEach(p => addProductToTable(p));
    updateStats();
    
  } catch (error) {
    console.error('Error adding category:', error);
    alert('Error adding category. Please try again.');
  }
}

// Open/Close Manage Categories Modal
function openManageCategoriesModal() {
  document.getElementById('manageCategoriesModal').classList.add('show');
  loadManageCategoriesList();
}

function closeManageCategoriesModal() {
  document.getElementById('manageCategoriesModal').classList.remove('show');
}

// Load categories list for management
function loadManageCategoriesList() {
  const listContainer = document.getElementById('manageCategoriesList');
  
  if (categories.length === 0) {
    listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No categories found.</p>';
    return;
  }
  
  listContainer.innerHTML = '';
  
  categories.forEach(cat => {
    const categoryItem = document.createElement('div');
    categoryItem.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition';
    
    // Count items in this category
    const itemCount = inventoryData.filter(i => i.category === cat.name).length;
    
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
  const itemsInCategory = inventoryData.filter(i => i.category === categoryName);
  
  if (itemsInCategory.length === 0) {
    if (!confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
      return;
    }
  } else {
    if (!confirm(`Warning: The category "${categoryName}" has ${itemsInCategory.length} item(s).\n\nDeleting this category will also delete all items in it. This action cannot be undone.\n\nAre you sure you want to continue?`)) {
      return;
    }
  }
  
  try {
    // Delete all items in this category
    const deletePromises = itemsInCategory.map(item => 
      db.collection('inventory').doc(item.firebaseId).delete()
    );
    
    await Promise.all(deletePromises);
    
    // Remove from local data
    inventoryData = inventoryData.filter(i => i.category !== categoryName);
    categories = categories.filter(c => c.name !== categoryName);
    
    // Update UI
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    inventoryData.forEach(i => addProductToTable(i));
    
    updateStats();
    updateCategorySelects();
    loadManageCategoriesList();
    
    alert(`Category "${categoryName}" and its ${itemsInCategory.length} item(s) have been deleted successfully!`);
  } catch (error) {
    console.error('Error deleting category:', error);
    alert('Error deleting category. Please try again.');
  }
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', function(e) {
  const searchTerm = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#inventoryTableBody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
});

// Filter by status
function filterByStatus(status) {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    if(btn.textContent.includes('All Items') || btn.textContent.includes('In Stock') || 
       btn.textContent.includes('Low Stock') || btn.textContent.includes('Out of Stock')) {
      btn.classList.remove('active');
    }
  });
  event.target.classList.add('active');
  
  const rows = document.querySelectorAll('#inventoryTableBody tr');
  rows.forEach(row => {
    if(status === 'all') {
      row.style.display = '';
    } else {
      const rowStatus = row.getAttribute('data-status');
      row.style.display = rowStatus === status ? '' : 'none';
    }
  });
}

// Filter by category
function filterByCategory() {
  const category = document.getElementById('categoryFilter').value;
  const rows = document.querySelectorAll('#inventoryTableBody tr');
  
  rows.forEach(row => {
    if(category === 'all') {
      row.style.display = '';
    } else {
      const rowCategory = row.getAttribute('data-category');
      row.style.display = rowCategory === category ? '' : 'none';
    }
  });
}

// Add new item
function addNewItem() {
  openAddProductModal();
}

// Export to CSV
function exportToCSV() {
  let csv = 'Item ID,Item Name,Category,Quantity,Unit Price,Total Value,Last Updated,Status,Last Edited By\n';
  
  inventoryData.forEach(row => {
    csv += `${row.id},${row.name},${row.category},${row.qty},${row.price},${row.total},${row.date},${row.status},${row.lastEditedBy || row.createdBy || 'Unknown'}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'inventory_report.csv';
  a.click();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const userMenu = document.getElementById('userMenu');
  const userMenuButton = document.getElementById('userMenuButton');
  
  if (!userMenuButton.contains(event.target) && !userMenu.contains(event.target)) {
    userMenu.classList.add('hidden');
  }

  if (!event.target.closest('#notificationBtn') && !event.target.closest('#notificationDropdown')) {
    document.getElementById('notificationDropdown').classList.remove('show');
  }

  // Close logout modal on overlay click
  const logoutModal = document.getElementById('logoutModal');
  if (logoutModal && event.target === logoutModal) {
    hideLogoutModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
    }
  }
});

// Notification System
function loadNotifications() {
  const notifications = JSON.parse(localStorage.getItem('skinshipNotifications') || '[]');
  const notificationList = document.getElementById('notificationList');
  const badge = document.getElementById('notificationBadge');
  
  const unreadCount = notifications.filter(n => !n.read).length;
  
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
  
  if (notifications.length === 0) {
    notificationList.innerHTML = '<div class="notification-empty"><i class="fa-solid fa-bell-slash text-3xl mb-2"></i><p>No notifications yet</p></div>';
    return;
  }
  
  notificationList.innerHTML = '';
  
  notifications.forEach(notification => {
    const item = document.createElement('div');
    item.className = `notification-item ${notification.read ? '' : 'unread'}`;
    item.onclick = () => viewNotification(notification.id);
    
    const time = new Date(notification.timestamp);
    const timeStr = time.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    });
    
    item.innerHTML = `
      <div class="flex justify-between items-start mb-1">
        <strong class="text-[#da5c73]">${notification.message}</strong>
        ${!notification.read ? '<span class="w-2 h-2 bg-red-500 rounded-full"></span>' : ''}
      </div>
      <p class="text-sm text-gray-600">${notification.details.service} - ${notification.details.date} at ${notification.details.time}</p>
      <p class="text-xs text-gray-400 mt-1">${timeStr}</p>
    `;
    
    notificationList.appendChild(item);
  });
}

function toggleNotifications() {
  const dropdown = document.getElementById('notificationDropdown');
  dropdown.classList.toggle('show');
  loadNotifications();
}

function viewNotification(id) {
  let notifications = JSON.parse(localStorage.getItem('skinshipNotifications') || '[]');
  const notification = notifications.find(n => n.id === id);
  
  if (!notification) return;
  
  notification.read = true;
  localStorage.setItem('skinshipNotifications', JSON.stringify(notifications));
  
  const modal = document.getElementById('notificationModal');
  const modalBody = document.getElementById('modalBody');
  
  const time = new Date(notification.timestamp).toLocaleString('en-US', { 
    dateStyle: 'full', 
    timeStyle: 'short' 
  });
  
  modalBody.innerHTML = `
    <h2 class="text-2xl font-bold text-[#da5c73] mb-4">Appointment Request</h2>
    <div class="space-y-3">
      <div><strong>Customer Name:</strong> ${notification.details.fullName}</div>
      <div><strong>Email:</strong> ${notification.details.email}</div>
      <div><strong>Phone:</strong> ${notification.details.phone}</div>
      <div><strong>Service:</strong> ${notification.details.service}</div>
      <div><strong>Preferred Date:</strong> ${notification.details.date}</div>
      <div><strong>Preferred Time:</strong> ${notification.details.time}</div>
      ${notification.details.message ? `<div><strong>Message:</strong> ${notification.details.message}</div>` : ''}
      <div class="text-sm text-gray-500"><strong>Submitted:</strong> ${time}</div>
    </div>
    <div class="mt-6 flex gap-3">
      <button onclick="approveAppointment(${id})" class="flex-1 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
        <i class="fa-solid fa-check mr-2"></i>Approve
      </button>
      <button onclick="rejectAppointment(${id})" class="flex-1 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
        <i class="fa-solid fa-times mr-2"></i>Decline
      </button>
    </div>
  `;
  
  modal.classList.add('show');
  loadNotifications();
}

function closeNotificationModal() {
  document.getElementById('notificationModal').classList.remove('show');
}

function markAllRead() {
  let notifications = JSON.parse(localStorage.getItem('skinshipNotifications') || '[]');
  notifications.forEach(n => n.read = true);
  localStorage.setItem('skinshipNotifications', JSON.stringify(notifications));
  loadNotifications();
}

function clearAllNotifications() {
  localStorage.setItem('skinshipNotifications', '[]');
  loadNotifications();
}

function approveAppointment(id) {
  alert('Appointment approved!');
  closeNotificationModal();
  deleteNotification(id);
}

function rejectAppointment(id) {
  alert('Appointment declined!');
  closeNotificationModal();
  deleteNotification(id);
}

function deleteNotification(id) {
  let notifications = JSON.parse(localStorage.getItem('skinshipNotifications') || '[]');
  notifications = notifications.filter(n => n.id !== id);
  localStorage.setItem('skinshipNotifications', JSON.stringify(notifications));
  loadNotifications();
}

// Generate next Item ID
function generateItemId() {
  const maxId = inventoryData.reduce((max, item) => {
    const num = parseInt(item.id.split('-')[1]);
    return num > max ? num : max;
  }, 0);
  return `INV-${String(maxId + 1).padStart(3, '0')}`;
}

// Get current date
function getCurrentDate() {
  const today = new Date();
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return today.toLocaleDateString('en-US', options);
}

// Determine status based on quantity
function determineStatus(qty, minStock) {
  if (qty === 0) return 'out-of-stock';
  if (qty <= minStock) return 'low-stock';
  return 'in-stock';
}

// Open Add Product Modal
function openAddProductModal() {
  updateCategorySelects();
  document.getElementById('addProductModal').classList.add('show');
}

// Close Add Product Modal
function closeAddProductModal() {
  document.getElementById('addProductModal').classList.remove('show');
  document.getElementById('addProductForm').reset();
}

// Generate sequential unique ID from Firestore
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

// Handle Add Product Form Submission
async function handleAddProduct(event) {
  event.preventDefault();
  
  const name = document.getElementById('itemName').value.trim();
  const category = document.getElementById('itemCategory').value;
  const qty = parseInt(document.getElementById('itemQuantity').value);
  const price = parseFloat(document.getElementById('itemPrice').value);
  const minStock = parseInt(document.getElementById('minStock').value);
  const supplier = document.getElementById('itemSupplier').value.trim();
  const description = document.getElementById('itemDescription').value.trim();
  
  if (!category || category === '__ADD_NEW__' || category === '__MANAGE__') {
    alert('Please select a valid category');
    return;
  }

  // Check if category exists in the database (case-insensitive)
  const categoryExists = categories.some(cat => cat.name.toLowerCase() === category.toLowerCase());
  
  if (!categoryExists) {
    alert('The selected category does not exist in the database. Please select an existing category or create a new one.');
    return;
  }
  
  const total = qty * price;
  const status = determineStatus(qty, minStock);
  
  const newProduct = {
    id: await generateUniqueItemId(),
    name: name,
    category: category,
    qty: qty,
    price: price,
    total: total,
    date: getCurrentDate(),
    status: status,
    minStock: minStock,
    supplier: supplier,
    description: description,
    createdBy: currentUser ? currentUser.fullName : 'Unknown',
    createdDate: getCurrentDate(),
    lastEditedBy: currentUser ? currentUser.fullName : 'Unknown'
  };
  
  try {
    const docRef = await db.collection('inventory').add(newProduct);
    newProduct.firebaseId = docRef.id;
    inventoryData.push(newProduct);
    addProductToTable(newProduct);
    
    // Reload categories to include any new category at the end
    await loadCategories();
    
    updateStats();
    closeAddProductModal();
    alert(`Product "${name}" added successfully to Firebase!`);
  } catch (error) {
    console.error('Error adding product to Firebase:', error);
    alert('Error adding product. Please check console for details.');
  }
}

// Toggle Edit Mode
function enableEditMode() {
  editMode = !editMode;
  const rows = document.querySelectorAll('#inventoryTableBody tr');
  const editBtn = document.getElementById('editModeBtn');

  if (editMode) {
    editBtn.classList.add('active');
    editBtn.innerHTML = '<i class="fa-solid fa-xmark mr-2"></i>Cancel Edit';
    rows.forEach(row => {
      row.classList.add('edit-mode-active');
      row.addEventListener('click', selectRowForEdit);
    });
  } else {
    editBtn.classList.remove('active');
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square mr-2"></i>Edit Item';
    rows.forEach(row => {
      row.classList.remove('edit-mode-active');
      row.removeEventListener('click', selectRowForEdit);
    });
  }
}

// When a row is clicked in edit mode
function selectRowForEdit(event) {
  if (!editMode) return;
  
  // Don't trigger if clicking on the date column (which has its own click handler)
  if (event.target.closest('td:nth-child(7)')) return;

  const idCell = this.querySelector('td').textContent.trim();
  const product = inventoryData.find(p => p.id === idCell);
  if (!product) return alert('Product not found.');

  // Ensure categories are loaded and update selects
  updateCategorySelects();
  
  // Wait a bit for the select to be populated
  setTimeout(() => {
    document.getElementById('editFirebaseId').value = product.firebaseId;
    document.getElementById('editItemName').value = product.name;
    document.getElementById('editItemCategory').value = product.category;
    document.getElementById('editItemQuantity').value = product.qty;
    document.getElementById('editItemPrice').value = product.price;
    document.getElementById('editMinStock').value = product.minStock || 0;
    document.getElementById('editItemSupplier').value = product.supplier || '';
    document.getElementById('editItemDescription').value = product.description || '';

    document.getElementById('editProductModal').classList.add('show');
  }, 100);
}

// Close Edit Product Modal
function closeEditProductModal() {
  document.getElementById('editProductModal').classList.remove('show');
  if (editMode) enableEditMode();
}

// Save edited product
async function handleEditProduct(e) {
  e.preventDefault();

  const id = document.getElementById('editFirebaseId').value;
  const category = document.getElementById('editItemCategory').value;
  
  if (!category || category === '__ADD_NEW__' || category === '__MANAGE__') {
    alert('Please select a valid category');
    return;
  }

  // Check if category exists in the database (case-insensitive)
  const categoryExists = categories.some(cat => cat.name.toLowerCase() === category.toLowerCase());
  
  if (!categoryExists) {
    alert('The selected category does not exist in the database. Please select an existing category or create a new one.');
    return;
  }
  
  const updatedProduct = {
    name: document.getElementById('editItemName').value.trim(),
    category: category,
    qty: parseInt(document.getElementById('editItemQuantity').value),
    price: parseFloat(document.getElementById('editItemPrice').value),
    minStock: parseInt(document.getElementById('editMinStock').value),
    supplier: document.getElementById('editItemSupplier').value.trim(),
    description: document.getElementById('editItemDescription').value.trim(),
    total:
      parseInt(document.getElementById('editItemQuantity').value) *
      parseFloat(document.getElementById('editItemPrice').value),
    status: determineStatus(
      parseInt(document.getElementById('editItemQuantity').value),
      parseInt(document.getElementById('editMinStock').value)
    ),
    date: getCurrentDate(),
    lastEditedBy: currentUser ? currentUser.fullName : 'Unknown'
  };

  try {
    if (id) {
      await db.collection('inventory').doc(id).update(updatedProduct);
      const index = inventoryData.findIndex(p => p.firebaseId === id);
      if (index !== -1) inventoryData[index] = { ...inventoryData[index], ...updatedProduct };

      const tbody = document.getElementById('inventoryTableBody');
      tbody.innerHTML = '';
      inventoryData.forEach(p => addProductToTable(p));
      
      // Reload categories to include any new category at the end
      await loadCategories();
      
      updateStats();

      closeEditProductModal();
      alert('✅ Product updated successfully!');
    } else {
      alert('Error: Missing Firestore document ID.');
    }
  } catch (error) {
    console.error('Error updating product:', error);
    alert('Error updating product. Check console for details.');
  }
}

// Show edit history modal
async function showEditHistory(firebaseId) {
  const product = inventoryData.find(p => p.firebaseId === firebaseId);
  if (!product) return;

  const modal = document.getElementById('editHistoryModal');
  const modalBody = document.getElementById('editHistoryBody');
  
  modalBody.innerHTML = `
    <h2 class="text-2xl font-bold text-[#da5c73] mb-4">
      <i class="fa-solid fa-history mr-2"></i>Edit History
    </h2>
    <div class="space-y-3">
      <div><strong>Item Name:</strong> ${product.name}</div>
      <div><strong>Item ID:</strong> ${product.id}</div>
      <div><strong>Last Updated:</strong> ${product.date || 'N/A'}</div>
      <div><strong>Last Edited By:</strong> ${product.lastEditedBy || 'Unknown'}</div>
      ${product.createdBy ? `<div><strong>Created By:</strong> ${product.createdBy}</div>` : ''}
      ${product.createdDate ? `<div><strong>Created On:</strong> ${product.createdDate}</div>` : ''}
    </div>
    <div class="mt-6">
      <button onclick="closeEditHistoryModal()" class="w-full bg-[#da5c73] text-white px-4 py-2 rounded hover:bg-[#c54d63]">
        <i class="fa-solid fa-times mr-2"></i>Close
      </button>
    </div>
  `;
  
  modal.classList.add('show');
}

function closeEditHistoryModal() {
  document.getElementById('editHistoryModal').classList.remove('show');
}

// Show last updated item info
function showLastUpdatedInfo(firebaseId) {
  const product = inventoryData.find(p => p.firebaseId === firebaseId);
  if (!product) return;

  const modal = document.getElementById('lastUpdatedModal');
  const modalBody = document.getElementById('lastUpdatedBody');
  
  modalBody.innerHTML = `
    <h2 class="text-2xl font-bold text-[#da5c73] mb-4">
      <i class="fa-solid fa-info-circle mr-2"></i>Last Updated Item
    </h2>
    <div class="space-y-3">
      <div><strong>Item Name:</strong> ${product.name}</div>
      <div><strong>Item ID:</strong> ${product.id}</div>
      <div><strong>Category:</strong> ${product.category || 'N/A'}</div>
      <div><strong>Quantity:</strong> ${product.qty || 0}</div>
      <div><strong>Price:</strong> ₱${(product.price || 0).toLocaleString()}</div>
      <div><strong>Last Updated:</strong> ${product.date || 'N/A'}</div>
      <div class="text-lg font-bold text-[#da5c73] mt-4"><strong>Last Updated By:</strong> ${product.lastEditedBy || product.createdBy || 'Unknown'}</div>
      ${product.createdBy ? `<div class="text-sm text-gray-600"><strong>Originally Created By:</strong> ${product.createdBy}</div>` : ''}
    </div>
    <div class="mt-6">
      <button onclick="closeLastUpdatedModal()" class="w-full bg-[#da5c73] text-white px-4 py-2 rounded hover:bg-[#c54d63]">
        <i class="fa-solid fa-times mr-2"></i>Close
      </button>
    </div>
  `;
  
  modal.classList.add('show');
}

function closeLastUpdatedModal() {
  document.getElementById('lastUpdatedModal').classList.remove('show');
}

// Add product to table
function addProductToTable(product) {
  const tbody = document.getElementById('inventoryTableBody');
  const row = document.createElement('tr');
  row.className = 'border-b hover:bg-gray-50 transition';
  row.setAttribute('data-status', product.status || 'in-stock');
  row.setAttribute('data-category', product.category || '');
  
  let statusBadge = '';
  if (product.status === 'in-stock') {
    statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-600">In Stock</span>';
  } else if (product.status === 'low-stock') {
    statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-600">Low Stock</span>';
  } else {
    statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600">Out of Stock</span>';
  }
  
  const price = product.price || 0;
  const total = product.total || 0;
  const qty = product.qty || 0;
  
  row.innerHTML = `
    <td class="py-4 px-4 font-semibold">${product.id || 'N/A'}</td>
    <td class="py-4 px-4">${product.name || 'N/A'}</td>
    <td class="py-4 px-4">${product.category || 'N/A'}</td>
    <td class="py-4 px-4 text-center">${qty}</td>
    <td class="py-4 px-4 text-right">₱ ${price.toLocaleString()}</td>
    <td class="py-4 px-4 text-right font-semibold text-[#da5c73]">₱ ${total.toLocaleString()}</td>
    <td class="py-4 px-4 text-center text-sm cursor-pointer hover:text-[#da5c73] hover:underline" onclick="showEditHistory('${product.firebaseId}')" title="Click to see edit history">${product.date || 'N/A'}</td>
    <td class="py-4 px-4 text-center">${statusBadge}</td>
  `;
  
  tbody.appendChild(row);
}

// Update statistics
function updateStats() {
  const totalItems = inventoryData.length;
  const totalValue = inventoryData.reduce((sum, item) => sum + item.total, 0);
  const lowStock = inventoryData.filter(item => item.status === 'low-stock').length;
  const outOfStock = inventoryData.filter(item => item.status === 'out-of-stock').length;
  
  document.getElementById('totalItems').textContent = totalItems;
  document.getElementById('totalValue').textContent = `₱ ${totalValue.toLocaleString()}`;
  document.getElementById('lowStock').textContent = lowStock;
  document.getElementById('outOfStock').textContent = outOfStock;
}

// Load inventory from Firebase
async function loadInventoryFromFirebase() {
  try {
    const snapshot = await db.collection('inventory').get();
    
    inventoryData = [];
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No inventory items found. Click "Add Item" to get started.</td></tr>';
    } else {
      snapshot.forEach(doc => {
        const product = doc.data();
        product.firebaseId = doc.id;
        
        inventoryData.push(product);
        addProductToTable(product);
      });
    }
    
    updateStats();
    
  } catch (error) {
    console.error('Error loading inventory from Firebase:', error);
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">Error loading inventory. Please refresh the page.</td></tr>';
  }
}

// Delete product function
async function deleteProduct() {
  const id = document.getElementById('editFirebaseId').value;
  const productName = document.getElementById('editItemName').value;
  
  if (!confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
    return;
  }
  
  try {
    if (id) {
      await db.collection('inventory').doc(id).delete();
      
      // Remove from local data
      const index = inventoryData.findIndex(p => p.firebaseId === id);
      if (index !== -1) {
        inventoryData.splice(index, 1);
      }
      
      // Refresh table
      const tbody = document.getElementById('inventoryTableBody');
      tbody.innerHTML = '';
      inventoryData.forEach(p => addProductToTable(p));
      updateStats();
      
      // Reload categories after deletion
      await loadCategories();
      
      closeEditProductModal();
      alert('✅ Product deleted successfully!');
    } else {
      alert('Error: Missing product ID.');
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    alert('Error deleting product. Check console for details.');
  }
}

// Handle page unload
window.addEventListener("beforeunload", async (e) => {
  await handleClockOut();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  // Set loading state
  document.getElementById('userDisplayName').textContent = 'Loading...';
  document.getElementById('inventoryTableBody').innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">Loading inventory data...</td></tr>';
  
  loadCurrentUserName();
  loadCategories();
  loadInventoryFromFirebase();
  loadNotifications();
  setInterval(loadNotifications, 5000);

  // Setup logout button handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showLogoutModal();
    });
  }
});