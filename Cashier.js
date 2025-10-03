let notifications = [];
let lastCustomerCheck = null;
let isCategoryMenuOpen = false;
let isProductsMenuOpen = false;
let selectedPaymentMethod = 'cash';

function toggleNotifications() {
  const popup = document.getElementById('notificationPopup');
  popup.style.display = popup.style.display === 'none' || popup.style.display === '' ? 'block' : 'none';
}

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
  } catch (error) {
    console.error("Error checking customers:", error);
  }
}

async function initializeNotifications() {
  try {
    const customerSnapshot = await db.collection("customers")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    
    if (!customerSnapshot.empty) {
      lastCustomerCheck = customerSnapshot.docs[0].data().createdAt?.toMillis() || Date.now();
    } else {
      lastCustomerCheck = Date.now();
    }
  } catch (error) {
    console.error("Error initializing notifications:", error);
    lastCustomerCheck = Date.now();
  }
  setInterval(checkForNewCustomers, 30000);
}

function logout() {
  window.location.href = 'Login.html';
}

const categories = [
  { name: "Fleek Eyelash", value: "FLEEK EYELASH" },
  { name: "Browmazing", value: "BROWMAZING" },
  { name: "Woke Up Like This", value: "WOKE UP LIKE THIS" },
  { name: "Express Offer", value: "EXPRESS OFFER" },
  { name: "Happy Nails", value: "HAPPY NAILS" },
  { name: "Promo", value: "PROMO PACKAGES" },
  { name: "Therapeutic Heat", value: "THERAPEUTIC HEAT" },
  { name: "Wax Out", value: "WAX – OUT" },
  { name: "Es-Facial For You", value: "ES-FACIALY FOR YOU" },
  { name: "Face And Body Contour", value: "FACE AND BODY CONTOURING" },
  { name: "Laser Hair Removal", value: "LASER HAIR REMOVAL" },
  { name: "Picosure Laser", value: "PICOSURE LASER" },
  { name: "Warts Removal", value: "WARTS REMOVAL" },
  { name: "CO2 Fractional", value: "CO2 FRACTIONAL" }
];

