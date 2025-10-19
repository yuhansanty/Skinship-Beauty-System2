import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  collection, 
  getDocs, 
  onSnapshot,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
  setDoc,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD2Yh7L4Wl9XRlOgxnzZyo8xxds6a02UJY",
  authDomain: "skinship-1ff4b.firebaseapp.com",
  projectId: "skinship-1ff4b",
  storageBucket: "skinship-1ff4b.appspot.com",
  messagingSenderId: "963752770497",
  appId: "1:963752770497:web:8911cc6a375acdbdcc8d40"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global State
let isCategoryMenuOpen = false;
let isProductsMenuOpen = false;
let selectedPaymentMethod = 'cash';
let currentUserData = null;
let inventoryProducts = [];
let servicesData = [];
let categories = [];
let currentView = 'services';
let cart = [];
let currentCategory = 'all';
let productCategories = [];
let currentUserId = null;
let dataLoaded = false;

// Listener references for cleanup
let inventoryListener = null;
let purchaseOrderListener = null;

// ==================== AUTH & USER INFO ====================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  
  currentUserId = user.uid;
  
  // Only load data once
  if (!dataLoaded) {
    await loadUserInfo(user);
    await Promise.all([
      loadServicesFromFirebase(),
      loadInventoryProducts()
    ]);
    setupSidebarBubbles();
    dataLoaded = true;
  }
  
  currentView = 'services';
  currentCategory = 'all';
  renderServices(servicesData);
  
  const paymentInput = document.getElementById('paymentInput');
  if (paymentInput && !paymentInput.dataset.listenerAdded) {
    paymentInput.addEventListener('input', calculateChange);
    paymentInput.dataset.listenerAdded = 'true';
  }
});

async function loadUserInfo(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      currentUserData = userSnap.data();
      
      const fullName = currentUserData.fullName || 
                      currentUserData.fullname || 
                      currentUserData.name || 
                      currentUserData.username || 
                      'User';
      
      document.getElementById('usernameDisplay').textContent = fullName;
      document.getElementById('cashierName').value = fullName;
      document.getElementById('logoutUsername').textContent = fullName;
      
      applySidebarRoleBasedVisibility(currentUserData.role);
    } else {
      console.error('User document not found');
      const fallbackName = 'User Not Found';
      document.getElementById('usernameDisplay').textContent = fallbackName;
      document.getElementById('cashierName').value = 'Unknown User';
      document.getElementById('logoutUsername').textContent = fallbackName;
    }
  } catch (error) {
    console.error("Error loading user info:", error);
    const errorName = 'Error Loading User';
    document.getElementById('usernameDisplay').textContent = errorName;
    document.getElementById('cashierName').value = 'Unknown User';
    document.getElementById('logoutUsername').textContent = errorName;
  }
}

function applySidebarRoleBasedVisibility(role) {
  const htmlElement = document.documentElement;
  
  if (role === 'admin' || role === 'Admin') {
    htmlElement.classList.add('admin-loaded');
    htmlElement.classList.remove('staff-loaded');
  } else {
    htmlElement.classList.add('staff-loaded');
    htmlElement.classList.remove('admin-loaded');
  }
}

// ==================== DATA LOADING ====================

