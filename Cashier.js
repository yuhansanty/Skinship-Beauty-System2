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

const EMAILJS_SERVICE_ID = "service_s0oyzpd";
const EMAILJS_TEMPLATE_ID = "template_mqrbj1n"; 
const EMAILJS_PUBLIC_KEY = "JcMrqAedryjLalsIq"; 

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
let confirmedCustomers = [];
let selectedCustomerId = null;

// Listener references for cleanup
let inventoryListener = null;
let purchaseOrderListener = null;
let customersListener = null;
let sessionMonitor = null;

// ==================== TOAST NOTIFICATION SYSTEM ====================

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
      loadInventoryProducts(),
      loadConfirmedCustomers()
    ]);
    setupSidebarBubbles();
    dataLoaded = true;
  }
  
  // Setup session monitoring
  setupSessionMonitoring(user.uid);
  
  currentView = 'services';
  currentCategory = 'all';
  renderServices(servicesData);
  
  const paymentInput = document.getElementById('paymentInput');
  if (paymentInput && !paymentInput.dataset.listenerAdded) {
    paymentInput.addEventListener('input', calculateChange);
    paymentInput.dataset.listenerAdded = 'true';
  }
});

// ==================== SESSION MONITORING ====================

function setupSessionMonitoring(userId) {
  if (sessionMonitor) sessionMonitor();
  
  const userRef = doc(db, "users", userId);
  const storedSessionId = sessionStorage.getItem('sessionId');
  
  if (!storedSessionId) {
    console.warn('No session ID found, logging out...');
    signOut(auth);
    return;
  }
  
  sessionMonitor = onSnapshot(userRef, (snapshot) => {
    if (!snapshot.exists()) {
      console.warn('User document no longer exists');
      signOut(auth);
      return;
    }
    
    const data = snapshot.data();
    const currentSessionId = data.currentSessionId;
    
    if (currentSessionId && currentSessionId !== storedSessionId) {
      console.log('Session invalidated - another login detected or password changed');
      
      showToast('Your session has been ended because someone else logged into this account or your password was changed', 'error');
      
      setTimeout(() => {
        signOut(auth).then(() => {
          window.location.href = 'index.html';
        });
      }, 3000);
    }
  }, (error) => {
    console.error('Session monitoring error:', error);
  });
}

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
    showToast('Error loading services', 'error');
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
    showToast('Error loading inventory', 'error');
  }
}

