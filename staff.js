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
let notificationListener = null;
let staffListener = null;

// ==================== APPLY DEFAULT SIDEBAR ON LOAD ====================

(function initializeSidebar() {
  const storedRole = localStorage.getItem('currentUserRole');
  if (storedRole === 'staff') {
    applyRoleBasedVisibility('staff');
  }
})();

// ==================== ROLE-BASED VISIBILITY ====================

function applyRoleBasedVisibility(role) {
  if (role === 'staff') {
    const allowedButtons = ['Dashboard', 'Reports', 'Cashier', 'Staff'];
    const allButtons = document.querySelectorAll('.sidebar-btn');
    
    allButtons.forEach((btn) => {
      const title = btn.getAttribute('title');
      
      if (!allowedButtons.includes(title)) {
        btn.style.setProperty('display', 'none', 'important');
        btn.style.visibility = 'hidden';
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
      } else {
        btn.style.setProperty('display', 'flex', 'important');
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      }
    });
  } else {
    const allButtons = document.querySelectorAll('.sidebar-btn');
    allButtons.forEach((btn) => {
      btn.style.setProperty('display', 'flex', 'important');
      btn.style.visibility = 'visible';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    });
  }
}

// ==================== SIDEBAR BUBBLE NOTIFICATIONS ====================

function loadNotifications() {
  if (notificationListener) {
    notificationListener();
  }

  notificationListener = onSnapshot(
    query(collection(db, "notifications"), orderBy("timestamp", "desc")),
    (snapshot) => {
      const notifications = [];
      
      snapshot.forEach(doc => {
        notifications.push({
          id: doc.id,
          ...doc.data()
        });
      });

      updateSidebarBubbles(notifications);
    },
    (error) => {
      console.error("Error loading notifications:", error);
    }
  );
}

function updateSidebarBubbles(notifications) {
  const appointmentCount = notifications.filter(n => !n.read && n.type === 'appointment').length;
  const purchaseOrderCount = notifications.filter(n => !n.read && n.type === 'purchase_order').length;
  const lowStockCount = notifications.filter(n => !n.read && n.type === 'low_stock').length;
  
  updateBubble('calendarBubble', appointmentCount, '#dc2626');
  updateBubble('purchaseOrderBubble', purchaseOrderCount, '#8b5cf6');
  updateBubble('inventoryBubble', lowStockCount, '#f59e0b');
}