async function loadServicesFromFirebase() {
  try {
    const snapshot = await getDocs(collection(db, 'services'));
    servicesData = [];
    const categorySet = new Set();
    
    snapshot.forEach(docSnap => {
      const service = docSnap.data();
      servicesData.push({
        name: service.name,
        price: service.price,
        category: service.category,
        id: service.id,
        firebaseId: docSnap.id
      });
      
      categorySet.add(service.category);
    });
    
    categories = Array.from(categorySet).map(cat => ({
      name: cat,
      value: cat
    }));
    
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

async function loadInventoryProducts() {
  try {
    const snapshot = await getDocs(collection(db, 'inventory'));
    inventoryProducts = [];
    const categorySet = new Set();
    
    snapshot.forEach(docSnap => {
      const product = docSnap.data();
      
      inventoryProducts.push({
        name: product.name,
        price: product.price,
        category: product.category,
        qty: product.qty || 0,
        minStock: product.minStock || 10,
        status: product.status || 'in-stock',
        id: product.id,
        firebaseId: docSnap.id
      });
      
      categorySet.add(product.category);
    });
    
    productCategories = Array.from(categorySet).map(cat => ({
      name: cat,
      value: cat
    }));
    
  } catch (error) {
    console.error('Error loading inventory:', error);
  }
}

// ==================== SIDEBAR BUBBLE SYSTEM ====================

function setupSidebarBubbles() {
  // Setup inventory listener for real-time updates
  if (inventoryListener) {
    inventoryListener();
  }

  inventoryListener = onSnapshot(
    collection(db, 'inventory'),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const product = change.doc.data();
        product.firebaseId = change.doc.id;
        
        if (change.type === 'added') {
          const exists = inventoryProducts.find(p => p.firebaseId === product.firebaseId);
          if (!exists) {
            inventoryProducts.push({
              name: product.name,
              price: product.price,
              category: product.category,
              qty: product.qty || 0,
              minStock: product.minStock || 10,
              status: product.status || 'in-stock',
              id: product.id,
              firebaseId: product.firebaseId
            });
          }
        } else if (change.type === 'modified') {
          const index = inventoryProducts.findIndex(p => p.firebaseId === product.firebaseId);
          if (index !== -1) {
            inventoryProducts[index] = {
              name: product.name,
              price: product.price,
              category: product.category,
              qty: product.qty || 0,
              minStock: product.minStock || 10,
              status: product.status || 'in-stock',
              id: product.id,
              firebaseId: product.firebaseId
            };
          }
        } else if (change.type === 'removed') {
          const index = inventoryProducts.findIndex(p => p.firebaseId === product.firebaseId);
          if (index !== -1) {
            inventoryProducts.splice(index, 1);
          }
        }
      });
      
      updateInventoryBubble();
    },
    (error) => {
      console.error('Inventory listener error:', error);
    }
  );

  // Setup purchase order listener
  if (purchaseOrderListener) {
    purchaseOrderListener();
  }

  purchaseOrderListener = onSnapshot(
    query(collection(db, 'purchaseOrders'), where('status', '==', 'pending'), limit(100)),
    (snapshot) => {
      updatePurchaseOrderBubble(snapshot.size);
    },
    (error) => {
      console.error('Purchase order listener error:', error);
    }
  );
}

function updateInventoryBubble() {
  const noStockCount = inventoryProducts.filter(item => item.status === 'out-of-stock' || item.qty === 0).length;
  const lowStockCount = inventoryProducts.filter(item => item.status === 'low-stock' && item.qty > 0).length;
  const overstockCount = inventoryProducts.filter(item => {
    const minStockThreshold = item.minStock || 10;
    return item.qty > (minStockThreshold * 1.5) && item.qty > 0;
  }).length;
  
  const button = document.getElementById('inventoryBtn');
  if (!button) return;
  
  let bubble = button.querySelector('.sidebar-bubble');
  
  if (!bubble) {
    bubble = document.createElement('span');
    bubble.className = 'sidebar-bubble';
    button.style.position = 'relative';
    button.appendChild(bubble);
  }
  
  // Priority: No Stock (Red) > Low Stock (Yellow) > Overstock (Blue)
  if (noStockCount > 0) {
    bubble.textContent = noStockCount > 99 ? '99+' : noStockCount;
    bubble.style.backgroundColor = '#dc2626'; // Red
    bubble.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.4)';
    bubble.style.display = 'flex';
  } else if (lowStockCount > 0) {
    bubble.textContent = lowStockCount > 99 ? '99+' : lowStockCount;
    bubble.style.backgroundColor = '#f59e0b'; // Yellow
    bubble.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.4)';
    bubble.style.display = 'flex';
  } else if (overstockCount > 0) {
    bubble.textContent = overstockCount > 99 ? '99+' : overstockCount;
    bubble.style.backgroundColor = '#3b82f6'; // Blue
    bubble.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.4)';
    bubble.style.display = 'flex';
  } else {
    bubble.style.display = 'none';
  }
}

function updatePurchaseOrderBubble(count) {
  const button = document.getElementById('purchaseOrderBtn');
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
    bubble.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.4)';
    bubble.style.display = 'flex';
  } else {
    bubble.style.display = 'none';
  }
}

// ==================== UI FUNCTIONS ====================

