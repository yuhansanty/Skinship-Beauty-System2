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

// ==================== NOTIFICATION SYSTEM ====================

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
    notificationList.innerHTML = `
      <div class="notification-empty">
        <i class="fa-solid fa-bell-slash"></i>
        <p>No notifications yet</p>
      </div>
    `;
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
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
        <strong style="color: var(--primary);">${notification.message}</strong>
        ${!notification.read ? '<span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span>' : ''}
      </div>
      <p style="font-size: 0.875rem; color: var(--text-secondary);">
        ${notification.details.service} - ${notification.details.date} at ${notification.details.time}
      </p>
      <p style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.5rem;">${timeStr}</p>
    `;
    
    notificationList.appendChild(item);
  });
}

window.toggleNotifications = function() {
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
    <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin-bottom: 1.5rem;">
      <i class="fa-solid fa-calendar-check"></i> Appointment Request
    </h2>
    <div style="display: grid; gap: 1rem;">
      <div><strong>Customer Name:</strong> ${notification.details.fullName}</div>
      <div><strong>Email:</strong> ${notification.details.email}</div>
      <div><strong>Phone:</strong> ${notification.details.phone}</div>
      <div><strong>Service:</strong> ${notification.details.service}</div>
      <div><strong>Preferred Date:</strong> ${notification.details.date}</div>
      <div><strong>Preferred Time:</strong> ${notification.details.time}</div>
      ${notification.details.message ? `<div><strong>Message:</strong> ${notification.details.message}</div>` : ''}
      <div style="font-size: 0.875rem; color: var(--text-secondary);"><strong>Submitted:</strong> ${time}</div>
    </div>
    <div style="margin-top: 2rem; display: flex; gap: 1rem;">
      <button onclick="approveAppointment(${id})" class="btn" style="flex: 1; background: #10b981; color: white;">
        <i class="fa-solid fa-check"></i> Approve
      </button>
      <button onclick="rejectAppointment(${id})" class="btn" style="flex: 1; background: #ef4444; color: white;">
        <i class="fa-solid fa-times"></i> Decline
      </button>
    </div>
  `;
  
  modal.classList.add('show');
  loadNotifications();
}

window.closeNotificationModal = function() {
  document.getElementById('notificationModal').classList.remove('show');
}

window.markAllRead = function() {
  let notifications = JSON.parse(localStorage.getItem('skinshipNotifications') || '[]');
  notifications.forEach(n => n.read = true);
  localStorage.setItem('skinshipNotifications', JSON.stringify(notifications));
  loadNotifications();
}

window.clearAllNotifications = function() {
  localStorage.setItem('skinshipNotifications', '[]');
  loadNotifications();
}

window.approveAppointment = function(id) {
  alert('Appointment approved!');
  closeNotificationModal();
  deleteNotification(id);
}

window.rejectAppointment = function(id) {
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
  
  // Previous button
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
  
  // Page numbers
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
  
  // Next button
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
  // Clear the grid first
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
    card.style.animationDelay = `${index * 0.3}s`;
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
    return staff.fullName.toLowerCase().includes(searchTerm) ||
           staff.gender.toLowerCase().includes(searchTerm) ||
           staff.mobile.toLowerCase().includes(searchTerm);
  });
  
  // Clear grid before displaying filtered results
  staffGrid.innerHTML = '';
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

    // Set user as unavailable in real-time
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

// ==================== AUTHENTICATION & MAIN ====================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "Login.html";
    return;
  }
  
  // Get current user's full name from database
  const userDoc = await getDoc(doc(db, "users", user.uid));
const currentUserFullName = userDoc.exists() ? userDoc.data().fullName : user.email;
usernameSpan.textContent = currentUserFullName;
// Add this line:
document.getElementById('logoutUsername').textContent = currentUserFullName;

  // Handle clock in for current user
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

  // Set user as available with real-time update
  const staffRef = doc(db, "users", user.uid);
  await updateDoc(staffRef, { 
    availability: true,
    lastUpdated: serverTimestamp()
  });

  // Listen to all staff members in REAL-TIME
  onSnapshot(collection(db, "users"), async (snapshot) => {
    const promises = snapshot.docs.map(async (docSnap) => {
      const staff = docSnap.data();
      
      const logsQuery = query(
        collection(db, "staffLogs", docSnap.id, "history"),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      
      const logsSnap = await getDocs(logsQuery);
      const latest = logsSnap.docs[0]?.data() || {};
      
      const isClockedIn = latest.clockIn && !latest.clockOut;
      
      // Use the availability field from the user document for real-time status
      const isAvailable = staff.availability === true && isClockedIn;

      return {
        id: docSnap.id,
        fullName: staff.fullName || "N/A",
        gender: staff.gender || "N/A",
        mobile: staff.mobile || "N/A",
        isAvailable,
        clockIn: latest.clockIn || "N/A",
        clockOut: latest.clockOut || "N/A"
      };
    });

    const results = await Promise.all(promises);
    
    // Update allStaffData with new results
    allStaffData = results;
    
    // Sort by availability (available first)
    allStaffData.sort((a, b) => b.isAvailable - a.isAvailable);
    
    // Update display
    displayStaffCards(allStaffData);
  });
});

// Logout handler with real-time availability update
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
    // Clock out and set unavailable
    await handleClockOut();
    
    // Sign out
    await signOut(auth);
    
    // Redirect to login page
    window.location.href = "Login.html";
  } catch (error) {
    console.error("Logout error:", error);
    
    // Reset button state
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    
    alert("An error occurred during logout. Please try again.");
    
    // Force sign out even if there's an error
    await signOut(auth);
    window.location.href = "Login.html";
  }
}

// Close modal on overlay click
document.getElementById('logoutModal')?.addEventListener('click', function(e) {
  if (e.target === this) {
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

window.showLogoutModal = function() {
  document.getElementById('logoutModal').classList.add('show');
}
// Handle page unload (closing browser/tab or navigating away)
window.addEventListener("beforeunload", async (e) => {
  await handleClockOut();
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
});

// Initialize notifications
loadNotifications();
setInterval(loadNotifications, 5000);