const services = [
  // FLEEK EYELASH
  { name: "Eyelash Natural (1 Size)", price: 499, category: "FLEEK EYELASH" },
  { name: "Eyelash Natural Volume", price: 599, category: "FLEEK EYELASH" },
  { name: "Eyelash Doll Eye (2 Size)", price: 599, category: "FLEEK EYELASH" },
  { name: "Eyelash Cat Eye (3 Size)", price: 699, category: "FLEEK EYELASH" },
  { name: "Wispy Natural", price: 699, category: "FLEEK EYELASH" },
  { name: "Wispy Volume", price: 799, category: "FLEEK EYELASH" },
  { name: "Eyelash Removal (In)", price: 100, category: "FLEEK EYELASH" },
  { name: "Eyelash Removal (Out)", price: 200, category: "FLEEK EYELASH" },
  { name: "Lash Lift", price: 499, category: "FLEEK EYELASH" },
  { name: "Lash Lift with Tint", price: 599, category: "FLEEK EYELASH" },
  
  // BROWMAZING
  { name: "Threading", price: 200, category: "BROWMAZING" },
  { name: "Shaving", price: 150, category: "BROWMAZING" },
  { name: "Brow Lamination", price: 499, category: "BROWMAZING" },
  { name: "Brow Lamination with Tint", price: 699, category: "BROWMAZING" },
  { name: "Brow Waxing", price: 249, category: "BROWMAZING" },
  
  // WOKE UP LIKE THIS
  { name: "Microblading (2 Sessions)", price: 1499, category: "WOKE UP LIKE THIS" },
  { name: "Combi/Ombre/Combibrows (2 Sessions)", price: 2499, category: "WOKE UP LIKE THIS" },
  { name: "Top/Lower Eyeliner (2 Sessions)", price: 1999, category: "WOKE UP LIKE THIS" },
  { name: "Korean BB Glow (Per Session)", price: 1499, category: "WOKE UP LIKE THIS" },
  { name: "Lip Tattoo/Pigmentation (2 Sessions)", price: 2999, category: "WOKE UP LIKE THIS" },
  
  // EXPRESS OFFER
  { name: "Back Massage", price: 399, category: "EXPRESS OFFER" },
  { name: "Head Massage", price: 399, category: "EXPRESS OFFER" },
  { name: "Foot Massage", price: 399, category: "EXPRESS OFFER" },
  { name: "Hand Massage", price: 399, category: "EXPRESS OFFER" },
  { name: "Foot Reflex", price: 499, category: "EXPRESS OFFER" },
  { name: "Hand Reflex", price: 499, category: "EXPRESS OFFER" },
  { name: "Head Massage + Ear Candling", price: 499, category: "EXPRESS OFFER" },
  { name: "Ear Candling", price: 199, category: "EXPRESS OFFER" },
  
  //HAPPY NAILS
  { name: "Basic Manicure", price: 120, category: "HAPPY NAILS" },
  { name: "Basic Pedicure", price: 170, category: "HAPPY NAILS" },
  { name: "Foot Spa", price: 300, category: "HAPPY NAILS" },
  { name: "Hand Spa", price: 300, category: "HAPPY NAILS" },
  { name: "Gel Removal (In)", price: 100, category: "HAPPY NAILS" },
  { name: "Gel Removal (Out)", price: 200, category: "HAPPY NAILS" },
  { name: "Soft Gel Removal (In)", price: 200, category: "HAPPY NAILS" },
  { name: "Soft Gel Removal (Out)", price: 300, category: "HAPPY NAILS" },
  { name: "Soft Gel Nail Extensions", price: 1700, category: "HAPPY NAILS" },
  { name: "Gel Manicure", price: 550, category: "HAPPY NAILS" },
  { name: "Gel Pedicure", price: 650, category: "HAPPY NAILS" },
  { name: "Footspa Or Handspa With Whitening Scrub", price: 400, category: "HAPPY NAILS" },
  { name: "Footspa Or Handspa With Whitening Scrub With Callus Removal", price: 450, category: "HAPPY NAILS" },

  // PROMO PACKAGES
  { name: "Package 1 - Uv Gel Manicure + Basic pedicure + Classic Footspa", price: 850, category: "PROMO PACKAGES" },
  { name: "Package 2 - Uv Gel Manicure + Basic Pedicure + Deluxe Footspa", price: 900, category: "PROMO PACKAGES" },
  { name: "Package 3 - Uv Gel Manicure + Uv Gel Pedicure + Classic Footspa", price: 1300, category: "PROMO PACKAGES" },
  { name: "Package 4 - UV Gel Manicure + UV Gel Pedicure + Deluxe Footspa With Whitening Scrub", price: 1400, category: "PROMO PACKAGES" },
  { name: "Package 5 - Classic Footspa + Basic Pedicure + 30 Mins. Foot Massage", price: 750, category: "PROMO PACKAGES" },
  { name: "Package 6 - Deluxe Footspa With Whitening Scrub + Basic Pedicure + 30 Mins. Foot Massage", price: 800, category: "PROMO PACKAGES" },
  { name: "Package 7 - Natural Eyelash Or Lash Lift (Add 100 For Tint) + UV Gel Manicure", price: 950, category: "PROMO PACKAGES" },
  { name: "Package 8 - Footspa + UV Gel Pedicure", price: 850, category: "PROMO PACKAGES" },
  { name: "Package 9 - Footspa + Basic Pedicure + Foot Reflex", price: 850, category: "PROMO PACKAGES" },
  { name: "Package 10 - Footspa + UV Gel Pedicure + Foot Massage", price: 1150, category: "PROMO PACKAGES" },
  
  // THERAPEUTIC HEAT
  { name: "Hand Paraffin", price: 250, category: "THERAPEUTIC HEAT" },
  { name: "Foot Paraffin", price: 300, category: "THERAPEUTIC HEAT" },
  { name: "Hand Paraffin + Handspa", price: 550, category: "THERAPEUTIC HEAT" },
  { name: "Foot Paraffin + Footspa", price: 600, category: "THERAPEUTIC HEAT" },
  { name: "Hand Paraffin + Hand Massage", price: 550, category: "THERAPEUTIC HEAT" },
  { name: "Foot Paraffin + Foot Massage", price: 600, category: "THERAPEUTIC HEAT" },
  
  // WAX – OUT
  { name: "Underarm Waxing (Female)", price: 399, category: "WAX – OUT" },
  { name: "Underarm Waxing (Male)", price: 499, category: "WAX – OUT" },
  { name: "Half Leg Waxing (Female)", price: 499, category: "WAX – OUT" },
  { name: "Half Leg Waxing (Male)", price: 599, category: "WAX – OUT" },
  { name: "Full Leg Waxing (Female)", price: 699, category: "WAX – OUT" },
  { name: "Full Leg Waxing (Male)", price: 799, category: "WAX – OUT" },
  { name: "Brazilian Waxing (Female)", price: 999, category: "WAX – OUT" },
  { name: "Brazilian Waxing (Male)", price: 1099, category: "WAX – OUT" },
  { name: "Upper/Lower Lip Waxing (Female)", price: 299, category: "WAX – OUT" },
  { name: "Upper/Lower Lip Waxing (Male)", price: 399, category: "WAX – OUT" },
  { name: "Full Face Waxing (Female)", price: 899, category: "WAX – OUT" },
  { name: "Full Face Waxing (Male)", price: 999, category: "WAX – OUT" },
  { name: "Full Arms Waxing (Female)", price: 599, category: "WAX – OUT" },
  { name: "Full Arms Waxing (Male)", price: 699, category: "WAX – OUT" },

  // ES-FACIALY FOR YOU
  { name: "HydraFacial with Collagen Mask", price: 899, category: "ES-FACIALY FOR YOU" },
  { name: "Black Doll Carbon Laser (2 Sessions)", price: 1999, category: "ES-FACIALY FOR YOU" },
  { name: "Black Doll Carbon Laser Lay-away 4+1", price: 4500, category: "ES-FACIALY FOR YOU" },
  { name: "Black Doll Carbon Laser Lay-away 9+1", price: 9000, category: "ES-FACIALY FOR YOU" },
  { name: "HydraFacial + Black Doll + Exillis/HIFU", price: 3399, category: "ES-FACIALY FOR YOU" },
  { name: "HydraFacial + BBGlow + Collagen PDT", price: 1899, category: "ES-FACIALY FOR YOU" },
  { name: "Black Doll + Exillis/HIFU + PDT", price: 2499, category: "ES-FACIALY FOR YOU" },
  { name: "HydraFacial + BBGlowBlush + PDT", price: 2199, category: "ES-FACIALY FOR YOU" },

  // FACE AND BODY CONTOURING
  { name: "HIFU (Per Session)", price: 1499, category: "FACE AND BODY CONTOURING" },
  { name: "Exillis (30 mins)", price: 1499, category: "FACE AND BODY CONTOURING" },
  { name: "EMSlim (30 mins)", price: 2000, category: "FACE AND BODY CONTOURING" },
  { name: "Cryolipolysis (Body Area)", price: 1499, category: "FACE AND BODY CONTOURING" },
  { name: "Cryolipolysis (Chin)", price: 999, category: "FACE AND BODY CONTOURING" },
  { name: "Super Trio Combo (Cryolipolysis + Exillis + EMSlim)", price: 3499, category: "FACE AND BODY CONTOURING" },
  { name: "Exillis 6+1 Sessions", price: 7499, category: "FACE AND BODY CONTOURING" },
  { name: "EMSlim 5+1 Sessions", price: 7499, category: "FACE AND BODY CONTOURING" },
  { name: "PowerCombo Exillis 3+3 Sessions", price: 7499, category: "FACE AND BODY CONTOURING" },

  // LASER HAIR REMOVAL / WHITENING
  { name: "Diode Laser - Underarm (1 Session)", price: 899, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Underarm (2 Sessions)", price: 1499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Underarm (10 Sessions)", price: 4999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Brazilian (1 Session)", price: 1999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Brazilian (2 Sessions)", price: 3499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Brazilian (10 Sessions)", price: 10499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Arms (1 Session)", price: 1499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Arms (2 Sessions)", price: 2499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Arms (10 Sessions)", price: 8499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Lower/Upper Legs (1 Session)", price: 1999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Lower/Upper Legs (2 Sessions)", price: 3499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Lower/Upper Legs (10 Sessions)", price: 10499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Upper Lip (1 Session)", price: 599, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Upper Lip (2 Sessions)", price: 999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Upper Lip (10 Sessions)", price: 3999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Lower Lip (1 Session)", price: 899, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Lower Lip (2 Sessions)", price: 1499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Lower Lip (10 Sessions)", price: 4499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Bikini Line (1 Session)", price: 1099, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Bikini Line (2 Sessions)", price: 1999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Bikini Line (10 Sessions)", price: 8999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Face Male (1 Session)", price: 2999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Face Male (2 Sessions)", price: 5499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Face Male (10 Sessions)", price: 15499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Face Female (1 Session)", price: 1999, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Face Female (2 Sessions)", price: 3499, category: "LASER HAIR REMOVAL" },
  { name: "Diode Laser - Full Face Female (10 Sessions)", price: 10499, category: "LASER HAIR REMOVAL" },
  { name: "Add-on Whitening Scrub", price: 200, category: "LASER HAIR REMOVAL" },

  // PICOSURE LASER TREATMENT
  { name: "PicoSure Lip (2 Sessions)", price: 999, category: "PICOSURE LASER" },
  { name: "PicoSure Knee/Neck/Elbow/Underarm/Face (2 Sessions)", price: 1499, category: "PICOSURE LASER" },
  { name: "Pico Melasma (2 Sessions)", price: 4000, category: "PICOSURE LASER" },
  { name: "Pico Tattoo/Birthmark Removal (1-3 inch, 2 Sessions)", price: 3000, category: "PICOSURE LASER" },
  { name: "Promo: 4+1 Sessions Any Part", price: 4000, category: "PICOSURE LASER" },

  // WARTS REMOVAL FRACTIONAL LASER
  { name: "Warts Removal Face/Neck (Unlimited)", price: 1999, category: "WARTS REMOVAL" },
  { name: "Warts Removal Back (Unlimited)", price: 2999, category: "WARTS REMOVAL" },
  { name: "Warts Removal Face/Neck/Back (Unlimited)", price: 5499, category: "WARTS REMOVAL" },
  { name: "Skin Tag Removal (Per Area)", price: 1499, category: "WARTS REMOVAL" },

  // CO2 FRACTIONAL LASER
  { name: "CO2 Fractional Laser 3+2 Sessions", price: 7997, category: "CO2 FRACTIONAL" }
];

const productCategories = [
  { name: "Hair Care", value: "HAIR CARE" },
  { name: "Styling Products", value: "STYLING PRODUCTS" },
  { name: "Skin Care", value: "SKIN CARE" },
  { name: "Nail Care", value: "NAIL CARE" },
  { name: "Tools & Accessories", value: "TOOLS & ACCESSORIES" }
];

const products = [
  // HAIR CARE
  { name: "Professional Shampoo - Hydrating", price: 450, category: "HAIR CARE" },
  { name: "Professional Shampoo - Color Safe", price: 480, category: "HAIR CARE" },
  { name: "Deep Conditioner - Repair", price: 520, category: "HAIR CARE" },
  { name: "Leave-In Conditioner", price: 380, category: "HAIR CARE" },
  { name: "Hair Oil - Argan", price: 650, category: "HAIR CARE" },
  { name: "Hair Oil - Coconut", price: 580, category: "HAIR CARE" },
  { name: "Hair Mask - Keratin Treatment", price: 890, category: "HAIR CARE" },
  { name: "Hair Serum - Anti-Frizz", price: 420, category: "HAIR CARE" },
  { name: "Scalp Treatment - Tea Tree", price: 550, category: "HAIR CARE" },
  { name: "Hair Perfume - Floral", price: 350, category: "HAIR CARE" },
  
  // STYLING PRODUCTS
  { name: "Hair Spray - Strong Hold", price: 380, category: "STYLING PRODUCTS" },
  { name: "Hair Spray - Flexible Hold", price: 350, category: "STYLING PRODUCTS" },
  { name: "Hair Clay - Matte Finish", price: 420, category: "STYLING PRODUCTS" },
  { name: "Hair Wax - Natural Shine", price: 390, category: "STYLING PRODUCTS" },
  { name: "Hair Gel - Maximum Hold", price: 320, category: "STYLING PRODUCTS" },
  { name: "Mousse - Volume Boost", price: 380, category: "STYLING PRODUCTS" },
  { name: "Pomade - High Shine", price: 450, category: "STYLING PRODUCTS" },
  { name: "Heat Protectant Spray", price: 480, category: "STYLING PRODUCTS" },
  { name: "Texturizing Spray", price: 420, category: "STYLING PRODUCTS" },
  { name: "Root Lift Powder", price: 380, category: "STYLING PRODUCTS" },
  
  // SKIN CARE
  { name: "Facial Cleanser - Gentle", price: 380, category: "SKIN CARE" },
  { name: "Facial Toner - Hydrating", price: 420, category: "SKIN CARE" },
  { name: "Moisturizer - Day Cream SPF 30", price: 680, category: "SKIN CARE" },
  { name: "Moisturizer - Night Cream", price: 720, category: "SKIN CARE" },
  { name: "Sunscreen SPF 50+", price: 620, category: "SKIN CARE" },
  { name: "Facial Mask - Collagen Sheet", price: 280, category: "SKIN CARE" },
  { name: "Facial Mask - Charcoal", price: 250, category: "SKIN CARE" },
  { name: "Eye Cream - Anti-Aging", price: 850, category: "SKIN CARE" },
  { name: "Vitamin C Serum", price: 980, category: "SKIN CARE" },
  { name: "Hyaluronic Acid Serum", price: 920, category: "SKIN CARE" },
  
  // NAIL CARE
  { name: "Nail Polish - Regular (Various Colors)", price: 150, category: "NAIL CARE" },
  { name: "Gel Polish - UV/LED (Various Colors)", price: 280, category: "NAIL CARE" },
  { name: "Base Coat", price: 180, category: "NAIL CARE" },
  { name: "Top Coat - Glossy", price: 180, category: "NAIL CARE" },
  { name: "Top Coat - Matte", price: 200, category: "NAIL CARE" },
  { name: "Cuticle Oil", price: 220, category: "NAIL CARE" },
  { name: "Nail Strengthener", price: 280, category: "NAIL CARE" },
  { name: "Nail Polish Remover - Acetone Free", price: 120, category: "NAIL CARE" },
  { name: "Hand Cream - Intensive Care", price: 250, category: "NAIL CARE" },
  { name: "Nail File Set", price: 180, category: "NAIL CARE" },
  
  // TOOLS & ACCESSORIES
  { name: "Professional Hair Brush - Detangling", price: 380, category: "TOOLS & ACCESSORIES" },
  { name: "Round Brush - Large (Blow Dry)", price: 450, category: "TOOLS & ACCESSORIES" },
  { name: "Paddle Brush - Smoothing", price: 320, category: "TOOLS & ACCESSORIES" },
  { name: "Wide Tooth Comb", price: 120, category: "TOOLS & ACCESSORIES" },
  { name: "Tail Comb - Sectioning", price: 150, category: "TOOLS & ACCESSORIES" },
  { name: "Hair Clips - Professional Set", price: 180, category: "TOOLS & ACCESSORIES" },
  { name: "Hair Ties - Damage Free (Pack of 10)", price: 150, category: "TOOLS & ACCESSORIES" },
  { name: "Microfiber Hair Towel", price: 280, category: "TOOLS & ACCESSORIES" },
  { name: "Shower Cap - Waterproof", price: 120, category: "TOOLS & ACCESSORIES" },
  { name: "Travel Size Bottle Set", price: 220, category: "TOOLS & ACCESSORIES" }
];

let currentView = 'services'; // Track if viewing services or products
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

async function loadUserInfo() {
  const currentUserEmail = localStorage.getItem('currentUserEmail');
  if (currentUserEmail) {
    try {
      const userSnapshot = await db.collection("users")
        .where("email", "==", currentUserEmail)
        .limit(1)
        .get();
      
      if (!userSnapshot.empty) {
        const userData = userSnapshot.docs[0].data();
        document.getElementById('usernameDisplay').textContent = userData.fullName || currentUserEmail;
      }
    } catch (error) {
      console.error("Error loading user info:", error);
    }
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
    renderServices(products);
  } else {
    const filtered = products.filter(p => p.category === category);
    renderServices(filtered);
  }
  
  toggleProductsMenu();
}

function renderServices(filteredServices = services) {
  const container = document.getElementById('servicesList');
  container.innerHTML = '';
  
  filteredServices.forEach(service => {
    const div = document.createElement('div');
    div.className = 'service-card bg-white p-4 rounded-xl cursor-pointer';
    div.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-800 text-sm mb-1 truncate">${service.name}</h3>
          <p class="text-xs text-gray-500 mb-2">${service.category}</p>
          <div class="flex items-center justify-between">
            <span class="text-lg font-bold text-[#da5c73]">₱${service.price.toFixed(2)}</span>
            <button class="bg-pink-100 text-pink-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-pink-200 transition">
              <i class="fa-solid fa-plus mr-1"></i>Add
            </button>
          </div>
        </div>
      </div>
    `;
    div.onclick = () => addToCart(service);
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
    renderServices(services);
  } else {
    const filtered = services.filter(s => s.category === category);
    renderServices(filtered);
  }
  
  toggleCategoryMenu();
}

function filterServices() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filtered = services.filter(s => 
    s.name.toLowerCase().includes(search) || 
    s.category.toLowerCase().includes(search)
  );
  renderServices(filtered);
}

function addToCart(service) {
  cart.push({...service, id: Date.now() + Math.random()});
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
    // Save to Firebase
    await db.collection("cashier_receipt").add(receiptData);
    
    // Save PDF
    const fileName = `Receipt_${customerName.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
    
    document.getElementById('loadingModal').classList.add('hidden');
    
    setTimeout(() => {
      let alertMessage = `Receipt generated successfully!\n\nReceipt No: ${receiptNumber}\nTotal: ₱${total.toFixed(2)}\nPayment: ₱${payment.toFixed(2)}`;
      if (selectedPaymentMethod === 'cash') {
        alertMessage += `\nChange: ₱${change.toFixed(2)}`;
      }
      alert(alertMessage);
      clearCart();
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

// Initialize
loadUserInfo();
renderServices();
updateNotificationUI();
initializeNotifications();