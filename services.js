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
let servicesData = [];
let editMode = false;
let categories = [];
let currentUser = null;
let servicesListener = null;
let notificationListener = null;

// Cache for user data and categories
let userDataCache = null;
let categoriesCache = null;
let lastCategoriesFetch = 0;
const CACHE_DURATION = 300000; // 5 minutes

// Load current user's full name - OPTIMIZED with caching
async function loadCurrentUserName() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        // Check cache first
        if (userDataCache && userDataCache.uid === user.uid) {
          currentUser = userDataCache;
          document.getElementById('userDisplayName').textContent = currentUser.fullName;
          document.getElementById('logoutUsername').textContent = currentUser.fullName;
          return;
        }

        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          currentUser = {
            uid: user.uid,
            fullName: userData.fullName || userData.email || 'User',
            email: userData.email || user.email
          };
        } else {
          currentUser = {
            uid: user.uid,
            fullName: user.email || 'User',
            email: user.email
          };
        }

        // Cache user data
        userDataCache = currentUser;
        
        document.getElementById('userDisplayName').textContent = currentUser.fullName;
        document.getElementById('logoutUsername').textContent = currentUser.fullName;
      } catch (error) {
        console.error('Error loading user data:', error);
        currentUser = {
          uid: user.uid,
          fullName: user.email || 'User',
          email: user.email
        };
        userDataCache = currentUser;
        document.getElementById('userDisplayName').textContent = currentUser.fullName;
        document.getElementById('logoutUsername').textContent = currentUser.fullName;
      }
    } else {
      window.location.href = 'index.html';
    }
  });
}

// Clock out function - OPTIMIZED with batch write
async function handleClockOut() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const today = new Date().toLocaleDateString();
    const logsRef = db.collection('staffLogs').doc(user.uid).collection('history');
    
    // Use limit(1) to reduce reads
    const todayQuery = logsRef.where('date', '==', today).limit(1);
    const todaySnap = await todayQuery.get();
    
    if (!todaySnap.empty) {
      const activeLog = todaySnap.docs[0];
      if (!activeLog.data().clockOut) {
        const batch = db.batch();
        
        // Batch both updates together
        batch.update(logsRef.doc(activeLog.id), {
          clockOut: new Date().toLocaleString()
        });
        
        batch.update(db.collection('users').doc(user.uid), {
          availability: false,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        console.log("User clocked out and set to unavailable");
      }
    }
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
    await handleClockOut();
    
    // Clear caches
    userDataCache = null;
    categoriesCache = null;
    
    // Detach listeners
    if (servicesListener) servicesListener();
    if (notificationListener) notificationListener();
    
    await auth.signOut();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    alert("An error occurred during logout. Please try again.");
    await auth.signOut();
    window.location.href = "index.html";
  }
}

// Load categories from memory first, then Firebase if needed - OPTIMIZED
async function loadCategories() {
  const now = Date.now();
  
  // Use cached categories if fresh
  if (categoriesCache && (now - lastCategoriesFetch) < CACHE_DURATION) {
    categories = categoriesCache;
    updateCategorySelects();
    return;
  }

  try {
    // Extract categories from already loaded services data
    const categorySet = new Set();
    const categoryOrder = [];
    
    servicesData.forEach(service => {
      if (service.category && !categorySet.has(service.category)) {
        categoryOrder.push(service.category);
        categorySet.add(service.category);
      }
    });

    categories = categoryOrder.map(cat => ({
      id: cat,
      name: cat
    }));

    // If no categories exist, add default ones
    if (categories.length === 0) {
      const defaultCategories = ['Hair Services', 'Nail Services', 'Facial Services', 'Lash Services', 'Massage'];
      categories = defaultCategories.map(cat => ({
        id: cat,
        name: cat
      }));
    }

    // Cache categories
    categoriesCache = categories;
    lastCategoriesFetch = now;

    updateCategorySelects();
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Update all category select elements
function updateCategorySelects() {
  const categorySelects = [
    document.getElementById('serviceCategorySelect'),
    document.getElementById('editServiceCategorySelect'),
    document.getElementById('categoryFilter')
  ];

  categorySelects.forEach((select, index) => {
    if (!select) return;
    
    const currentValue = select.value;
    
    if (index === 2) {
      select.innerHTML = '<option value="all">All Categories</option>';
    } else {
      select.innerHTML = '<option value="">Select Category</option>';
    }
    
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      select.appendChild(option);
    });
    
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
    
    if (currentValue && currentValue !== 'all' && currentValue !== '' && 
        currentValue !== '__ADD_NEW__' && currentValue !== '__MANAGE__') {
      select.value = currentValue;
    }
  });
  
  const addCategorySelects = [
    document.getElementById('serviceCategorySelect'),
    document.getElementById('editServiceCategorySelect')
  ];
  
  addCategorySelects.forEach(select => {
    if (!select) return;
    select.removeEventListener('change', handleCategorySelectChange);
    select.addEventListener('change', handleCategorySelectChange);
  });
}