function validatePhoneNumber(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.length > 11) {
    value = value.slice(0, 11);
  }
  input.value = value;
  
  const errorMsg = document.getElementById('phoneError');
  if (value.length > 0) {
    if (!value.startsWith('09')) {
      errorMsg.classList.remove('hidden');
      input.classList.add('border-red-300');
      input.classList.remove('border-pink-100');
    } else if (value.length === 11) {
      errorMsg.classList.add('hidden');
      input.classList.remove('border-red-300');
      input.classList.add('border-pink-100');
    } else {
      errorMsg.classList.remove('hidden');
      input.classList.add('border-red-300');
      input.classList.remove('border-pink-100');
    }
  } else {
    errorMsg.classList.add('hidden');
    input.classList.remove('border-red-300');
    input.classList.add('border-pink-100');
  }
}

function selectPaymentMethod(method) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.payment-method-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const selectedBtn = document.querySelector(`[data-method="${method}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  
  const referenceContainer = document.getElementById('referenceNumberContainer');
  if (referenceContainer) {
    if (method === 'check') {
      referenceContainer.classList.remove('hidden');
    } else {
      referenceContainer.classList.add('hidden');
    }
  }
  calculateChange();
}

function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

window.onclick = function(event) {
  if (!event.target.matches('#userMenuButton') && !event.target.matches('#userMenuButton *')) {
    const menu = document.getElementById('userMenu');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
    }
  }
  
  const logoutModal = document.getElementById('logoutModal');
  if (logoutModal && event.target === logoutModal) {
    hideLogoutModal();
  }
}

function showLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) {
    modal.classList.add('show');
  }
}

function hideLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

async function handleClockOut() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const today = new Date().toLocaleDateString();
    const logsRef = collection(db, "staffLogs", user.uid, "history");
    
    const todayQuery = query(logsRef, where("date", "==", today), limit(1));
    const todaySnap = await getDocs(todayQuery);
    
    if (!todaySnap.empty) {
      const activeLog = todaySnap.docs.find(docSnap => !docSnap.data().clockOut);
      if (activeLog) {
        await setDoc(doc(db, "staffLogs", user.uid, "history", activeLog.id), {
          clockOut: new Date().toLocaleString()
        }, { merge: true });
      }
    }

    const staffRef = doc(db, "users", user.uid);
    await updateDoc(staffRef, { 
      availability: false,
      lastUpdated: serverTimestamp()
    });
    
  } catch (error) {
    console.error('Clock out error:', error);
  }
}

async function confirmLogout() {
  const confirmBtn = document.getElementById('confirmLogoutBtn');
  if (confirmBtn) {
    confirmBtn.classList.add('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner"></i> Logging out...';
  }

  try {
    await handleClockOut();
    
    // Cleanup listeners
    if (inventoryListener) inventoryListener();
    if (purchaseOrderListener) purchaseOrderListener();
    
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error('Logout error:', error);
    if (confirmBtn) {
      confirmBtn.classList.remove('loading');
      confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    }
    
    alert("An error occurred during logout. Please try again.");
    await signOut(auth);
    window.location.href = "index.html";
  }
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
    }
  }
});

function logout() {
  showLogoutModal();
}

window.addEventListener("beforeunload", async (e) => {
  await handleClockOut();
});

// Make functions globally accessible
window.validatePhoneNumber = validatePhoneNumber;
window.selectPaymentMethod = selectPaymentMethod;
window.toggleUserMenu = toggleUserMenu;
window.showLogoutModal = showLogoutModal;
window.hideLogoutModal = hideLogoutModal;
window.confirmLogout = confirmLogout;
window.logout = logout;
window.toggleCategoryMenu = toggleCategoryMenu;
window.toggleProductsMenu = toggleProductsMenu;
window.showCategory = showCategory;
window.showProductCategory = showProductCategory;
window.filterServices = filterServices;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.checkout = checkout;

// ==================== CATEGORY & PRODUCT MENUS ====================

function toggleCategoryMenu() {
  const dropdown = document.getElementById('categoryDropdown');
  const btn = document.querySelector('.all-services-btn');
  const grid = document.getElementById('categoryGrid');
  const productsDropdown = document.getElementById('productsDropdown');
  const productsBtn = document.querySelector('.all-products-btn');
  
  if (isProductsMenuOpen) {
    productsDropdown.classList.remove('open');
    productsBtn.classList.remove('active');
    isProductsMenuOpen = false;
  }
  
  isCategoryMenuOpen = !isCategoryMenuOpen;
  
  if (isCategoryMenuOpen) {
    btn.classList.add('active');
    dropdown.classList.add('open');
    currentView = 'services';
    grid.innerHTML = '';
    
    const viewAllBtn = document.createElement('button');
    viewAllBtn.className = 'category-btn';
    viewAllBtn.textContent = 'View All Services';
    viewAllBtn.classList.add('first-row');
    if (currentCategory === 'all' && currentView === 'services') {
      viewAllBtn.classList.add('active');
    }
    viewAllBtn.onclick = () => showCategory('all', 'All Services');
    grid.appendChild(viewAllBtn);
    
    categories.forEach((cat, index) => {
      const button = document.createElement('button');
      button.className = 'category-btn';
      button.textContent = cat.name;
      
      if (index < 3) {
        button.classList.add('first-row');
      } else {
        button.classList.add('remaining-rows');
      }
      
      if (currentCategory === cat.value && currentView === 'services') {
        button.classList.add('active');
      }
      
      button.onclick = () => showCategory(cat.value, cat.name);
      grid.appendChild(button);
    });
  } else {
    btn.classList.remove('active');
    dropdown.classList.remove('open');
  }
}

function toggleProductsMenu() {
  const dropdown = document.getElementById('productsDropdown');
  const btn = document.querySelector('.all-products-btn');
  const grid = document.getElementById('productsGrid');
  const servicesDropdown = document.getElementById('categoryDropdown');
  const servicesBtn = document.querySelector('.all-services-btn');
  
  if (isCategoryMenuOpen) {
    servicesDropdown.classList.remove('open');
    servicesBtn.classList.remove('active');
    isCategoryMenuOpen = false;
  }
  
  isProductsMenuOpen = !isProductsMenuOpen;
  
  if (isProductsMenuOpen) {
    btn.classList.add('active');
    dropdown.classList.add('open');
    currentView = 'products';
    grid.innerHTML = '';
    
    const viewAllBtn = document.createElement('button');
    viewAllBtn.className = 'category-btn product-btn';
    viewAllBtn.textContent = 'View All Products';
    viewAllBtn.classList.add('first-row');
    if (currentCategory === 'all' && currentView === 'products') {
      viewAllBtn.classList.add('active');
    }
    viewAllBtn.onclick = () => showProductCategory('all', 'All Products');
    grid.appendChild(viewAllBtn);
    
    productCategories.forEach((cat, index) => {
      const button = document.createElement('button');
      button.className = 'category-btn product-btn';
      button.textContent = cat.name;
      
      if (index < 3) {
        button.classList.add('first-row');
      } else {
        button.classList.add('remaining-rows');
      }
      
      if (currentCategory === cat.value && currentView === 'products') {
        button.classList.add('active');
      }
      
      button.onclick = () => showProductCategory(cat.value, cat.name);
      grid.appendChild(button);
    });
  } else {
    btn.classList.remove('active');
    dropdown.classList.remove('open');
  }
}

function showProductCategory(category, categoryName) {
  currentCategory = category;
  currentView = 'products';
  
  const allProductsBtn = document.querySelector('.all-products-btn span');
  if (allProductsBtn) {
    allProductsBtn.textContent = categoryName || 'All Products';
  }
  
  const buttons = document.querySelectorAll('#productsGrid .category-btn');
  buttons.forEach(btn => {
    if (btn.textContent === 'View All Products' && category === 'all') {
      btn.classList.add('active');
    } else if (btn.textContent === categoryName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  if (category === 'all') {
    renderServices(inventoryProducts);
  } else {
    const filtered = inventoryProducts.filter(p => p.category === category);
    renderServices(filtered);
  }
  
  toggleProductsMenu();
}

function renderServices(filteredItems = servicesData) {
  const container = document.getElementById('servicesList');
  if (!container) return;
  
  container.innerHTML = '';
  
  filteredItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'service-card bg-white p-4 rounded-xl cursor-pointer';
    
    const stockInfo = item.qty !== undefined ? 
      `<p class="text-xs text-gray-500 mb-1">Stock: ${item.qty}</p>` : '';
    
    div.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-800 text-sm mb-1 truncate">${item.name}</h3>
          <p class="text-xs text-gray-500 mb-2">${item.category}</p>
          ${stockInfo}
          <div class="flex items-center justify-between">
            <span class="text-lg font-bold text-[#da5c73]">₱${item.price.toFixed(2)}</span>
            <button class="bg-pink-100 text-pink-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-pink-200 transition">
              <i class="fa-solid fa-plus mr-1"></i>Add
            </button>
          </div>
        </div>
      </div>
    `;
    div.onclick = () => addToCart(item);
    container.appendChild(div);
  });
}

