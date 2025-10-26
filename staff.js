import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  onSnapshot, 
  updateDoc, 
  serverTimestamp, 
  limit,
  getDoc
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

// DOM Elements
const usernameSpan = document.getElementById("usernameDisplay");
const staffGrid = document.getElementById("staffGrid");
const emptyState = document.getElementById("emptyState");
const logoutBtn = document.getElementById("logoutBtn");
const searchInput = document.getElementById("searchInput");

// Global State
let allStaffData = [];
let currentPage = 1;
const entriesPerPage = 10;
let allHistoryData = [];
let currentStaffId = null;
let currentStaffName = null;
let staffListener = null;
let inventoryListener = null;
let purchaseOrderListener = null;
let sessionMonitor = null;
let userDataCache = null;
let inventoryDataCache = [];

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  
  const titles = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <div class="toast-content">
      <div class="toast-title">${titles[type]}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

window.showToast = showToast;

// ==================== ROLE-BASED VISIBILITY ====================

function applyRoleBasedVisibility(role) {
  const body = document.body;
  
  // Remove existing role classes
  body.classList.remove('role-admin', 'role-staff');
  
  // Add appropriate role class - default to staff if no role specified
  if (role === 'admin') {
    body.classList.add('role-admin');
  } else {
    // Default to staff for any other role or undefined
    body.classList.add('role-staff');
  }
}

// Session monitoring function
function setupSessionMonitoring(userId) {
  if (sessionMonitor) sessionMonitor(); // Cleanup previous listener
  
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
    
    // Check if session ID has changed (another login or password change)
    if (currentSessionId && currentSessionId !== storedSessionId) {
      console.log('Session invalidated - another login detected or password changed');
      
      // Show notification before logout
showToast('Your session has been ended because someone else logged in or your password was changed', 'warning', 5000);
      
      // Force logout
      signOut(auth).then(() => {
        window.location.href = 'index.html';
      });
    }
  }, (error) => {
    console.error('Session monitoring error:', error);
  });
}

// Check localStorage for role and apply immediately to prevent flash
(function() {
  const storedRole = localStorage.getItem('currentUserRole');
  if (storedRole === 'admin') {
    document.body.classList.remove('role-staff');
    document.body.classList.add('role-admin');
  } else {
    // Default to staff (already applied in HTML)
    document.body.classList.add('role-staff');
  }
})();

// Helper function to determine status
function determineStatus(qty, minStock) {
  if (qty === 0) return 'out-of-stock';
  if (qty <= minStock) return 'low-stock';
  return 'in-stock';
}

