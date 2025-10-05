// ---- TEST: Read the role ----
const role = (localStorage.getItem("currentUserRole") || "").toLowerCase();
console.log("Detected role from localStorage:", role);

document.addEventListener("DOMContentLoaded", () => {
  const sidebarButtons = document.querySelectorAll(".sidebar-btn");
  console.log("Found sidebar buttons:", sidebarButtons.length);

  sidebarButtons.forEach(btn => {
    const onclickValue = btn.getAttribute("onclick");
    const match = onclickValue ? onclickValue.match(/'([^']+)'/) : null;
    const page = match && match[1] ? match[1].toLowerCase() : "(none)";
    const isCashierButton =
      btn.title.toLowerCase().includes("cashier") ||
      btn.innerHTML.toLowerCase().includes("cash-register");

    // Staff should only see Dashboard, Sales, Cashier
    if (
      role === "staff" &&
      !["dashboard.html", "sales.html", "cashier.html"].includes(page) &&
      !isCashierButton
    ) {
      console.log("Hiding:", page);
      btn.style.display = "none";
    }
  });
});