function showCategory(category, categoryName) {
  currentCategory = category;
  currentView = 'services';
  
  const allServicesBtn = document.querySelector('.all-services-btn span');
  if (allServicesBtn) {
    allServicesBtn.textContent = categoryName || 'All Services';
  }
  
  const buttons = document.querySelectorAll('#categoryGrid .category-btn');
  buttons.forEach(btn => {
    const cat = categories.find(c => c.name === btn.textContent);
    if (cat && cat.value === category) {
      btn.classList.add('active');
    } else if (btn.textContent === 'View All Services' && category === 'all') {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  if (category === 'all') {
    renderServices(servicesData);
  } else {
    const filtered = servicesData.filter(s => s.category === category);
    renderServices(filtered);
  }
  
  toggleCategoryMenu();
}

function filterServices() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;
  
  const search = searchInput.value.toLowerCase();
  const itemsToFilter = currentView === 'products' ? inventoryProducts : servicesData;
  const filtered = itemsToFilter.filter(s => 
    s.name.toLowerCase().includes(search) || 
    s.category.toLowerCase().includes(search)
  );
  renderServices(filtered);
}

// ==================== CART FUNCTIONS ====================

function addToCart(item) {
  const existingItem = cart.find(cartItem => 
    cartItem.name.toLowerCase() === item.name.toLowerCase()
  );
  
  if (existingItem) {
    alert(`"${item.name}" is already in the cart!`);
    return;
  }
  
  if (item.qty !== undefined && item.qty <= 0) {
    alert(`"${item.name}" is out of stock!`);
    return;
  }
  
  cart.push({
    ...item, 
    id: Date.now() + Math.random(),
    isInventoryProduct: item.qty !== undefined,
    firebaseId: item.firebaseId
  });
  updateCart();
}

function removeFromCart(id) {
  const cartItemElement = event.target.closest('.cart-item');
  if (cartItemElement) {
    cartItemElement.classList.add('removing');
    setTimeout(() => {
      cart = cart.filter(item => item.id !== id);
      updateCart();
    }, 300);
  } else {
    cart = cart.filter(item => item.id !== id);
    updateCart();
  }
}

function updateCart() {
  const container = document.getElementById('cartItems');
  if (!container) return;
  
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-400 py-8">
        <i class="fa-solid fa-cart-shopping text-4xl mb-2"></i>
        <p class="text-sm">No items in cart</p>
      </div>
    `;
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
    }
  } else {
    container.innerHTML = cart.map(item => `
      <div class="cart-item bg-pink-50 p-2.5 rounded-lg border border-pink-200">
        <div class="flex justify-between items-start gap-2">
          <div class="flex-1 min-w-0">
            <h4 class="font-medium text-xs text-gray-800 truncate">${item.name}</h4>
            <p class="text-xs text-gray-500">${item.category}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <p class="font-bold text-[#da5c73] text-sm">₱${item.price.toFixed(2)}</p>
            <button onclick="removeFromCart(${item.id})" class="text-red-500 text-xs hover:text-red-700">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
    }
  }
  
  const totalElement = document.getElementById('totalAmount');
  if (totalElement) {
    totalElement.textContent = total.toFixed(2);
  }
  calculateChange();
}