// Monitor inventory for overstock, low stock, and out of stock
function monitorInventory() {
  if (inventoryListener) {
    inventoryListener();
  }

  inventoryListener = onSnapshot(
    collection(db, "inventory"),
    (snapshot) => {
      const inventoryData = [];
      snapshot.forEach(doc => {
        const product = doc.data();
        inventoryData.push({
          id: doc.id,
          ...product
        });
      });
      
      const noStockCount = inventoryData.filter(item => item.status === 'out-of-stock').length;
      const lowStockCount = inventoryData.filter(item => item.status === 'low-stock').length;
      const overstockCount = inventoryData.filter(item => item.status === 'overstock').length;
      
      updateInventoryBubble(noStockCount, lowStockCount, overstockCount);
    },
    (error) => {
      console.error('Error monitoring inventory:', error);
    }
  );
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

// Monitor purchase orders for sidebar bubble
function monitorPurchaseOrders() {
  if (purchaseOrderListener) {
    purchaseOrderListener();
  }

  purchaseOrderListener = onSnapshot(
    query(collection(db, "purchaseOrders"), where("status", "==", "pending"), limit(100)),
    (snapshot) => {
      const newOrderCount = snapshot.size;
      updatePurchaseOrderBubble(newOrderCount);
    },
    (error) => {
      console.error('Error monitoring purchase orders:', error);
    }
  );
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

function displayHistoryPage() {
  const historyList = document.getElementById("historyList");
  const historyCount = document.getElementById("historyCount");
  const pageInfo = document.getElementById("pageInfo");
  const paginationControls = document.getElementById("paginationControls");
  
  const totalEntries = allHistoryData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  
  historyCount.textContent = `Total entries: ${totalEntries}`;
  pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  
  if (totalEntries === 0) {
    historyList.innerHTML = `
      <tr>
        <td colspan="2" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
          <i class="fa-solid fa-inbox" style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem; display: block;"></i>
          No history available yet
        </td>
      </tr>
    `;
    paginationControls.innerHTML = "";
    return;
  }
  
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const pageData = allHistoryData.slice(startIndex, endIndex);
  
  historyList.innerHTML = pageData.map(log => {
    return `
      <tr>
        <td>${log.clockIn || "N/A"}</td>
        <td>${log.clockOut || '<span style="color: var(--success); font-weight: 600;">Currently Active</span>'}</td>
      </tr>
    `;
  }).join("");
  
  renderPagination(totalPages, paginationControls);
}

function renderPagination(totalPages, container) {
  container.innerHTML = "";
  
  if (totalPages <= 1) return;
  
  const prevBtn = createPaginationButton(
    '<i class="fa-solid fa-chevron-left"></i>',
    currentPage === 1,
    () => {
      if (currentPage > 1) {
        currentPage--;
        displayHistoryPage();
      }
    }
  );
  container.appendChild(prevBtn);
  
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  
  if (startPage > 1) {
    container.appendChild(createPaginationButton("1", false, () => {
      currentPage = 1;
      displayHistoryPage();
    }));
    
    if (startPage > 2) {
      const dots = document.createElement("span");
      dots.textContent = "...";
      dots.className = "pagination-dots";
      container.appendChild(dots);
    }
  }
  
  for (let i = startPage; i <= endPage; i++) {
    const btn = createPaginationButton(i.toString(), false, () => {
      currentPage = i;
      displayHistoryPage();
    });
    if (i === currentPage) btn.classList.add('active');
    container.appendChild(btn);
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement("span");
      dots.textContent = "...";
      dots.className = "pagination-dots";
      container.appendChild(dots);
    }
    
    container.appendChild(createPaginationButton(totalPages.toString(), false, () => {
      currentPage = totalPages;
      displayHistoryPage();
    }));
  }
  
  const nextBtn = createPaginationButton(
    '<i class="fa-solid fa-chevron-right"></i>',
    currentPage === totalPages,
    () => {
      if (currentPage < totalPages) {
        currentPage++;
        displayHistoryPage();
      }
    }
  );
  container.appendChild(nextBtn);
}

function createPaginationButton(content, disabled, onClick) {
  const btn = document.createElement("button");
  btn.innerHTML = content;
  btn.disabled = disabled;
  btn.onclick = onClick;
  return btn;
}

// ==================== STAFF DISPLAY ====================

function displayStaffCards(staffData) {
  staffGrid.innerHTML = '';
  
  if (staffData.length === 0) {
    staffGrid.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  staffGrid.style.display = 'grid';
  emptyState.style.display = 'none';
  
  staffData.forEach((staff, index) => {
    const card = document.createElement('div');
    card.className = 'staff-card';
    card.style.animationDelay = `${index * 0.05}s`;
    card.setAttribute('data-staff-id', staff.id);
    
    // Format schedule for display - different for admin vs staff
    let scheduleDisplay = "No schedule";
    let scheduleIcon = "fa-clock";
    
    if (staff.role === 'admin') {
      scheduleDisplay = "Admin Account";
      scheduleIcon = "fa-user-shield";
    } else {
      // Format schedule for staff
      const schedule = staff.schedule || "";
      
      if (schedule.includes("10:00-13:00")) {
        scheduleIcon = "fa-sun";
        scheduleDisplay = "10:00 AM - 1:00 PM (Morning)";
      } else if (schedule.includes("13:00-17:00")) {
        scheduleIcon = "fa-cloud-sun";
        scheduleDisplay = "1:00 PM - 5:00 PM (Afternoon)";
      } else if (schedule.includes("17:00-21:00")) {
        scheduleIcon = "fa-moon";
        scheduleDisplay = "5:00 PM - 9:00 PM (Evening)";
      } else if (schedule) {
        scheduleDisplay = schedule;
      }
    }
    
card.innerHTML = `
      <div class="staff-card-header">
        <div class="staff-info">
          <h3>${staff.fullName}</h3>
          <div class="staff-gender">
            <i class="fa-solid fa-${staff.gender.toLowerCase() === 'male' ? 'mars' : 'venus'}"></i>
            ${staff.gender}
          </div>
        </div>
            <div class="availability-badge ${staff.isAbsent ? 'absent' : (staff.onLaunchBreak ? 'on-break' : (staff.isAvailable ? 'available' : 'unavailable'))}">
          <i class="fa-solid fa-circle"></i>
          ${staff.isAbsent ? 'Absent' : (staff.onLaunchBreak ? 'On Break' : (staff.isAvailable ? 'Available' : 'Unavailable'))}
        </div>      
      </div>
      
      <div class="staff-details">
        <div class="detail-row">
          <span class="detail-label">
            <i class="fa-solid fa-phone"></i>
            Mobile
          </span>
          <span class="detail-value">${staff.mobile}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">
            <i class="fa-solid fa-user-tag"></i>
            Role
          </span>
          <span class="detail-value ${staff.role === 'admin' ? 'admin-role' : ''}">${staff.role}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">
            <i class="fa-solid ${scheduleIcon}"></i>
            Schedule
          </span>
          <span class="detail-value ${staff.role === 'admin' ? 'admin-schedule' : ''}">${scheduleDisplay}</span>
        </div>
      </div>
      
${staff.role !== 'admin' && !staff.isArchived ? `
        <div class="staff-actions">
          <button class="btn btn-break ${staff.onLaunchBreak ? 'active' : ''}" data-staff-id="${staff.id}" data-break-status="${staff.onLaunchBreak || false}" ${staff.isAbsent ? 'disabled' : ''}>
            <i class="fa-solid fa-${staff.onLaunchBreak ? 'play' : 'utensils'}"></i>
            ${staff.onLaunchBreak ? 'End Break' : 'Launch Break'}
          </button>
          <button class="btn btn-absent ${staff.isAbsent ? 'active' : ''}" data-staff-id="${staff.id}" data-absent-status="${staff.isAbsent || false}">
            <i class="fa-solid fa-${staff.isAbsent ? 'user-check' : 'user-xmark'}"></i>
            ${staff.isAbsent ? 'Mark Present' : 'Mark Absent'}
          </button>
        </div>
      ` : ''}
      
      ${staff.isArchived ? '<div class="archived-overlay"><div class="archived-label">ARCHIVED</div><div class="archived-subtitle">Account Inactive</div></div>' : ''}
    `;
    
    // Add archived class if staff is archived
    if (staff.isArchived) {
      card.classList.add('archived');
    }
    
    staffGrid.appendChild(card);
  });
}

// Add event listeners for break and absent buttons
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn-break')) {
    const button = e.target.closest('.btn-break');
    const staffId = button.getAttribute('data-staff-id');
    const currentBreakStatus = button.getAttribute('data-break-status') === 'true';
    
    toggleLaunchBreak(staffId, currentBreakStatus);
  }
  
  if (e.target.closest('.btn-absent')) {
    const button = e.target.closest('.btn-absent');
    const staffId = button.getAttribute('data-staff-id');
    const currentAbsentStatus = button.getAttribute('data-absent-status') === 'true';
    
    toggleAbsent(staffId, currentAbsentStatus);
  }
});