function updateBubble(bubbleId, count, color) {
  let bubble = document.getElementById(bubbleId);
  
  if (!bubble) {
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

// ==================== HISTORY MODAL ====================

window.openHistory = async function(staffId, staffName) {
  const historyList = document.getElementById("historyList");
  const paginationControls = document.getElementById("paginationControls");
  const historyStaffName = document.getElementById("historyStaffName");
  
  historyList.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
    <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem;"></i>
    <p style="margin-top: 1rem;">Loading history...</p>
  </td></tr>`;
  paginationControls.innerHTML = "";
  historyStaffName.textContent = staffName;
  
  document.getElementById("historyModal").classList.add("show");

  currentStaffId = staffId;
  currentStaffName = staffName;
  
  const q = query(
    collection(db, "staffLogs", staffId, "history"), 
    orderBy("timestamp", "desc")
  );
  
  const snap = await getDocs(q);
  
  allHistoryData = snap.docs.map(docSnap => docSnap.data());
  currentPage = 1;
  
  displayHistoryPage();
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
        <td colspan="3" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
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
    const duration = calculateDuration(log.clockIn, log.clockOut);
    return `
      <tr>
        <td>${log.clockIn || "N/A"}</td>
        <td>${log.clockOut || '<span style="color: var(--success); font-weight: 600;">Currently Active</span>'}</td>
        <td>${duration}</td>
      </tr>
    `;
  }).join("");
  
  renderPagination(totalPages, paginationControls);
}

function calculateDuration(clockIn, clockOut) {
  if (!clockIn || !clockOut) return "—";
  
  try {
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    const diff = end - start;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  } catch (e) {
    return "—";
  }
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

window.closeHistory = function() {
  document.getElementById("historyModal").classList.remove("show");
  currentPage = 1;
  allHistoryData = [];
  currentStaffId = null;
  currentStaffName = null;
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
    
    card.innerHTML = `
      <div class="staff-card-header">
        <div class="staff-info">
          <h3>${staff.fullName}</h3>
          <div class="staff-gender">
            <i class="fa-solid fa-${staff.gender.toLowerCase() === 'male' ? 'mars' : 'venus'}"></i>
            ${staff.gender}
          </div>
        </div>
        <div class="availability-badge ${staff.isAvailable ? 'available' : 'unavailable'}">
          <i class="fa-solid fa-circle"></i>
          ${staff.isAvailable ? 'Available' : 'Unavailable'}
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
            <i class="fa-solid fa-clock"></i>
            Clock In
          </span>
          <span class="detail-value ${staff.clockIn !== 'N/A' ? 'active' : ''}">${staff.clockIn}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">
            <i class="fa-solid fa-clock-rotate-left"></i>
            Clock Out
          </span>
          <span class="detail-value">${staff.clockOut}</span>
        </div>
      </div>
      
      <div class="staff-actions">
        <button class="btn btn-primary" onclick="openHistory('${staff.id}', '${staff.fullName.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-history"></i>
          View History
        </button>
      </div>
    `;
    
    staffGrid.appendChild(card);
  });
}

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
    
    return fullName.includes(searchTerm) ||
           gender === searchTerm ||
           mobile.includes(searchTerm);
  });
  
  displayStaffCards(filteredData);
});

// ==================== CLOCK OUT HANDLING ====================

async function handleClockOut() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const today = new Date().toLocaleDateString();
    const logsRef = collection(db, "staffLogs", user.uid, "history");
    
    const todayQuery = query(logsRef, where("date", "==", today));
    const todaySnap = await getDocs(todayQuery);
    
    if (!todaySnap.empty) {
      const activeLog = todaySnap.docs.find(doc => !doc.data().clockOut);
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
    
    console.log("User clocked out and set to unavailable");
  } catch (error) {
    console.error("Error during clock out:", error);
  }
}

// ==================== OPTIMIZED STAFF DATA LOADING ====================

async function loadAllStaffData() {
  try {
    // Single read: Get all users at once
    const usersSnapshot = await getDocs(collection(db, "users"));
    
    // Build a map of users
    const usersMap = new Map();
    usersSnapshot.forEach(doc => {
      usersMap.set(doc.id, {
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Single read: Get today's logs for all staff in one query
    const today = new Date().toLocaleDateString();
    const staffIds = Array.from(usersMap.keys());
    
    // Map to store latest logs per staff
    const latestLogsMap = new Map();
    
    // Fetch logs for each staff (this is unavoidable with subcollections)
    // But we limit to 1 document per staff member
    const logPromises = staffIds.map(async (staffId) => {
      const logsQuery = query(
        collection(db, "staffLogs", staffId, "history"),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      
      const logsSnap = await getDocs(logsQuery);
      const latest = logsSnap.docs[0]?.data() || {};
      latestLogsMap.set(staffId, latest);
    });
    
    await Promise.all(logPromises);
    
    // Build staff data array
    const staffData = [];
    usersMap.forEach((userData, staffId) => {
      const latest = latestLogsMap.get(staffId) || {};
      const isClockedIn = latest.clockIn && !latest.clockOut;
      const isAvailable = userData.availability === true && isClockedIn;
      
      staffData.push({
        id: staffId,
        fullName: userData.fullName || "N/A",
        gender: userData.gender || "N/A",
        mobile: userData.mobile || "N/A",
        isAvailable,
        clockIn: latest.clockIn || "N/A",
        clockOut: latest.clockOut || "N/A"
      });
    });
    
    // Sort by availability
    staffData.sort((a, b) => b.isAvailable - a.isAvailable);
    
    allStaffData = staffData;
    displayStaffCards(allStaffData);
    
  } catch (error) {
    console.error("Error loading staff data:", error);
  }
}

// ==================== SETUP REAL-TIME LISTENER (OPTIMIZED) ====================

function setupStaffListener() {
  // Only listen to changes in the users collection
  // This triggers much fewer reads than before
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
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      console.error("User document not found in Firestore!");
      return;
    }
    
    const userData = userDoc.data();
    const currentUserFullName = userData.fullName || user.email;
    const currentUserRole = userData.role || 'staff';
    
    localStorage.setItem('currentUserRole', currentUserRole);
    
    usernameSpan.textContent = currentUserFullName;
    document.getElementById('logoutUsername').textContent = currentUserFullName;
    
    applyRoleBasedVisibility(currentUserRole);

    const today = new Date().toLocaleDateString();
    const logsRef = collection(db, "staffLogs", user.uid, "history");
    
    const todayQuery = query(logsRef, where("date", "==", today));
    const todaySnap = await getDocs(todayQuery);
    
    let needsNewLog = true;
    if (!todaySnap.empty) {
      const activeSession = todaySnap.docs.find(doc => !doc.data().clockOut);
      if (activeSession) {
        needsNewLog = false;
      }
    }
    
    if (needsNewLog) {
      await addDoc(logsRef, {
        date: today,
        clockIn: new Date().toLocaleString(),
        clockOut: null,
        timestamp: serverTimestamp()
      });
    }

    const staffRef = doc(db, "users", user.uid);
    await updateDoc(staffRef, { 
      availability: true,
      lastUpdated: serverTimestamp()
    });

    // Initial load of all staff data
    await loadAllStaffData();
    
    // Setup real-time listener for updates
    setupStaffListener();

    loadNotifications();
    
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
    await handleClockOut();
    
    if (notificationListener) {
      notificationListener();
    }
    
    if (staffListener) {
      staffListener();
    }
    
    localStorage.removeItem('currentUserRole');
    
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    alert("An error occurred during logout. Please try again.");
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
  await handleClockOut();
});

window.addEventListener('click', (e) => {
  const userMenu = document.getElementById('userMenu');
  const btn = document.getElementById('userMenuButton');
  
  if (!btn.contains(e.target) && userMenu && !userMenu.contains(e.target)) {
    userMenu.classList.add('hidden');
  }
});