function calculateChange() {
  const paymentInput = document.getElementById('paymentInput');
  const payment = paymentInput ? (parseFloat(paymentInput.value) || 0) : 0;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const change = payment - total;
  
  const changeDisplay = document.getElementById('changeDisplay');
  const changeAmount = document.getElementById('changeAmount');
  
  if (changeDisplay && changeAmount) {
    if (selectedPaymentMethod === 'cash' && payment > 0 && change >= 0) {
      changeDisplay.classList.remove('hidden');
      changeAmount.textContent = change.toFixed(2);
    } else {
      changeDisplay.classList.add('hidden');
    }
  }
}

function clearCart() {
  cart = [];
  updateCart();
  
  const fields = [
    'paymentInput', 'customerName', 'customerEmail', 
    'customerAddress', 'customerPhone', 'referenceNumber'
  ];
  
  fields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) field.value = '';
  });
  
  const changeDisplay = document.getElementById('changeDisplay');
  const phoneError = document.getElementById('phoneError');
  
  if (changeDisplay) changeDisplay.classList.add('hidden');
  if (phoneError) phoneError.classList.add('hidden');
  
  selectedPaymentMethod = 'cash';
  document.querySelectorAll('.payment-method-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const cashBtn = document.querySelector('[data-method="cash"]');
  if (cashBtn) cashBtn.classList.add('active');
  
  const refContainer = document.getElementById('referenceNumberContainer');
  if (refContainer) refContainer.classList.add('hidden');
}