// ==================== SEARCH FUNCTIONALITY ====================
searchInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase().trim();
  
  if (searchTerm === '') {
    displayStaffCards(allStaffData);
    return;
  }
  
  const filteredData = allStaffData.filter(staff => {
    const fullName = (staff.fullName || '').toLowerCase();
    const gender = (staff.gender || '').toLowerCase();
    const mobile = (staff.mobile || '').toLowerCase();
    const schedule = (staff.schedule || '').toLowerCase();
    
    return fullName.includes(searchTerm) ||
           gender === searchTerm ||
           mobile.includes(searchTerm) ||
           schedule.includes(searchTerm);
  });
  
  displayStaffCards(filteredData);
});

// Handle launch break toggle
async function toggleLaunchBreak(staffId, currentBreakStatus) {
  try {
    const staffRef = doc(db, "users", staffId);
    const newBreakStatus = !currentBreakStatus;
    
    if (newBreakStatus) {
      // Starting break - save current availability and set to false
      const staffDoc = await getDoc(staffRef);
      const currentAvailability = staffDoc.data().availability || false;
      
      await updateDoc(staffRef, {
        onLaunchBreak: true,
        availability: false,
        availabilityBeforeBreak: currentAvailability, // Save the state
        lastUpdated: serverTimestamp()
      });
    } else {
      // Ending break - restore previous availability
      const staffDoc = await getDoc(staffRef);
      const previousAvailability = staffDoc.data().availabilityBeforeBreak || false;
      
      await updateDoc(staffRef, {
        onLaunchBreak: false,
        availability: previousAvailability, // Restore previous state
        lastUpdated: serverTimestamp()
      });
    }
    
    console.log(`Staff ${staffId} launch break status updated to: ${newBreakStatus}`);
  } catch (error) {
    console.error("Error toggling launch break:", error);
showToast("Failed to update launch break status. Please try again.", 'error');
  }
}

