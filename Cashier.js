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

async function loadConfirmedCustomers() {
  try {
    // Initial load with cache
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
    
    // Set up real-time listener - only listens for CHANGES (not full re-reads)
    if (customersListener) {
      customersListener();
    }
    
    customersListener = onSnapshot(
      q,
      (snapshot) => {
        // Only process changes, not entire collection
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
      
      // Re-render products if currently viewing products
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
  
  // Priority: No Stock > Low Stock > Overstock > wakwak go boom boom system
  if (noStockCount > 0) {
    bubble.textContent = noStockCount > 99 ? '99+' : noStockCount;
    bubble.style.backgroundColor = '#dc2626';
    bubble.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.4)';
    bubble.style.display = 'flex';
  } else if (lowStockCount > 0) {
    bubble.textContent = lowStockCount > 99 ? '99+' : lowStockCount;
    bubble.style.backgroundColor = '#f59e0b';
    bubble.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.4)';
    bubble.style.display = 'flex';
  } else if (overstockCount > 0) {
    bubble.textContent = overstockCount > 99 ? '99+' : overstockCount;
    bubble.style.backgroundColor = '#3b82f6';
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
    bubble.style.backgroundColor = '#8b5cf6';
    bubble.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.4)';
    bubble.style.display = 'flex';
  } else {
    bubble.style.display = 'none';
  }
}

// ==================== UI FUNCTIONS ====================

function normalizePhoneNumber(phone) {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle +63 or 63 prefix
  if (cleaned.startsWith('63')) {
    cleaned = '0' + cleaned.substring(2);
  }
  
  // Ensure it starts with 09 and is 11 digits
  if (cleaned.startsWith('09') && cleaned.length === 11) {
    return cleaned;
  }
  
  return phone; // Return original if invalid
}