async function loadConfirmedCustomers() {
  try {
    const q = query(collection(db, 'appointments'), where('status', '==', 'Confirmed'));
    const snapshot = await getDocs(q);

    confirmedCustomers = [];
    snapshot.forEach(docSnap => {
      const customer = docSnap.data();
      
      let services = [];
      
      if (customer.services && Array.isArray(customer.services) && customer.services.length > 0) {
        services = customer.services.map(serviceObj => {
          if (typeof serviceObj === 'object' && serviceObj !== null) {
            return {
              name: serviceObj.name || '',
              price: parseFloat(serviceObj.price) || 0,
              id: serviceObj.id || null
            };
          } else if (typeof serviceObj === 'string') {
            return { name: serviceObj, price: 0, id: null };
          }
          return null;
        }).filter(s => s !== null && s.name);
      } else if (customer.service) {
        if (typeof customer.service === 'string') {
          services = [{ name: customer.service, price: 0, id: null }];
        } else if (typeof customer.service === 'object' && customer.service.name) {
          services = [{ 
            name: customer.service.name, 
            price: customer.service.price || 0,
            id: customer.service.id || null 
          }];
        }
      }
      
      confirmedCustomers.push({
        id: docSnap.id,
        name: customer.name || customer.fullName || '',
        email: customer.email || '',
        phone: customer.phone || customer.mobile || '',
        address: customer.address || '',
        services: services
      });
    });
    
    console.log('Loaded confirmed customers:', confirmedCustomers.length);
    
    if (customersListener) {
      customersListener();
    }
    
    customersListener = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach(change => {
          const customer = change.doc.data();
          const customerId = change.doc.id;
          
          let services = [];
          if (customer.services && Array.isArray(customer.services) && customer.services.length > 0) {
            services = customer.services.map(serviceObj => {
              if (typeof serviceObj === 'object' && serviceObj !== null) {
                return {
                  name: serviceObj.name || '',
                  price: parseFloat(serviceObj.price) || 0,
                  id: serviceObj.id || null
                };
              }
              return null;
            }).filter(s => s !== null && s.name);
          } else if (customer.service) {
            if (typeof customer.service === 'string') {
              services = [{ name: customer.service, price: 0, id: null }];
            }
          }
          
          const customerData = {
            id: customerId,
            name: customer.name || customer.fullName || '',
            email: customer.email || '',
            phone: customer.phone || customer.mobile || '',
            address: customer.address || '',
            services: services
          };
          
          if (change.type === 'added') {
            const exists = confirmedCustomers.find(c => c.id === customerId);
            if (!exists) {
              confirmedCustomers.push(customerData);
              console.log('New customer added:', customerData.name);
            }
          } else if (change.type === 'modified') {
            const index = confirmedCustomers.findIndex(c => c.id === customerId);
            if (index !== -1) {
              confirmedCustomers[index] = customerData;
              console.log('Customer updated:', customerData.name);
            }
          } else if (change.type === 'removed') {
            confirmedCustomers = confirmedCustomers.filter(c => c.id !== customerId);
            console.log('Customer removed');
          }
        });
      },
      (error) => {
        console.error('Customer listener error:', error);
      }
    );
    
  } catch (error) {
    console.error('Error loading confirmed customers:', error);
    showToast('Error loading customers', 'error');
  }
}

// ==================== SIDEBAR BUBBLE SYSTEM ====================

function setupSidebarBubbles() {
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
      
      if (currentView === 'products') {
        if (currentCategory === 'all') {
          renderServices(inventoryProducts);
        } else {
          const filtered = inventoryProducts.filter(p => p.category === currentCategory);
          renderServices(filtered);
        }
      }
    },
    (error) => {
      console.error('Inventory listener error:', error);
    }
  );

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
  const noStockCount = inventoryProducts.filter(item => item.status === 'out-of-stock').length;
  const lowStockCount = inventoryProducts.filter(item => item.status === 'low-stock').length;
  const overstockCount = inventoryProducts.filter(item => item.status === 'overstock').length;
  
  const button = document.getElementById('inventoryBtn');
  if (!button) return;
  
  let bubble = button.querySelector('.sidebar-bubble');
  
  if (!bubble) {
    bubble = document.createElement('span');
    bubble.className = 'sidebar-bubble';
    button.style.position = 'relative';
    button.appendChild(bubble);
  }
  
  if (noStockCount > 0) {
    bubble.textContent = noStockCount > 99 ? '99+' : noStockCount;
    bubble.style.backgroundColor = '#dc2626'; // Red
    bubble.style.display = 'flex';
  } else if (lowStockCount > 0) {
    bubble.textContent = lowStockCount > 99 ? '99+' : lowStockCount;
    bubble.style.backgroundColor = '#f59e0b'; // Yellow
    bubble.style.display = 'flex';
  } else if (overstockCount > 0) {
    bubble.textContent = overstockCount > 99 ? '99+' : overstockCount;
    bubble.style.backgroundColor = '#3b82f6'; // Blue
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
    bubble.style.backgroundColor = '#8b5cf6';
    bubble.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.4)';
    bubble.style.display = 'flex';
  } else {
    bubble.style.display = 'none';
  }
}

// ==================== UI FUNCTIONS ====================

function normalizePhoneNumber(phone) {
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('63')) {
    cleaned = '0' + cleaned.substring(2);
  }
  
  if (cleaned.startsWith('09') && cleaned.length === 11) {
    return cleaned;
  }
  
  return phone;
}