// Handle category select change
function handleCategorySelectChange(event) {
  if (event.target.value === '__ADD_NEW__') {
    event.target.dataset.triggerSelect = 'true';
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

// Handle Add Category - OPTIMIZED
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
    const placeholderService = {
      id: await generateUniqueServiceId(),
      name: `${categoryName} - Sample Service`,
      category: categoryName,
      price: 0,
      date: getCurrentDate(),
      createdBy: currentUser ? currentUser.fullName : 'Unknown',
      createdDate: getCurrentDate(),
      lastEditedBy: currentUser ? currentUser.fullName : 'Unknown',
      isPlaceholder: true
    };

    const docRef = await db.collection('services').add(placeholderService);
    placeholderService.firebaseId = docRef.id;
    
    // Update local data immediately (listener will update too)
    servicesData.push(placeholderService);
    
    // Add to categories and clear cache
    categories.push({
      id: categoryName,
      name: categoryName
    });
    categoriesCache = categories;
    
    updateCategorySelects();
    closeAddCategoryModal();
    
    const addSelect = document.getElementById('serviceCategorySelect');
    const editSelect = document.getElementById('editServiceCategorySelect');
    const addModal = document.getElementById('addServiceModal');
    const editModal = document.getElementById('editServiceModal');
    
    if (addModal && addModal.classList.contains('show')) {
      addSelect.value = categoryName;
    } else if (editModal && editModal.classList.contains('show')) {
      editSelect.value = categoryName;
    }
    
    alert(`Category "${categoryName}" added successfully!`);
    
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

// Load categories list for management - use in-memory data
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
    
    // Count from in-memory data
    const serviceCount = servicesData.filter(s => s.category === cat.name).length;
    
    categoryItem.innerHTML = `
      <div>
        <span class="font-semibold text-gray-800">${cat.name}</span>
        <span class="text-sm text-gray-500 ml-2">(${serviceCount} service${serviceCount !== 1 ? 's' : ''})</span>
      </div>
      <button 
        onclick="handleDeleteCategory('${cat.name.replace(/'/g, "\\'")}', ${serviceCount})" 
        class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition text-sm"
        title="Delete category"
      >
        <i class="fa-solid fa-trash"></i> Delete
      </button>
    `;
    
    listContainer.appendChild(categoryItem);
  });
}

// Handle Delete Category - OPTIMIZED with batch delete
async function handleDeleteCategory(categoryName, serviceCount) {
  const servicesInCategory = servicesData.filter(s => s.category === categoryName);
  
  if (servicesInCategory.length === 0) {
    if (!confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
      return;
    }
  } else {
    if (!confirm(`Warning: The category "${categoryName}" has ${servicesInCategory.length} service(s).\n\nDeleting this category will also delete all services in it. This action cannot be undone.\n\nAre you sure you want to continue?`)) {
      return;
    }
  }
  
  try {
    // Use batched deletes (max 500 per batch)
    const batches = [];
    let currentBatch = db.batch();
    let operationCount = 0;
    
    servicesInCategory.forEach(service => {
      currentBatch.delete(db.collection('services').doc(service.firebaseId));
      operationCount++;
      
      if (operationCount === 500) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        operationCount = 0;
      }
    });
    
    if (operationCount > 0) {
      batches.push(currentBatch);
    }
    
    // Commit all batches
    await Promise.all(batches.map(batch => batch.commit()));
    
    // Update local data
    servicesData = servicesData.filter(s => s.category !== categoryName);
    categories = categories.filter(c => c.name !== categoryName);
    categoriesCache = categories;
    
    updateStats();
    updateCategorySelects();
    loadManageCategoriesList();
    
    alert(`Category "${categoryName}" and its ${servicesInCategory.length} service(s) have been deleted successfully!`);
  } catch (error) {
    console.error('Error deleting category:', error);
    alert('Error deleting category. Please try again.');
  }
}

// Search functionality - debounced
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', function(e) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#servicesTableBody tr');
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  }, 300);
});

