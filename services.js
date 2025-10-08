const firebaseConfig = {
  apiKey: "AIzaSyD2Yh7L4Wl9XRlOgxnzZyo8xxds6a02UJY",
  authDomain: "skinship-1ff4b.firebaseapp.com",
  projectId: "skinship-1ff4b",
  storageBucket: "skinship-1ff4b.appspot.com",
  messagingSenderId: "963752770497",
  appId: "1:963752770497:web:8911cc6a375acdbdcc8d40"
}

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let servicesData = [];
let editMode = false;
let categories = [];
let currentUser = null;

// Logout Modal Functions
window.showLogoutModal = function() {
  document.getElementById('logoutModal').classList.add('show');
}

window.hideLogoutModal = function() {
  document.getElementById('logoutModal').classList.remove('show');
}

// Clock out function
async function handleClockOut() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const today = new Date().toLocaleDateString();
    const logsRef = db.collection("staffLogs").doc(user.uid).collection("history");
    
    const todayQuery = logsRef.where("date", "==", today);
    const todaySnap = await todayQuery.get();
    
    if (!todaySnap.empty) {
      const activeLog = todaySnap.docs.find(doc => !doc.data().clockOut);
      if (activeLog) {
        await db.collection("staffLogs").doc(user.uid).collection("history").doc(activeLog.id).set({
          clockOut: new Date().toLocaleString()
        }, { merge: true });
      }
    }

    // Set user as unavailable
    const staffRef = db.collection("users").doc(user.uid);
    await staffRef.update({ 
      availability: false,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log("User clocked out and set to unavailable");
  } catch (error) {
    console.error("Error during clock out:", error);
  }
}

window.confirmLogout = async function() {
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

// Generate unique service ID
async function generateServiceId() {
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

  return `SRV-${String(newNumber).padStart(3, '0')}`;
}

function getCurrentDate() {
  const today = new Date();
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return today.toLocaleDateString('en-US', options);
}

// Show edit history modal
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

// Load services from Firebase
async function loadServicesFromFirebase() {
  try {
    const snapshot = await db.collection('services').get();
    servicesData = [];
    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '';

    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No services found. Click "Add Service" to get started.</td></tr>';
    } else {
      snapshot.forEach(doc => {
        const service = doc.data();
        service.firebaseId = doc.id;
        servicesData.push(service);
        addServiceToTable(service);
      });
    }

    updateStats();
    updateCategoryFilter();
  } catch (error) {
    console.error('Error loading services:', error);
    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-500">Error loading services. Please refresh the page.</td></tr>';
  }
}

function addServiceToTable(service) {
  const tbody = document.getElementById('servicesTableBody');
  const row = document.createElement('tr');
  row.className = 'border-b hover:bg-gray-50 transition';
  row.setAttribute('data-category', service.category || '');

  row.innerHTML = `
    <td class="py-4 px-4 font-semibold">${service.id || 'N/A'}</td>
    <td class="py-4 px-4">${service.name || 'N/A'}</td>
    <td class="py-4 px-4">${service.category || 'N/A'}</td>
    <td class="py-4 px-4 text-right font-semibold text-[#da5c73]">₱ ${(service.price || 0).toLocaleString()}</td>
    <td class="py-4 px-4 text-center text-sm cursor-pointer hover:text-[#da5c73] hover:underline" onclick="showEditHistory('${service.firebaseId}')" title="Click to see edit history">${service.date || 'N/A'}</td>
  `;

  tbody.appendChild(row);
}

