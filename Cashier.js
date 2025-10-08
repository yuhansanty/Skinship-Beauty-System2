let notifications = [];
let lastCustomerCheck = null;
let isCategoryMenuOpen = false;
let isProductsMenuOpen = false;
let selectedPaymentMethod = 'cash';
let currentUserData = null;
let inventoryProducts = [];
let servicesData = [];

function validatePhoneNumber(input) {
  // Remove any non-digit characters
  let value = input.value.replace(/\D/g, '');
  
  // Limit to 11 digits
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
  
  // Update button states
  document.querySelectorAll('.payment-method-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-method="${method}"]`).classList.add('active');
  
  // Show/hide reference number field
  const referenceContainer = document.getElementById('referenceNumberContainer');
  if (method === 'check') {
    referenceContainer.classList.remove('hidden');
  } else {
    referenceContainer.classList.add('hidden');
  }
  
  // Recalculate change (check/bank doesn't show change)
  calculateChange();
}

function toggleUserMenu() {
  document.getElementById('userMenu').classList.toggle('hidden');
}

window.onclick = function(event) {
  if (!event.target.closest('#notificationPopup') && !event.target.closest('button[onclick="toggleNotifications()"]')) {
    document.getElementById('notificationPopup').style.display = 'none';
  }
  if (!event.target.matches('#userMenuButton') && !event.target.matches('#userMenuButton *')) {
    document.getElementById('userMenu').classList.add('hidden');
  }
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
  return Math.floor(seconds / 86400) + ' days ago';
}

function updateNotificationUI() {
  const badge = document.getElementById('notificationBadge');
  const list = document.getElementById('notificationList');
  
  if (notifications.length > 0) {
    badge.textContent = notifications.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
  
  if (notifications.length === 0) {
    list.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #999; font-size: 14px;">No new notifications</div>';
    return;
  }
  
  list.innerHTML = notifications.map(notif => {
    const timeAgo = getTimeAgo(notif.timestamp);
    return `
      <div onclick="handleNotificationClick('${notif.link}', '${notif.id}')" style="padding: 14px 16px; border-bottom: 1px solid #f9fafb; cursor: pointer; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; transition: background 0.2s ease;">
        <div style="flex: 1;">
          <div style="color: #333; font-size: 13px; line-height: 1.4; margin-bottom: 4px;">${notif.text}</div>
          <div style="color: #999; font-size: 11px;">${timeAgo}</div>
        </div>
        <button onclick="event.stopPropagation(); removeNotification('${notif.id}')" style="background: none; border: none; color: #999; cursor: pointer; font-size: 16px; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease;">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    `;
  }).join('');
}

function addNotification(notification) {
  notifications.unshift({
    ...notification,
    id: Date.now() + Math.random()
  });
  
  if (notifications.length > 20) {
    notifications = notifications.slice(0, 20);
  }
  
  updateNotificationUI();
}

function handleNotificationClick(link, notifId) {
  removeNotification(notifId);
  window.location.href = link;
}

function removeNotification(notifId) {
  notifications = notifications.filter(n => n.id != notifId);
  updateNotificationUI();
}

function clearAllNotifications() {
  notifications = [];
  updateNotificationUI();
}

async function checkForNewCustomers() {
  try {
    const snapshot = await db.collection("customers")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    
    const latestCustomer = snapshot.docs[0];
    if (latestCustomer && lastCustomerCheck) {
      const customerTime = latestCustomer.data().createdAt?.toMillis();
      if (customerTime && customerTime > lastCustomerCheck) {
        const customerData = latestCustomer.data();
        addNotification({
          type: 'customer',
          text: `New customer added: ${customerData.name}`,
          link: 'customer.html',
          timestamp: new Date()
        });
      }
    }
    
    if (latestCustomer) {
      lastCustomerCheck = latestCustomer.data().createdAt?.toMillis() || Date.now();
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
  try {
    const currentUserEmail = localStorage.getItem('currentUserEmail');
    if (!currentUserEmail) return;

    const userSnapshot = await db.collection("users").get();
    let userId = null;

    userSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.email && data.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) {
        userId = doc.id;
      }
    });

    if (!userId) {
      console.warn("User not found for clock out");
      return;
    }

    const today = new Date().toLocaleDateString();
    const logsRef = db.collection("users").doc(userId).collection("staffLogs").doc("history").collection("entries");
    
    const todayQuery = logsRef.where("date", "==", today);
    const todaySnap = await todayQuery.get();
    
    if (!todaySnap.empty) {
      const activeLog = todaySnap.docs.find(doc => !doc.data().clockOut);
      if (activeLog) {
        await activeLog.ref.update({
          clockOut: new Date().toLocaleString()
        });
        console.log("Clock out successful");
      }
    }

    await db.collection("users").doc(userId).update({ 
      availability: false,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log("User set to unavailable");
  } catch (error) {
    console.error("Error during clock out:", error);
  }
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
    
    window.location.href = "Login.html";
  } catch (error) {
    console.error("Logout error:", error);
    
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    
    alert("An error occurred during logout. Please try again.");
    
    window.location.href = "Login.html";
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

let categories = [];
let currentView = 'services';
let cart = [];
let currentCategory = 'all';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD2Yh7L4Wl9XRlOgxnzZyo8xxds6a02UJY",
  authDomain: "skinship-1ff4b.firebaseapp.com",
  projectId: "skinship-1ff4b",
  storageBucket: "skinship-1ff4b.appspot.com",
  messagingSenderId: "963752770497",
  appId: "1:963752770497:web:8911cc6a375acdbdcc8d40"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

async function loadServicesFromFirebase() {
  try {
    const snapshot = await db.collection('services').get();
    servicesData = [];
    const categorySet = new Set();
    
    snapshot.forEach(doc => {
      const service = doc.data();
      servicesData.push({
        name: service.name,
        price: service.price,
        category: service.category,
        id: service.id,
        firebaseId: doc.id
      });
      
      categorySet.add(service.category);
    });
    
    categories = Array.from(categorySet).map(cat => ({
      name: cat,
      value: cat
    }));
    
    console.log('Loaded services:', servicesData);
    console.log('Categories:', categories);
    
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

let productCategories = [];

async function loadInventoryProducts() {
  try {
    const snapshot = await db.collection('inventory').get();
    inventoryProducts = [];
    const categorySet = new Set();
    
    snapshot.forEach(doc => {
      const product = doc.data();
      
      inventoryProducts.push({
        name: product.name,
        price: product.price,
        category: product.category,
        qty: product.qty || 0,
        id: product.id,
        firebaseId: doc.id
      });
      
      categorySet.add(product.category);
    });
    
    productCategories = Array.from(categorySet).map(cat => ({
      name: cat,
      value: cat
    }));
    
    console.log('Loaded inventory products:', inventoryProducts);
    console.log('Product categories:', productCategories);
    
  } catch (error) {
    console.error('Error loading inventory:', error);
  }
}

async function loadUserInfo() {
  console.log('=== Loading User Info ===');
  console.log('All localStorage keys:', Object.keys(localStorage));
  
  const currentUserEmail = localStorage.getItem('currentUserEmail') || 
                          localStorage.getItem('userEmail') ||
                          localStorage.getItem('email');
  const currentUsername = localStorage.getItem('currentUsername') || 
                         localStorage.getItem('username');
  
  console.log('Current user email:', currentUserEmail);
  console.log('Current username:', currentUsername);
  
  if (!currentUserEmail && !currentUsername) {
    console.warn("No user credentials found in localStorage");
    document.getElementById('usernameDisplay').textContent = 'Not logged in';
    document.getElementById('cashierName').value = 'Unknown';
    document.getElementById('logoutUsername').textContent = 'Not logged in';
    return;
  }
  
  try {
    const userSnapshot = await db.collection("users").get();
    console.log('Total users in database:', userSnapshot.size);
    
    let foundUser = null;
    
    userSnapshot.forEach(doc => {
      const data = doc.data();
      console.log('Checking user doc:', {
        id: doc.id,
        email: data.email,
        username: data.username,
        fullName: data.fullName
      });
      
      if (currentUserEmail && data.email && 
          data.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) {
        foundUser = data;
        console.log('✓ Found user by email match');
      }
      else if (currentUsername && data.username && 
               data.username.toLowerCase().trim() === currentUsername.toLowerCase().trim()) {
        foundUser = data;
        console.log('✓ Found user by username match');
      }
    });
    
    if (foundUser) {
      currentUserData = foundUser;
      console.log('User data loaded:', currentUserData);
      
      const fullName = currentUserData.fullName || 
                      currentUserData.fullname || 
                      currentUserData.name || 
                      currentUserData.username || 
                      'User';
      
      console.log('Display name set to:', fullName);
      
      document.getElementById('usernameDisplay').textContent = fullName;
      document.getElementById('cashierName').value = fullName;
      document.getElementById('logoutUsername').textContent = fullName;
    } else {
      console.error('❌ No matching user found');
      console.error('Searched for email:', currentUserEmail);
      console.error('Searched for username:', currentUsername);
      document.getElementById('usernameDisplay').textContent = 'User Not Found';
      document.getElementById('cashierName').value = 'Unknown User';
      document.getElementById('logoutUsername').textContent = 'User Not Found';
    }
  } catch (error) {
    console.error("Error loading user info:", error);
    document.getElementById('usernameDisplay').textContent = 'Error Loading User';
    document.getElementById('cashierName').value = 'Unknown User';
    document.getElementById('logoutUsername').textContent = 'Error Loading User';
  }
}

function toggleCategoryMenu() {
  const dropdown = document.getElementById('categoryDropdown');
  const btn = document.querySelector('.all-services-btn');
  const grid = document.getElementById('categoryGrid');
  const productsDropdown = document.getElementById('productsDropdown');
  const productsBtn = document.querySelector('.all-products-btn');
  
  // Close products dropdown if open
  if (isProductsMenuOpen) {
    productsDropdown.classList.remove('open');
    productsBtn.classList.remove('active');
    isProductsMenuOpen = false;
  }
  
  isCategoryMenuOpen = !isCategoryMenuOpen;
  
  if (isCategoryMenuOpen) {
    btn.classList.add('active');
    dropdown.classList.add('open');
    
    grid.innerHTML = '';
    
    // Add "View All Services" button first
    const viewAllBtn = document.createElement('button');
    viewAllBtn.className = 'category-btn';
    viewAllBtn.textContent = 'View All Services';
    viewAllBtn.classList.add('first-row');
    if (currentCategory === 'all') {
      viewAllBtn.classList.add('active');
    }
    viewAllBtn.onclick = () => showCategory('all', 'All Services');
    grid.appendChild(viewAllBtn);
    
    // Render categories with animation classes
    categories.forEach((cat, index) => {
      const button = document.createElement('button');
      button.className = 'category-btn';
      button.textContent = cat.name;
      
      // Adjust animation classes since we added one button
      if (index < 3) {
        button.classList.add('first-row');
      } else {
        button.classList.add('remaining-rows');
      }
      
      if (currentCategory === cat.value) {
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
  
  // Close services dropdown if open
  if (isCategoryMenuOpen) {
    servicesDropdown.classList.remove('open');
    servicesBtn.classList.remove('active');
    isCategoryMenuOpen = false;
  }
  
  isProductsMenuOpen = !isProductsMenuOpen;
  
  if (isProductsMenuOpen) {
    btn.classList.add('active');
    dropdown.classList.add('open');
    
    grid.innerHTML = '';
    
     // Add "View All Products" button first
    const viewAllBtn = document.createElement('button');
    viewAllBtn.className = 'category-btn product-btn';
    viewAllBtn.textContent = 'View All Products';
    viewAllBtn.classList.add('first-row');
    viewAllBtn.onclick = () => showProductCategory('all', 'All Products');
    grid.appendChild(viewAllBtn);
    
    // Render product categories
    productCategories.forEach((cat, index) => {
      const button = document.createElement('button');
      button.className = 'category-btn product-btn';
      button.textContent = cat.name;
      
      if (index < 3) {
        button.classList.add('first-row');
      } else {
        button.classList.add('remaining-rows');
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
  allProductsBtn.textContent = categoryName || 'All Products';
  
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
  
  // Filter and render products
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
  allServicesBtn.textContent = categoryName || 'All Services';
  
  const buttons = document.querySelectorAll('.category-btn');
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
  
  // Filter services
  if (category === 'all') {
    renderServices(servicesData);
  } else {
    const filtered = servicesData.filter(s => s.category === category);
    renderServices(filtered);
  }
  
  toggleCategoryMenu();
}

function filterServices() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const itemsToFilter = currentView === 'products' ? inventoryProducts : servicesData;
  const filtered = itemsToFilter.filter(s => 
    s.name.toLowerCase().includes(search) || 
    s.category.toLowerCase().includes(search)
  );
  renderServices(filtered);
}

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
  cart = cart.filter(item => item.id !== id);
  updateCart();
}

function updateCart() {
  const container = document.getElementById('cartItems');
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-400 py-8">
        <i class="fa-solid fa-cart-shopping text-4xl mb-2"></i>
        <p class="text-sm">No items in cart</p>
      </div>
    `;
    document.getElementById('checkoutBtn').disabled = true;
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
    document.getElementById('checkoutBtn').disabled = false;
  }
  
  document.getElementById('totalAmount').textContent = total.toFixed(2);
  calculateChange();
}

function calculateChange() {
  const payment = parseFloat(document.getElementById('paymentInput').value) || 0;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const change = payment - total;
  
  const changeDisplay = document.getElementById('changeDisplay');
  
  // Only show change for cash payments
  if (selectedPaymentMethod === 'cash' && payment > 0 && change >= 0) {
    changeDisplay.classList.remove('hidden');
    document.getElementById('changeAmount').textContent = change.toFixed(2);
  } else {
    changeDisplay.classList.add('hidden');
  }
}

document.getElementById('paymentInput').addEventListener('input', calculateChange);

function clearCart() {
  cart = [];
  updateCart();
  document.getElementById('paymentInput').value = '';
  document.getElementById('customerName').value = '';
  document.getElementById('customerEmail').value = '';
  document.getElementById('customerAddress').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('referenceNumber').value = '';
  document.getElementById('changeDisplay').classList.add('hidden');
  document.getElementById('phoneError').classList.add('hidden');
  
  // Reset payment method to cash
  selectedPaymentMethod = 'cash';
  document.querySelectorAll('.payment-method-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector('[data-method="cash"]').classList.add('active');
  document.getElementById('referenceNumberContainer').classList.add('hidden');
}

function checkout() {
  const customerName = document.getElementById('customerName').value.trim();
  const customerEmail = document.getElementById('customerEmail').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();
  const payment = parseFloat(document.getElementById('paymentInput').value) || 0;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const referenceNumber = document.getElementById('referenceNumber').value.trim();
  
  if (!customerName) {
    alert('Please enter customer name');
    return;
  }
  
  // Validate email if provided
  if (customerEmail && !customerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    alert('Please enter a valid email address');
    return;
  }
  
  // Validate phone number
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
  
  // Validate reference number for check/bank payments
  if (selectedPaymentMethod === 'check' && !referenceNumber) {
    alert('Please enter reference or check number');
    return;
  }
  
  generateReceipt();
}

async function sendEmailWithPDF(email, pdfBlob, receiptData) {
  try {
    const reader = new FileReader();
    const base64PDF = await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    const itemsList = receiptData.items.map(item => 
      `${item.name} - ₱${item.price.toFixed(2)}`
    ).join('\n');

    const response = await emailjs.send(
      'service_s0oyzpd',
      'template_mqrbj1n',
      {
        to_email: email,
        customer_name: receiptData.customerName,
        receipt_number: receiptData.receiptNumber,
        date: receiptData.date,
        time: receiptData.time,
        items: itemsList,
        total: `₱${receiptData.subtotal.toFixed(2)}`,
        payment: `₱${receiptData.payment.toFixed(2)}`,
        change: `₱${receiptData.change.toFixed(2)}`,
        payment_method: receiptData.paymentMethod,
        cashier: receiptData.cashierName
      }
    );

    console.log('Email sent successfully:', response);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

async function generateReceipt() {
  document.getElementById('loadingModal').classList.remove('hidden');
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const customerName = document.getElementById('customerName').value.trim();
  const customerEmail = document.getElementById('customerEmail').value.trim();
  const customerAddress = document.getElementById('customerAddress').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();
  const payment = parseFloat(document.getElementById('paymentInput').value) || 0;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const change = selectedPaymentMethod === 'cash' ? payment - total : 0;
  const referenceNumber = document.getElementById('referenceNumber').value.trim();
  const date = new Date().toLocaleDateString('en-PH');
  const time = new Date().toLocaleTimeString('en-PH');
  const receiptNumber = 'RCP-' + Date.now();
  const paymentMethodText = selectedPaymentMethod === 'cash' ? 'Cash' : 'Check/Bank Transfer';
  
  let y = 20;
  
  // Header
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
  
  // Title
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('ACKNOWLEDGEMENT RECEIPT', 105, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.text(`Receipt No: ${receiptNumber}`, 105, y, { align: 'center' });
  y += 10;
  
  // Customer Info
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
  y += 8;
  
  // Table Header
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
  
  // Items
  doc.setFont(undefined, 'normal');
  cart.forEach(item => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.text('1', 25, y);
    const lines = doc.splitTextToSize(item.name, 90);
    doc.text(lines, 50, y);
    doc.text(`₱${item.price.toFixed(2)}`, 150, y);
    doc.text(`₱${item.price.toFixed(2)}`, 175, y);
    y += Math.max(6, lines.length * 5);
  });
  
  // Total Section
  y += 4;
  doc.line(20, y, 190, y);
  y += 6;
  doc.setFont(undefined, 'bold');
  doc.text('TOTAL:', 150, y);
  doc.text(`₱${total.toFixed(2)}`, 175, y);
  y += 6;
  doc.setFont(undefined, 'normal');
  doc.text('PAYMENT:', 150, y);
  doc.text(`₱${payment.toFixed(2)}`, 175, y);
  y += 6;
  
  if (selectedPaymentMethod === 'cash') {
    doc.setFont(undefined, 'bold');
    doc.text('CHANGE:', 150, y);
    doc.text(`₱${change.toFixed(2)}`, 175, y);
    y += 10;
  } else {
    y += 4;
  }
  
  // Payment Info
  doc.setFont(undefined, 'normal');
  doc.text(`Mode of Payment: ${paymentMethodText}`, 20, y);
  y += 6;
  
  if (selectedPaymentMethod === 'check' && referenceNumber) {
    doc.text(`Reference/Check No: ${referenceNumber}`, 20, y);
    y += 10;
  } else {
    y += 4;
  }
  
  // Footer
  doc.line(140, y, 190, y);
  y += 5;
  doc.setFontSize(9);
  doc.text('AUTHORIZED SIGNATURE', 165, y, { align: 'center' });
  
  // Prepare receipt data for Firebase
  const receiptData = {
    receiptNumber: receiptNumber,
    customerName: customerName,
    customerEmail: customerEmail || '',
    customerAddress: customerAddress || '',
    customerPhone: customerPhone || '',
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
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: new Date().toISOString()
  };
  
  try {
    const inventoryUpdates = [];
    for (const item of cart) {
      if (item.isInventoryProduct && item.firebaseId) {
        inventoryUpdates.push(
          db.collection('inventory').doc(item.firebaseId).update({
            qty: firebase.firestore.FieldValue.increment(-1)
          })
        );
      }
    }
    
    await Promise.all(inventoryUpdates);
    await db.collection("cashier_receipt").add(receiptData);
    await loadInventoryProducts();
    
    // Save PDF
    const fileName = `Receipt_${customerName.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`;
    
    let emailSent = false;
    if (customerEmail) {
      try {
        const pdfBlob = doc.output('blob');
        await sendEmailWithPDF(customerEmail, pdfBlob, receiptData);
        emailSent = true;
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }
    }
    
    doc.save(fileName);
    
    document.getElementById('loadingModal').classList.add('hidden');
    
    setTimeout(() => {
      let alertMessage = `Receipt generated successfully!\n\nReceipt No: ${receiptNumber}\nTotal: ₱${total.toFixed(2)}\nPayment: ₱${payment.toFixed(2)}`;
      if (selectedPaymentMethod === 'cash') {
        alertMessage += `\nChange: ₱${change.toFixed(2)}`;
      }
      if (customerEmail) {
        if (emailSent) {
          alertMessage += `\n\n✓ Receipt sent to ${customerEmail}`;
        } else {
          alertMessage += `\n\n✗ Failed to send email. Please check the email address.`;
        }
      }
      alert(alertMessage);
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
    console.error("Error saving receipt:", error);
    document.getElementById('loadingModal').classList.add('hidden');
    alert('Receipt printed but failed to save to database. Please check your connection.');
    
    // Still save PDF even if Firebase fails
    const fileName = `Receipt_${customerName.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
    
    setTimeout(() => {
      clearCart();
    }, 100);
  }
}

(async function init() {
  await loadUserInfo();
  await loadServicesFromFirebase();
  await loadInventoryProducts();
  currentView = 'services';
  currentCategory = 'all';
  renderServices(servicesData);
  document.getElementById('paymentInput').addEventListener('input', calculateChange);
})();