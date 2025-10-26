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
let suppliers = [];
let currentUser = null;
let currentProductMode = 'existing';
let selectedProduct = null;
let purchaseOrderListener = null;
let inventoryListener = null;
let sessionMonitor = null;

// Cache for user data, suppliers, and categories
let userDataCache = null;
let suppliersCache = null;
let categoriesCache = null;
let itemCounterCache = null;
let lastCounterFetch = 0;
const COUNTER_CACHE_DURATION = 60000; // 1 minute

// Make functions globally accessible
window.editPO = editPO;
window.deletePO = deletePO;
window.receiveOrder = receiveOrder;
window.viewPO = viewPO;

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  
  const icons = {
    error: 'fa-circle-xmark',
    success: 'fa-circle-check',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="fa-solid ${icons[type]}"></i>
    </div>
    <div class="toast-content">
      <p>${message}</p>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function calculateOverstock(currentStock, dailyDemand, targetCoverage = 30) {
  if (!dailyDemand || dailyDemand <= 0) {
    return {
      isOverstock: false,
      excessUnits: 0,
      stockDuration: 0,
      targetCoverage: targetCoverage
    };
  }
  
  // Calculate how many days the current stock will last
  const stockDuration = Math.floor(currentStock / dailyDemand);
  
  // Calculate estimated demand for target coverage period
  const estimatedDemand = dailyDemand * targetCoverage;
  
  // Overstock if stock duration exceeds target coverage
  const isOverstock = stockDuration > targetCoverage;
  
  // Calculate excess units above estimated demand
  const excessUnits = Math.max(0, currentStock - estimatedDemand);
  
  return {
    isOverstock: isOverstock,
    excessUnits: Math.floor(excessUnits),
    stockDuration: stockDuration,
    targetCoverage: targetCoverage,
    estimatedDemand: Math.floor(estimatedDemand)
  };
}

function updateOverstockPreview() {
  // Only show overstock preview for NEW products
  if (currentProductMode !== 'new') {
    const infoBox = document.getElementById('overstockInfoBox');
    if (infoBox) {
      infoBox.style.display = 'none';
    }
    return;
  }
  
  const quantity = parseInt(document.getElementById('quantity')?.value) || 0;
  const dailyDemand = parseFloat(document.getElementById('newProductDailyDemand')?.value) || 0;
  const targetCoverage = parseInt(document.getElementById('newProductStockCoverage')?.value) || 30;
  
  const infoBox = document.getElementById('overstockInfoBox');
  
  if (quantity > 0 && dailyDemand > 0) {
    // Calculate stock duration in days
    const stockDuration = Math.floor(quantity / dailyDemand);
    
    // Calculate if it's overstock
    const isOverstock = stockDuration > targetCoverage;
    const excessUnits = isOverstock ? quantity - (dailyDemand * targetCoverage) : 0;
    
    infoBox.style.display = 'block';
    
    document.getElementById('previewStockDuration').textContent = stockDuration;
    document.getElementById('previewTargetCoverage').textContent = targetCoverage;
    
    const statusSpan = document.getElementById('previewOverstockStatus');
    if (isOverstock) {
      statusSpan.textContent = '⚠️ OVERSTOCK';
      statusSpan.className = 'font-bold text-orange-600';
      infoBox.className = 'info-box bg-orange-50 border-orange-500';
    } else {
      statusSpan.textContent = '✓ OPTIMAL';
      statusSpan.className = 'font-bold text-green-600';
      infoBox.className = 'info-box bg-blue-50 border-blue-500';
    }
    
    document.getElementById('previewExcessUnits').textContent = 
      excessUnits > 0 ? `${Math.floor(excessUnits)} units` : 'None';
    
  } else {
    infoBox.style.display = 'none';
  }
}

// Session monitoring function
function setupSessionMonitoring(userId) {
  if (sessionMonitor) sessionMonitor();
  
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
showToast('Your session has been ended because someone else logged into this account or your password was changed', 'error');
      
      // Force logout
      auth.signOut().then(() => {
        window.location.href = 'index.html';
      });
    }
  }, (error) => {
    console.error('Session monitoring error:', error);
  });
}