function updateStats() {
  const total = servicesData.length;
  const uniqueCategories = [...new Set(servicesData.map(s => s.category))].length;
  const prices = servicesData.map(s => s.price || 0);
  const avg = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

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

  document.getElementById('totalServices').textContent = total;
  document.getElementById('totalCategories').textContent = uniqueCategories;
  document.getElementById('avgPrice').textContent = `₱${Math.round(avg).toLocaleString()}`;
  
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

function updateCategoryFilter() {
  const uniqueCategories = [...new Set(servicesData.map(s => s.category))];
  const select = document.getElementById('categoryFilter');
  select.innerHTML = '<option value="all">Filter by Category</option>';
  uniqueCategories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

// Add service
function openAddServiceModal() {
  // Reload categories to ensure dropdown is up to date
  updateCategorySelects();
  document.getElementById('addServiceModal').classList.add('show');
}

function closeAddServiceModal() {
  document.getElementById('addServiceModal').classList.remove('show');
  document.getElementById('addServiceForm').reset();
}

async function handleAddService(e) {
  e.preventDefault();

  const category = document.getElementById('serviceCategorySelect').value;
  
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

  const newService = {
    id: await generateServiceId(),
    name: document.getElementById('serviceName').value.trim(),
    category: category,
    price: parseFloat(document.getElementById('servicePrice').value),
    date: getCurrentDate(),
    createdBy: currentUser ? currentUser.fullName : 'Unknown',
    createdDate: getCurrentDate(),
    lastEditedBy: currentUser ? currentUser.fullName : 'Unknown'
  };

  try {
    const docRef = await db.collection('services').add(newService);
    newService.firebaseId = docRef.id;
    servicesData.push(newService);
    addServiceToTable(newService);
    
    // Reload categories to include any new category at the end
    await loadCategories();
    
    updateStats();
    updateCategoryFilter();
    closeAddServiceModal();
    alert('Service added successfully!');
  } catch (error) {
    console.error('Error adding service:', error);
    alert('Error adding service');
  }
}

// Edit mode
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

function selectRowForEdit(event) {
  if (!editMode) return;
  
  // Don't trigger if clicking on the date column (which has its own click handler)
  if (event.target.closest('td:last-child')) return;
  
  const idCell = this.querySelector('td').textContent.trim();
  const service = servicesData.find(s => s.id === idCell);
  if (!service) return;

  // Ensure categories are loaded and update selects
  updateCategorySelects();
  
  // Wait a bit for the select to be populated
  setTimeout(() => {
    document.getElementById('editFirebaseId').value = service.firebaseId;
    document.getElementById('editServiceName').value = service.name;
    document.getElementById('editServicePrice').value = service.price;
    
    // Set the category value
    const editCategorySelect = document.getElementById('editServiceCategorySelect');
    if (editCategorySelect && service.category) {
      editCategorySelect.value = service.category;
    }

    document.getElementById('editServiceModal').classList.add('show');
  }, 100);
}

function closeEditServiceModal() {
  document.getElementById('editServiceModal').classList.remove('show');
  if (editMode) toggleEditMode();
}

async function handleEditService(e) {
  e.preventDefault();

  const id = document.getElementById('editFirebaseId').value;
  const category = document.getElementById('editServiceCategorySelect').value;
  
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

  const updatedService = {
    name: document.getElementById('editServiceName').value.trim(),
    category: category,
    price: parseFloat(document.getElementById('editServicePrice').value),
    date: getCurrentDate(),
    lastEditedBy: currentUser ? currentUser.fullName : 'Unknown'
  };

  try {
    await db.collection('services').doc(id).update(updatedService);
    const index = servicesData.findIndex(s => s.firebaseId === id);
    if (index !== -1) servicesData[index] = { ...servicesData[index], ...updatedService };

    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '';
    servicesData.forEach(s => addServiceToTable(s));
    
    // Reload categories to include any new category at the end
    await loadCategories();
    
    updateStats();
    updateCategoryFilter();
    closeEditServiceModal();
    alert('Service updated successfully!');
  } catch (error) {
    console.error('Error updating service:', error);
    alert('Error updating service');
  }
}

// Delete service
async function handleDeleteService() {
  const id = document.getElementById('editFirebaseId').value;
  const serviceName = document.getElementById('editServiceName').value;
  
  if (!confirm(`Are you sure you want to delete "${serviceName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    await db.collection('services').doc(id).delete();
    servicesData = servicesData.filter(s => s.firebaseId !== id);

    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '';
    servicesData.forEach(s => addServiceToTable(s));
    updateStats();
    updateCategoryFilter();
    
    // Reload categories after deletion
    await loadCategories();
    
    closeEditServiceModal();
    alert('Service deleted successfully!');
  } catch (error) {
    console.error('Error deleting service:', error);
    alert('Error deleting service');
  }
}

// Search
document.getElementById('searchInput').addEventListener('input', function(e) {
  const search = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#servicesTableBody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(search) ? '' : 'none';
  });
});

// Filter by category
function filterByCategory(category) {
  const rows = document.querySelectorAll('#servicesTableBody tr');
  rows.forEach(row => {
    if (category === 'all') {
      row.style.display = '';
    } else {
      const rowCategory = row.getAttribute('data-category');
      row.style.display = rowCategory === category ? '' : 'none';
    }
  });
}

// Export
function exportToCSV() {
  let csv = 'Service ID,Service Name,Category,Price,Last Updated,Last Edited By\n';
  servicesData.forEach(s => {
    csv += `${s.id},${s.name},${s.category},${s.price},${s.date},${s.lastEditedBy || 'Unknown'}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'services_report.csv';
  a.click();
}

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
      window.location.href = 'Login.html';
    }
  });
}