function validatePhoneNumber(input) {
  let value = input.value;
  
  if (value.startsWith('+63')) {
    let rest = value.substring(3).replace(/\D/g, '');
    if (rest.length > 10) rest = rest.slice(0, 10);
    input.value = '+63' + rest;
  } else if (value.startsWith('63') && !value.startsWith('639')) {
    let rest = value.substring(2).replace(/\D/g, '');
    if (rest.length > 10) rest = rest.slice(0, 10);
    input.value = '63' + rest;
  } else if (value.startsWith('63')) {
    let rest = value.substring(2).replace(/\D/g, '');
    if (rest.length > 10) rest = rest.slice(0, 10);
    input.value = '63' + rest;
  } else {
    value = value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    input.value = value;
  }
  
  const errorMsg = document.getElementById('phoneError');
  if (input.value.length > 0) {
    const normalized = normalizePhoneNumber(input.value);
    if (normalized.startsWith('09') && normalized.length === 11) {
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

function toggleCustomerDropdown() {
  const dropdown = document.getElementById('customerDropdown');
  const input = document.getElementById('customerName');
  
  if (dropdown.classList.contains('hidden')) {
    dropdown.classList.remove('hidden');
    filterCustomers();
  } else {
    dropdown.classList.add('hidden');
  }
}

function filterCustomers() {
  const input = document.getElementById('customerName');
  const dropdown = document.getElementById('customerDropdown');
  const searchTerm = input.value.toLowerCase();
  
  const filtered = confirmedCustomers.filter(customer => 
    customer.name.toLowerCase().includes(searchTerm) ||
    (customer.email && customer.email.toLowerCase().includes(searchTerm)) ||
    (customer.phone && customer.phone.includes(searchTerm))
  );
  
  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="px-4 py-3 text-gray-500 text-sm">No confirmed customers found</div>';
  } else {
    dropdown.innerHTML = filtered.map(customer => `
      <div class="customer-option px-4 py-3 hover:bg-pink-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
           onclick="selectCustomer('${customer.id}')">
        <div class="font-medium text-gray-800">${customer.name}</div>
        <div class="text-xs text-gray-500">${customer.email || 'No email'}</div>
        <div class="text-xs text-gray-500">${customer.phone || 'No phone'}</div>
      </div>
    `).join('');
  }
  
  dropdown.classList.remove('hidden');
}

function selectCustomer(customerId) {
  const customer = confirmedCustomers.find(c => c.id === customerId);
  if (!customer) return;
  
  if (selectedCustomerId && selectedCustomerId !== customerId && cart.length > 0) {
    if (!confirm('⚠️ Switching customers will clear your current cart.\n\nDo you want to continue?')) {
      document.getElementById('customerDropdown').classList.add('hidden');
      return;
    }
    cart = [];
    updateCart();
  }
  
  if (!selectedCustomerId && cart.length > 0 && customerId) {
    if (!confirm('⚠️ You have items in cart.\n\nDo you want to clear the cart and load this customer?')) {
      document.getElementById('customerDropdown').classList.add('hidden');
      return;
    }
    cart = [];
    updateCart();
  }
  
  selectedCustomerId = customerId;
  
  document.getElementById('customerName').value = customer.name;
  document.getElementById('customerEmail').value = customer.email || '';
  document.getElementById('customerPhone').value = customer.phone || '';
  document.getElementById('customerAddress').value = customer.address || '';
  
  document.getElementById('customerDropdown').classList.add('hidden');
  
  const phoneInput = document.getElementById('customerPhone');
  if (phoneInput.value) {
    validatePhoneNumber(phoneInput);
  }

  if (customer.services && customer.services.length > 0) {
    const serviceCount = customer.services.length;
    const serviceText = serviceCount === 1 ? 'service' : 'services';
    
    if (confirm(`Add ${serviceCount} ${serviceText} from this appointment to cart?`)) {
      
      let addedCount = 0;
      let notFoundServices = [];
      
      customer.services.forEach((serviceData, index) => {
        
        let serviceName = serviceData.name || '';
        let servicePrice = parseFloat(serviceData.price) || 0;
        let serviceId = serviceData.id || null;
        
        if (!serviceName) {
          return;
        }
        
        const matchedService = servicesData.find(s => 
          s.name.toLowerCase().trim() === serviceName.toLowerCase().trim() ||
          s.id === serviceId ||
          s.firebaseId === serviceId
        );
        
        if (matchedService) {
          cart.push({
            name: matchedService.name,
            price: matchedService.price,
            category: matchedService.category || 'Service',
            id: Date.now() + Math.random(),
            isInventoryProduct: false,
            firebaseId: matchedService.firebaseId || matchedService.id
          });
          addedCount++;
        } else if (servicePrice > 0) {
          cart.push({
            name: serviceName,
            price: servicePrice,
            category: 'Service',
            id: Date.now() + Math.random(),
            isInventoryProduct: false,
            firebaseId: serviceId
          });
          addedCount++;
        } else {
          notFoundServices.push(serviceName);
        }
      });

      updateCart();
      
      if (addedCount > 0) {
        let message = `${addedCount} ${addedCount === 1 ? 'service' : 'services'} added to cart!`;
        
        if (notFoundServices.length > 0) {
          message += ` ${notFoundServices.length} service(s) not found and need to be added manually.`;
        }
        
        showToast(message, 'success');
      } else {
        showToast('No services could be added to cart. Please add services manually.', 'warning');
      }
    }
  }
}

function clearCustomerSelection() {
  selectedCustomerId = null;
  document.getElementById('customerName').value = '';
  document.getElementById('customerEmail').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerAddress').value = '';
  
  const phoneError = document.getElementById('phoneError');
  if (phoneError) phoneError.classList.add('hidden');
  
  const phoneInput = document.getElementById('customerPhone');
  if (phoneInput) {
    phoneInput.classList.remove('border-red-300');
    phoneInput.classList.add('border-pink-100');
  }
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
  
  const customerDropdown = document.getElementById('customerDropdown');
  const customerNameInput = document.getElementById('customerName');
  if (customerDropdown && !customerDropdown.contains(event.target) && event.target !== customerNameInput) {
    customerDropdown.classList.add('hidden');
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
    
    if (inventoryListener) inventoryListener();
    if (purchaseOrderListener) purchaseOrderListener();
    if (customersListener) customersListener();
    if (sessionMonitor) sessionMonitor();
    
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error('Logout error:', error);
    if (confirmBtn) {
      confirmBtn.classList.remove('loading');
      confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    }
    
    showToast('An error occurred during logout. Please try again.', 'error');
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
    
    const dropdown = document.getElementById('customerDropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
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
window.toggleCustomerDropdown = toggleCustomerDropdown;
window.filterCustomers = filterCustomers;
window.selectCustomer = selectCustomer;
window.clearCustomerSelection = clearCustomerSelection;

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

function getStockBadge(item) {
  if (item.qty === undefined) return '';
  
  if (item.qty === 0 || item.status === 'out-of-stock') {
    return '<span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold text-white bg-red-500 rounded-lg ml-1">No Stock</span>';
  } else if (item.qty <= item.minStock || item.status === 'low-stock') {
    return '<span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold text-white bg-yellow-500 rounded-lg ml-1">Low Stock</span>';
  }
  
  return '';
}

function renderServices(filteredItems = servicesData) {
  const container = document.getElementById('servicesList');
  if (!container) return;
  
  container.innerHTML = '';
  
  filteredItems.forEach(item => {
    const div = document.createElement('div');
    const isOutOfStock = item.qty !== undefined && (item.qty === 0 || item.status === 'out-of-stock');
    const isLowStock = item.qty !== undefined && item.qty > 0 && (item.qty <= item.minStock || item.status === 'low-stock');
    
    div.className = `service-card bg-white p-4 rounded-xl ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;
    
    const stockInfo = item.qty !== undefined ? 
      `<p class="text-xs text-gray-500 mb-1">Stock: ${item.qty}</p>` : '';
    
    const stockBadge = getStockBadge(item);
    
    div.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-800 text-sm mb-1 truncate">${item.name}</h3>
          <p class="text-xs text-gray-500 mb-2">${item.category}</p>
          ${stockInfo}
          <div class="flex items-center justify-between">
            <span class="text-lg font-bold text-[#da5c73]">₱${item.price.toFixed(2)}</span>
            <div class="flex items-center gap-1">
              ${stockBadge}
              <button class="bg-pink-100 text-pink-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-pink-200 transition ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}" ${isOutOfStock ? 'disabled' : ''}>
                <i class="fa-solid fa-plus mr-1"></i>Add
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    if (!isOutOfStock) {
      div.onclick = () => addToCart(item);
    } else {
      div.onclick = () => {
        showToast(`"${item.name}" is out of stock and cannot be added to cart!`, 'error');
      };
    }
    
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
  if (item.qty !== undefined) {
    const currentCartQty = cart.filter(cartItem => cartItem.firebaseId === item.firebaseId).length;
    
    if (currentCartQty >= item.qty) {
      showToast(`Cannot add more "${item.name}"! Only ${item.qty} available in stock.`, 'warning');
      return;
    }
    
    if (item.qty <= 0) {
      showToast(`"${item.name}" is out of stock!`, 'error');
      return;
    }
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
    const groupedItems = [];
    cart.forEach(item => {
      const existing = groupedItems.find(g => 
        g.firebaseId === item.firebaseId && g.name === item.name
      );
      
      if (existing) {
        existing.quantity++;
        existing.items.push(item);
      } else {
        groupedItems.push({
          ...item,
          quantity: 1,
          items: [item]
        });
      }
    });
    
    container.innerHTML = groupedItems.map(group => `
      <div class="cart-item bg-pink-50 p-2.5 rounded-lg border border-pink-200">
        <div class="flex justify-between items-start gap-2">
          <div class="flex-1 min-w-0">
            <h4 class="font-medium text-xs text-gray-800 truncate">${group.name} ${group.quantity > 1 ? `(x${group.quantity})` : ''}</h4>
            <p class="text-xs text-gray-500">${group.category}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <p class="font-bold text-[#da5c73] text-sm">₱${(group.price * group.quantity).toFixed(2)}</p>
            <button onclick="removeFromCart(${group.items[group.items.length - 1].id})" class="text-red-500 text-xs hover:text-red-700" title="Remove one">
              <i class="fa-solid fa-minus"></i>
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
    if (payment > 0 && change >= 0) {
      changeDisplay.classList.remove('hidden');
      changeAmount.textContent = change.toFixed(2);
    } else {
      changeDisplay.classList.add('hidden');
    }
  }
}

function clearCart() {
  cart = [];
  selectedCustomerId = null;
  clearCustomerSelection(); 
  updateCart();
  
  const fields = [
    'paymentInput', 'customerName', 'customerEmail', 
    'customerAddress', 'customerPhone'
  ];
  
  fields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) field.value = '';
  });
  
  const changeDisplay = document.getElementById('changeDisplay');
  const phoneError = document.getElementById('phoneError');
  
  if (changeDisplay) changeDisplay.classList.add('hidden');
  if (phoneError) phoneError.classList.add('hidden');
}

function checkout() {
  const customerName = document.getElementById('customerName')?.value.trim();
  const customerEmail = document.getElementById('customerEmail')?.value.trim();
  const customerPhone = document.getElementById('customerPhone')?.value.trim();
  const payment = parseFloat(document.getElementById('paymentInput')?.value) || 0;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  
  if (!customerName) {
    showToast('Customer name is required', 'error');
    document.getElementById('customerName')?.focus();
    return;
  }
  
  if (customerEmail && !customerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    showToast('Please enter a valid email address', 'error');
    return;
  }
  
  if (customerPhone) {
    const normalized = normalizePhoneNumber(customerPhone);
    if (!normalized.startsWith('09') || normalized.length !== 11) {
      showToast('Mobile number must be valid (09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX)', 'error');
      return;
    }
  }
  
  if (payment < total) {
    showToast(`Insufficient payment! Total: ₱${total.toFixed(2)}`, 'error');
    return;
  }
  
  generateReceipt();
}

// ==================== EMAIL SENDING FUNCTION ====================

async function sendReceiptEmail(customerEmail, pdfBlob, receiptData) {
  try {
    if (typeof emailjs === 'undefined') {
      console.error('EmailJS library not loaded');
      return false;
    }

    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    const base64data = await base64Promise;

    let itemsList = '';
    receiptData.items.forEach(item => {
      itemsList += `${item.quantity}x ${item.name} - ₱${item.totalPrice.toFixed(2)}\n`;
    });

    const emailParams = {
      to_email: customerEmail,
      customer_name: receiptData.customerName,
      receipt_number: receiptData.receiptNumber,
      total_amount: receiptData.subtotal.toFixed(2),
      date: receiptData.date,
      time: receiptData.time,
      payment_method: receiptData.paymentMethod,
      cashier: receiptData.cashierName,
      items: itemsList,
      total: '₱' + receiptData.subtotal.toFixed(2),
      payment: '₱' + receiptData.payment.toFixed(2),
      change: '₱' + receiptData.change.toFixed(2),
      pdf_attachment: base64data
    };

    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      emailParams,
      EMAILJS_PUBLIC_KEY
    );

    console.log('Email sent successfully:', response);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// ==================== RECEIPT GENERATION ====================

async function generateReceipt() {
  const loadingModal = document.getElementById('loadingModal');
  if (loadingModal) {
    loadingModal.classList.remove('hidden');
  }
  
  try {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      throw new Error('jsPDF library not loaded');
    }
    
    const pdfDoc = new jsPDF();
    
    const customerName = document.getElementById('customerName')?.value.trim() || 'Walk-in Customer';
    const customerEmail = document.getElementById('customerEmail')?.value.trim();
    const customerAddress = document.getElementById('customerAddress')?.value.trim();
    const customerPhone = document.getElementById('customerPhone')?.value.trim();
    const normalizedPhone = customerPhone ? normalizePhoneNumber(customerPhone) : '';
    const payment = parseFloat(document.getElementById('paymentInput')?.value) || 0;
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    const change = payment - total;
    const date = new Date().toLocaleDateString('en-PH');
    const time = new Date().toLocaleTimeString('en-PH');
    const receiptNumber = 'RCP-' + Date.now();
    const paymentMethodText = 'Cash';
    const cashierName = currentUserData ? (currentUserData.fullName || currentUserData.fullname || 'Unknown') : 'Unknown';
    
    let y = 20;
    
    pdfDoc.setFontSize(18);
    pdfDoc.setFont(undefined, 'bold');
    pdfDoc.text('Skinship Beauty', 105, y, { align: 'center' });
    y += 7;
    
    pdfDoc.setFontSize(9);
    pdfDoc.setFont(undefined, 'normal');
    pdfDoc.text('2nd floor, Primark Town Center Cainta', 105, y, { align: 'center' });
    y += 4;
    pdfDoc.text('Ortigas Extension, Cainta, Rizal', 105, y, { align: 'center' });
    y += 4;
    pdfDoc.text('0917-5880889 / 0915-9123020', 105, y, { align: 'center' });
    y += 10;
    
    pdfDoc.setFontSize(14);
    pdfDoc.setFont(undefined, 'bold');
    pdfDoc.text('ACKNOWLEDGEMENT RECEIPT', 105, y, { align: 'center' });
    y += 6;
    pdfDoc.setFontSize(9);
    pdfDoc.text(`Receipt No: ${receiptNumber}`, 105, y, { align: 'center' });
    y += 10;
    
    pdfDoc.setFontSize(10);
    pdfDoc.setFont(undefined, 'normal');
    pdfDoc.text(`SOLD TO: ${customerName}`, 20, y);
    pdfDoc.text(`DATE: ${date}`, 150, y);
    y += 6;
    
    if (customerEmail) {
      pdfDoc.text(`EMAIL: ${customerEmail}`, 20, y);
      y += 6;
    }
    if (customerAddress) {
      pdfDoc.text(`ADDRESS: ${customerAddress}`, 20, y);
      y += 6;
    }
    if (normalizedPhone) {
      pdfDoc.text(`MOBILE NO: ${normalizedPhone}`, 20, y);
      y += 6;
    }
    pdfDoc.text(`TIME: ${time}`, 20, y);
    pdfDoc.text(`CASHIER: ${cashierName}`, 150, y);
    y += 8;
    
    pdfDoc.setFont(undefined, 'bold');
    pdfDoc.line(20, y, 190, y);
    y += 6;
    pdfDoc.text('QTY', 25, y);
    pdfDoc.text('DESCRIPTION', 50, y);
    pdfDoc.text('PRICE', 150, y);
    pdfDoc.text('AMOUNT', 175, y);
    y += 2;
    pdfDoc.line(20, y, 190, y);
    y += 6;
    
    pdfDoc.setFont(undefined, 'normal');
    
    const groupedItems = {};
    cart.forEach(item => {
      const key = item.firebaseId || item.name;
      if (groupedItems[key]) {
        groupedItems[key].quantity++;
        groupedItems[key].totalPrice += item.price;
      } else {
        groupedItems[key] = {
          name: item.name,
          category: item.category,
          price: item.price,
          quantity: 1,
          totalPrice: item.price,
          firebaseId: item.firebaseId,
          isInventoryProduct: item.isInventoryProduct
        };
      }
    });
    
    Object.values(groupedItems).forEach(item => {
      if (y > 250) {
        pdfDoc.addPage();
        y = 20;
      }
      pdfDoc.text(item.quantity.toString(), 25, y);
      const lines = pdfDoc.splitTextToSize(item.name, 90);
      pdfDoc.text(lines, 50, y);
      pdfDoc.text(`PHP ${item.price.toFixed(2)}`, 150, y);
      pdfDoc.text(`PHP ${item.totalPrice.toFixed(2)}`, 175, y);
      y += Math.max(6, lines.length * 5);
    });
    
    y += 4;
    pdfDoc.line(20, y, 190, y);
    y += 6;
    pdfDoc.setFont(undefined, 'bold');
    pdfDoc.text('TOTAL:', 150, y);
    pdfDoc.text(`PHP ${total.toFixed(2)}`, 175, y);
    y += 6;
    pdfDoc.setFont(undefined, 'normal');
    pdfDoc.text('PAYMENT:', 150, y);
    pdfDoc.text(`PHP ${payment.toFixed(2)}`, 175, y);
    y += 6;
    
    pdfDoc.setFont(undefined, 'bold');
    pdfDoc.text('CHANGE:', 150, y);
    pdfDoc.text(`PHP ${change.toFixed(2)}`, 175, y);
    y += 10;
    
    pdfDoc.setFont(undefined, 'normal');
    pdfDoc.text(`Mode of Payment: ${paymentMethodText}`, 20, y);
    y += 10;
    
    pdfDoc.line(140, y, 190, y);
    y += 5;
    pdfDoc.setFontSize(9);
    pdfDoc.text('AUTHORIZED SIGNATURE', 165, y, { align: 'center' });
    
    const receiptItems = Object.values(groupedItems).map(item => ({
      name: item.name,
      category: item.category,
      price: item.price,
      quantity: item.quantity,
      totalPrice: item.totalPrice
    }));
    
    const receiptData = {
      receiptNumber: receiptNumber,
      customerName: customerName,
      customerEmail: customerEmail || '',
      customerAddress: customerAddress || '',
      customerPhone: normalizedPhone || '',
      cashierName: cashierName,
      items: receiptItems,
      subtotal: total,
      payment: payment,
      change: change,
      paymentMethod: paymentMethodText,
      referenceNumber: '',
      date: date,
      time: time,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    };
    
    const dbPromises = [];
    
    for (const [key, groupedItem] of Object.entries(groupedItems)) {
      if (groupedItem.isInventoryProduct && groupedItem.firebaseId) {
        const productRef = doc(db, 'inventory', groupedItem.firebaseId);
        const updatePromise = updateDoc(productRef, {
          qty: increment(-groupedItem.quantity)
        }).then(() => {
          console.log(`Inventory updated for product ${groupedItem.firebaseId}: -${groupedItem.quantity}`);
        }).catch(error => {
          console.error(`Error updating inventory for ${groupedItem.firebaseId}:`, error);
        });
        
        dbPromises.push(updatePromise);
      }
    }
    
    if (selectedCustomerId) {
      console.log('Updating customer status to Completed for:', selectedCustomerId);
      const customerRef = doc(db, 'appointments', selectedCustomerId);
      const customerPromise = updateDoc(customerRef, {
        status: 'Completed',
        completedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }).then(() => {
        console.log('Customer status updated successfully');
      }).catch(error => {
        console.error('Error updating customer status:', error);
      });
      
      dbPromises.push(customerPromise);
    }
    
    const receiptPromise = addDoc(collection(db, "cashier_receipt"), receiptData)
      .then(receiptRef => {
        console.log('Receipt saved to cashier_receipt with ID:', receiptRef.id);
      })
      .catch(error => {
        console.error('Error saving receipt:', error);
      });
    
    dbPromises.push(receiptPromise);
    
    const salesData = {
      receiptNumber: receiptNumber,
      customerName: customerName,
      cashierName: cashierName,
      items: receiptItems,
      total: total,
      payment: payment,
      change: change,
      paymentMethod: paymentMethodText,
      date: date,
      time: time,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
      userId: currentUserId
    };
    
    const salesPromise = addDoc(collection(db, "sales"), salesData)
      .then(() => {
        console.log('Sale recorded successfully');
      })
      .catch(error => {
        console.error('Error recording sale:', error);
      });
    
    dbPromises.push(salesPromise);
    
    await Promise.allSettled(dbPromises);
    
    const pdfBlob = pdfDoc.output('blob');
    
    let emailSent = false;
    if (customerEmail) {
      emailSent = await sendReceiptEmail(customerEmail, pdfBlob, receiptData);
    }
    
    const fileName = `Receipt_${customerName.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`;
    pdfDoc.save(fileName);
    
    if (loadingModal) {
      loadingModal.classList.add('hidden');
    }
    
    setTimeout(() => {
      let message = `Receipt generated successfully! Receipt No: ${receiptNumber}`;
      
      if (selectedCustomerId) {
        message += ' | Customer status updated to Completed';
      }
      
      if (customerEmail) {
        if (emailSent) {
          message += ' | Receipt sent to email';
        } else {
          showToast('Failed to send email (check EmailJS configuration)', 'warning');
        }
      }
      
      showToast(message, 'success');
      clearCart();
      
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
    console.error("Error during checkout:", error);
    if (loadingModal) {
      loadingModal.classList.add('hidden');
    }
    
    showToast('Error generating receipt: ' + error.message, 'error');
  }
}

window.addEventListener('beforeunload', () => {
  if (inventoryListener) inventoryListener();
  if (purchaseOrderListener) purchaseOrderListener();
  if (customersListener) customersListener();
  if (sessionMonitor) sessionMonitor();
});