// Load current user
auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      // Check cache first
      if (userDataCache && userDataCache.uid === user.uid) {
        currentUser = userDataCache;
        document.getElementById('userDisplayName').textContent = currentUser.fullName;
        document.getElementById('logoutUsername').textContent = currentUser.fullName;
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
      
      // Start session monitoring
      setupSessionMonitoring(user.uid);
    } catch (error) {
      console.error('Error loading user:', error);
      currentUser = {
        uid: user.uid,
        fullName: user.email || 'User',
        email: user.email
      };
      userDataCache = currentUser;
      document.getElementById('userDisplayName').textContent = currentUser.fullName;
      document.getElementById('logoutUsername').textContent = currentUser.fullName;
      setupSessionMonitoring(user.uid);
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
    
    const todayQuery = logsRef.where('date', '==', today).limit(1);
    const todaySnap = await todayQuery.get();
    
    if (!todaySnap.empty) {
      const activeLog = todaySnap.docs[0];
      if (!activeLog.data().clockOut) {
        const batch = db.batch();
        
        batch.update(logsRef.doc(activeLog.id), {
          clockOut: new Date().toLocaleString()
        });
        
        batch.update(db.collection('users').doc(user.uid), {
          availability: false,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
      }
    }
  } catch (error) {
    console.error('Error during clock out:', error);
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
    suppliersCache = null;
    categoriesCache = null;
    itemCounterCache = null;
    
    // Clear notification flag
    sessionStorage.removeItem('poInventoryNotificationsShown');
    
    // Detach listeners
    if (purchaseOrderListener) purchaseOrderListener();
    if (inventoryListener) inventoryListener();
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

// Update sidebar bubbles based on inventory status - NO FIREBASE READS
function updateSidebarBubbles() {
  const noStockCount = inventoryItems.filter(item => item.status === 'out-of-stock').length;
  const lowStockCount = inventoryItems.filter(item => item.status === 'low-stock').length;
  const overstockCount = inventoryItems.filter(item => item.status === 'overstock').length;
  
  // Update inventory bubble (no stock - red, low stock - yellow, overstock - blue)
  updateInventoryBubble(noStockCount, lowStockCount, overstockCount);
  
  // Check if notifications have already been shown in this session
  const notificationsShown = sessionStorage.getItem('poInventoryNotificationsShown');
  
  if (!notificationsShown) {
    // Show toast for critical inventory issues (only once per session)
    if (noStockCount > 0) {
      showToast(`⚠️ ${noStockCount} product${noStockCount > 1 ? 's are' : ' is'} out of stock!`, 'error');
    } else if (lowStockCount > 0) {
      showToast(`⚠️ ${lowStockCount} product${lowStockCount > 1 ? 's are' : ' is'} running low on stock`, 'warning');
    } else if (overstockCount > 0) {
      showToast(`ℹ️ ${overstockCount} product${overstockCount > 1 ? 's have' : ' has'} excess inventory`, 'info');
    }
    
    // Mark notifications as shown for this session
    sessionStorage.setItem('poInventoryNotificationsShown', 'true');
  }
  
  // Purchase Order bubble
  const pendingPOCount = purchaseOrders.filter(po => po.status === 'pending').length;
  updatePurchaseOrderBubble(pendingPOCount);
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

// Load suppliers from cache or Firebase
async function loadSuppliersFromFirebase() {
  try {
    // Check cache first
    if (suppliersCache) {
      suppliers = suppliersCache;
      return;
    }

    const doc = await db.collection('metadata').doc('suppliers').get();
    if (doc.exists && doc.data().list) {
      suppliers = doc.data().list;
    } else {
      suppliers = ['Beauty Supplies Inc.', 'Cosmetic World', 'Hair Care Solutions', 'Nail Art Supplies', 'Skincare Essentials'];
      await db.collection('metadata').doc('suppliers').set({ list: suppliers });
    }
    
    // Cache suppliers
    suppliersCache = suppliers;
  } catch (error) {
    console.error('Error loading suppliers:', error);
    suppliers = ['Beauty Supplies Inc.', 'Cosmetic World', 'Hair Care Solutions', 'Nail Art Supplies', 'Skincare Essentials'];
    suppliersCache = suppliers;
  }
}

// Save suppliers to Firebase
async function saveSuppliersToFirebase() {
  try {
    await db.collection('metadata').doc('suppliers').set({ list: suppliers });
    suppliersCache = suppliers;
  } catch (error) {
    console.error('Error saving suppliers:', error);
  }
}

document.addEventListener('DOMContentLoaded', async function() {

    sessionStorage.removeItem('poInventoryNotificationsShown');

  await loadSuppliersFromFirebase();
  await loadCategoriesFromFirebase(); 
  loadInventoryItemsAndCategories();
  loadPurchaseOrders();
  updateSupplierDropdown();
  
  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('poDate').value = today;
  document.getElementById('poDate').min = today;
  
  document.getElementById('logoutBtn').addEventListener('click', function() {
    showLogoutModal();
  });
  
  document.getElementById('supplier').addEventListener('change', handleSupplierSelectChange);
  
  // ADD THIS EVENT DELEGATION FOR ACTION BUTTONS
  document.getElementById('poTableBody').addEventListener('click', function(e) {
    const button = e.target.closest('.po-action-btn');
    if (!button) return;
    
    const action = button.getAttribute('data-action');
    const index = parseInt(button.getAttribute('data-index'));
      
    switch(action) {
      case 'edit':
        editPO(index);
        break;
      case 'receive':
        receiveOrder(index);
        break;
      case 'delete':
        deletePO(index);
        break;
      case 'view':
        viewPO(index);
        break;
    }
  });
  
  // Rest of your existing code...
  
  document.getElementById('supplier').addEventListener('change', handleSupplierSelectChange);
  
// Add event listeners for stock level indicator
const quantityInput = document.getElementById('quantity');
const minStockInput = document.getElementById('newProductMinStock');

if (quantityInput) {
  quantityInput.addEventListener('input', function() {
    this.dataset.hasInteracted = 'true';
    
    // Auto-calculate and set minimum stock to 20% of order quantity (only for new products)
    if (currentProductMode === 'new' && this.value && parseInt(this.value) > 0) {
      const orderQty = parseInt(this.value);
      const suggested20Percent = Math.ceil(orderQty * 0.2);
      
      const minStockField = document.getElementById('newProductMinStock');
      if (minStockField) {
        minStockField.value = suggested20Percent;
        
        // Add visual feedback
        minStockField.classList.add('auto-updated');
        setTimeout(() => {
          minStockField.classList.remove('auto-updated');
        }, 1000);
      }
    }
    
    updateStockLevelIndicator();
    updateOverstockPreview();
    calculateTotal();
  });
  
  // Also mark as interacted when user focuses on the field
  quantityInput.addEventListener('focus', function() {
    if (this.value) {
      this.dataset.hasInteracted = 'true';
      updateStockLevelIndicator();
    }
  });
}

if (minStockInput) {
  minStockInput.addEventListener('input', function() {
    // Only update if quantity has been interacted with
    const quantityInput = document.getElementById('quantity');
    if (quantityInput && quantityInput.dataset.hasInteracted === 'true') {
      updateStockLevelIndicator();
      updateOverstockPreview();
    }
  });
}

// Add event listeners for daily demand and stock coverage
const dailyDemandInput = document.getElementById('newProductDailyDemand');
const stockCoverageInput = document.getElementById('newProductStockCoverage');

if (dailyDemandInput) {
  dailyDemandInput.addEventListener('input', updateOverstockPreview);
}

if (stockCoverageInput) {
  stockCoverageInput.addEventListener('input', updateOverstockPreview);
}
});

// Load inventory items and categories with real-time listener
function loadInventoryItemsAndCategories() {
  try {
    inventoryListener = db.collection('inventory')
      .onSnapshot(async (snapshot) => {
        inventoryItems = [];
        const categorySet = new Set();
        categoryCounts = {};
        
snapshot.forEach(doc => {
  const item = doc.data();
  item.firebaseId = doc.id;
  
  // Recalculate status based on current quantity with overstock tracking
  const qty = item.qty || 0;
  const minStock = item.minStock || 10;
  const originalOrderQty = item.originalOrderQty || 0;
  const customThreshold = item.overstockThreshold || null;
  
  item.status = determineStatus(qty, minStock, originalOrderQty, customThreshold);
  
  // Recalculate total
  item.total = qty * (item.price || 0);
          
          inventoryItems.push(item);
          
          if (item.category) {
            categorySet.add(item.category);
            categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
          }
        });
        
        // Load categories from Firebase (includes manually added ones)
        await loadCategoriesFromFirebase();
        
        // Merge with categories from inventory items
        categorySet.forEach(cat => {
          if (!categories.find(c => c.name === cat)) {
            categories.push({ id: cat, name: cat });
          }
        });
        
        // Sort categories alphabetically
        categories.sort((a, b) => a.name.localeCompare(b.name));
        
        categoriesCache = categories;
        
        populateProductDropdown();
        updateCategorySelects();
        updateSidebarBubbles();
      }, (error) => {
        console.error('Error loading inventory:', error);
      });
  } catch (error) {
    console.error('Error setting up inventory listener:', error);
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
    // Add to categories array
    categories.push({
      id: categoryName,
      name: categoryName
    });
    
    // Sort categories alphabetically
    categories.sort((a, b) => a.name.localeCompare(b.name));
    
    // Save to Firebase
    await saveCategoriesToFirebase();
    
    // Update the dropdown
    updateCategorySelects();
    
    closeAddCategoryModal();
    
    // Set the newly added category as selected
    const categorySelect = document.getElementById('newProductCategory');
    setTimeout(() => {
      categorySelect.value = categoryName;
    }, 100);
    
showToast(`Category "${categoryName}" added successfully! You can now use it when creating a new product in your purchase order.`, 'success');
    
  } catch (error) {
    console.error('Error adding category:', error);
    showToast('Error adding category: ' + error.message + '. Please try again.', 'error');
  }
}

// Load categories from Firebase
async function loadCategoriesFromFirebase() {
  try {
    // Check cache first
    if (categoriesCache) {
      categories = categoriesCache;
      return;
    }

    const doc = await db.collection('metadata').doc('inventoryCategories').get();
    if (doc.exists && doc.data().list) {
      categories = doc.data().list.map(name => ({ id: name, name: name }));
    } else {
      // If no categories exist, extract from inventory items
      const categorySet = new Set();
      inventoryItems.forEach(item => {
        if (item.category) {
          categorySet.add(item.category);
        }
      });
      
      if (categorySet.size === 0) {
        const defaultCategories = ['Hair Products', 'Nail Products', 'Skincare', 'Lash Products', 'Tools'];
        categories = defaultCategories.map(cat => ({ id: cat, name: cat }));
      } else {
        categories = Array.from(categorySet).map(cat => ({ id: cat, name: cat }));
      }
      
      // Save to Firebase for future use
      const categoryNames = categories.map(c => c.name);
      await db.collection('metadata').doc('inventoryCategories').set({ list: categoryNames });
    }
    
    // Cache categories
    categoriesCache = categories;
  } catch (error) {
    console.error('Error loading categories:', error);
    const defaultCategories = ['Hair Products', 'Nail Products', 'Skincare', 'Lash Products', 'Tools'];
    categories = defaultCategories.map(cat => ({ id: cat, name: cat }));
    categoriesCache = categories;
  }
}

// Save categories to Firebase
async function saveCategoriesToFirebase() {
  try {
    const categoryNames = categories.map(c => c.name);
    await db.collection('metadata').doc('inventoryCategories').set({ list: categoryNames });
    categoriesCache = categories;
  } catch (error) {
    console.error('Error saving categories:', error);
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
    const itemsToDelete = inventoryItems.filter(i => i.category === categoryName);
    
    const batches = [];
    let batch = db.batch();
    let operationCount = 0;
    
    itemsToDelete.forEach(item => {
      batch.delete(db.collection('inventory').doc(item.firebaseId));
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
    
    // Remove from categories array
    categories = categories.filter(c => c.name !== categoryName);
    
    // Save updated categories to Firebase
    await saveCategoriesToFirebase();
    
    closeManageCategoriesModal();
    
showToast(`Category "${categoryName}" and its ${itemCount} item(s) have been deleted successfully!`, 'success');
  } catch (error) {
    console.error('Error deleting category:', error);
showToast('Error deleting category. Please try again.', 'error');
  }
}

window.openManageCategoriesModal = openManageCategoriesModal;
window.closeManageCategoriesModal = closeManageCategoriesModal;
window.handleDeleteCategory = handleDeleteCategory;

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
async function handleAddSupplier(event) {
  event.preventDefault();
  
  const supplierName = document.getElementById('newSupplierName').value.trim();
  
  if (!supplierName) {
showToast('Supplier name cannot be empty!', 'error');
    return;
  }
  
  if (suppliers.some(s => s.toLowerCase() === supplierName.toLowerCase())) {
showToast('This supplier already exists! Please choose a different name.', 'error');
    return;
  }
  
  suppliers.push(supplierName);
  suppliers.sort();
  
  await saveSuppliersToFirebase();
  
  updateSupplierDropdown();
  closeAddSupplierModal();
  
  const supplierSelect = document.getElementById('supplier');
  supplierSelect.value = supplierName;
  
showToast(`Supplier "${supplierName}" added successfully!`, 'success');
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
async function handleDeleteSupplier(supplierName, usageCount) {
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
  
  await saveSuppliersToFirebase();
  
  updateSupplierDropdown();
  loadManageSuppliersList();
  
showToast(`Supplier "${supplierName}" has been deleted successfully!`, 'success');
}

window.openAddSupplierModal = openAddSupplierModal;
window.closeAddSupplierModal = closeAddSupplierModal;
window.handleAddSupplier = handleAddSupplier;
window.openManageSuppliersModal = openManageSuppliersModal;
window.closeManageSuppliersModal = closeManageSuppliersModal;
window.handleDeleteSupplier = handleDeleteSupplier;

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
  
  // Hide overstock preview for existing products
  const overstockInfoBox = document.getElementById('overstockInfoBox');
  if (overstockInfoBox) {
    overstockInfoBox.style.display = 'none';
  }
  
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
    
    // Set required for existing product fields
    document.getElementById('existingProduct').required = true;
    
    // Remove required from new product fields
    document.getElementById('newProductName').required = false;
    document.getElementById('newProductCategory').required = false;
    document.getElementById('newProductPrice').required = false;
    document.getElementById('newProductDailyDemand').required = false;
    document.getElementById('newProductStockCoverage').required = false;
    
    // Hide indicator when switching to existing product
    hideStockLevelIndicator();
    
    // Hide overstock preview when switching to existing product
    const overstockInfoBox = document.getElementById('overstockInfoBox');
    if (overstockInfoBox) {
      overstockInfoBox.style.display = 'none';
    }
} else {
    existingBtn.classList.remove('active');
    newBtn.classList.add('active');
    existingSection.style.display = 'none';
    newSection.style.display = 'block';
    
    // Remove required from existing product field
    document.getElementById('existingProduct').required = false;
    
    // Set required for new product fields
    document.getElementById('newProductName').required = true;
    document.getElementById('newProductCategory').required = true;
    document.getElementById('newProductPrice').required = true;
    document.getElementById('newProductDailyDemand').required = true;
    document.getElementById('newProductStockCoverage').required = true;
    
    generateNewProductId();
    
    // Don't show indicator yet - wait for user interaction
    hideStockLevelIndicator();
    
    // Trigger overstock preview update if there's already data
    setTimeout(() => {
      updateOverstockPreview();
    }, 100);
  }
  
  calculateTotal();
}

// Generate new product ID with caching
async function generateNewProductId() {
  try {
    const now = Date.now();
    
    if (itemCounterCache !== null && (now - lastCounterFetch) < COUNTER_CACHE_DURATION) {
      const newId = `INV-${String(itemCounterCache + 1).padStart(3, '0')}`;
      document.getElementById('newProductId').value = newId;
      return;
    }
    
    const counterRef = db.collection('metadata').doc('inventoryCounter');
    const docSnap = await counterRef.get();
    
    let newNumber = 1;
    if (docSnap.exists) {
      newNumber = (docSnap.data().last || 0) + 1;
    }
    
    itemCounterCache = newNumber - 1;
    lastCounterFetch = now;
    
    const newId = `INV-${String(newNumber).padStart(3, '0')}`;
    document.getElementById('newProductId').value = newId;
  } catch (error) {
    console.error('Error generating ID:', error);
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

  itemCounterCache = newNumber;
  lastCounterFetch = Date.now();

  return `INV-${String(newNumber).padStart(3, '0')}`;
}

// Calculate total value
function calculateTotal() {
  const qty = parseInt(document.getElementById('quantity').value);
  
  // Allow 0 or empty, but show 0.00 as total
  const quantity = isNaN(qty) || qty < 0 ? 0 : qty;
  
  let unitPrice = 0;
  
  if (currentProductMode === 'existing' && selectedProduct) {
    unitPrice = selectedProduct.price || 0;
  } else if (currentProductMode === 'new') {
    unitPrice = parseFloat(document.getElementById('newProductPrice').value) || 0;
  }
  
  const total = quantity * unitPrice;
  document.getElementById('totalValue').value = `₱ ${total.toFixed(2)}`;
}

function loadPurchaseOrders() {
  try {
    purchaseOrderListener = db.collection('purchaseOrders')
      .orderBy('date', 'desc')
      .onSnapshot((snapshot) => {
        purchaseOrders = [];
        
        snapshot.forEach(doc => {
          const po = doc.data();
          po.firebaseId = doc.id;
          purchaseOrders.push(po);
        });
        
        updateStats();
        renderTable();
        generatePONumber();
        updateSidebarBubbles();
      }, (error) => {
        console.error('Error loading purchase orders:', error);
      });
  } catch (error) {
    console.error('Error setting up purchase order listener:', error);
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
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('poDate').value = today;
  document.getElementById('poDate').min = today;
  switchProductMode('existing');
  selectedProduct = null;
  document.getElementById('productDetails').style.display = 'none';
  
  // Reset interaction flag and hide indicator
  hideStockLevelIndicator();
  
  document.getElementById('poModal').style.display = 'block';
}

// Close PO modal
function closePOModal() {
  document.getElementById('poModal').style.display = 'none';
}

function updateStockLevelIndicator() {
  const quantityInput = document.getElementById('quantity');
  const quantity = parseInt(quantityInput.value) || 0;
  const minStock = parseInt(document.getElementById('newProductMinStock').value) || 10;
  const dailyDemand = parseFloat(document.getElementById('newProductDailyDemand')?.value) || 0;
  const targetCoverage = parseInt(document.getElementById('newProductStockCoverage')?.value) || 30;
  
  // Find the label for quantity input
  const quantityInputDiv = quantityInput.parentElement;
  const quantityLabel = quantityInputDiv.querySelector('label');
  
  if (!quantityLabel) return;
  
  // Get or create the inline indicator span
  let indicator = document.getElementById('stockLevelIndicator');
  
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.id = 'stockLevelIndicator';
    quantityLabel.appendChild(indicator);
  }
  
  // Only show for new products AND if user has interacted with quantity field
  const hasInteracted = quantityInput.dataset.hasInteracted === 'true';
  
  if (currentProductMode !== 'new' || !hasInteracted) {
    indicator.style.display = 'none';
    return;
  }
  
  // Calculate overstock using proper formula
  const overstockCalc = dailyDemand > 0 ? 
    calculateOverstock(quantity, dailyDemand, targetCoverage) : 
    { isOverstock: false, stockDuration: 0 };
  
  // Determine status and message
  if (quantity === 0) {
    indicator.className = 'ml-2 text-xs font-semibold text-red-600';
    indicator.textContent = '⚠️ Out of Stock - 0 inventory';
    indicator.style.display = 'inline';
  } else if (quantity <= minStock) {
    indicator.className = 'ml-2 text-xs font-semibold text-yellow-600';
    indicator.textContent = `⚠️ Low Stock (min: ${minStock})`;
    indicator.style.display = 'inline';
  } else if (dailyDemand > 0 && overstockCalc.isOverstock) {
    indicator.className = 'ml-2 text-xs font-semibold text-blue-600';
    indicator.textContent = `ℹ️ Overstock (${overstockCalc.stockDuration} days vs ${targetCoverage} target)`;
    indicator.style.display = 'inline';
  } else {
    indicator.className = 'ml-2 text-xs font-semibold text-green-600';
    indicator.textContent = dailyDemand > 0 ? `✓ Optimal (${overstockCalc.stockDuration} days)` : '✓ Optimal';
    indicator.style.display = 'inline';
  }
}

// Hide the indicator (called when switching modes or opening modal)
function hideStockLevelIndicator() {
  const indicator = document.getElementById('stockLevelIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
  
  // Reset interaction flag
  const quantityInput = document.getElementById('quantity');
  if (quantityInput) {
    quantityInput.dataset.hasInteracted = 'false';
  }
}


// Show duplicate PO warning modal
function showDuplicatePOModal(duplicatePO) {
  return new Promise((resolve) => {
    const modal = document.getElementById('duplicatePOModal');
    document.getElementById('duplicatePOName').textContent = duplicatePO.productName;
    document.getElementById('duplicatePONumber').textContent = duplicatePO.id;
    document.getElementById('duplicatePODate').textContent = formatDate(duplicatePO.date);
    document.getElementById('duplicatePOSupplier').textContent = duplicatePO.supplier;
    
    modal.classList.add('show');
    
    // Store resolve function
    window.duplicatePOResolve = resolve;
  });
}

function hideDuplicatePOModal(confirmed) {
  const modal = document.getElementById('duplicatePOModal');
  modal.classList.remove('show');
  
  if (window.duplicatePOResolve) {
    window.duplicatePOResolve(confirmed);
    window.duplicatePOResolve = null;
  }
}


// Make function globally accessible
window.hideDuplicatePOModal = hideDuplicatePOModal;

// Handle form submission
document.getElementById('poForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  // Mark quantity as interacted when submitting (so warnings show)
  const quantityInput = document.getElementById('quantity');
  if (quantityInput && currentProductMode === 'new') {
    quantityInput.dataset.hasInteracted = 'true';
    updateStockLevelIndicator();
  }
  
  let productData = {};
  
  if (currentProductMode === 'existing') {
    if (!selectedProduct) {
showToast('Please select a product from inventory.', 'error');
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
    
    if (!name || !category || !price || category === '__ADD_NEW__' || category === '__MANAGE__') {
showToast('Please fill in all required fields for the new product.', 'error');
      return;
    }
    
    const duplicateName = inventoryItems.find(item => 
      item.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    
    if (duplicateName) {
      showToast(`⚠️ Duplicate Product Name! A product with the name "${duplicateName.name}" already exists. Product ID: ${duplicateName.id}, Category: ${duplicateName.category}. Please use the "Existing Product" option or choose a different name.`, 'error');
      return;
    }
    
    const duplicateId = inventoryItems.find(item => 
      item.id === productId
    );
    
    if (duplicateId) {
      showToast(`⚠️ Duplicate Product ID! A product with ID "${duplicateId.id}" already exists (${duplicateId.name}). Please refresh the page to generate a new ID.`, 'error');
      await generateNewProductId();
      return;
    }
    
const duplicateInPO = purchaseOrders.find(po => 
  po.isNewProduct && 
  po.status === 'pending' && 
  po.productName.toLowerCase().trim() === name.toLowerCase().trim()
);

if (duplicateInPO) {
  const proceed = await showDuplicatePOModal(duplicateInPO);
  
  if (!proceed) {
    return; // This is actually correct - it stops submission and keeps the form open
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
  
  // Get quantity and allow 0
  const quantityValue = document.getElementById('quantity').value;
  
  // Check if quantity field is empty
  if (quantityValue === '' || quantityValue === null) {
showToast('Please enter an order quantity (you can enter 0 for product templates).', 'error');
    return;
  }
  
  const quantity = parseInt(quantityValue);
  
  // Validate quantity is a number and not negative
  if (isNaN(quantity) || quantity < 0) {
showToast('Please enter a valid quantity (0 or greater).', 'error');
    return;
  }
  
  const totalValue = quantity * productData.unitPrice;

// Check stock levels and warn user for NEW products only
if (currentProductMode === 'new') {
  const minStock = parseInt(document.getElementById('newProductMinStock').value);
  const suggestedMinStock = Math.ceil(quantity * 0.2); // 20% of order quantity
  const dailyDemand = parseFloat(document.getElementById('newProductDailyDemand')?.value) || 0;
  const targetCoverage = parseInt(document.getElementById('newProductStockCoverage')?.value) || 30;
  
  // Validate required fields
  if (!dailyDemand || dailyDemand <= 0) {
    showToast('⚠️ Please enter the estimated daily demand to calculate overstock levels.', 'error');
    document.getElementById('newProductDailyDemand')?.focus();
    return;
  }
  
  // Calculate overstock using proper formula
  const overstockCalc = calculateOverstock(quantity, dailyDemand, targetCoverage);
  
  // Check if quantity will result in no stock (0)
  if (quantity === 0) {
    const confirmNoStock = await showZeroStockModal();
    
    if (!confirmNoStock) {
      return;
    }
  }
  // Check if minStock is less than 20% of order quantity
  else if (minStock < suggestedMinStock) {
    showToast(`⚠️ Minimum Stock Level Too Low! Your minimum stock (${minStock}) is below the recommended 20% of order quantity (${suggestedMinStock}). Consider increasing it for better inventory management.`, 'warning');
  }
  // Check if quantity will result in low stock
  else if (quantity <= minStock) {
    const confirmLowStock = await showLowStockModal(quantity, minStock);
    
    if (!confirmLowStock) {
      return;
    }
  }
  // Check if quantity will result in overstock using proper calculation
  else if (overstockCalc.isOverstock) {
    const confirmOverstock = await showOverstockModal(
      quantity, 
      minStock, 
      overstockCalc.stockDuration,
      targetCoverage,
      overstockCalc.excessUnits,
      dailyDemand
    );
    
    if (!confirmOverstock) {
      return;
    }
  }
}


document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
      return; // ADD RETURN to prevent other checks
    }
    const duplicatePOModal = document.getElementById('duplicatePOModal');
    if (duplicatePOModal && duplicatePOModal.classList.contains('show')) {
      hideDuplicatePOModal(false);
      return; // ADD RETURN
    }
    const deletePOModal = document.getElementById('deletePOModal'); // ADD THIS
    if (deletePOModal && deletePOModal.classList.contains('show')) {
      hideDeletePOModal(false);
      return; // ADD RETURN
    }
    const lowStockModal = document.getElementById('lowStockModal');
    if (lowStockModal && lowStockModal.classList.contains('show')) {
      hideLowStockModal(false);
      return; // ADD RETURN
    }
    
    const zeroStockModal = document.getElementById('zeroStockModal');
    if (zeroStockModal && zeroStockModal.classList.contains('show')) {
      hideZeroStockModal(false);
      return; // ADD RETURN
    }
    
    const overstockModal = document.getElementById('overstockModal');
    if (overstockModal && overstockModal.classList.contains('show')) {
      hideOverstockModal(false);
      return; // ADD RETURN
    }
  }
});
  
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

// Add overstock tracking data for new products
if (currentProductMode === 'new') {
  const dailyDemand = parseFloat(document.getElementById('newProductDailyDemand')?.value) || 0;
  const targetCoverage = parseInt(document.getElementById('newProductStockCoverage')?.value) || 30;
  
  formData.newProductData = {
    ...formData.newProductData,
    dailyDemand: dailyDemand,
    targetStockCoverage: targetCoverage,
    estimatedDemand: dailyDemand * targetCoverage
  };
}

try {
  if (editingIndex === -1) {
    await db.collection('purchaseOrders').add(formData);
    
    // Show appropriate success message based on quantity
    if (currentProductMode === 'new' && quantity === 0) {
      showToast(`✅ Purchase Order Created! Product: ${productData.productName}, Quantity: 0 units (Product template). This product will be added to inventory with "Out of Stock" status.`, 'success');
    } else {
      showToast('✅ Purchase order created successfully!', 'success');
    }
  } else {
    const po = purchaseOrders[editingIndex];
    await db.collection('purchaseOrders').doc(po.firebaseId).update(formData);
    showToast('✅ Purchase order updated successfully!', 'success');
  }

  closePOModal();
} catch (error) {
  console.error('Error saving purchase order:', error);
  showToast('Error saving purchase order. Please try again.', 'error');
}
});

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
            <button data-action="edit" data-index="${index}" class="text-blue-600 hover:text-blue-800 po-action-btn" title="Edit" style="cursor: pointer; padding: 5px;">
              <i class="fa-solid fa-edit"></i>
            </button>
            <button data-action="receive" data-index="${index}" class="text-green-600 hover:text-green-800 po-action-btn" title="Mark as Received" style="cursor: pointer; padding: 5px;">
              <i class="fa-solid fa-check"></i>
            </button>
            <button data-action="delete" data-index="${index}" class="text-red-600 hover:text-red-800 po-action-btn" title="Delete" style="cursor: pointer; padding: 5px;">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : `
            <button data-action="view" data-index="${index}" class="text-blue-600 hover:text-blue-800 po-action-btn" title="View Details" style="cursor: pointer; padding: 5px;">
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
showToast('Only pending purchase orders can be edited.', 'warning');
    return;
  }
  
  editingIndex = index;
  
  document.getElementById('modalTitle').textContent = 'Edit Purchase Order';
  document.getElementById('poNumber').value = po.id;
  document.getElementById('poDate').value = po.date;
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('poDate').min = today;
  
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

function viewPO(index) {
  const po = purchaseOrders[index];
  showToast(`📋 PO #${po.id} | ${formatDate(po.date)} | Supplier: ${po.supplier} | Product: ${po.productName} (${po.productId}) | Category: ${po.category || 'N/A'} | Qty: ${po.quantity} | Unit Price: ₱${(po.unitPrice || 0).toFixed(2)} | Total: ₱${(po.totalValue || 0).toFixed(2)} | Status: ${po.status} | Created by: ${po.createdBy || 'Unknown'}`, 'info');
}

// Modal confirmation handlers
let confirmationResolve = null;

function showLowStockModal(quantity, minStock) {
  return new Promise((resolve) => {
    confirmationResolve = resolve;
    
    document.getElementById('lowStockTitle').textContent = 
      `Your order quantity (${quantity} units) is at or below minimum stock level (${minStock} units)`;
    
    document.getElementById('lowStockMessage1').textContent = 
      'The product will immediately show as "Low Stock"';
    
    document.getElementById('lowStockMessage2').textContent = 
      'You may need to reorder soon';
    
    document.getElementById('lowStockMessage3').textContent = 
      `Recommended quantity: ${Math.ceil(minStock * 2)} units or more`;
    
    document.getElementById('lowStockModal').classList.add('show');
  });
}

function hideLowStockModal(confirmed) {
  document.getElementById('lowStockModal').classList.remove('show');
  if (confirmationResolve) {
    confirmationResolve(confirmed);
    confirmationResolve = null;
  }
}

function showZeroStockModal() {
  return new Promise((resolve) => {
    confirmationResolve = resolve;
    document.getElementById('zeroStockModal').classList.add('show');
  });
}

function hideZeroStockModal(confirmed) {
  document.getElementById('zeroStockModal').classList.remove('show');
  if (confirmationResolve) {
    confirmationResolve(confirmed);
    confirmationResolve = null;
  }
}

function showOverstockModal(quantity, minStock, stockDuration, targetCoverage, excessUnits, dailyDemand) {
  return new Promise((resolve) => {
    confirmationResolve = resolve;
    
    const estimatedDemand = Math.round(dailyDemand * targetCoverage);
    
    document.getElementById('overstockTitle').textContent = 
      `Stock duration (${stockDuration} days) exceeds target coverage (${targetCoverage} days)`;
    
    document.getElementById('overstockMessage1').textContent = 
      `Excess inventory: ${excessUnits} units above estimated demand`;
    
    document.getElementById('overstockMessage2').textContent = 
      'Higher inventory holding costs and capital tied up';
    
    document.getElementById('overstockMessage3').textContent = 
      'Risk of product expiration or obsolescence';
    
    document.getElementById('overstockRange').innerHTML = 
      `<strong>Formula:</strong> Overstock = ${quantity} (Total Stock) - ${estimatedDemand} (${dailyDemand}/day × ${targetCoverage} days) = ${excessUnits} excess units<br>` +
      `<strong>Stock Duration:</strong> ${stockDuration} days | <strong>Target:</strong> ${targetCoverage} days | <strong>Recommendation:</strong> Order ${estimatedDemand} units instead`;
    
    document.getElementById('overstockModal').classList.add('show');
  });
}

function hideOverstockModal(confirmed) {
  document.getElementById('overstockModal').classList.remove('show');
  if (confirmationResolve) {
    confirmationResolve(confirmed);
    confirmationResolve = null;
  }
}

// Make functions globally accessible
window.hideLowStockModal = hideLowStockModal;
window.hideZeroStockModal = hideZeroStockModal;
window.hideOverstockModal = hideOverstockModal;

function determineStatus(qty, minStock, originalOrderQty = 0, customThreshold = null) {
  if (qty === 0) return 'out-of-stock';
  if (qty <= minStock) return 'low-stock';
  
  // Check for overstock using purchase order quantity
  if (originalOrderQty > 0) {
    const overstockCalc = calculateOverstock(qty, originalOrderQty, customThreshold);
    if (overstockCalc.isOverstock) return 'overstock';
  }
  
  return 'in-stock';
}

// Action Toast with Confirm/Cancel buttons
function showActionToast(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const container = document.getElementById('actionToastContainer');
    const toast = document.createElement('div');
    toast.className = 'action-toast';
    
    toast.innerHTML = `
      <div class="action-toast-header">
        <div class="action-toast-icon">
          <i class="fa-solid fa-check-circle" style="font-size: 20px;"></i>
        </div>
        <div class="action-toast-title">${title}</div>
      </div>
      <div class="action-toast-body">${message}</div>
      <div class="action-toast-buttons">
        <button class="action-toast-btn action-toast-btn-cancel" onclick="this.closest('.action-toast').remove(); window.actionToastResolve(false);">
          ${cancelText}
        </button>
        <button class="action-toast-btn action-toast-btn-confirm" onclick="this.closest('.action-toast').remove(); window.actionToastResolve(true);">
          ${confirmText}
        </button>
      </div>
    `;
    
    container.appendChild(toast);
    
    // Store resolve function globally
    window.actionToastResolve = resolve;
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto remove after 15 seconds if no action taken
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.remove('show');
        setTimeout(() => {
          toast.remove();
          resolve(false);
        }, 300);
      }
    }, 15000);
  });
}

// Show receive order confirmation modal
// Show receive order confirmation modal
function showReceiveOrderModal(po) {
  return new Promise((resolve) => {
    const modal = document.getElementById('receiveOrderModal');
    
    if (!modal) {
      console.error('Receive order modal not found!');
      resolve(confirm(`Mark this purchase order as received and add ${po.quantity} units of ${po.productName} to inventory?`));
      return;
    }
    
    document.getElementById('receivePONumber').textContent = po.id;
    document.getElementById('receivePOProduct').textContent = po.productName;
    document.getElementById('receivePOQuantity').textContent = po.quantity;
    document.getElementById('receivePOQuantityRepeat').textContent = po.quantity;
    document.getElementById('receivePOSupplier').textContent = po.supplier;
    
    modal.classList.add('show');
    
    // Store resolve function
    window.receiveOrderResolve = resolve;
  });
}

function hideReceiveOrderModal(confirmed) {
  const modal = document.getElementById('receiveOrderModal');
  
  if (modal) {
    modal.classList.remove('show');
  }
  
  if (window.receiveOrderResolve) {
    window.receiveOrderResolve(confirmed);
    window.receiveOrderResolve = null;
  }
}

// Make functions globally accessible
window.hideReceiveOrderModal = hideReceiveOrderModal;

function hideReceiveOrderModal(confirmed) {
  const modal = document.getElementById('receiveOrderModal');
  
  if (modal) {
    modal.classList.remove('show');
  }
  
  if (window.receiveOrderResolve) {
    window.receiveOrderResolve(confirmed);
    window.receiveOrderResolve = null;
  }
}

// Make functions globally accessible
window.hideReceiveOrderModal = hideReceiveOrderModal;

async function receiveOrder(index) {
  const po = purchaseOrders[index];
  
  // Show confirmation modal
  const confirmed = await showReceiveOrderModal(po);
  
  if (!confirmed) {
    return;
  }

  try {
    const existingProduct = inventoryItems.find(item => item.id === po.productId);

if (existingProduct) {
  const newQty = existingProduct.qty + po.quantity;
  const newTotal = newQty * existingProduct.price;
  
  // Get overstock tracking data (use existing or from PO if new product)
  const dailyDemand = existingProduct.dailyDemand || 0;
  const targetCoverage = existingProduct.targetStockCoverage || 30;
  
  const newStatus = determineStatus(newQty, existingProduct.minStock || 10, dailyDemand, targetCoverage);

  // Create restock history entry
  const restockEntry = {
    date: getCurrentDate(),
    quantity: po.quantity,
    purchaseOrderId: po.id,
    addedBy: currentUser ? currentUser.fullName : 'Unknown',
    notes: `Received from PO ${po.id} - Supplier: ${po.supplier}`
  };

  // Prepare update object
  const updateData = {
    qty: newQty,
    total: newTotal,
    status: newStatus,
    date: getCurrentDate(),
    lastEditedBy: currentUser ? currentUser.fullName : 'Unknown',
    supplier: po.supplier,
    restockHistory: firebase.firestore.FieldValue.arrayUnion(restockEntry)
  };

  // If this is the FIRST time receiving this product (no originalOrderQty set yet)
  if (!existingProduct.originalOrderQty) {
    updateData.originalOrderQty = po.quantity;
    updateData.overstockThreshold = Math.ceil(po.quantity * 0.20); // 20% of original order
  }

  await db.collection('inventory').doc(existingProduct.firebaseId).update(updateData);

showToast(`✅ Inventory updated! ${po.productName} (${po.productId}). Previous: ${existingProduct.qty}, Added: ${po.quantity}, New: ${newQty}`, 'success');
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

        itemCounterCache = parseInt(po.productId.split('-')[1]);
        lastCounterFetch = Date.now();

const dailyDemand = po.newProductData?.dailyDemand || 0;
const targetCoverage = po.newProductData?.targetStockCoverage || 30;

// Create initial restock history entry
const initialRestockEntry = {
  date: getCurrentDate(),
  quantity: po.quantity,
  purchaseOrderId: po.id,
  addedBy: currentUser ? currentUser.fullName : 'Unknown',
  notes: `Initial stock from PO ${po.id} - Supplier: ${po.supplier}`
};

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
  lastEditedBy: currentUser ? currentUser.fullName : 'Unknown',
  // Add overstock tracking fields
  dailyDemand: dailyDemand,
  targetStockCoverage: targetCoverage,
  // Add original order tracking
  originalOrderQty: po.quantity,
  overstockThreshold: Math.ceil(po.quantity * 0.20), // 20% of original order
  restockHistory: [initialRestockEntry]
};
await db.collection('inventory').add(newProduct);

showToast(`✅ New product added to inventory! ${po.productName} (${po.productId}), Category: ${po.category}, Quantity: ${po.quantity}`, 'success');
      } else {
showToast('⚠️ Error: Product not found in inventory and no new product data available.', 'error');
        return;
      }
    }

    await db.collection('purchaseOrders').doc(po.firebaseId).update({
      status: 'received',
      receivedDate: getCurrentDate(),
      receivedBy: currentUser ? currentUser.fullName : 'Unknown'
    });

  } catch (error) {
    console.error('Error processing order:', error);
showToast('Error processing the order. Please try again.', 'error');
  }
}