// Filter by category
function filterByCategory(category) {
  const rows = document.querySelectorAll('#servicesTableBody tr');
  
  rows.forEach(row => {
    if(category === 'all') {
      row.style.display = '';
    } else {
      const rowCategory = row.getAttribute('data-category');
      row.style.display = rowCategory === category ? '' : 'none';
    }
  });
}

// Export to CSV - use in-memory data
function exportToCSV() {
  let csv = 'Service ID,Service Name,Category,Price,Last Updated,Last Edited By\n';
  
  servicesData.forEach(row => {
    csv += `${row.id},${row.name},${row.category},${row.price},${row.date},${row.lastEditedBy || row.createdBy || 'Unknown'}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `services_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const userMenu = document.getElementById('userMenu');
  const userMenuButton = document.getElementById('userMenuButton');
  
  if (userMenuButton && !userMenuButton.contains(event.target) && !userMenu.contains(event.target)) {
    userMenu.classList.add('hidden');
  }

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

// Notification System - SIDEBAR BUBBLE NOTIFICATIONS
function loadNotifications() {
  if (notificationListener) {
    notificationListener();
  }

  notificationListener = db.collection('notifications')
    .orderBy('timestamp', 'desc')
    .onSnapshot((snapshot) => {
      const notifications = [];
      
      snapshot.forEach(doc => {
        notifications.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Update sidebar bubbles based on notification types
      updateSidebarBubbles(notifications);
    });
}

// Mark notifications as read for current page
async function markCurrentPageNotificationsRead() {
  const currentPage = window.location.pathname;
  let notificationType = null;
  
  // Determine notification type based on current page
  if (currentPage.includes('calendar.html')) {
    notificationType = 'appointment';
  } else if (currentPage.includes('purchase-order.html')) {
    notificationType = 'purchase_order';
  } else if (currentPage.includes('inventory.html')) {
    notificationType = 'low_stock';
  }
  
  // Mark notifications as read for this page
  if (notificationType) {
    try {
      const snapshot = await db.collection('notifications')
        .where('type', '==', notificationType)
        .where('read', '==', false)
        .get();
      
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.forEach(doc => {
          batch.update(doc.ref, { read: true });
        });
        await batch.commit();
        console.log(`Marked ${notificationType} notifications as read`);
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }
}

function updateSidebarBubbles(notifications) {
  // Count unread notifications by type
  const appointmentCount = notifications.filter(n => !n.read && n.type === 'appointment').length;
  const purchaseOrderCount = notifications.filter(n => !n.read && n.type === 'purchase_order').length;
  const lowStockCount = notifications.filter(n => !n.read && n.type === 'low_stock').length;
  
  // Update calendar bubble (appointments)
  updateBubble('calendarBubble', appointmentCount, '#dc2626'); // Red
  
  // Update purchase order bubble
  updateBubble('purchaseOrderBubble', purchaseOrderCount, '#8b5cf6'); // Purple
  
  // Update inventory bubble (low stock)
  updateBubble('inventoryBubble', lowStockCount, '#f59e0b'); // Yellow/Orange
}

function updateBubble(bubbleId, count, color) {
  let bubble = document.getElementById(bubbleId);
  
  if (!bubble) {
    // Create bubble if it doesn't exist
    const button = getBubbleButton(bubbleId);
    if (button) {
      bubble = document.createElement('span');
      bubble.id = bubbleId;
      bubble.className = 'sidebar-bubble';
      button.style.position = 'relative';
      button.appendChild(bubble);
    }
  }
  
  if (bubble) {
    if (count > 0) {
      bubble.textContent = count > 99 ? '99+' : count;
      bubble.style.backgroundColor = color;
      bubble.style.display = 'flex';
    } else {
      bubble.style.display = 'none';
    }
  }
}

function getBubbleButton(bubbleId) {
  const buttonMap = {
    'calendarBubble': document.querySelector('button[title="Reservations"]'),
    'purchaseOrderBubble': document.querySelector('button[title="Purchase Order"]'),
    'inventoryBubble': document.querySelector('button[title="Inventory"]')
  };
  return buttonMap[bubbleId];
}

function toggleNotifications() {
  // Removed - no longer needed
}

async function viewNotification(id) {
  // Removed - no longer needed
}

async function viewLowStockNotification(id) {
  // Removed - no longer needed
}

function closeNotificationModal() {
  // Removed - no longer needed
}

async function markAllRead() {
  // Removed - no longer needed
}

async function clearAllNotifications() {
  // Removed - no longer needed
}

async function approveAppointment(notificationId, appointmentId) {
  // Removed - no longer needed
}

async function rejectAppointment(notificationId, appointmentId) {
  // Removed - no longer needed
}

// Generate next Service ID - from in-memory data
function generateServiceId() {
  const maxId = servicesData.reduce((max, service) => {
    const num = parseInt(service.id.split('-')[1]);
    return num > max ? num : max;
  }, 0);
  return `SRV-${String(maxId + 1).padStart(3, '0')}`;
}

// Get current date
function getCurrentDate() {
  const today = new Date();
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return today.toLocaleDateString('en-US', options);
}

// Open Add Service Modal
function openAddServiceModal() {
  updateCategorySelects();
  document.getElementById('addServiceModal').classList.add('show');
}

// Close Add Service Modal
function closeAddServiceModal() {
  document.getElementById('addServiceModal').classList.remove('show');
  document.getElementById('addServiceForm').reset();
}

// Generate sequential unique ID - OPTIMIZED with caching
let serviceCounterCache = null;
let lastCounterFetch = 0;
const COUNTER_CACHE_DURATION = 60000; // 1 minute

async function generateUniqueServiceId() {
  try {
    const now = Date.now();
    
    // Use cached counter if recent
    if (serviceCounterCache !== null && (now - lastCounterFetch) < COUNTER_CACHE_DURATION) {
      serviceCounterCache++;
      // Update in background
      db.collection('metadata').doc('servicesCounter').update({ last: serviceCounterCache });
      return `SRV-${String(serviceCounterCache).padStart(3, '0')}`;
    }
    
    const counterRef = db.collection('metadata').doc('servicesCounter');
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

    // Update cache
    serviceCounterCache = newNumber;
    lastCounterFetch = now;

    return `SRV-${String(newNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating ID:', error);
    return `SRV-${Date.now().toString().slice(-3)}`;
  }
}

// Handle Add Service Form Submission
async function handleAddService(event) {
  event.preventDefault();
  
  const name = document.getElementById('serviceName').value.trim();
  const category = document.getElementById('serviceCategorySelect').value;
  const price = parseFloat(document.getElementById('servicePrice').value);
  
  if (!category || category === '__ADD_NEW__' || category === '__MANAGE__') {
    alert('Please select a valid category');
    return;
  }

  const categoryExists = categories.some(cat => cat.name.toLowerCase() === category.toLowerCase());
  
  if (!categoryExists) {
    alert('The selected category does not exist in the database. Please select an existing category or create a new one.');
    return;
  }
  
  const newService = {
    id: await generateUniqueServiceId(),
    name: name,
    category: category,
    price: price,
    date: getCurrentDate(),
    createdBy: currentUser ? currentUser.fullName : 'Unknown',
    createdDate: getCurrentDate(),
    lastEditedBy: currentUser ? currentUser.fullName : 'Unknown'
  };
  
  try {
    const docRef = await db.collection('services').add(newService);
    newService.firebaseId = docRef.id;
    
    closeAddServiceModal();
    alert(`Service "${name}" added successfully!`);
  } catch (error) {
    console.error('Error adding service:', error);
    alert('Error adding service. Please try again.');
  }
}

// Toggle Edit Mode
function toggleEditMode() {
  editMode = !editMode;
  const rows = document.querySelectorAll('#servicesTableBody tr');
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
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square mr-2"></i>Edit Service';
    rows.forEach(row => {
      row.classList.remove('edit-mode-active');
      row.removeEventListener('click', selectRowForEdit);
    });
  }
}

// When a row is clicked in edit mode - use in-memory data
function selectRowForEdit(event) {
  if (!editMode) return;
  
  if (event.target.closest('td:nth-child(5)')) return;

  const idCell = this.querySelector('td').textContent.trim();
  const service = servicesData.find(s => s.id === idCell);
  if (!service) return alert('Service not found.');

  updateCategorySelects();
  
  setTimeout(() => {
    document.getElementById('editFirebaseId').value = service.firebaseId;
    document.getElementById('editServiceName').value = service.name;
    document.getElementById('editServiceCategorySelect').value = service.category;
    document.getElementById('editServicePrice').value = service.price;

    document.getElementById('editServiceModal').classList.add('show');
  }, 100);
}

// Close Edit Service Modal
function closeEditServiceModal() {
  document.getElementById('editServiceModal').classList.remove('show');
  if (editMode) toggleEditMode();
}

// Save edited service
async function handleEditService(e) {
  e.preventDefault();

  const id = document.getElementById('editFirebaseId').value;
  const category = document.getElementById('editServiceCategorySelect').value;
  
  if (!category || category === '__ADD_NEW__' || category === '__MANAGE__') {
    alert('Please select a valid category');
    return;
  }

  const categoryExists = categories.some(cat => cat.name.toLowerCase() === category.toLowerCase());
  
  if (!categoryExists) {
    alert('The selected category does not exist in the database. Please select an existing category or create a new one.');
    return;
  }
  
  const updatedService = {
    name: document.getElementById('editServiceName').value.trim(),
    category: category,
    price: parseFloat(document.getElementById('editServicePrice').value),
    date: getCurrentDate(),
    lastEditedBy: currentUser ? currentUser.fullName : 'Unknown'
  };

  try {
    if (id) {
      await db.collection('services').doc(id).update(updatedService);

      closeEditServiceModal();
      alert('✅ Service updated successfully!');
    } else {
      alert('Error: Missing Firestore document ID.');
    }
  } catch (error) {
    console.error('Error updating service:', error);
    alert('Error updating service. Check console for details.');
  }
}

// Show edit history modal - use in-memory data
async function showEditHistory(firebaseId) {
  const service = servicesData.find(s => s.firebaseId === firebaseId);
  if (!service) return;

  const modal = document.getElementById('editHistoryModal');
  const modalBody = document.getElementById('editHistoryBody');
  
  modalBody.innerHTML = `
    <h2 class="text-2xl font-bold text-[#da5c73] mb-4">
      <i class="fa-solid fa-history mr-2"></i>Edit History
    </h2>
    <div class="space-y-3">
      <div><strong>Service Name:</strong> ${service.name}</div>
      <div><strong>Service ID:</strong> ${service.id}</div>
      <div><strong>Last Updated:</strong> ${service.date || 'N/A'}</div>
      <div><strong>Last Edited By:</strong> ${service.lastEditedBy || 'Unknown'}</div>
      ${service.createdBy ? `<div><strong>Created By:</strong> ${service.createdBy}</div>` : ''}
      ${service.createdDate ? `<div><strong>Created On:</strong> ${service.createdDate}</div>` : ''}
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

// Update statistics - calculate from in-memory data
function updateStats() {
  const totalServices = servicesData.length;
  const uniqueCategories = [...new Set(servicesData.map(s => s.category))].length;
  const prices = servicesData.map(s => s.price || 0);
  const avgPrice = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  
  // Get last updated service
  let lastUpdatedService = 'N/A';
  let lastUpdatedServiceId = null;
  if (servicesData.length > 0) {
    const sortedByDate = [...servicesData].sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB - dateA;
    });
    lastUpdatedService = sortedByDate[0].name || 'N/A';
    lastUpdatedServiceId = sortedByDate[0].firebaseId;
  }
  
  document.getElementById('totalServices').textContent = totalServices;
  document.getElementById('totalCategories').textContent = uniqueCategories;
  document.getElementById('avgPrice').textContent = `₱ ${Math.round(avgPrice).toLocaleString()}`;
  
  const lastUpdatedElement = document.getElementById('lastUpdatedService');
  lastUpdatedElement.textContent = lastUpdatedService;
  
  // Make it clickable if there's a service
  if (lastUpdatedServiceId) {
    lastUpdatedElement.style.cursor = 'pointer';
    lastUpdatedElement.onclick = () => showLastUpdatedInfo(lastUpdatedServiceId);
  } else {
    lastUpdatedElement.style.cursor = 'default';
    lastUpdatedElement.onclick = null;
  }
}

// Show last updated service info
function showLastUpdatedInfo(firebaseId) {
  const service = servicesData.find(s => s.firebaseId === firebaseId);
  if (!service) return;

  const modal = document.getElementById('lastUpdatedModal');
  const modalBody = document.getElementById('lastUpdatedBody');
  
  modalBody.innerHTML = `
    <h2 class="text-2xl font-bold text-[#da5c73] mb-4">
      <i class="fa-solid fa-info-circle mr-2"></i>Last Updated Service
    </h2>
    <div class="space-y-3">
      <div><strong>Service Name:</strong> ${service.name}</div>
      <div><strong>Service ID:</strong> ${service.id}</div>
      <div><strong>Category:</strong> ${service.category || 'N/A'}</div>
      <div><strong>Price:</strong> ₱${(service.price || 0).toLocaleString()}</div>
      <div><strong>Last Updated:</strong> ${service.date || 'N/A'}</div>
      <div class="text-lg font-bold text-[#da5c73] mt-4"><strong>Last Updated By:</strong> ${service.lastEditedBy || service.createdBy || 'Unknown'}</div>
      ${service.createdBy ? `<div class="text-sm text-gray-600"><strong>Originally Created By:</strong> ${service.createdBy}</div>` : ''}
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

// Render table from in-memory data - optimized
function renderServicesTable() {
  const tbody = document.getElementById('servicesTableBody');
  
  if (servicesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No services found. Click "Add Service" to get started.</td></tr>';
    return;
  }
  
  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  
  servicesData.forEach(service => {
    const row = document.createElement('tr');
    row.className = 'border-b hover:bg-gray-50 transition';
    row.setAttribute('data-category', service.category || '');
    row.setAttribute('data-firebase-id', service.firebaseId);
    
    const price = service.price || 0;
    
    row.innerHTML = `
      <td class="py-4 px-4 font-semibold">${service.id || 'N/A'}</td>
      <td class="py-4 px-4">${service.name || 'N/A'}</td>
      <td class="py-4 px-4">${service.category || 'N/A'}</td>
      <td class="py-4 px-4 text-right font-semibold text-[#da5c73]">₱ ${price.toLocaleString()}</td>
      <td class="py-4 px-4 text-center text-sm cursor-pointer hover:text-[#da5c73] hover:underline" onclick="showEditHistory('${service.firebaseId}')" title="Click to see edit history">${service.date || 'N/A'}</td>
    `;
    
    fragment.appendChild(row);
  });
  
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

// Load services from Firebase - OPTIMIZED with real-time listener
function loadServicesFromFirebase() {
  try {
    // Use onSnapshot for real-time updates instead of repeated gets
    servicesListener = db.collection('services')
      .onSnapshot((snapshot) => {
        // Process changes efficiently
        snapshot.docChanges().forEach((change) => {
          const service = change.doc.data();
          service.firebaseId = change.doc.id;
          
          if (change.type === 'added') {
            // Check if already exists to avoid duplicates
            const exists = servicesData.find(s => s.firebaseId === service.firebaseId);
            if (!exists) {
              servicesData.push(service);
            }
          } else if (change.type === 'modified') {
            const index = servicesData.findIndex(s => s.firebaseId === service.firebaseId);
            if (index !== -1) {
              servicesData[index] = service;
            }
          } else if (change.type === 'removed') {
            const index = servicesData.findIndex(s => s.firebaseId === service.firebaseId);
            if (index !== -1) {
              servicesData.splice(index, 1);
            }
          }
        });
        
        // Update UI
        renderServicesTable();
        updateStats();
        loadCategories(); // Update categories from services data
        
      }, (error) => {
        console.error('Error loading services:', error);
        const tbody = document.getElementById('servicesTableBody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-500">Error loading services. Please refresh the page.</td></tr>';
      });
    
  } catch (error) {
    console.error('Error setting up services listener:', error);
    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-500">Error loading services. Please refresh the page.</td></tr>';
  }
}

// Delete service function - OPTIMIZED
async function handleDeleteService() {
  const id = document.getElementById('editFirebaseId').value;
  const serviceName = document.getElementById('editServiceName').value;
  
  if (!confirm(`Are you sure you want to delete "${serviceName}"? This action cannot be undone.`)) {
    return;
  }
  
  try {
    if (id) {
      await db.collection('services').doc(id).delete();
      
      closeEditServiceModal();
      alert('Service deleted successfully!');
    } else {
      alert('Error: Missing service ID.');
    }
  } catch (error) {
    console.error('Error deleting service:', error);
    alert('Error deleting service. Check console for details.');
  }
}

// Cleanup function
function cleanup() {
  if (servicesListener) servicesListener();
  if (notificationListener) notificationListener();
  userDataCache = null;
  categoriesCache = null;
  servicesData = [];
  categories = [];
}

// Handle page unload
window.addEventListener("beforeunload", async (e) => {
  await handleClockOut();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  // Set loading state
  document.getElementById('userDisplayName').textContent = 'Loading...';
  document.getElementById('servicesTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Loading services data...</td></tr>';
  
  loadCurrentUserName();
  loadServicesFromFirebase(); // This will also load categories
  loadNotifications();
  
  // Mark current page notifications as read after a short delay
  setTimeout(() => {
    markCurrentPageNotificationsRead();
  }, 1000);

  // Setup logout button handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showLogoutModal();
    });
  }
  
  // Cleanup on page unload
  window.addEventListener('unload', cleanup);
});