// Global variables for absent modal
let pendingAbsentStaffId = null;
let pendingAbsentStatus = false;

// Handle absent toggle
async function toggleAbsent(staffId, currentAbsentStatus) {
  const newAbsentStatus = !currentAbsentStatus;
  
  // Find staff name
  const staffData = allStaffData.find(s => s.id === staffId);
  const staffName = staffData ? staffData.fullName : 'Unknown';
  
  // Store pending action
  pendingAbsentStaffId = staffId;
  pendingAbsentStatus = newAbsentStatus;
  
  // Update modal content based on action
  const modal = document.getElementById('absentModal');
  const title = document.getElementById('absentModalTitle');
  const message = document.getElementById('absentModalMessage');
  const warning = document.getElementById('absentWarning');
  const success = document.getElementById('absentSuccess');
  const iconContainer = document.getElementById('absentIconContainer');
  const confirmBtn = document.getElementById('confirmAbsentBtn');
  const staffNameSpan = document.getElementById('absentStaffName');
  
  staffNameSpan.textContent = staffName;
  
  if (newAbsentStatus) {
    // Marking as absent
    title.textContent = 'Mark as Absent';
    message.textContent = 'Are you sure you want to mark this staff member as ABSENT?';
    warning.style.display = 'flex';
    success.style.display = 'none';
    iconContainer.innerHTML = '<i class="fa-solid fa-user-xmark"></i>';
    iconContainer.style.background = 'linear-gradient(135deg, #fecaca 0%, #ef4444 100%)';
    confirmBtn.innerHTML = '<i class="fa-solid fa-user-xmark"></i> Mark Absent';
    confirmBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
  } else {
    // Marking as present
    title.textContent = 'Mark as Present';
    message.textContent = 'Are you sure you want to mark this staff member as PRESENT?';
    warning.style.display = 'none';
    success.style.display = 'flex';
    iconContainer.innerHTML = '<i class="fa-solid fa-user-check"></i>';
    iconContainer.style.background = 'linear-gradient(135deg, #d1fae5 0%, #10b981 100%)';
    confirmBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Mark Present';
    confirmBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  }
  
  // Show modal
  modal.classList.add('show');
}

