// ---- TEST: Read the role ----
const role = (localStorage.getItem("currentUserRole") || "").toLowerCase();
console.log("Detected role from localStorage:", role);

// Apply role class to HTML element immediately
if (role === "staff") {
  document.documentElement.classList.add('staff-loaded');
  document.documentElement.classList.remove('admin-loaded');
} else if (role === "admin") {
  document.documentElement.classList.add('admin-loaded');
  document.documentElement.classList.remove('staff-loaded');
}

document.addEventListener("DOMContentLoaded", () => {
  const sidebarButtons = document.querySelectorAll(".sidebar-btn");
  console.log("Found sidebar buttons:", sidebarButtons.length);
  console.log("HTML classes:", document.documentElement.className);

  // Force update button visibility based on role
  if (role === "staff") {
    sidebarButtons.forEach(btn => {
      const hasRoleRestricted = btn.classList.contains('role-restricted');
      const title = btn.getAttribute('title');
      const allowedTitles = ['Dashboard', 'Staff', 'Reports', 'Cashier'];
      
      console.log(`Button: ${title}, Role-restricted: ${hasRoleRestricted}, Should show: ${allowedTitles.includes(title)}`);
      
      if (hasRoleRestricted && !allowedTitles.includes(title)) {
        btn.style.setProperty('display', 'none', 'important');
        console.log(`Hiding: ${title}`);
      } else {
        btn.style.setProperty('display', 'flex', 'important');
        console.log(`Showing: ${title}`);
      }
    });
  } else if (role === "admin") {
    // Show all buttons for admin
    sidebarButtons.forEach(btn => {
      btn.style.setProperty('display', 'flex', 'important');
    });
  }
});