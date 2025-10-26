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
let inventoryListener = null;
let purchaseOrderListener = null;
let sessionMonitor = null;


// Cache for user data and categories
let userDataCache = null;
let categoriesCache = null;
let lastCategoriesFetch = 0;
const CACHE_DURATION = 300000; // 5 minutes

// Toast notification function
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    `;
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  
  const icons = {
    error: 'fa-circle-xmark',
    success: 'fa-circle-check',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  
  const colors = {
    error: '#dc2626',
    success: '#16a34a',
    warning: '#f59e0b',
    info: '#3b82f6'
  };
  
  toast.style.cssText = `
    background: white;
    border-left: 4px solid ${colors[type]};
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    gap: 12px;
    align-items: flex-start;
    animation: slideIn 0.3s ease;
    max-width: 100%;
  `;
  
  toast.innerHTML = `
    <div style="color: ${colors[type]}; font-size: 20px; flex-shrink: 0;">
      <i class="fa-solid ${icons[type]}"></i>
    </div>
    <div style="flex: 1; font-size: 14px; color: #374151;">
      <p style="margin: 0;">${message}</p>
    </div>
    <button onclick="this.parentElement.remove()" style="background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 18px; padding: 0; flex-shrink: 0;">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

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
          
          // Setup session monitoring
          setupSessionMonitoring(user.uid);
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
        
        // Setup session monitoring
        setupSessionMonitoring(user.uid);
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
        
        // Setup session monitoring even on error
        setupSessionMonitoring(user.uid);
      }
    } else {
      window.location.href = 'index.html';
    }
  });
}

// Session monitoring function
function setupSessionMonitoring(userId) {
  if (sessionMonitor) sessionMonitor(); // Cleanup previous listener
  
  const userRef = db.collection('users').doc(userId);
  const storedSessionId = sessionStorage.getItem('sessionId');
  
  if (!storedSessionId) {
    console.warn('No session ID found, logging out...');
    auth.signOut();
    return;
  }
  
  sessionMonitor = userRef.onSnapshot((snapshot) => {
    if (!snapshot.exists) {
      console.warn('User document no longer exists');
      auth.signOut();
      return;
    }
    
    const data = snapshot.data();
    const currentSessionId = data.currentSessionId;
    
    // Check if session ID has changed (another login or password change)
    if (currentSessionId && currentSessionId !== storedSessionId) {
      console.log('Session invalidated - another login detected or password changed');
      
      // Show notification before logout
showToast('Your session has been ended because someone else logged in or your password was changed', 'warning');
      
      // Force logout
      auth.signOut().then(() => {
        window.location.href = 'index.html';
      });
    }
  }, (error) => {
    console.error('Session monitoring error:', error);
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
    if (inventoryListener) inventoryListener();
    if (purchaseOrderListener) purchaseOrderListener();
    if (sessionMonitor) sessionMonitor();
    
    await auth.signOut();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
showToast("An error occurred during logout. Please try again.", 'error');
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

async function handleAddCategory(event) {
  event.preventDefault();
  
  const categoryName = document.getElementById('newCategoryName').value.trim();
  
  if (!categoryName) {
    showToast('Category name cannot be empty!', 'error');
    return;
  }

  if (categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
    showToast('This category already exists! Please choose a different name.', 'error');
    return;
  }
  
  try {
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
    
    showToast(`Category "${categoryName}" added successfully!`, 'success');
    
  } catch (error) {
    console.error('Error adding category:', error);
    showToast('Error adding category. Please try again.', 'error');
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
    
    showToast(`Category "${categoryName}" and its ${servicesInCategory.length} service(s) deleted successfully!`, 'success');
  } catch (error) {
    console.error('Error deleting category:', error);
    showToast('Error deleting category. Please try again.', 'error');
  }
}

let searchTimeout;
document.getElementById('searchInput').addEventListener('input', function(e) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const searchTerm = e.target.value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter');
    const selectedCategory = categoryFilter ? categoryFilter.value : 'all';
    
    const rows = document.querySelectorAll('#servicesTableBody tr');
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const rowCategory = row.getAttribute('data-category');
      
      const matchesSearch = text.includes(searchTerm);
      const matchesCategory = selectedCategory === 'all' || rowCategory === selectedCategory;
      
      row.style.display = (matchesSearch && matchesCategory) ? '' : 'none';
    });
  }, 300);
});