document.querySelectorAll('button[title="Delete"]').forEach((btn, i) => {
});

async function deletePO(index) {
  
  const po = purchaseOrders[index];
  
  if (!po) {
    console.error('Purchase order not found at index:', index);
    showToast('Purchase order not found.', 'error');
    return;
  }
  
  // Show confirmation modal instead of browser confirm
  const confirmed = await showDeleteConfirmationModal(po);
  
  if (!confirmed) {
    return;
  }

  try {
    await db.collection('purchaseOrders').doc(po.firebaseId).delete();
    
    showToast('Purchase order deleted successfully!', 'success');
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    showToast('Error deleting purchase order. Please try again.', 'error');
  }
}

// Make sure it's globally accessible
window.deletePO = deletePO;

function showDeleteConfirmationModal(po) {
  
  return new Promise((resolve) => {
    const modal = document.getElementById('deletePOModal');
    
    if (!modal) {
      console.error('Delete modal not found!');
      // Fallback to browser confirm
      resolve(confirm(`Delete purchase order ${po.id}?`));
      return;
    }
    
    document.getElementById('deletePONumber').textContent = po.id;
    document.getElementById('deletePOProduct').textContent = po.productName;
    document.getElementById('deletePOSupplier').textContent = po.supplier;
    
    modal.classList.add('show');
  
    // Store resolve function
    window.deletePOResolve = resolve;
  });
}