// Confirm absent toggle
window.confirmAbsentToggle = async function() {
  const confirmBtn = document.getElementById('confirmAbsentBtn');
  confirmBtn.classList.add('loading');
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner"></i> Processing...';
  
  try {
    const staffRef = doc(db, "users", pendingAbsentStaffId);
    
    if (pendingAbsentStatus) {
      // Marking as absent
      const staffDoc = await getDoc(staffRef);
      const currentAvailability = staffDoc.data().availability || false;
      
      await updateDoc(staffRef, {
        isAbsent: true,
        availability: false,
        onLaunchBreak: false, // Clear break status
        availabilityBeforeAbsent: currentAvailability,
        lastUpdated: serverTimestamp()
      });
    } else {
      // Marking as present
      await updateDoc(staffRef, {
        isAbsent: false,
        availability: false, // Stay unavailable, they need to manually go online
        lastUpdated: serverTimestamp()
      });
    }
    
    console.log(`Staff ${pendingAbsentStaffId} absent status updated to: ${pendingAbsentStatus}`);
    hideAbsentModal();
    
  } catch (error) {
    console.error("Error toggling absent status:", error);
showToast("Failed to update absent status. Please try again.", 'error');
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = pendingAbsentStatus ? 
      '<i class="fa-solid fa-user-xmark"></i> Mark Absent' : 
      '<i class="fa-solid fa-user-check"></i> Mark Present';
  }
}

// Hide absent modal
window.hideAbsentModal = function() {
  const modal = document.getElementById('absentModal');
  modal.classList.remove('show');
  
  // Reset button state
  const confirmBtn = document.getElementById('confirmAbsentBtn');
  confirmBtn.classList.remove('loading');
  
  // Clear pending data
  pendingAbsentStaffId = null;
  pendingAbsentStatus = false;
}

// Close absent modal on outside click
document.getElementById('absentModal')?.addEventListener('click', function(e) {
  if (e.target === this) {
    hideAbsentModal();
  }
});

// Close absent modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('absentModal');
    if (modal && modal.classList.contains('show')) {
      hideAbsentModal();
    }
  }
});

async function loadAllStaffData() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    
    const staffData = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      
      // Get availability from user document
      const isAvailable = userData.availability === true;
      const isArchived = userData.archived === true; // Add archived status
      
staffData.push({
        id: doc.id,
        fullName: userData.fullName || "N/A",
        gender: userData.gender || "N/A",
        mobile: userData.mobile || "N/A",
        role: userData.role || "staff",
        schedule: userData.schedule || "No schedule assigned",
        isAvailable: isAvailable,
        isArchived: isArchived,
        onLaunchBreak: userData.onLaunchBreak || false,
        isAbsent: userData.isAbsent || false
      });
    });
    
    // Sort by archived status first (active first), then by availability, then alphabetically
    staffData.sort((a, b) => {
      // Archived accounts go to the end
      if (a.isArchived !== b.isArchived) {
        return a.isArchived - b.isArchived;
      }
      // Then sort by availability
      if (a.isAvailable !== b.isAvailable) {
        return b.isAvailable - a.isAvailable;
      }
      // Finally sort alphabetically
      return a.fullName.localeCompare(b.fullName);
    });
    
    allStaffData = staffData;
    displayStaffCards(allStaffData);
    
  } catch (error) {
    console.error("Error loading staff data:", error);
  }
}
// ==================== SETUP REAL-TIME LISTENER (OPTIMIZED) ====================

function setupStaffListener() {
  // Only listen to changes in the users collection
  if (staffListener) {
    staffListener();
  }
  
  staffListener = onSnapshot(
    collection(db, "users"),
    async (snapshot) => {
      // Only process changes, not all documents
      if (snapshot.docChanges().length > 0) {
        console.log("Staff data changed, reloading...");
        await loadAllStaffData();
      }
    },
    (error) => {
      console.error("Error in staff listener:", error);
    }
  );
}

// ==================== AUTHENTICATION & MAIN ====================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  
  try {
    // Check cache first
    if (userDataCache && userDataCache.uid === user.uid) {
      const currentUserFullName = userDataCache.fullName;
      const currentUserRole = userDataCache.role;
      
      usernameSpan.textContent = currentUserFullName;
      document.getElementById('logoutUsername').textContent = currentUserFullName;
      applyRoleBasedVisibility(currentUserRole);
    } else {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        console.error("User document not found in Firestore!");
        return;
      }
      
      const userData = userDoc.data();
      const currentUserFullName = userData.fullName || user.email;
      const currentUserRole = userData.role || 'staff';
      
      // Cache user data
      userDataCache = {
        uid: user.uid,
        fullName: currentUserFullName,
        role: currentUserRole
      };
      
      localStorage.setItem('currentUserRole', currentUserRole);
      
      usernameSpan.textContent = currentUserFullName;
      document.getElementById('logoutUsername').textContent = currentUserFullName;
      
      // Apply role-based visibility
      applyRoleBasedVisibility(currentUserRole);
    }