function validatePhoneNumber(input) {
  let value = input.value;
  
  // Allow +63, 63, or 09 at the start
  if (value.startsWith('+63')) {
    let rest = value.substring(3).replace(/\D/g, '');
    // Allow 10 digits after +63 (e.g., +639061301185)
    if (rest.length > 10) rest = rest.slice(0, 10);
    input.value = '+63' + rest;
  } else if (value.startsWith('63') && !value.startsWith('639')) {
    let rest = value.substring(2).replace(/\D/g, '');
    // Allow 10 digits after 63 (e.g., 639061301185)
    if (rest.length > 10) rest = rest.slice(0, 10);
    input.value = '63' + rest;
  } else if (value.startsWith('63')) {
    // Handle 639... format
    let rest = value.substring(2).replace(/\D/g, '');
    // Allow 10 digits after 63 (e.g., 639061301185)
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
  
  console.log('Filtering customers, total:', confirmedCustomers.length);
  console.log('Search term:', searchTerm);
  
  const filtered = confirmedCustomers.filter(customer => 
    customer.name.toLowerCase().includes(searchTerm) ||
    (customer.email && customer.email.toLowerCase().includes(searchTerm)) ||
    (customer.phone && customer.phone.includes(searchTerm))
  );
  
  console.log('Filtered customers:', filtered.length);
  
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
  
  // Check if switching to a different customer with items in cart
  if (selectedCustomerId && selectedCustomerId !== customerId && cart.length > 0) {
    if (!confirm('⚠️ Switching customers will clear your current cart.\n\nDo you want to continue?')) {
      // User clicked "No" - close dropdown and keep current customer
      document.getElementById('customerDropdown').classList.add('hidden');
      return;
    }
    // User clicked "Yes" - clear cart
    cart = [];
    updateCart();
  }
  
  // If selecting customer for first time with items in cart
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
  
  // Validate phone if present
  const phoneInput = document.getElementById('customerPhone');
  if (phoneInput.value) {
    validatePhoneNumber(phoneInput);
  }

  // SERVICES TO CART 
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
          console.log('❌ No service name found');
          return;
        }
        
        // Try to find matching service in servicesData for updated price
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
          // Service not in database but has price from appointment
          console.log('✅ Not in database, using appointment price:', servicePrice);
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
          // Service not found and no price
          console.log('❌ Service not found and no price available');
          notFoundServices.push(serviceName);
        }
      });

      updateCart();
      
      // Show result notification
      if (addedCount > 0) {
        let message = `✓ ${addedCount} ${addedCount === 1 ? 'service' : 'services'} added to cart!`;
        
        if (notFoundServices.length > 0) {
          message += `\n\n⚠ Not found (${notFoundServices.length}):\n${notFoundServices.join('\n')}`;
          message += '\n\nThese services need to be added manually.';
        }
        
        alert(message);
      } else {
        alert('⚠ No services could be added to cart.\n\nPlease add services manually.');
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
  
  // Close customer dropdown when clicking outside
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
    
    // Cleanup listeners
    if (inventoryListener) inventoryListener();
    if (purchaseOrderListener) purchaseOrderListener();
    if (customersListener) customersListener();
    
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
  if (item.qty === undefined) return ''; // Service, no stock badge
  
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
        alert(`"${item.name}" is out of stock and cannot be added to cart!`);
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
  // For products, check if already in cart and get current quantity
  if (item.qty !== undefined) {
    // Count how many of this specific product are already in cart
    const currentCartQty = cart.filter(cartItem => cartItem.firebaseId === item.firebaseId).length;
    
    // Check if we have enough stock to add one more
    if (currentCartQty >= item.qty) {
      alert(`Cannot add more "${item.name}"! Only ${item.qty} available in stock.`);
      return;
    }
    
    // Check if product is out of stock
    if (item.qty <= 0) {
      alert(`"${item.name}" is out of stock!`);
      return;
    }
  }
  
  // Add item to cart with unique ID
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
    // Group items by firebaseId and name for display
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
  selectedCustomerId = null;
  clearCustomerSelection(); 
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
    const normalized = normalizePhoneNumber(customerPhone);
    if (!normalized.startsWith('09') || normalized.length !== 11) {
      alert('Mobile number must be valid (09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX)');
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

// ==================== EMAIL SENDING FUNCTION ====================

async function sendReceiptEmail(customerEmail, pdfBlob, receiptData) {
  try {
    // Check if EmailJS is loaded
    if (typeof emailjs === 'undefined') {
      console.error('EmailJS library not loaded');
      return false;
    }

    // Convert blob to base64
    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    const base64data = await base64Promise;

    // Format items list for email
    let itemsList = '';
    receiptData.items.forEach(item => {
      itemsList += `${item.quantity}x ${item.name} - ₱${item.totalPrice.toFixed(2)}\n`;
    });

    // Prepare email parameters
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

    // Send email using EmailJS
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
    const change = selectedPaymentMethod === 'cash' ? payment - total : 0;
    const referenceNumber = document.getElementById('referenceNumber')?.value.trim();
    const date = new Date().toLocaleDateString('en-PH');
    const time = new Date().toLocaleTimeString('en-PH');
    const receiptNumber = 'RCP-' + Date.now();
    const paymentMethodText = selectedPaymentMethod === 'cash' ? 'Cash' : 'Check/Bank Transfer';
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
    
    // Group cart items by product/service
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
    
    // Print grouped items
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
    
    if (selectedPaymentMethod === 'cash') {
      pdfDoc.setFont(undefined, 'bold');
      pdfDoc.text('CHANGE:', 150, y);
      pdfDoc.text(`PHP ${change.toFixed(2)}`, 175, y);
      y += 10;
    } else {
      y += 4;
    }
    
    pdfDoc.setFont(undefined, 'normal');
    pdfDoc.text(`Mode of Payment: ${paymentMethodText}`, 20, y);
    y += 6;
    
    if (selectedPaymentMethod === 'check' && referenceNumber) {
      pdfDoc.text(`Reference/Check No: ${referenceNumber}`, 20, y);
      y += 10;
    } else {
      y += 4;
    }
    
    pdfDoc.line(140, y, 190, y);
    y += 5;
    pdfDoc.setFontSize(9);
    pdfDoc.text('AUTHORIZED SIGNATURE', 165, y, { align: 'center' });
    
    // Prepare receipt data with grouped items
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
      referenceNumber: referenceNumber || '',
      date: date,
      time: time,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    };
    
    // Prepare database updates - use groupedItems to get correct quantities
    const dbPromises = [];
    
    // Update inventory for products - FIXED: Use grouped quantities
    for (const [key, groupedItem] of Object.entries(groupedItems)) {
      if (groupedItem.isInventoryProduct && groupedItem.firebaseId) {
        const productRef = doc(db, 'inventory', groupedItem.firebaseId);
        const updatePromise = updateDoc(productRef, {
          qty: increment(-groupedItem.quantity) // Use the grouped quantity
        }).then(() => {
          console.log(`Inventory updated for product ${groupedItem.firebaseId}: -${groupedItem.quantity}`);
        }).catch(error => {
          console.error(`Error updating inventory for ${groupedItem.firebaseId}:`, error);
        });
        
        dbPromises.push(updatePromise);
      }
    }
    
    // Update customer status if selected from dropdown
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
    
    // Save receipt to cashier_receipt collection
    const receiptPromise = addDoc(collection(db, "cashier_receipt"), receiptData)
      .then(receiptRef => {
        console.log('Receipt saved to cashier_receipt with ID:', receiptRef.id);
      })
      .catch(error => {
        console.error('Error saving receipt:', error);
      });
    
    dbPromises.push(receiptPromise);
    
    // Save to sales collection for reports
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
    
    // Execute all database updates
    await Promise.allSettled(dbPromises);
    
    // Generate PDF blob for email
    const pdfBlob = pdfDoc.output('blob');
    
    // Send email if customer email is provided
    let emailSent = false;
    if (customerEmail) {
      emailSent = await sendReceiptEmail(customerEmail, pdfBlob, receiptData);
    }
    
    // Download PDF
    const fileName = `Receipt_${customerName.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`;
    pdfDoc.save(fileName);
    
    if (loadingModal) {
      loadingModal.classList.add('hidden');
    }
    
    setTimeout(() => {
      let alertMessage = `Receipt generated successfully!\n\nReceipt No: ${receiptNumber}\nTotal: ₱${total.toFixed(2)}\nPayment: ₱${payment.toFixed(2)}`;
      if (selectedPaymentMethod === 'cash') {
        alertMessage += `\nChange: ₱${change.toFixed(2)}`;
      }
      if (selectedCustomerId) {
        alertMessage += '\n\n✓ Customer status updated to: Completed';
      }
      if (customerEmail) {
        if (emailSent) {
          alertMessage += '\n✓ Receipt sent to email successfully!';
        } else {
          alertMessage += '\n✗ Failed to send email (check EmailJS configuration)';
        }
      }
      alertMessage += '\n✓ Sale recorded in reports';
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
    console.error("Error during checkout:", error);
    if (loadingModal) {
      loadingModal.classList.add('hidden');
    }
    
    alert('Error generating receipt: ' + error.message + '\n\nPlease check your internet connection and try again.');
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (inventoryListener) inventoryListener();
  if (purchaseOrderListener) purchaseOrderListener();
  if (customersListener) customersListener();
});