// Load categories from services collection
async function loadCategories() {
  try {
    const snapshot = await db.collection('services').get();
    const categoryOrder = [];
    const categorySet = new Set();
    
    // Preserve order of appearance (first occurrence)
    snapshot.forEach(doc => {
      const service = doc.data();
      if (service.category && !categorySet.has(service.category)) {
        categoryOrder.push(service.category);
        categorySet.add(service.category);
      }
    });

    categories = categoryOrder.map(cat => ({
      id: cat,
      name: cat
    }));

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
      // Category filter
      select.innerHTML = '<option value="all">Filter by Category</option>';
    } else {
      // Add/Edit modals
      select.innerHTML = '<option value="">Select Category</option>';
    }
    
    // Add category options (in order of appearance, not alphabetical)
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      select.appendChild(option);
    });
    
    // Add "Add New Category..." option only for Add/Edit modals
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
  
  // Add event listeners
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
    // Create a placeholder service with the new category
    const placeholderService = {
      id: await generateServiceId(),
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
    servicesData.push(placeholderService);
    
    // Add new category to the array (will be at the end/bottom)
    categories.push({
      id: categoryName,
      name: categoryName
    });
    
    updateCategorySelects();
    closeAddCategoryModal();
    
    // Auto-select the newly added category in whichever modal is open
    const addSelect = document.getElementById('serviceCategorySelect');
    const editSelect = document.getElementById('editServiceCategorySelect');
    
    // Check which modal is currently visible
    const addModal = document.getElementById('addServiceModal');
    const editModal = document.getElementById('editServiceModal');
    
    if (addModal && addModal.classList.contains('show')) {
      addSelect.value = categoryName;
    } else if (editModal && editModal.classList.contains('show')) {
      editSelect.value = categoryName;
    }
    
    alert(`Category "${categoryName}" added successfully! A placeholder service was created. You can edit or delete it later.`);
    
    // Refresh the table to show the new placeholder service
    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '';
    servicesData.forEach(s => addServiceToTable(s));
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
    
    // Count services in this category
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

// Handle Delete Category
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
    // Delete all services in this category
    const deletePromises = servicesInCategory.map(service => 
      db.collection('services').doc(service.firebaseId).delete()
    );
    
    await Promise.all(deletePromises);
    
    // Remove from local data
    servicesData = servicesData.filter(s => s.category !== categoryName);
    categories = categories.filter(c => c.name !== categoryName);
    
    // Update UI
    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '';
    servicesData.forEach(s => addServiceToTable(s));
    
    updateStats();
    updateCategoryFilter();
    updateCategorySelects();
    loadManageCategoriesList();
    
    alert(`Category "${categoryName}" and its ${servicesInCategory.length} service(s) have been deleted successfully!`);
  } catch (error) {
    console.error('Error deleting category:', error);
    alert('Error deleting category. Please try again.');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('userDisplayName').textContent = 'Loading...';
  document.getElementById('servicesTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Loading services...</td></tr>';
  
  loadCurrentUserName();
  loadCategories();
  loadServicesFromFirebase();
  loadNotifications();
  setInterval(loadNotifications, 5000);
  
  // Add logout button event listener
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showLogoutModal();
    });
  }
});

// Close dropdowns on outside click
window.addEventListener('click', (e) => {
  const userMenu = document.getElementById('userMenu');
  const btn = document.getElementById('userMenuButton');
  if (!btn.contains(e.target) && userMenu && !userMenu.contains(e.target)) {
    userMenu.classList.add('hidden');
  }

  if (!e.target.closest('#notificationBtn') && !e.target.closest('#notificationDropdown')) {
    document.getElementById('notificationDropdown').classList.remove('show');
  }
  
  // Close logout modal on overlay click
  const logoutModal = document.getElementById('logoutModal');
  if (e.target === logoutModal) {
    hideLogoutModal();
  }
});

// Close logout modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
    }
  }
});

// Handle page unload - clock out user
window.addEventListener("beforeunload", async (e) => {
  await handleClockOut();
});