// Set user as available when they log in (unless absent)
    const staffRef = doc(db, "users", user.uid);
    const staffDoc = await getDoc(staffRef);
    const staffData = staffDoc.data();
    
    // Only set to available if not marked absent
    if (!staffData.isAbsent) {
      await updateDoc(staffRef, { 
        availability: true,
        lastUpdated: serverTimestamp()
      });
    } else {
      // Keep them unavailable if absent
      await updateDoc(staffRef, { 
        availability: false,
        lastUpdated: serverTimestamp()
      });
    }

    await loadAllStaffData();

    setupSessionMonitoring(user.uid);
    setupStaffListener();

    monitorInventory();
    monitorPurchaseOrders();

    
  } catch (error) {
    console.error("Error in onAuthStateChanged:", error);
  }
});

// Logout handler
logoutBtn.addEventListener("click", () => {
  showLogoutModal();
});

window.hideLogoutModal = function() {
  document.getElementById('logoutModal').classList.remove('show');
}

window.confirmLogout = async function() {
  const confirmBtn = document.getElementById('confirmLogoutBtn');
  confirmBtn.classList.add('loading');
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner"></i> Logging out...';

  try {
    // Set user as unavailable when logging out
    const user = auth.currentUser;
    if (user) {
      const staffRef = doc(db, "users", user.uid);
      await updateDoc(staffRef, { 
        availability: false,
        onLaunchBreak: false, // Clear break status on logout
        lastUpdated: serverTimestamp()
      });
      
      // Wait a bit to ensure Firestore updates propagate
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Detach all listeners
    if (staffListener) staffListener();
    if (inventoryListener) inventoryListener();
    if (purchaseOrderListener) purchaseOrderListener();
    if (sessionMonitor) sessionMonitor();
    
    // Clear caches
    userDataCache = null;
    inventoryDataCache = [];
    
    localStorage.removeItem('currentUserRole');
    sessionStorage.removeItem('sessionId');
    
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
showToast("An error occurred during logout. Please try again.", 'error');
    // Force logout anyway
    await signOut(auth);
    window.location.href = "index.html";
  }
}

document.getElementById('logoutModal')?.addEventListener('click', function(e) {
  if (e.target === this) {
    hideLogoutModal();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('logoutModal');
    if (modal && modal.classList.contains('show')) {
      hideLogoutModal();
    }
  }
});

window.showLogoutModal = function() {
  document.getElementById('logoutModal').classList.add('show');
}

window.addEventListener("beforeunload", async (e) => {
  // Set user as unavailable when closing browser/tab
  const user = auth.currentUser;
  if (user) {
    const staffRef = doc(db, "users", user.uid);
    // Use navigator.sendBeacon for more reliable updates during unload
    const data = JSON.stringify({
      availability: false,
      onLaunchBreak: false,
      lastUpdated: new Date().toISOString()
    });
    
    try {
      await updateDoc(staffRef, { 
        availability: false,
        onLaunchBreak: false,
        lastUpdated: serverTimestamp()
      });
    } catch (err) {
      console.error("Error updating availability on unload:", err);
    }
  }
  
  // Detach all listeners
  if (staffListener) staffListener();
  if (inventoryListener) inventoryListener();
  if (purchaseOrderListener) purchaseOrderListener();
  if (sessionMonitor) sessionMonitor();
});

window.addEventListener('click', (e) => {
  const userMenu = document.getElementById('userMenu');
  const btn = document.getElementById('userMenuButton');
  
  if (!btn.contains(e.target) && userMenu && !userMenu.contains(e.target)) {
    userMenu.classList.add('hidden');
  }
});