function hideDeletePOModal(confirmed) {
  
  const modal = document.getElementById('deletePOModal');
  
  if (modal) {
    modal.classList.remove('show');
  }
  
  if (window.deletePOResolve) {
    window.deletePOResolve(confirmed);
    window.deletePOResolve = null;
  }
}

// Make sure it's globally accessible
window.hideDeletePOModal = hideDeletePOModal;

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
});

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('poModal');
  if (event.target === modal) {
    closePOModal();
  }

  const deletePOModal = document.getElementById('deletePOModal');
  if (event.target === deletePOModal) { // CHANGE: only close if clicking the overlay itself
    hideDeletePOModal(false);
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
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
      return;
    }

    const receiveOrderModal = document.getElementById('receiveOrderModal');
    if (receiveOrderModal && receiveOrderModal.classList.contains('show')) {
      hideReceiveOrderModal(false);
      return;
    }
    
    // Add new modal handlers
    const lowStockModal = document.getElementById('lowStockModal');
    if (lowStockModal && lowStockModal.classList.contains('show')) {
      hideLowStockModal(false);
    }
    
    const zeroStockModal = document.getElementById('zeroStockModal');
    if (zeroStockModal && zeroStockModal.classList.contains('show')) {
      hideZeroStockModal(false);
    }
    
    const overstockModal = document.getElementById('overstockModal');
    if (overstockModal && overstockModal.classList.contains('show')) {
      hideOverstockModal(false);
    }
  }
});

// Cleanup function
function cleanup() {
  if (purchaseOrderListener) purchaseOrderListener();
  if (inventoryListener) inventoryListener();
  if (sessionMonitor) sessionMonitor();
  userDataCache = null;
  suppliersCache = null;
  categoriesCache = null;
  itemCounterCache = null;
  purchaseOrders = [];
  inventoryItems = [];
  categories = [];
}

// Handle page unload
window.addEventListener("beforeunload", async (e) => {
  await handleClockOut();
});

window.addEventListener('unload', cleanup);