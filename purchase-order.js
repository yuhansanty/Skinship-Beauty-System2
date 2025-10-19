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

// Cache for user data, suppliers, and categories
let userDataCache = null;
let suppliersCache = null;
let categoriesCache = null;
let itemCounterCache = null;
let lastCounterFetch = 0;
const COUNTER_CACHE_DURATION = 60000; // 1 minute

// Load current user
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
      console.error('Error loading user:', error);
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
    
    // Detach listeners
    if (purchaseOrderListener) purchaseOrderListener();
    if (inventoryListener) inventoryListener();
    
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

// Update sidebar bubbles based on inventory and purchase orders
function updateSidebarBubbles() {
  // Inventory bubble
  const noStockCount = inventoryItems.filter(item => item.status === 'out-of-stock').length;
  const lowStockCount = inventoryItems.filter(item => item.status === 'low-stock').length;
  const overstockCount = inventoryItems.filter(item => {
    const minStockThreshold = item.minStock || 10;
    return item.qty > (minStockThreshold * 1.5) && item.qty > 0;
  }).length;
  
  updateInventoryBubble(noStockCount, lowStockCount, overstockCount);
  
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

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
  await loadSuppliersFromFirebase();
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
});

// Load inventory items and categories with real-time listener
function loadInventoryItemsAndCategories() {
  try {
    inventoryListener = db.collection('inventory')
      .onSnapshot((snapshot) => {
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

    await db.collection('inventory').add(placeholderItem);
    
    closeAddCategoryModal();
    
    const categorySelect = document.getElementById('newProductCategory');
    setTimeout(() => {
      categorySelect.value = categoryName;
    }, 500);
    
    alert(`Category "${categoryName}" added successfully!`);
    
  } catch (error) {
    console.error('Error adding category:', error);
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
    
    closeManageCategoriesModal();
    
    alert(`Category "${categoryName}" and its ${itemCount} item(s) have been deleted successfully!`);
  } catch (error) {
    console.error('Error deleting category:', error);
    alert('Error deleting category. Please try again.');
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
    alert('Supplier name cannot be empty!');
    return;
  }
  
  if (suppliers.some(s => s.toLowerCase() === supplierName.toLowerCase())) {
    alert('This supplier already exists! Please choose a different name.');
    return;
  }
  
  suppliers.push(supplierName);
  suppliers.sort();
  
  await saveSuppliersToFirebase();
  
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
  
  alert(`Supplier "${supplierName}" has been deleted successfully!`);
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

// Load purchase orders with real-time listener
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
      await db.collection('purchaseOrders').add(formData);
      alert('Purchase order created successfully!');
    } else {
      const po = purchaseOrders[editingIndex];
      await db.collection('purchaseOrders').doc(po.firebaseId).update(formData);
      alert('Purchase order updated successfully!');
    }

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
    const existingProduct = inventoryItems.find(item => item.id === po.productId);

    if (existingProduct) {
      const newQty = existingProduct.qty + po.quantity;
      const newTotal = newQty * existingProduct.price;
      const newStatus = determineStatus(newQty, existingProduct.minStock || 10);

      await db.collection('inventory').doc(existingProduct.firebaseId).update({
        qty: newQty,
        total: newTotal,
        status: newStatus,
        date: getCurrentDate(),
        lastEditedBy: currentUser ? currentUser.fullName : 'Unknown',
        supplier: po.supplier
      });

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

        itemCounterCache = parseInt(po.productId.split('-')[1]);
        lastCounterFetch = Date.now();

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

    await db.collection('purchaseOrders').doc(po.firebaseId).update({
      status: 'received',
      receivedDate: getCurrentDate(),
      receivedBy: currentUser ? currentUser.fullName : 'Unknown'
    });

  } catch (error) {
    console.error('Error processing order:', error);
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

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
    }
  }
});

// Cleanup function
function cleanup() {
  if (purchaseOrderListener) purchaseOrderListener();
  if (inventoryListener) inventoryListener();
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