function filterByCategory(category) {
  // Simply re-render the table with the filter applied
  renderServicesTable();
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

// Monitor inventory for sidebar bubble - OPTIMIZED single listener
function monitorInventory() {
  if (inventoryListener) {
    inventoryListener();
  }

  inventoryListener = db.collection('inventory')
    .onSnapshot((snapshot) => {
      let noStockCount = 0;
      let lowStockCount = 0;
      let overstockCount = 0;
      
      snapshot.forEach(doc => {
        const item = doc.data();
        const status = item.status || 'in-stock';
        
        if (status === 'out-of-stock') {
          noStockCount++;
        } else if (status === 'low-stock') {
          lowStockCount++;
        } else if (status === 'overstock') {
          overstockCount++;
        }
      });
      
      updateInventoryBubble(noStockCount, lowStockCount, overstockCount);
    }, (error) => {
      console.error('Error monitoring inventory:', error);
    });
}

function updateInventoryBubble(noStock, lowStock, overstock) {
  const button = document.querySelector('button[title="Inventory"]');
  if (!button) return;
  
  let bubble = button.querySelector('.sidebar-bubble');
  
  if (!bubble) {
    bubble = document.createElement('span');
    bubble.className = 'sidebar-bubble';
    button.style.position = 'relative';
    button.appendChild(bubble);
  }
  
  if (noStock > 0) {
    bubble.textContent = noStock > 99 ? '99+' : noStock;
    bubble.style.backgroundColor = '#dc2626'; // Red
    bubble.style.display = 'flex';
  } else if (lowStock > 0) {
    bubble.textContent = lowStock > 99 ? '99+' : lowStock;
    bubble.style.backgroundColor = '#f59e0b'; // Yellow
    bubble.style.display = 'flex';
  } else if (overstock > 0) {
    bubble.textContent = overstock > 99 ? '99+' : overstock;
    bubble.style.backgroundColor = '#3b82f6'; // Blue
    bubble.style.display = 'flex';
  } else {
    bubble.style.display = 'none';
  }
}

function updateInventoryBubble(noStock, lowStock, overstock) {
  const button = document.querySelector('button[title="Inventory"]');
  if (!button) return;
  
  let bubble = button.querySelector('.sidebar-bubble');
  
  if (!bubble) {
    bubble = document.createElement('span');
    bubble.className = 'sidebar-bubble';
    button.style.position = 'relative';
    button.appendChild(bubble);
  }
  
  // Priority: No stock (red) > Low stock (yellow) > Overstock (blue)
  if (noStock > 0) {
    bubble.textContent = noStock > 99 ? '99+' : noStock;
    bubble.style.backgroundColor = '#dc2626'; // Red
    bubble.style.display = 'flex';
  } else if (lowStock > 0) {
    bubble.textContent = lowStock > 99 ? '99+' : lowStock;
    bubble.style.backgroundColor = '#f59e0b'; // Yellow
    bubble.style.display = 'flex';
  } else if (overstock > 0) {
    bubble.textContent = overstock > 99 ? '99+' : overstock;
    bubble.style.backgroundColor = '#3b82f6'; // Blue
    bubble.style.display = 'flex';
  } else {
    bubble.style.display = 'none';
  }
}

// Monitor purchase orders for sidebar bubble - OPTIMIZED single listener
function monitorPurchaseOrders() {
  if (purchaseOrderListener) {
    purchaseOrderListener();
  }

  purchaseOrderListener = db.collection('purchaseOrders')
    .where('status', '==', 'pending')
    .limit(100)
    .onSnapshot((snapshot) => {
      const newOrderCount = snapshot.size;
      updatePurchaseOrderBubble(newOrderCount);
    }, (error) => {
      console.error('Error monitoring purchase orders:', error);
    });
}

function updatePurchaseOrderBubble(count) {
  const button = document.querySelector('button[title="Purchase Order"]');
  if (!button) return;
  
  let bubble = button.querySelector('.sidebar-bubble');
  
  if (!bubble) {
    bubble = document.createElement('span');
    bubble.className = 'sidebar-bubble';
    button.style.position = 'relative';
    button.appendChild(bubble);
  }
  
  if (count > 0) {
    bubble.textContent = count > 99 ? '99+' : count;
    bubble.style.backgroundColor = '#8b5cf6'; // Purple
    bubble.style.display = 'flex';
  } else {
    bubble.style.display = 'none';
  }
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

async function handleAddService(event) {
  event.preventDefault();
  
  const name = document.getElementById('serviceName').value.trim();
  const category = document.getElementById('serviceCategorySelect').value;
  const price = parseFloat(document.getElementById('servicePrice').value);
  
  if (!category || category === '__ADD_NEW__' || category === '__MANAGE__') {
    showToast('Please select a valid category', 'error');
    return;
  }

  const categoryExists = categories.some(cat => cat.name.toLowerCase() === category.toLowerCase());
  
  if (!categoryExists) {
    showToast('The selected category does not exist in the database. Please select an existing category or create a new one.', 'error');
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
    showToast(`Service "${name}" added successfully!`, 'success');
  } catch (error) {
    console.error('Error adding service:', error);
    showToast('Error adding service. Please try again.', 'error');
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
    showToast('Please select a valid category', 'error');
    return;
  }

  const categoryExists = categories.some(cat => cat.name.toLowerCase() === category.toLowerCase());
  
  if (!categoryExists) {
    showToast('The selected category does not exist in the database. Please select an existing category or create a new one.', 'error');
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
      showToast('Service updated successfully!', 'success');
    } else {
      showToast('Error: Missing Firestore document ID.', 'error');
    }
  } catch (error) {
    console.error('Error updating service:', error);
    showToast('Error updating service. Please try again.', 'error');
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

function renderServicesTable() {
  const tbody = document.getElementById('servicesTableBody');
  const categoryFilter = document.getElementById('categoryFilter');
  const selectedCategory = categoryFilter ? categoryFilter.value : 'all';
  
  if (servicesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500"><i class="fa-solid fa-inbox text-4xl mb-3 block"></i><strong>No services available</strong><br><span class="text-sm">Click "Add Service" to create your first service</span></td></tr>';
    return;
  }
  
  // Filter services based on selected category
  let filteredServices = servicesData;
  if (selectedCategory !== 'all') {
    filteredServices = servicesData.filter(service => service.category === selectedCategory);
  }
  
  // Check if filtered results are empty
  if (filteredServices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500"><i class="fa-solid fa-filter-circle-xmark text-4xl mb-3 block"></i><strong>No services found in this category</strong><br><span class="text-sm">Try selecting "All Categories" or add a new service</span></td></tr>';
    return;
  }
  
  // Sort services by date (newest first) - comparing timestamps
  const sortedServices = [...filteredServices].sort((a, b) => {
    // Parse dates for comparison
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA; // Descending order (newest first)
  });
  
  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  
  sortedServices.forEach(service => {
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

let pendingDeleteCategoryName = null;
let pendingDeleteCategoryServiceCount = 0;

// Show delete category modal
function showDeleteCategoryModal(categoryName, serviceCount) {
  pendingDeleteCategoryName = categoryName;
  pendingDeleteCategoryServiceCount = serviceCount;
  
  document.getElementById('deleteCategoryNameDisplay').textContent = categoryName;
  
  if (serviceCount === 0) {
    document.getElementById('deleteCategoryMessage').textContent = `Are you sure you want to delete the category "${categoryName}"?`;
    document.getElementById('deleteCategoryWarningText').textContent = 'This action cannot be undone';
    document.getElementById('deleteCategoryServiceCountItem').style.display = 'none';
  } else {
    document.getElementById('deleteCategoryMessage').textContent = `Warning: This category has ${serviceCount} service(s)`;
    document.getElementById('deleteCategoryWarningText').textContent = 'All services in this category will also be deleted';
    document.getElementById('deleteCategoryServiceCountItem').style.display = 'flex';
    document.getElementById('deleteCategoryServiceCountText').textContent = `${serviceCount} service${serviceCount !== 1 ? 's' : ''} will be deleted`;
  }
  
  document.getElementById('deleteCategoryModal').classList.add('show');
}

function hideDeleteCategoryModal() {
  document.getElementById('deleteCategoryModal').classList.remove('show');
  pendingDeleteCategoryName = null;
  pendingDeleteCategoryServiceCount = 0;
}

async function handleDeleteCategory(categoryName, serviceCount) {
  // Show custom modal instead of confirm()
  showDeleteCategoryModal(categoryName, serviceCount);
}

async function confirmDeleteCategory() {
  const confirmBtn = document.getElementById('confirmDeleteCategoryBtn');
  confirmBtn.classList.add('loading');
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner"></i> Deleting...';
  
  try {
    const servicesInCategory = servicesData.filter(s => s.category === pendingDeleteCategoryName);
    
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
    servicesData = servicesData.filter(s => s.category !== pendingDeleteCategoryName);
    categories = categories.filter(c => c.name !== pendingDeleteCategoryName);
    categoriesCache = categories;
    
    updateStats();
    updateCategorySelects();
    loadManageCategoriesList();
    
    hideDeleteCategoryModal();
    showToast(`Category "${pendingDeleteCategoryName}" and its ${servicesInCategory.length} service(s) deleted successfully!`, 'success');
  } catch (error) {
    console.error('Error deleting category:', error);
    showToast('Error deleting category. Please try again.', 'error');
    hideDeleteCategoryModal();
  } finally {
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete Category';
  }
}

// Cleanup function
function cleanup() {
  if (servicesListener) servicesListener();
  if (inventoryListener) inventoryListener();
  if (purchaseOrderListener) purchaseOrderListener();
  if (sessionMonitor) sessionMonitor();
  userDataCache = null;
  categoriesCache = null;
  servicesData = [];
  categories = [];
}

// Handle page unload
window.addEventListener("beforeunload", async (e) => {
  cleanup(); 
  await handleClockOut();
});

// Global variables for delete service confirmation
let pendingDeleteServiceId = null;
let pendingDeleteServiceName = null;

// Show delete service modal
function showDeleteServiceModal(serviceName, serviceId) {
  pendingDeleteServiceId = serviceId;
  pendingDeleteServiceName = serviceName;
  
  document.getElementById('deleteServiceNameDisplay').textContent = serviceName;
  document.getElementById('deleteServiceMessage').textContent = `Are you sure you want to delete "${serviceName}"?`;
  document.getElementById('deleteServiceModal').classList.add('show');
}

function hideDeleteServiceModal() {
  document.getElementById('deleteServiceModal').classList.remove('show');
  pendingDeleteServiceId = null;
  pendingDeleteServiceName = null;
}

async function handleDeleteService() {
  const id = document.getElementById('editFirebaseId').value;
  const serviceName = document.getElementById('editServiceName').value;
  
  // Show custom modal instead of confirm()
  showDeleteServiceModal(serviceName, id);
}

async function confirmDeleteService() {
  const confirmBtn = document.getElementById('confirmDeleteServiceBtn');
  confirmBtn.classList.add('loading');
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner"></i> Deleting...';
  
  // Get the service name before deleting
   const service = servicesData.find(s => s.firebaseId === pendingDeleteServiceId);
   const serviceName = service ? service.name : 'Service';
  
  try {
    if (pendingDeleteServiceId) {
      // Get the service name before deleting
      const service = servicesData.find(s => s.firebaseId === pendingDeleteServiceId);
      const serviceName = service ? service.name : 'Service';
      
      await db.collection('services').doc(pendingDeleteServiceId).delete();
      
      // Reset category filter to "All Categories"
      const categoryFilter = document.getElementById('categoryFilter');
      if (categoryFilter) {
        categoryFilter.value = 'all';
      }
      
      hideDeleteServiceModal();
      closeEditServiceModal();
showToast(`Service "${serviceName}" deleted successfully!`, 'success');
    } else {
      showToast('Error: Missing service ID.', 'error');
      hideDeleteServiceModal();
    }
  } catch (error) {
    console.error('Error deleting service:', error);
    showToast('Error deleting service. Please try again.', 'error');
    hideDeleteServiceModal();
  } finally {
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete Service';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  // Set loading state
  document.getElementById('userDisplayName').textContent = 'Loading...';
  document.getElementById('servicesTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Loading services data...</td></tr>';
  
  loadCurrentUserName();
  loadServicesFromFirebase();

  // Close delete modals when clicking outside or pressing Escape
document.addEventListener('click', function(event) {
  const deleteServiceModal = document.getElementById('deleteServiceModal');
  const deleteCategoryModal = document.getElementById('deleteCategoryModal');
  
  if (deleteServiceModal && event.target === deleteServiceModal) {
    hideDeleteServiceModal();
  }
  
  if (deleteCategoryModal && event.target === deleteCategoryModal) {
    hideDeleteCategoryModal();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const deleteServiceModal = document.getElementById('deleteServiceModal');
    const deleteCategoryModal = document.getElementById('deleteCategoryModal');
    const logoutModal = document.getElementById('logoutModal');
    
    if (deleteServiceModal && deleteServiceModal.classList.contains('show')) {
      hideDeleteServiceModal();
    }
    
    if (deleteCategoryModal && deleteCategoryModal.classList.contains('show')) {
      hideDeleteCategoryModal();
    }
    
    if (logoutModal && logoutModal.classList.contains('show')) {
      hideLogoutModal();
    }
  }
});
  
  // Monitor inventory and purchase orders for sidebar bubbles
  monitorInventory();
  monitorPurchaseOrders();

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