function checkout() {
  const customerName = document.getElementById('customerName')?.value.trim();
  const customerEmail = document.getElementById('customerEmail')?.value.trim();
  const customerPhone = document.getElementById('customerPhone')?.value.trim();
  const payment = parseFloat(document.getElementById('paymentInput')?.value) || 0;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const referenceNumber = document.getElementById('referenceNumber')?.value.trim();
  
  if (!customerName) {
    alert('Customer name is required');
    document.getElementById('customerName')?.focus();
    return;
  }
  
  if (customerEmail && !customerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    alert('Please enter a valid email address');
    return;
  }
  
  if (customerPhone) {
    if (!customerPhone.startsWith('09') || customerPhone.length !== 11) {
      alert('Mobile number must start with 09 and be exactly 11 digits');
      return;
    }
  }
  
  if (payment < total) {
    alert(`Insufficient payment! Total: ₱${total.toFixed(2)}`);
    return;
  }
  
  if (selectedPaymentMethod === 'check' && !referenceNumber) {
    alert('Please enter reference or check number');
    return;
  }
  
  generateReceipt();
}

async function generateReceipt() {
  const loadingModal = document.getElementById('loadingModal');
  if (loadingModal) {
    loadingModal.classList.remove('hidden');
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const customerName = document.getElementById('customerName')?.value.trim() || 'Walk-in Customer';
  const customerEmail = document.getElementById('customerEmail')?.value.trim();
  const customerAddress = document.getElementById('customerAddress')?.value.trim();
  const customerPhone = document.getElementById('customerPhone')?.value.trim();
  const payment = parseFloat(document.getElementById('paymentInput')?.value) || 0;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const change = selectedPaymentMethod === 'cash' ? payment - total : 0;
  const referenceNumber = document.getElementById('referenceNumber')?.value.trim();
  const date = new Date().toLocaleDateString('en-PH');
  const time = new Date().toLocaleTimeString('en-PH');
  const receiptNumber = 'RCP-' + Date.now();
  const paymentMethodText = selectedPaymentMethod === 'cash' ? 'Cash' : 'Check/Bank Transfer';
  const cashierName = currentUserData ? (currentUserData.fullName || currentUserData.fullname || 'Unknown') : 'Unknown';
  
  let y = 20;
  
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Skinship Beauty', 105, y, { align: 'center' });
  y += 7;
  
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text('2nd floor, Primark Town Center Cainta', 105, y, { align: 'center' });
  y += 4;
  doc.text('Ortigas Extension, Cainta, Rizal', 105, y, { align: 'center' });
  y += 4;
  doc.text('0917-5880889 / 0915-9123020', 105, y, { align: 'center' });
  y += 10;
  
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('ACKNOWLEDGEMENT RECEIPT', 105, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.text(`Receipt No: ${receiptNumber}`, 105, y, { align: 'center' });
  y += 10;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`SOLD TO: ${customerName}`, 20, y);
  doc.text(`DATE: ${date}`, 150, y);
  y += 6;
  
  if (customerEmail) {
    doc.text(`EMAIL: ${customerEmail}`, 20, y);
    y += 6;
  }
  if (customerAddress) {
    doc.text(`ADDRESS: ${customerAddress}`, 20, y);
    y += 6;
  }
  if (customerPhone) {
    doc.text(`MOBILE NO: ${customerPhone}`, 20, y);
    y += 6;
  }
  doc.text(`TIME: ${time}`, 20, y);
  doc.text(`CASHIER: ${cashierName}`, 150, y);
  y += 8;
  
  doc.setFont(undefined, 'bold');
  doc.line(20, y, 190, y);
  y += 6;
  doc.text('QTY', 25, y);
  doc.text('DESCRIPTION', 50, y);
  doc.text('PRICE', 150, y);
  doc.text('AMOUNT', 175, y);
  y += 2;
  doc.line(20, y, 190, y);
  y += 6;
  
  doc.setFont(undefined, 'normal');
  cart.forEach(item => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.text('1', 25, y);
    const lines = doc.splitTextToSize(item.name, 90);
    doc.text(lines, 50, y);
    doc.text(`PHP ${item.price.toFixed(2)}`, 150, y);
    doc.text(`PHP ${item.price.toFixed(2)}`, 175, y);
    y += Math.max(6, lines.length * 5);
  });
  
  y += 4;
  doc.line(20, y, 190, y);
  y += 6;
  doc.setFont(undefined, 'bold');
  doc.text('TOTAL:', 150, y);
  doc.text(`PHP ${total.toFixed(2)}`, 175, y);
  y += 6;
  doc.setFont(undefined, 'normal');
  doc.text('PAYMENT:', 150, y);
  doc.text(`PHP ${payment.toFixed(2)}`, 175, y);
  y += 6;
  
  if (selectedPaymentMethod === 'cash') {
    doc.setFont(undefined, 'bold');
    doc.text('CHANGE:', 150, y);
    doc.text(`PHP ${change.toFixed(2)}`, 175, y);
    y += 10;
  } else {
    y += 4;
  }
  
  doc.setFont(undefined, 'normal');
  doc.text(`Mode of Payment: ${paymentMethodText}`, 20, y);
  y += 6;
  
  if (selectedPaymentMethod === 'check' && referenceNumber) {
    doc.text(`Reference/Check No: ${referenceNumber}`, 20, y);
    y += 10;
  } else {
    y += 4;
  }
  
  doc.line(140, y, 190, y);
  y += 5;
  doc.setFontSize(9);
  doc.text('AUTHORIZED SIGNATURE', 165, y, { align: 'center' });
  
  const receiptData = {
    receiptNumber: receiptNumber,
    customerName: customerName,
    customerEmail: customerEmail || '',
    customerAddress: customerAddress || '',
    customerPhone: customerPhone || '',
    cashierName: cashierName,
    items: cart.map(item => ({
      name: item.name,
      category: item.category,
      price: item.price
    })),
    subtotal: total,
    payment: payment,
    change: change,
    paymentMethod: paymentMethodText,
    referenceNumber: referenceNumber || '',
    date: date,
    time: time,
    timestamp: serverTimestamp(),
    createdAt: new Date().toISOString()
  };
  
  try {
    // Use batch write for inventory updates
    const inventoryUpdates = [];
    for (const item of cart) {
      if (item.isInventoryProduct && item.firebaseId) {
        const productRef = doc(db, 'inventory', item.firebaseId);
        inventoryUpdates.push(
          updateDoc(productRef, {
            qty: increment(-1)
          })
        );
        
        // Update local inventory cache
        const productIndex = inventoryProducts.findIndex(p => p.firebaseId === item.firebaseId);
        if (productIndex !== -1) {
          inventoryProducts[productIndex].qty -= 1;
        }
      }
    }
    
    // Parallel execution of inventory updates and receipt save
    await Promise.all([
      ...inventoryUpdates,
      addDoc(collection(db, "cashier_receipt"), receiptData)
    ]);
    
    const fileName = `Receipt_${customerName.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
    
    if (loadingModal) {
      loadingModal.classList.add('hidden');
    }
    
    setTimeout(() => {
      let alertMessage = `Receipt generated successfully!\n\nReceipt No: ${receiptNumber}\nTotal: ₱${total.toFixed(2)}\nPayment: ₱${payment.toFixed(2)}`;
      if (selectedPaymentMethod === 'cash') {
        alertMessage += `\nChange: ₱${change.toFixed(2)}`;
      }
      alert(alertMessage);
      clearCart();
      
      // Refresh product view if showing products
      if (currentView === 'products') {
        if (currentCategory === 'all') {
          renderServices(inventoryProducts);
        } else {
          const filtered = inventoryProducts.filter(p => p.category === currentCategory);
          renderServices(filtered);
        }
      }
    }, 100);
  } catch (error) {
    console.error("Error saving receipt:", error);
    if (loadingModal) {
      loadingModal.classList.add('hidden');
    }
    alert('Receipt printed but failed to save to database. Please check your connection.');
    
    const fileName = `Receipt_${customerName.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
    
    setTimeout(() => {
      clearCart();
    }, 100);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (inventoryListener) inventoryListener();
  if (purchaseOrderListener) purchaseOrderListener();
});