import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  getDocs,
  getDoc,
  where,
  limit,
  serverTimestamp,
  deleteDoc,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ===== FIREBASE INITIALIZATION =====
const firebaseConfig = {
  apiKey: "AIzaSyD6rgutkYK7MZ3F0Xne6Zs4PyEiPME7ePM",
  authDomain: "onevictoria-23409.firebaseapp.com",
  projectId: "onevictoria-23409",
  storageBucket: "onevictoria-23409.firebasestorage.app",
  messagingSenderId: "334731169631",
  appId: "1:334731169631:web:7484599232fef8b06eb0ea",
  measurementId: "G-0ML9K6JSK8",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===== STANDARDIZED STATUS CONSTANTS =====
const STATUS = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  REGISTERED: "Registered",
  CANCELLED: "Cancelled",
};

// ===== GLOBAL STATE =====
let loggedInUser = null,
  alertTimeout = null,
  pendingConfirmCallback = null,
  isSaving = false;
let registeredEventIds = new Set(),
  completedEventIds = new Set();
let eventsUnsubscribe = null,
  participantsUnsubscribe = null,
  notificationsUnsubscribe = null,
  donationsUnsubscribe = null,
  volunteersUnsubscribe = null,
  hoursUnsubscribe = null;
let selectedPaymentMethod = null,
  currentDonationData = null,
  isTabSwitching = false;
let selectedProfilePicFile = undefined,
  selectedSkillVerificationFile = null;
let notificationCount = 0,
  allNotifications = [],
  showingAllNotifications = false;
let mobileShowingAllNotifications = false;
let sessionCheckInterval = null,
  currentSessionToken = null;

// ===== MOBILE SIDE MENU =====
function openMobileMenu() {
  const menu = document.getElementById("mobile-side-menu");
  const overlay = document.getElementById("mobile-overlay-menu");
  if (menu) {
    menu.classList.add("open");
    document.body.classList.add("menu-open");
  }
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.classList.add("show");
  }
}
function closeMobileMenu() {
  const menu = document.getElementById("mobile-side-menu");
  const overlay = document.getElementById("mobile-overlay-menu");
  if (menu) {
    menu.classList.remove("open");
    document.body.classList.remove("menu-open");
  }
  if (overlay) {
    overlay.classList.remove("show");
    setTimeout(() => overlay.classList.add("hidden"), 300);
  }
}
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;

// ===== HEADER DROPDOWN MANAGEMENT =====
function closeAllHeaderDropdowns() {
  document
    .querySelectorAll(".header-dropdown")
    .forEach((d) => d.classList.remove("show"));
}

// ===== DATE UTILITIES =====
function formatShortDate(ts) {
  if (!ts) return "N/A";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function formatRelativeTime(ts) {
  if (!ts) return "";
  const now = new Date(),
    date = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMs = now - date,
    diffSec = Math.floor(diffMs / 1000),
    diffMin = Math.floor(diffSec / 60),
    diffHr = Math.floor(diffMin / 60),
    diffDays = Math.floor(diffHr / 24),
    diffWeeks = Math.floor(diffDays / 7),
    diffMonths = Math.floor(diffDays / 30),
    diffYears = Math.floor(diffDays / 365);
  if (diffSec < 60) return "Just now";
  if (diffMin < 60)
    return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? "hour" : "hours"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks < 5)
    return `${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
  if (diffMonths < 12)
    return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
  if (diffYears === 1) return "1 year ago";
  return `${diffYears} years ago`;
}
function formatFullDateTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return (
    date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }) +
    " at " +
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );
}
function formatTimeDisplay(timeValue) {
  if (!timeValue) return "";
  if (typeof timeValue === "string" && timeValue.includes(":")) {
    const [hours, minutes] = timeValue.split(":");
    const h = parseInt(hours),
      ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${minutes} ${ampm}`;
  }
  return timeValue;
}

// ===== MOBILE MENU TOGGLE (backward compatible) =====
window.toggleMobileMenu = function () {
  const mobileMenu = document.getElementById("mobile-side-menu");
  if (mobileMenu) {
    mobileMenu.classList.contains("open")
      ? closeMobileMenu()
      : openMobileMenu();
    return;
  }
  const sidebar = document.getElementById("sidebar"),
    overlay = document.getElementById("mobile-overlay"),
    body = document.body;
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains("translate-x-0");
  if (isOpen) {
    sidebar.classList.remove("translate-x-0");
    sidebar.classList.add("-translate-x-full");
    if (overlay) overlay.classList.add("hidden");
    body.style.overflow = "";
  } else {
    sidebar.classList.remove("-translate-x-full");
    sidebar.classList.add("translate-x-0");
    if (overlay) overlay.classList.remove("hidden");
    body.style.overflow = "hidden";
  }
};

// ===== NOTIFICATION DETAIL OVERLAY =====
window.openNotificationDetail = function (notifId, type, title, message, time) {
  const overlay = document.getElementById("notification-detail-modal");
  if (!overlay) return;
  document.getElementById("notif-detail-title").textContent =
    title || "Notification";
  document.getElementById("notif-detail-time").innerHTML =
    `<i class="fa-solid fa-clock mr-1"></i>${time || "Just now"}`;
  document.getElementById("notif-detail-message").textContent = message || "";
  const iconContainer = document.getElementById("notif-detail-icon");
  const iconInner = document.getElementById("notif-detail-icon-inner");
  let bgClass = "bg-blue-100",
    iconClass = "fa-bell text-blue-600";
  switch (type) {
    case "volunteer_approved":
      bgClass = "bg-emerald-100";
      iconClass = "fa-circle-check text-emerald-600";
      break;
    case "volunteer_rejected":
      bgClass = "bg-rose-100";
      iconClass = "fa-circle-xmark text-rose-600";
      break;
    case "donation_confirmed":
      bgClass = "bg-emerald-100";
      iconClass = "fa-circle-check text-emerald-600";
      break;
    case "donation_rejected":
      bgClass = "bg-rose-100";
      iconClass = "fa-circle-xmark text-rose-600";
      break;
    case "hours_credited":
      bgClass = "bg-purple-100";
      iconClass = "fa-clock text-purple-600";
      break;
    case "contact_status_update":
      bgClass = "bg-indigo-100";
      iconClass = "fa-envelope-circle-check text-indigo-600";
      break;
  }
  iconContainer.className = `w-12 h-12 rounded-full flex items-center justify-center shadow-md ${bgClass}`;
  iconInner.className = `fa-solid ${iconClass} text-lg`;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
};
window.closeNotificationDetail = function () {
  const modal = document.getElementById("notification-detail-modal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }
};

// ===== CLEAR ALL NOTIFICATIONS =====
window.clearAllNotifications = async function() {
  if (!loggedInUser?.id) {
    window.showAlert('Error', 'Please login first.', 'error');
    return;
  }
  
  showLoading('Clearing notifications...');
  try {
    // Get all notifications for this user from Firebase
    const snap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('residentId', '==', loggedInUser.id)
      )
    );
    
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();
      console.log('✅ All notifications deleted from Firebase');
    }
    
    // Clear local state
    allNotifications = [];
    notificationCount = 0;
    updateNotificationBadge();
    renderNotificationDropdown();
    renderMobileNotificationDropdown();
    
    hideLoading();
    window.showAlert('Notifications Cleared', 'All notifications have been permanently removed.', 'success');
  } catch (e) {
    hideLoading();
    console.error('Error clearing notifications:', e);
    window.showAlert('Error', 'Failed to clear notifications.', 'error');
  }
};

// ===== PAYMENT PROCESSING =====
window.selectPaymentMethod = function (method) {
  selectedPaymentMethod = method;
  const inp = document.getElementById("selected-payment-method");
  if (inp) inp.value = method;
  document
    .querySelectorAll(".payment-method-btn")
    .forEach((b) => b.classList.remove("selected"));
  const btn = document.querySelector(`[data-method="${method}"]`);
  if (btn) btn.classList.add("selected");
  const qr = document.getElementById("qr-code-container");
  if (method === "gcash" || method === "paymaya") {
    if (qr) qr.classList.remove("hidden");
    generateQRCode(method);
  } else {
    if (qr) qr.classList.add("hidden");
  }
};
window.setAmount = function (amount) {
  const inp = document.getElementById("donation-amount");
  if (inp) inp.value = amount;
};
function generateQRCode(method) {
  const ph = document.getElementById("qr-code-placeholder");
  if (!ph) return;
  ph.innerHTML =
    method === "gcash"
      ? `<div class="text-center p-3"><i class="fa-solid fa-mobile-screen text-4xl text-blue-600 mb-2"></i><p class="text-[10px] font-bold">GCash QR</p><p class="text-[10px] text-gray-500">Scan to pay</p></div>`
      : `<div class="text-center p-3"><i class="fa-solid fa-wallet text-4xl text-purple-600 mb-2"></i><p class="text-[10px] font-bold">PayMaya QR</p><p class="text-[10px] text-gray-500">Scan to pay</p></div>`;
}
window.openPaymentModal = function (item, purpose) {
  if (!loggedInUser) {
    window.showAlert("Error", "Please login first.", "error");
    return;
  }
  currentDonationData = {
    item: item || "Donation",
    purpose: purpose || "General",
    donorName: loggedInUser.name || "Anonymous",
    donorId: loggedInUser.id || "",
  };
  const pi = document.getElementById("payment-item");
  if (pi) pi.textContent = currentDonationData.item;
  const pp = document.getElementById("payment-purpose");
  if (pp) pp.textContent = currentDonationData.purpose;
  const pdn = document.getElementById("payment-donor-name");
  if (pdn) pdn.value = currentDonationData.donorName;
  selectedPaymentMethod = null;
  const spm = document.getElementById("selected-payment-method");
  if (spm) spm.value = "";
  document
    .querySelectorAll(".payment-method-btn")
    .forEach((b) => b.classList.remove("selected"));
  const qr = document.getElementById("qr-code-container");
  if (qr) qr.classList.add("hidden");
  const da = document.getElementById("donation-amount");
  if (da) da.value = "";
  window.toggleModal("payment-modal");
};
async function saveDonation(pr) {
  try {
    if (!pr || !pr.transactionId) throw new Error("Invalid payment result");
    if (!currentDonationData || !currentDonationData.donorId)
      throw new Error("Donation data missing");
    const dd = {
      donorName: currentDonationData.donorName || "Anonymous",
      donorId: currentDonationData.donorId || "",
      item: currentDonationData.item || "Donation",
      purpose: currentDonationData.purpose || "General",
      amount: pr.amount || 0,
      paymentMethod: pr.method || "unknown",
      transactionId: pr.transactionId,
      paymentStatus: pr.status || STATUS.PENDING,
      paymentTimestamp: pr.timestamp || new Date().toISOString(),
      status: STATUS.PENDING,
      createdAt: serverTimestamp(),
    };
    if (pr.bankDetails)
      dd.bankDetails = {
        bankName: pr.bankDetails.bankName || "",
        accountNumber: pr.bankDetails.accountNumber || "",
        accountName: pr.bankDetails.accountName || "",
      };
    if (pr.cashDetails)
      dd.cashDetails = {
        officeAddress: pr.cashDetails.officeAddress || "",
        officeHours: pr.cashDetails.officeHours || "",
      };
    await addDoc(collection(db, "donations"), dd);
  } catch (e) {
    console.error("Save donation error:", e);
    throw new Error("Failed to save donation: " + e.message);
  }
}
window.processPayment = async function () {
  const pm =
    selectedPaymentMethod ||
    document.getElementById("selected-payment-method")?.value;
  const amount = parseFloat(
    document.getElementById("donation-amount")?.value || 0,
  );
  const donorName =
    document.getElementById("payment-donor-name")?.value?.trim() || "";
  if (!pm) {
    window.showAlert("Error", "Select a payment method.", "error");
    return;
  }
  if (!amount || amount <= 0 || isNaN(amount)) {
    window.showAlert("Error", "Enter a valid amount.", "error");
    return;
  }
  if (!donorName) {
    window.showAlert("Error", "Enter your name.", "error");
    return;
  }
  if (!currentDonationData) {
    window.showAlert("Error", "Donation data missing.", "error");
    return;
  }
  currentDonationData.donorName = donorName;
  showLoading("Processing payment...");
  try {
    let pr;
    switch (pm) {
      case "gcash":
        pr = await processGCashPayment(amount);
        break;
      case "paymaya":
        pr = await processPayMayaPayment(amount);
        break;
      case "bank_transfer":
        pr = await processBankTransfer(amount);
        break;
      case "cash":
        pr = await processCashPayment(amount);
        break;
      default:
        throw new Error("Invalid payment method");
    }
    await saveDonation(pr);
    window.toggleModal("payment-modal");
    document.getElementById("donation-form")?.reset();
    document.getElementById("payment-form")?.reset();
    currentDonationData = null;
    selectedPaymentMethod = null;
    hideLoading();
    window.showAlert(
      "Payment Successful!",
      `Thank you for ₱${amount.toLocaleString()}!`,
      "success",
    );
  } catch (e) {
    hideLoading();
    window.showAlert(
      "Payment Failed",
      e.message || "An error occurred.",
      "error",
    );
  }
};
async function processGCashPayment(a) {
  return {
    transactionId: `GCASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "gcash",
    amount: a,
    status: STATUS.PENDING,
    timestamp: new Date().toISOString(),
  };
}
async function processPayMayaPayment(a) {
  return {
    transactionId: `MAYA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "paymaya",
    amount: a,
    status: STATUS.PENDING,
    timestamp: new Date().toISOString(),
  };
}
async function processBankTransfer(a) {
  return {
    transactionId: `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "bank_transfer",
    amount: a,
    status: STATUS.PENDING,
    bankDetails: {
      bankName: "GCash",
      accountNumber: "4413-6000-0859-3972",
      accountName: "Municipality of Victoria",
    },
    timestamp: new Date().toISOString(),
  };
}
async function processCashPayment(a) {
  return {
    transactionId: `CASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "cash",
    amount: a,
    status: STATUS.PENDING,
    cashDetails: {
      officeAddress: "Municipal Hall, Victoria, Tarlac",
      officeHours: "8:00 AM - 5:00 PM, Monday to Friday",
    },
    timestamp: new Date().toISOString(),
  };
}

// ===== SESSION MANAGEMENT =====
function generateSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
}
async function enforceSingleSession(uid) {
  if (!uid) return true;
  try {
    const userDoc = await getDoc(doc(db, "residents", uid));
    if (!userDoc.exists()) return true;
    const userData = userDoc.data(),
      storedToken = userData.sessionToken;
    if (storedToken && storedToken !== currentSessionToken) {
      const lastActive = userData.lastActive?.toDate
        ? userData.lastActive.toDate()
        : new Date(0);
      if (lastActive > new Date(Date.now() - 5 * 60 * 1000)) {
        window.showAlert(
          "Session Terminated",
          "This account is already logged in on another device.",
          "error",
        );
        await signOut(auth);
        clearUserSession();
        loggedInUser = null;
        document.getElementById("auth-screen")?.classList.remove("hidden");
        document.getElementById("dashboard")?.classList.add("hidden");
        hideNotificationBell();
        try {
          await updateDoc(doc(db, "residents", uid), {
            sessionToken: null,
            isOnline: false,
          });
        } catch (e) {}
        return false;
      }
    }
    currentSessionToken = generateSessionToken();
    await updateDoc(doc(db, "residents", uid), {
      sessionToken: currentSessionToken,
      lastActive: serverTimestamp(),
      isOnline: true,
      lastDeviceCheck: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Session enforcement error:", error);
    return true;
  }
}
function startSessionHeartbeat(uid) {
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);
  sessionCheckInterval = setInterval(async () => {
    if (!loggedInUser?.id) {
      clearInterval(sessionCheckInterval);
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, "residents", uid));
      if (!userDoc.exists()) return;
      if (
        userDoc.data().sessionToken &&
        userDoc.data().sessionToken !== currentSessionToken
      ) {
        clearInterval(sessionCheckInterval);
        window.showAlert(
          "Session Expired",
          "Logged in from another device.",
          "error",
        );
        await signOut(auth);
        clearUserSession();
        loggedInUser = null;
        document.getElementById("auth-screen")?.classList.remove("hidden");
        document.getElementById("dashboard")?.classList.add("hidden");
        hideNotificationBell();
        if (participantsUnsubscribe) participantsUnsubscribe();
        if (notificationsUnsubscribe) notificationsUnsubscribe();
        if (donationsUnsubscribe) donationsUnsubscribe();
        if (volunteersUnsubscribe) volunteersUnsubscribe();
        if (hoursUnsubscribe) hoursUnsubscribe();
        return;
      }
      await updateDoc(doc(db, "residents", uid), {
        lastActive: serverTimestamp(),
      });
    } catch (error) {
      console.error("Heartbeat error:", error);
    }
  }, 30000);
}
function stopSessionHeartbeat() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}
function saveUserSession(ud) {
  try {
    const sd = {
      ...ud,
      createdAt: ud.createdAt?.toDate
        ? ud.createdAt.toDate().toISOString()
        : ud.createdAt,
      lastActive: ud.lastActive?.toDate
        ? ud.lastActive.toDate().toISOString()
        : ud.lastActive,
    };
    localStorage.setItem("barangayUser", JSON.stringify(sd));
  } catch (e) {}
}
function clearUserSession() {
  try {
    localStorage.removeItem("barangayUser");
    sessionStorage.removeItem("userActiveTab");
    sessionStorage.removeItem("registeredEvents");
    sessionStorage.removeItem("completedEvents");
  } catch (e) {}
}
function saveActiveTab(t) {
  try {
    sessionStorage.setItem("userActiveTab", t);
  } catch (e) {}
}
function getSavedActiveTab() {
  try {
    return sessionStorage.getItem("userActiveTab") || "announcements";
  } catch (e) {
    return "announcements";
  }
}

// ===== LOADING MANAGEMENT =====
function showLoading(msg = "Loading...") {
  const l = document.getElementById("global-loading"),
    t = document.getElementById("loading-text");
  if (l) {
    l.classList.remove("hidden");
    l.style.display = "flex";
  }
  if (t) t.textContent = msg;
}
function hideLoading() {
  const l = document.getElementById("global-loading");
  if (l) {
    l.classList.add("hidden");
    l.style.display = "none";
  }
}

// ===== PROFILE PICTURE HANDLING =====
window.triggerProfilePicUpload = function () {
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.click();
};
window.handleProfilePicChange = function (event) {
  const file = event.target.files[0];
  if (!file) return;
  if (
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)
  ) {
    window.showAlert("Error", "Invalid image type.", "error");
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    window.showAlert("Error", "Image must be < 5MB.", "error");
    event.target.value = "";
    return;
  }
  selectedProfilePicFile = file;
  const reader = new FileReader();
  reader.onload = function (e) {
    const ip = document.getElementById("profile-img-preview"),
      ic = document.getElementById("profile-icon-fallback");
    if (ip) {
      ip.src = e.target.result;
      ip.classList.remove("hidden");
      ip.style.opacity = "0.6";
      ip.style.border = "2px solid #FFD700";
    }
    if (ic) ic.classList.add("hidden");
    const pi = document.getElementById("profile-pic-pending");
    if (pi) pi.classList.remove("hidden");
    const ab = document.getElementById("profile-action-btn");
    if (ab && ab.getAttribute("data-mode") === "save") {
      const rb = document.getElementById("remove-profile-pic-btn");
      if (rb) rb.classList.remove("hidden");
    }
  };
  reader.readAsDataURL(file);
  window.showAlert(
    "Picture Selected",
    "Click 'Save Changes' to apply.",
    "success",
  );
};
window.removeProfilePic = function () {
  const ab = document.getElementById("profile-action-btn");
  if (!ab || ab.getAttribute("data-mode") !== "save") return;
  if (
    !(loggedInUser?.profilePic && loggedInUser.profilePic !== "") &&
    !(selectedProfilePicFile instanceof File)
  ) {
    window.showAlert("No Picture", "Nothing to remove.", "error");
    return;
  }
  window.showConfirmPopup("Remove Picture?", "Are you sure?", () => {
    showLoading("Removing...");
    setTimeout(() => {
      selectedProfilePicFile = null;
      const ip = document.getElementById("profile-img-preview"),
        ic = document.getElementById("profile-icon-fallback");
      if (ip) {
        ip.src = "";
        ip.classList.add("hidden");
        ip.style.opacity = "1";
        ip.style.border = "3px solid rgba(10,41,71,0.15)";
      }
      if (ic) ic.classList.remove("hidden");
      const rb = document.getElementById("remove-profile-pic-btn");
      if (rb) rb.classList.add("hidden");
      const pi = document.getElementById("profile-pic-pending");
      if (pi) pi.classList.remove("hidden");
      const fi = document.getElementById("profile-pic-input");
      if (fi) fi.value = "";
      hideLoading();
      window.showAlert(
        "Marked for Removal",
        "Click 'Save Changes' to apply.",
        "success",
      );
    }, 600);
  });
};
async function uploadProfilePicture(uid, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const b64 = e.target.result;
        await updateDoc(doc(db, "residents", uid), { profilePic: b64 });
        resolve(b64);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== UI UTILITIES =====
function updateUIWithUserData(user) {
  if (!user) return;
  const ssv = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };
  const sst = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "";
  };
  const ip = document.getElementById("profile-img-preview"),
    ic = document.getElementById("profile-icon-fallback");
  const sp = document.getElementById("sidebar-profile-pic"),
    si = document.getElementById("sidebar-icon-fallback");
  const msp = document.getElementById("mobile-sidebar-profile-pic"),
    msi = document.getElementById("mobile-sidebar-icon-fallback");
  const rb = document.getElementById("remove-profile-pic-btn"),
    pi = document.getElementById("profile-pic-pending");
  if (user.profilePic && user.profilePic !== "") {
    if (ip) {
      ip.src = user.profilePic;
      ip.classList.remove("hidden");
      ip.style.opacity = "1";
      ip.style.border = "3px solid rgba(10,41,71,0.15)";
    }
    if (ic) ic.classList.add("hidden");
    if (sp) {
      sp.src = user.profilePic;
      sp.classList.remove("hidden");
      sp.style.opacity = "1";
    }
    if (si) si.classList.add("hidden");
    if (msp) {
      msp.src = user.profilePic;
      msp.classList.remove("hidden");
      msp.style.opacity = "1";
    }
    if (msi) msi.classList.add("hidden");
  } else {
    if (ip) {
      ip.src = "";
      ip.classList.add("hidden");
      ip.style.opacity = "1";
    }
    if (ic) ic.classList.remove("hidden");
    if (sp) {
      sp.src = "";
      sp.classList.add("hidden");
    }
    if (si) si.classList.remove("hidden");
    if (msp) {
      msp.src = "";
      msp.classList.add("hidden");
    }
    if (msi) msi.classList.remove("hidden");
  }
  if (rb) rb.classList.add("hidden");
  if (pi) pi.classList.add("hidden");
  sst("sidebar-username", user.name || "Resident");
  sst("sidebar-email", user.email || "");
  sst("profile-display-name", user.name || "Resident");
  sst("profile-display-email", user.email || "");
  sst("mobile-username", user.name || "Resident");
  ssv("prof-name", user.name);
  ssv("prof-email", user.email);
  ssv("prof-phone", user.phone);
  ssv("prof-age", user.age);
  ssv("prof-gender", user.gender || "Male");
  ssv("prof-address", user.address);
  ssv("vol-name", user.name);
  ["prof-email", "prof-gender", "prof-name", "prof-age"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("bg-gray-100", "cursor-not-allowed");
    }
  });
  const pf = document.getElementById("prof-password");
  if (pf) pf.value = user.password || "";
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.value = "";
}

// ===== MOBILE INPUT RESTRICTIONS =====
function setupPhoneRestrictions() {
  ["reg-phone", "prof-phone"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute("maxlength", "11");
      el.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "");
        if (e.target.value.length > 11)
          e.target.value = e.target.value.slice(0, 11);
      });
    }
  });
}

// ===== ALERT SYSTEM =====
window.showAlert = function (title, message, type = "success") {
  const ae = document.getElementById("custom-alert");
  if (!ae) {
    alert(`${title}\n${message}`);
    return;
  }
  clearTimeout(alertTimeout);
  const ib = document.getElementById("alert-icon-box"),
    ic = document.getElementById("alert-icon");
  if (type === "success") {
    if (ib) ib.className = "p-1.5 rounded-lg text-white bg-emerald-500";
    if (ic) ic.className = "fa-solid fa-circle-check text-sm";
  } else if (type === "warning") {
    if (ib) ib.className = "p-1.5 rounded-lg text-white bg-amber-500";
    if (ic) ic.className = "fa-solid fa-triangle-exclamation text-sm";
  } else {
    if (ib) ib.className = "p-1.5 rounded-lg text-white bg-rose-500";
    if (ic) ic.className = "fa-solid fa-circle-exclamation text-sm";
  }
  document.getElementById("alert-title").innerText = title;
  document.getElementById("alert-message").innerText = message;
  ae.classList.remove("translate-x-96", "opacity-0", "pointer-events-none");
  ae.classList.add("translate-x-0", "opacity-100");
  alertTimeout = setTimeout(() => window.closeCustomAlert(), 4000);
};
window.closeCustomAlert = function () {
  const el = document.getElementById("custom-alert");
  if (el) {
    el.classList.remove("translate-x-0", "opacity-100");
    el.classList.add("translate-x-96", "opacity-0", "pointer-events-none");
  }
};
window.showConfirmPopup = function (title, text, cb) {
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-msg").innerText = text;
  document.getElementById("confirm-modal").classList.remove("hidden");
  pendingConfirmCallback = cb;
};

// ===== FIREBASE USER OPERATIONS =====
async function setUserStatus(uid, status) {
  if (!uid) return;
  try {
    if (status) {
      currentSessionToken = generateSessionToken();
      await updateDoc(doc(db, "residents", uid), {
        isOnline: status,
        lastActive: serverTimestamp(),
        sessionToken: currentSessionToken,
        lastDeviceCheck: serverTimestamp(),
      });
    } else {
      currentSessionToken = null;
      await updateDoc(doc(db, "residents", uid), {
        isOnline: status,
        lastActive: serverTimestamp(),
        sessionToken: null,
        lastDeviceCheck: serverTimestamp(),
      });
    }
  } catch (e) {
    console.error("Status update error:", e);
  }
}
async function loadUserRegisteredEvents() {
  if (!loggedInUser?.id) return;
  try {
    const s1 = await getDocs(
      query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("status", "==", STATUS.REGISTERED),
      ),
    );
    registeredEventIds.clear();
    s1.forEach((d) => registeredEventIds.add(d.data().eventId));
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    const s2 = await getDocs(
      query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("status", "==", STATUS.COMPLETED),
      ),
    );
    completedEventIds.clear();
    s2.forEach((d) => completedEventIds.add(d.data().eventId));
    sessionStorage.setItem(
      "completedEvents",
      JSON.stringify([...completedEventIds]),
    );
    return registeredEventIds;
  } catch (e) {
    return new Set();
  }
}
function setupParticipantsListener() {
  if (!loggedInUser?.id) return;
  if (participantsUnsubscribe) participantsUnsubscribe();
  participantsUnsubscribe = onSnapshot(
    query(
      collection(db, "participants"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      registeredEventIds.clear();
      completedEventIds.clear();
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === STATUS.REGISTERED)
          registeredEventIds.add(data.eventId);
        else if (data.status === STATUS.COMPLETED)
          completedEventIds.add(data.eventId);
      });
      sessionStorage.setItem(
        "registeredEvents",
        JSON.stringify([...registeredEventIds]),
      );
      sessionStorage.setItem(
        "completedEvents",
        JSON.stringify([...completedEventIds]),
      );
      if (typeof renderEvents === "function") renderEvents();
      if (typeof renderMyEvents === "function") renderMyEvents();
    },
  );
}

// ===== AUTH PANELS =====
window.toggleAuthPanels = function (showRegister) {
  const lp = document.getElementById("login-panel"),
    rp = document.getElementById("register-panel");
  if (lp && rp) {
    showLoading(showRegister ? "Loading registration..." : "Loading login...");
    setTimeout(() => {
      lp.classList.toggle("hidden", showRegister);
      rp.classList.toggle("hidden", !showRegister);
      const form = document.getElementById(
        showRegister ? "register-form" : "login-form",
      );
      if (form) form.reset();
      hideLoading();
    }, 400);
  }
};

// ===== REGISTRATION =====
document
  .getElementById("register-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name")?.value.trim() || "",
      email =
        document.getElementById("reg-email")?.value.trim().toLowerCase() || "";
    const phone = document.getElementById("reg-phone")?.value.trim() || "",
      age = document.getElementById("reg-age")?.value.trim() || "";
    const gender = document.getElementById("reg-gender")?.value || "",
      address = document.getElementById("reg-address")?.value.trim() || "";
    const pass = document.getElementById("reg-password")?.value || "",
      confirmPass =
        document.getElementById("reg-confirm-password")?.value || "";
    if (!name || !email || !phone || !age || !gender || !address || !pass) {
      window.showAlert("Error", "All fields required.", "error");
      return;
    }
    if (!/^[a-zA-ZñÑ\s.]+$/.test(name)) {
      window.showAlert("Error", "Invalid name.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.showAlert("Error", "Invalid email.", "error");
      return;
    }
    if (!/^09\d{9}$/.test(phone)) {
      window.showAlert(
        "Error",
        "Phone must be 11 digits starting with 09.",
        "error",
      );
      return;
    }
    if (pass !== confirmPass) {
      window.showAlert("Error", "Passwords don't match.", "error");
      return;
    }
    if (pass.length < 6) {
      window.showAlert("Error", "Password must be 6+ characters.", "error");
      return;
    }
    showLoading("Creating account...");
    try {
      const uc = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(uc.user);
      await setDoc(doc(db, "residents", uc.user.uid), {
        name,
        email,
        phone,
        age: parseInt(age) || 0,
        gender,
        address,
        password: pass,
        isOnline: false,
        profilePic: "",
        sessionToken: null,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        lastProfileUpdate: null,
        lastAgeUpdate: null,
        role: "resident",
      });
      await signOut(auth);
      hideLoading();
      document.getElementById("register-form")?.reset();
      window.showAlert(
        "Verification Sent!",
        "Check your email to verify.",
        "success",
      );
      window.toggleAuthPanels(false);
    } catch (err) {
      hideLoading();
      window.showAlert(
        "Error",
        err.code === "auth/email-already-in-use"
          ? "Email already registered."
          : `Failed: ${err.message}`,
        "error",
      );
    }
  });

// ===== LOGIN =====
document.getElementById("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email =
      document.getElementById("login-email")?.value.trim().toLowerCase() || "",
    pass = document.getElementById("login-password")?.value || "";
  if (!email || !pass) {
    window.showAlert("Error", "Enter email and password.", "error");
    return;
  }
  showLoading("Logging in...");
  try {
    const uc = await signInWithEmailAndPassword(auth, email, pass);
    await uc.user.reload();
    if (!auth.currentUser.emailVerified) {
      hideLoading();
      window.showAlert("Not Verified", "Check your email first.", "error");
      await signOut(auth);
      return;
    }
    if (!(await enforceSingleSession(uc.user.uid))) {
      hideLoading();
      return;
    }
    const snap = await getDoc(doc(db, "residents", uc.user.uid));
    if (snap.exists()) {
      loggedInUser = { id: snap.id, ...snap.data() };
      saveUserSession(loggedInUser);
      saveActiveTab("announcements");
      await setUserStatus(loggedInUser.id, true);
      await loadUserRegisteredEvents();
      setupParticipantsListener();
      initializeAllUserListeners();
      startSessionHeartbeat(loggedInUser.id);
      document.getElementById("auth-screen")?.classList.add("hidden");
      document.getElementById("dashboard")?.classList.remove("hidden");
      showNotificationBell();
      updateUIWithUserData(loggedInUser);
      initUserHourTracker();
      initNotificationsListener();
      window.switchTab("announcements");
      hideLoading();
      window.showAlert("Welcome!", `Hello ${loggedInUser.name}!`, "success");
    } else {
      hideLoading();
      window.showAlert("Error", "Profile not found.", "error");
      await signOut(auth);
    }
  } catch (err) {
    hideLoading();
    window.showAlert("Error", "Incorrect email or password.", "error");
  }
});

// ===== INITIALIZE ALL REAL-TIME LISTENERS =====
function initializeAllUserListeners() {
  if (!loggedInUser?.id) return;
  if (donationsUnsubscribe) donationsUnsubscribe();
  if (volunteersUnsubscribe) volunteersUnsubscribe();
  donationsUnsubscribe = onSnapshot(
    query(collection(db, "donations"), where("donorId", "==", loggedInUser.id)),
    (snap) => {
      const tbody = document.getElementById("user-donations-tbody");
      if (!tbody) return;
      if (snap.empty) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center py-4 text-xs text-gray-400">No donations yet.</td></tr>';
        return;
      }
      const donations = [];
      snap.forEach((d) => donations.push({ id: d.id, ...d.data() }));
      donations.sort((a, b) => {
        const ta = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return tb - ta;
      });
      let html = "";
      donations.forEach((data) => {
        let badge =
          data.status === STATUS.APPROVED
            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Confirmed</span>'
            : data.status === STATUS.REJECTED
              ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>'
              : '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.item || ""}</td><td class="px-3 py-2 text-xs">${data.purpose || ""}</td><td class="px-3 py-2 text-xs">${data.amount ? "₱" + parseFloat(data.amount).toLocaleString() : data.item || ""}</td><td class="px-3 py-2">${badge}</td><td class="px-3 py-2 text-xs text-gray-400">${data.createdAt ? formatShortDate(data.createdAt) : "N/A"}</td></tr>`;
      });
      tbody.innerHTML = html;
    },
  );
  volunteersUnsubscribe = onSnapshot(
    query(
      collection(db, "volunteers"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      const tbody = document.getElementById("user-volunteers-tbody");
      if (!tbody) return;
      if (snap.empty) {
        tbody.innerHTML =
          '<tr><td colspan="4" class="text-center py-4 text-xs text-gray-400">No volunteer applications yet.</td></tr>';
        return;
      }
      const volunteers = [];
      snap.forEach((d) => volunteers.push({ id: d.id, ...d.data() }));
      volunteers.sort((a, b) => {
        const ta = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return tb - ta;
      });
      let html = "";
      volunteers.forEach((data) => {
        let badge =
          data.status === STATUS.APPROVED
            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Approved</span>'
            : data.status === STATUS.REJECTED
              ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>'
              : '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.skills || ""}</td><td class="px-3 py-2 text-xs">${data.availability || ""}</td><td class="px-3 py-2">${badge}</td><td class="px-3 py-2 text-xs text-gray-400">${data.createdAt ? formatShortDate(data.createdAt) : "N/A"}</td></tr>`;
      });
      tbody.innerHTML = html;
    },
  );
}

// ===== NOTIFICATION SYSTEM =====
function showNotificationBell() {
  const bell = document.getElementById("notification-bell-container");
  if (bell) bell.style.display = "block";
}
function hideNotificationBell() {
  const bell = document.getElementById("notification-bell-container");
  if (bell) bell.style.display = "none";
}
function initNotificationsListener() {
  if (!loggedInUser?.id) return;
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  notificationsUnsubscribe = onSnapshot(
    query(
      collection(db, "notifications"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      notificationCount = 0;
      allNotifications = [];
      snap.forEach((d) => {
        const notif = { id: d.id, ...d.data() };
        allNotifications.push(notif);
        if (!notif.read) notificationCount++;
      });
      allNotifications.sort((a, b) => {
        const ta = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return tb - ta;
      });
      updateNotificationBadge();
      renderNotificationDropdown();
      renderMobileNotificationDropdown();
    },
  );
}
function updateNotificationBadge() {
  const badge = document.getElementById("notification-count-badge"),
    mBadge = document.getElementById("mobile-notification-count-badge");
  if (badge) {
    if (notificationCount > 0) {
      badge.textContent = notificationCount > 99 ? "99+" : notificationCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
  if (mBadge) {
    if (notificationCount > 0) {
      mBadge.textContent = notificationCount > 99 ? "99+" : notificationCount;
      mBadge.classList.remove("hidden");
    } else {
      mBadge.classList.add("hidden");
    }
  }
}
function renderNotificationDropdown() {
  const container = document.getElementById("notification-dropdown-list"),
    unreadSpan = document.getElementById("dropdown-unread-count");
  const toggleBtn = document.getElementById("notification-toggle-more-btn"),
    dropdown = document.getElementById("notification-dropdown");
  if (!container) return;
  if (unreadSpan) {
    if (notificationCount > 0) {
      unreadSpan.textContent = `${notificationCount} new`;
      unreadSpan.classList.remove("hidden");
    } else {
      unreadSpan.classList.add("hidden");
    }
  }
  if (allNotifications.length === 0) {
    container.innerHTML = `<div class="text-center py-10"><div class="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-bell-slash text-xl text-gray-300"></i></div><p class="text-sm text-gray-400 font-medium">No notifications yet</p></div>`;
    if (toggleBtn) toggleBtn.classList.add("hidden");
    return;
  }
  if (toggleBtn) toggleBtn.classList.remove("hidden");
  const toShow = showingAllNotifications
    ? allNotifications
    : allNotifications.slice(0, 5);
  const hasMore = allNotifications.length > 5;
  if (toggleBtn) {
    if (showingAllNotifications)
      toggleBtn.innerHTML =
        '<i class="fa-solid fa-chevron-up mr-1"></i> Show Less';
    else if (hasMore)
      toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> See All (${allNotifications.length})`;
    else toggleBtn.classList.add("hidden");
  }
  if (dropdown) {
    dropdown.style.maxHeight = showingAllNotifications ? "85vh" : "60vh";
    container.style.maxHeight = showingAllNotifications ? "75vh" : "50vh";
  }
  let html = "";
  toShow.forEach((notif) => {
    let iconBg = "bg-blue-50 text-blue-600",
      icon = "fa-bell";
    switch (notif.type) {
      case "volunteer_approved":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "volunteer_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "donation_confirmed":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "donation_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "hours_credited":
        iconBg = "bg-purple-50 text-purple-600";
        icon = "fa-clock";
        break;
      case "contact_status_update":
        iconBg = "bg-indigo-50 text-indigo-600";
        icon = "fa-envelope-circle-check";
        break;
    }
    const isUnread = !notif.read,
      timeDisplay = notif.createdAt
        ? formatRelativeTime(notif.createdAt)
        : "Just now";
    html += `<div onclick="window.handleNotificationClick('${notif.id}','${notif.type || "default"}')" class="p-4 hover:bg-gray-100 cursor-pointer transition-all duration-200 ${isUnread ? "bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-gray-50"} border-b border-gray-100 last:border-b-0 group"><div class="flex items-start space-x-3"><div class="w-10 h-10 ${iconBg} rounded-full flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform"><i class="fa-solid ${icon} text-sm"></i></div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-gray-800 truncate group-hover:text-tsu-blue transition-colors">${notif.title || "Notification"}</p>${isUnread ? '<div class="w-2.5 h-2.5 bg-blue-500 rounded-full shrink-0 animate-pulse"></div>' : ""}</div><p class="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">${notif.message || ""}</p><div class="flex items-center justify-between mt-2"><p class="text-[10px] text-gray-400 flex items-center"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</p><span class="text-[10px] text-tsu-blue font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center">Tap to view <i class="fa-solid fa-arrow-right ml-0.5 text-[9px]"></i></span></div></div></div></div>`;
  });
  container.innerHTML = html;
}
window.toggleMoreNotifications = function () {
  showingAllNotifications = !showingAllNotifications;
  renderNotificationDropdown();
};
window.toggleNotificationDropdown = function () {
  const dropdown = document.getElementById("notification-dropdown"),
    bellBtn = document.getElementById("notification-bell-btn");
  if (!dropdown || !bellBtn) return;
  if (dropdown.classList.contains("hidden")) {
    const rect = bellBtn.getBoundingClientRect(),
      dw = 320,
      vw = window.innerWidth;
    let lp = rect.right + 15;
    if (lp + dw > vw) lp = vw - dw - 10;
    dropdown.style.cssText = `position:fixed;top:${rect.bottom + 8}px;left:${lp}px;right:auto;bottom:auto;transform:none;width:${dw}px`;
    showingAllNotifications = false;
    renderNotificationDropdown();
    dropdown.classList.remove("hidden");
    setTimeout(
      () => document.addEventListener("click", closeNotificationOnClickOutside),
      100,
    );
  } else {
    closeNotificationDropdown();
  }
};
function closeNotificationDropdown() {
  const d = document.getElementById("notification-dropdown");
  if (d) {
    d.classList.add("hidden");
    showingAllNotifications = false;
  }
  document.removeEventListener("click", closeNotificationOnClickOutside);
}
function closeNotificationOnClickOutside(e) {
  const d = document.getElementById("notification-dropdown"),
    b = document.getElementById("notification-bell-btn");
  if (
    d &&
    !d.classList.contains("hidden") &&
    !d.contains(e.target) &&
    b &&
    !b.contains(e.target)
  )
    closeNotificationDropdown();
}
window.handleNotificationClick = async function (notifId, type) {
  const notif = allNotifications.find((n) => n.id === notifId);
  // Open notification detail overlay
  if (notif) {
    window.openNotificationDetail(
      notifId,
      type || "default",
      notif.title || "Notification",
      notif.message || "",
      notif.createdAt ? formatRelativeTime(notif.createdAt) : "Just now",
    );
  }
  await window.markNotificationAsRead(notifId);
  closeNotificationDropdown();
  closeMobileNotificationDropdown();
};
window.markNotificationAsRead = async function (notifId) {
  try {
    await updateDoc(doc(db, "notifications", notifId), { read: true });
  } catch (e) {}
};
window.markAllNotificationsAsRead = async function () {
  if (!loggedInUser?.id) return;
  showLoading();
  try {
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("residentId", "==", loggedInUser.id),
        where("read", "==", false),
      ),
    );
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
    }
    hideLoading();
    window.showAlert("Success", "All notifications marked as read.", "success");
  } catch (e) {
    hideLoading();
  }
};

// ===== MOBILE NOTIFICATION FUNCTIONS =====
window.toggleMobileNotificationDropdown = function () {
  const dropdown = document.getElementById("mobile-notification-dropdown"),
    bellBtn = document.getElementById("mobile-notification-bell-btn");
  if (!dropdown || !bellBtn) return;
  const dd = document.getElementById("notification-dropdown");
  if (dd && !dd.classList.contains("hidden")) {
    dd.classList.add("hidden");
    showingAllNotifications = false;
  }
  if (dropdown.classList.contains("hidden")) {
    mobileShowingAllNotifications = false;
    renderMobileNotificationDropdown();
    dropdown.classList.remove("hidden");
    setTimeout(
      () =>
        document.addEventListener(
          "click",
          closeMobileNotificationOnClickOutside,
        ),
      100,
    );
  } else {
    closeMobileNotificationDropdown();
  }
};
function closeMobileNotificationDropdown() {
  const d = document.getElementById("mobile-notification-dropdown");
  if (d) {
    d.classList.add("hidden");
    mobileShowingAllNotifications = false;
  }
  document.removeEventListener("click", closeMobileNotificationOnClickOutside);
}
function closeMobileNotificationOnClickOutside(e) {
  const d = document.getElementById("mobile-notification-dropdown"),
    b = document.getElementById("mobile-notification-bell-btn");
  if (
    d &&
    !d.classList.contains("hidden") &&
    !d.contains(e.target) &&
    b &&
    !b.contains(e.target)
  )
    closeMobileNotificationDropdown();
}
function renderMobileNotificationDropdown() {
  const container = document.getElementById(
      "mobile-notification-dropdown-list",
    ),
    unreadSpan = document.getElementById("mobile-dropdown-unread-count"),
    toggleBtn = document.getElementById("mobile-notification-toggle-more-btn"),
    dropdown = document.getElementById("mobile-notification-dropdown");
  if (!container) return;
  if (unreadSpan) {
    if (notificationCount > 0) {
      unreadSpan.textContent = `${notificationCount} new`;
      unreadSpan.classList.remove("hidden");
    } else {
      unreadSpan.classList.add("hidden");
    }
  }
  if (allNotifications.length === 0) {
    container.innerHTML = `<div class="text-center py-10"><div class="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-bell-slash text-xl text-gray-300"></i></div><p class="text-sm text-gray-400 font-medium">No notifications yet</p></div>`;
    if (toggleBtn) toggleBtn.classList.add("hidden");
    return;
  }
  if (toggleBtn) toggleBtn.classList.remove("hidden");
  const toShow = mobileShowingAllNotifications
    ? allNotifications
    : allNotifications.slice(0, 5);
  const hasMore = allNotifications.length > 5;
  if (toggleBtn) {
    if (mobileShowingAllNotifications)
      toggleBtn.innerHTML =
        '<i class="fa-solid fa-chevron-up mr-1"></i> Show Less';
    else if (hasMore)
      toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> See All (${allNotifications.length})`;
    else toggleBtn.classList.add("hidden");
  }
  if (dropdown) {
    dropdown.style.maxHeight = mobileShowingAllNotifications ? "85vh" : "60vh";
    container.style.maxHeight = mobileShowingAllNotifications ? "75vh" : "50vh";
  }
  let html = "";
  toShow.forEach((notif) => {
    let iconBg = "bg-blue-50 text-blue-600",
      icon = "fa-bell";
    switch (notif.type) {
      case "volunteer_approved":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "volunteer_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "donation_confirmed":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "donation_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "hours_credited":
        iconBg = "bg-purple-50 text-purple-600";
        icon = "fa-clock";
        break;
      case "contact_status_update":
        iconBg = "bg-indigo-50 text-indigo-600";
        icon = "fa-envelope-circle-check";
        break;
    }
    const isUnread = !notif.read,
      timeDisplay = notif.createdAt
        ? formatRelativeTime(notif.createdAt)
        : "Just now";
    html += `<div onclick="window.handleNotificationClick('${notif.id}','${notif.type || "default"}'); closeMobileNotificationDropdown();" class="p-4 hover:bg-gray-100 cursor-pointer transition-all duration-200 ${isUnread ? "bg-blue-50/30" : "hover:bg-gray-50"} border-b border-gray-100"><div class="flex items-start space-x-3"><div class="w-9 h-9 ${iconBg} rounded-full flex items-center justify-center shrink-0 shadow-sm"><i class="fa-solid ${icon} text-xs"></i></div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><p class="text-xs font-semibold text-gray-800 truncate">${notif.title || "Notification"}</p>${isUnread ? '<div class="w-2 h-2 bg-blue-500 rounded-full shrink-0"></div>' : ""}</div><p class="text-[11px] text-gray-600 mt-0.5 line-clamp-2">${notif.message || ""}</p><p class="text-[9px] text-gray-400 mt-1.5"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</p></div></div></div>`;
  });
  container.innerHTML = html;
}
window.toggleMoreMobileNotifications = function () {
  mobileShowingAllNotifications = !mobileShowingAllNotifications;
  renderMobileNotificationDropdown();
};

// ===== PROFILE FIELDS =====
function disableAllProfileFields() {
  [
    "prof-name",
    "prof-phone",
    "prof-address",
    "prof-password",
    "prof-age",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("bg-gray-100", "cursor-not-allowed", "opacity-60");
    }
  });
  ["prof-gender"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("bg-gray-100", "cursor-not-allowed");
    }
  });
  const ut = document.getElementById("upload-trigger");
  if (ut) {
    ut.style.pointerEvents = "none";
    ut.style.opacity = "0.6";
    ut.classList.add("cursor-not-allowed");
  }
  const ip = document.getElementById("profile-img-preview");
  if (ip) {
    ip.style.opacity = "1";
    ip.style.border = "3px solid rgba(10,41,71,0.15)";
  }
  document.getElementById("remove-profile-pic-btn")?.classList.add("hidden");
  document.getElementById("profile-pic-pending")?.classList.add("hidden");
  const tb = document.getElementById("toggle-prof-password");
  if (tb) {
    tb.disabled = true;
    tb.classList.add("opacity-60", "cursor-not-allowed");
  }
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.disabled = true;
  updateEditButtonText();
}
function updateEditButtonText() {
  const ab = document.getElementById("profile-action-btn");
  if (!ab || !loggedInUser) return;
  ab.innerHTML =
    '<i class="fa-solid fa-pen-to-square text-[10px] mr-1"></i><span class="text-[10px]">Edit Profile</span>';
  ab.classList.remove("btn-primary", "opacity-60", "cursor-not-allowed");
  ab.classList.add("btn-secondary");
  ab.setAttribute("data-mode", "edit");
  ab.setAttribute("onclick", "toggleEditMode()");
  ab.disabled = false;
}
function enableAllProfileFields() {
  ["prof-phone", "prof-address", "prof-password"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = false;
      el.classList.remove("bg-gray-100", "cursor-not-allowed", "opacity-60");
    }
  });
  const ut = document.getElementById("upload-trigger");
  if (ut) {
    ut.style.pointerEvents = "auto";
    ut.style.opacity = "1";
    ut.classList.remove("cursor-not-allowed");
  }
  const ip = document.getElementById("profile-img-preview");
  if (ip) ip.style.opacity = "1";
  const hasPic = loggedInUser?.profilePic && loggedInUser.profilePic !== "",
    hasPend = selectedProfilePicFile instanceof File;
  const rb = document.getElementById("remove-profile-pic-btn");
  if (rb && (hasPic || hasPend || (ip && !ip.classList.contains("hidden"))))
    rb.classList.remove("hidden");
  const tb = document.getElementById("toggle-prof-password");
  if (tb) {
    tb.disabled = false;
    tb.classList.remove("opacity-60", "cursor-not-allowed");
  }
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.disabled = false;
}
window.toggleEditMode = function () {
  const ab = document.getElementById("profile-action-btn");
  if (!ab) return;
  if (ab.getAttribute("data-mode") === "edit") {
    showLoading("Preparing edit mode...");
    setTimeout(() => {
      enableAllProfileFields();
      ab.innerHTML =
        '<i class="fa-solid fa-floppy-disk text-[10px] mr-1"></i><span class="text-[10px]">Save Changes</span>';
      ab.classList.remove("btn-secondary", "opacity-60", "cursor-not-allowed");
      ab.classList.add("btn-primary");
      ab.setAttribute("data-mode", "save");
      ab.setAttribute("onclick", "saveProfileChanges()");
      ab.disabled = false;
      document.getElementById("cancel-edit-btn")?.classList.remove("hidden");
      hideLoading();
      window.showAlert(
        "Edit Mode",
        "You can now edit your profile.",
        "success",
      );
    }, 500);
  }
};
window.cancelEdit = function () {
  showLoading("Cancelling...");
  setTimeout(() => {
    selectedProfilePicFile = undefined;
    document.getElementById("profile-pic-pending")?.classList.add("hidden");
    const fi = document.getElementById("profile-pic-input");
    if (fi) fi.value = "";
    if (loggedInUser) updateUIWithUserData(loggedInUser);
    disableAllProfileFields();
    document.getElementById("cancel-edit-btn")?.classList.add("hidden");
    const ab = document.getElementById("profile-action-btn");
    if (ab) {
      ab.innerHTML =
        '<i class="fa-solid fa-pen-to-square text-[10px] mr-1"></i><span class="text-[10px]">Edit Profile</span>';
      ab.classList.remove("btn-primary");
      ab.classList.add("btn-secondary");
      ab.setAttribute("data-mode", "edit");
      ab.setAttribute("onclick", "toggleEditMode()");
    }
    hideLoading();
    window.showAlert("Cancelled", "Changes discarded.", "success");
    const profPassword = document.getElementById('prof-password').type = 'password';
  }, 400);
};
window.saveProfileChanges = function () {
  showLoading("Saving...");
  setTimeout(() => {
    const pf = document.getElementById("profile-form");
    if (pf) {
      if (typeof pf.requestSubmit === "function") pf.requestSubmit();
      else
        pf.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
    }
    hideLoading();
  }, 300);
};

// ===== PROFILE FORM =====
const profileForm = document.getElementById("profile-form");
if (profileForm) {
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ab = document.getElementById("profile-action-btn");
    if (!ab || ab.getAttribute("data-mode") !== "save") return;
    if (isSaving || !loggedInUser?.id) return;
    const phone = document.getElementById("prof-phone")?.value.trim() || "",
      address = document.getElementById("prof-address")?.value.trim() || "";
    const pi = document.getElementById("prof-password");
    const password =
      pi && pi.value.trim() !== "" ? pi.value.trim() : loggedInUser.password;
    const hasNonPwd =
      phone !== (loggedInUser.phone || "") ||
      address !== (loggedInUser.address || "");
    const hasPwd = password !== (loggedInUser.password || ""),
      hasInfo = hasNonPwd || hasPwd;
    const hasPic = selectedProfilePicFile !== undefined,
      isNewPic = selectedProfilePicFile instanceof File,
      isRemoving = selectedProfilePicFile === null;
    if (!hasInfo && !hasPic) {
      window.showAlert("No Changes", "Nothing to save.", "error");
      return;
    }
    if (hasNonPwd && phone && !/^09\d{9}$/.test(phone)) {
      window.showAlert("Error", "Invalid phone.", "error");
      return;
    }
    isSaving = true;
    showLoading("Saving...");
    if (ab) {
      ab.disabled = true;
      ab.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin text-[10px] mr-1"></i><span class="text-[10px]">Saving...</span>';
    }
    try {
      const ud = {},
        su = {},
        now = new Date();
      if (hasPic) {
        if (isNewPic) {
          const pic = await uploadProfilePicture(
            loggedInUser.id,
            selectedProfilePicFile,
          );
          ud.profilePic = pic;
          su.profilePic = pic;
        } else if (isRemoving) {
          ud.profilePic = "";
          su.profilePic = "";
        }
      }
      if (hasInfo) {
        if (hasPwd && auth.currentUser)
          await updatePassword(auth.currentUser, password);
        if (hasNonPwd) {
          ud.phone = phone;
          ud.address = address;
          ud.lastProfileUpdate = serverTimestamp();
          su.phone = phone;
          su.address = address;
          su.lastProfileUpdate = now.toISOString();
        }
        ud.password = password;
        su.password = password;
      }
      if (Object.keys(ud).length > 0)
        await updateDoc(doc(db, "residents", loggedInUser.id), ud);
      if (Object.keys(su).length > 0) {
        Object.assign(loggedInUser, su);
        saveUserSession(loggedInUser);
      }
      selectedProfilePicFile = undefined;
      updateUIWithUserData(loggedInUser);
      disableAllProfileFields();
      hideLoading();
      document.getElementById("cancel-edit-btn")?.classList.add("hidden");
      let msg = hasNonPwd ? "Profile updated" : "";
      if (hasPwd) msg += (msg ? " & " : "") + "password changed";
      if (isNewPic) msg += (msg ? " & " : "") + "picture updated";
      if (isRemoving) msg += (msg ? " & " : "") + "picture removed";
      window.showAlert("Success!", msg + "! Fields locked.", "success");
      document.getElementById("prof-password").type = "password";
    } catch (error) {
      hideLoading();
      window.showAlert("Error", `Failed: ${error.message}`, "error");
      if (ab) {
        ab.disabled = false;
        ab.innerHTML =
          '<i class="fa-solid fa-floppy-disk text-[10px] mr-1"></i><span class="text-[10px]">Save Changes</span>';
        ab.classList.add("btn-primary");
      }
    } finally {
      isSaving = false;
    }
  });
}

// ===== PASSWORD TOGGLE & CONFIRM BUTTONS =====
document
  .getElementById("toggle-prof-password")
  ?.addEventListener("click", function () {
    const pf = document.getElementById("prof-password"),
      ic = document.getElementById("prof-password-icon");
    if (!pf) return;
    if (pf.type === "password") {
      pf.type = "text";
      if (ic) {
        ic.classList.remove("fa-eye");
        ic.classList.add("fa-eye-slash");
      }
    } else {
      pf.type = "password";
      if (ic) {
        ic.classList.remove("fa-eye-slash");
        ic.classList.add("fa-eye");
      }
    }
  });
document.getElementById("confirm-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("confirm-modal")?.classList.add("hidden");
  pendingConfirmCallback = null;
});
document
  .getElementById("confirm-proceed-btn")
  ?.addEventListener("click", () => {
    document.getElementById("confirm-modal")?.classList.add("hidden");
    if (typeof pendingConfirmCallback === "function") pendingConfirmCallback();
    pendingConfirmCallback = null;
  });

// ===== ANNOUNCEMENTS =====
onSnapshot(
  query(collection(db, "announcements"), orderBy("createdAt", "desc")),
  (snap) => {
    const container = document.getElementById("announcements-container"),
      publicContainer = document.getElementById(
        "public-announcements-container",
      );
    const emptyHtml =
      '<div class="text-center py-10 bg-white rounded-xl border shadow-sm"><div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-bullhorn text-2xl text-gray-300"></i></div><p class="text-base text-gray-400">No announcements yet.</p></div>';
    if (snap.empty) {
      if (container) container.innerHTML = emptyHtml;
      if (publicContainer) publicContainer.innerHTML = emptyHtml;
      return;
    }
    let html = "";
    snap.forEach((d) => {
      const a = d.data(),
        annId = d.id;
      let badgeClass = "bg-gray-100 text-gray-600",
        badgeIcon = "fa-circle-info";
      if (a.priority === "Important") {
        badgeClass = "bg-amber-100 text-amber-700";
        badgeIcon = "fa-circle-exclamation";
      }
      if (a.priority === "Emergency") {
        badgeClass = "bg-red-100 text-red-700";
        badgeIcon = "fa-triangle-exclamation";
      }
      const rt = a.createdAt ? formatRelativeTime(a.createdAt) : "Recently",
        et = a.createdAt ? formatFullDateTime(a.createdAt) : "Recently";
      const escT = (a.title || "").replace(/'/g, "\\'").replace(/"/g, "&quot;"),
        escD = (a.desc || "")
          .replace(/'/g, "\\'")
          .replace(/"/g, "&quot;")
          .replace(/\n/g, "\\n"),
        escP = (a.priority || "Notice").replace(/'/g, "\\'"),
        escDt = et.replace(/'/g, "\\'");
      html += `<div onclick="openAnnouncementDetails('${annId}','${escT}','${escD}','${escP}','${escDt}')" class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden group"><div class="p-5 sm:p-6"><div class="flex items-center justify-between mb-3"><div class="flex items-center space-x-3"><div class="w-10 h-10 bg-gradient-to-br from-tsu-blue to-tsu-dark rounded-xl flex items-center justify-center shadow-sm shrink-0"><i class="fa-solid fa-building-columns text-tsu-gold text-sm"></i></div><div class="min-w-0"><h4 class="font-bold text-sm text-gray-900">Municipality of Victoria</h4><div class="flex items-center space-x-2 mt-1"><span class="text-[11px] text-gray-400" title="${et}"><i class="fa-solid fa-clock mr-1"></i>${rt}</span><span class="text-[11px] px-2 py-0.5 rounded-full font-bold ${badgeClass}"><i class="fa-solid ${badgeIcon} mr-1 text-[10px]"></i>${a.priority || "Notice"}</span></div></div></div></div><h3 class="text-base sm:text-lg font-extrabold text-gray-900 group-hover:text-tsu-blue transition-colors line-clamp-2 leading-snug mb-2">${a.title || "Untitled"}</h3><p class="text-sm text-gray-500 mt-2 line-clamp-3 leading-relaxed">${a.desc || ""}</p></div><div class="px-5 sm:px-6 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between"><span class="text-xs text-tsu-blue font-semibold group-hover:underline">Read More <i class="fa-solid fa-arrow-right ml-1.5 text-[11px]"></i></span></div></div>`;
    });
    if (container) container.innerHTML = html;
    if (publicContainer) publicContainer.innerHTML = html;
  },
);
window.openAnnouncementDetails = function (annId, title, desc, priority, date) {
  const mT = document.getElementById("modal-announcement-title"),
    mD = document.getElementById("modal-announcement-desc"),
    mDt = document.getElementById("modal-announcement-date"),
    mB = document.getElementById("modal-announcement-badge");
  if (mT) mT.textContent = title;
  if (mD) mD.textContent = desc || "No description.";
  if (mDt) {
    mDt.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>${date || "Recently"}`;
    mDt.title = date || "Recently";
  }
  if (mB) {
    mB.textContent = priority || "Notice";
    mB.className = "text-xs font-bold uppercase px-3.5 py-1 rounded-full";
    if (priority === "Important")
      mB.classList.add("bg-amber-100", "text-amber-700");
    else if (priority === "Emergency")
      mB.classList.add("bg-red-100", "text-red-700");
    else mB.classList.add("bg-gray-100", "text-gray-600");
  }
  window.toggleModal("view-announcement-modal");
};

// ===== EVENT HANDLERS =====
window.handleRegisterClick = function (e, eid, et, ed, etm, el) {
  e.preventDefault();
  e.stopPropagation();
  window.confirmJoinEvent(eid, et, ed, etm, el);
  return false;
};
window.handleUnregisterClick = function (e, eid, et) {
  e.preventDefault();
  e.stopPropagation();
  window.unregisterFromEvent(eid, et);
  return false;
};

// ===== RENDER EVENTS =====
function renderPublicEvents() {
  const grid = document.getElementById("public-events-grid");
  if (!grid) return;
  getDocs(query(collection(db, "events"), orderBy("date", "asc"))).then(
    (snap) => {
      if (snap.empty) {
        grid.innerHTML =
          '<div class="col-span-full text-center py-10 bg-white rounded-xl border shadow-sm"><p class="text-sm text-gray-400">No upcoming events.</p></div>';
        return;
      }
      let html = "";
      snap.forEach((d) => {
        const ev = d.data();
        const esc = (t) => {
          const div = document.createElement("div");
          div.textContent = t || "";
          return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        };
        const dd = ev.date || "TBA",
          td = ev.time ? formatTimeDisplay(ev.time) : "";
        let ti = "fa-calendar-check",
          pg = "from-tsu-blue to-tsu-dark";
        switch (ev.type) {
          case "Seminar":
            ti = "fa-chalkboard-user";
            pg = "from-[#800000] to-[#A52A2A]";
            break;
          case "Workshop":
            ti = "fa-toolbox";
            pg = "from-[#A52A2A] to-[#8B0000]";
            break;
          case "Meeting":
            ti = "fa-users";
            pg = "from-[#B8960C] to-[#8B6914]";
            break;
          case "Sports":
            ti = "fa-futbol";
            pg = "from-[#0D3B5C] to-[#0A2947]";
            break;
          case "Health":
            ti = "fa-heart-pulse";
            pg = "from-[#8B0000] to-[#600000]";
            break;
          case "Training":
            ti = "fa-graduation-cap";
            pg = "from-[#1A5276] to-[#0A2947]";
            break;
          case "Celebration":
            ti = "fa-cake-candles";
            pg = "from-[#FFD700] to-[#B8960C]";
            break;
          case "Outreach":
            ti = "fa-hand-holding-heart";
            pg = "from-[#0A2947] to-[#1A5276]";
            break;
          case "Environmental":
            ti = "fa-leaf";
            pg = "from-[#2B0000] to-[#0A2947]";
            break;
          case "Cultural":
            ti = "fa-masks-theater";
            pg = "from-[#FFD700] to-[#CCAC00]";
            break;
          case "Fundraising":
            ti = "fa-sack-dollar";
            pg = "from-[#A52A2A] to-[#800000]";
            break;
        }
        const hi = ev.imageUrl && ev.imageUrl !== "";
        const is = hi
          ? `<div class="relative h-40 overflow-hidden rounded-t-xl"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover"><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full"><i class="fa-solid ${ti} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-40 bg-gradient-to-br ${pg} flex items-center justify-center overflow-hidden rounded-t-xl"><i class="fa-solid ${ti} text-white/30 text-5xl"></i><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full"><i class="fa-solid ${ti} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;
        const ab = `<button type="button" onclick="window.showAlert('Authentication Required','Please log in or create an account to join community events.','error')" class="text-xs font-semibold text-[#0A2947] bg-white border border-[#0A2947] hover:bg-[#E8F0FE] px-4 py-2 rounded-lg transition-all shadow-sm flex items-center justify-center space-x-1.5 w-full"><i class="fa-solid fa-calendar-plus text-[#0A2947]"></i><span>Register / Join</span></button>`;
        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${dd}','${td}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${is}<div class="p-4 pb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#800000] transition-colors line-clamp-2 leading-snug mb-2">${ev.title || "Untitled Event"}</h3><div class="space-y-2"><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-calendar text-[#B8960C] w-4"></i><span class="font-medium text-gray-700">${dd}</span>${td ? `<span class="text-gray-400">| ${td}</span>` : ""}</div><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-location-dot text-[#B8960C] w-4"></i><span class="font-medium text-gray-700 truncate">${ev.location || "TBA"}</span></div></div></div></div><div class="px-4 pb-4 pt-3 border-t border-gray-100 mt-auto">${ab}</div></div>`;
      });
      grid.innerHTML = html;
    },
  );
}
function renderEvents() {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  getDocs(query(collection(db, "events"), orderBy("date", "asc"))).then(
    (snap) => {
      if (snap.empty) {
        grid.innerHTML =
          '<div class="col-span-full text-center py-16 bg-white rounded-xl border shadow-sm"><p class="text-base text-gray-400">No upcoming events.</p></div>';
        return;
      }
      let html = "";
      snap.forEach((d) => {
        const ev = d.data(),
          id = d.id;
        const esc = (t) => {
          const div = document.createElement("div");
          div.textContent = t || "";
          return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        };
        const isReg = registeredEventIds.has(id),
          isComp = completedEventIds.has(id);
        const dd = ev.date || "TBA",
          td = ev.time ? formatTimeDisplay(ev.time) : "";
        const hi = ev.imageUrl && ev.imageUrl !== "";
        let ti, pg;
        switch (ev.type) {
          case "Seminar":
            ti = "fa-chalkboard-user";
            pg = "from-[#800000] to-[#A52A2A]";
            break;
          case "Workshop":
            ti = "fa-toolbox";
            pg = "from-[#A52A2A] to-[#8B0000]";
            break;
          case "Meeting":
            ti = "fa-users";
            pg = "from-[#B8960C] to-[#8B6914]";
            break;
          case "Sports":
            ti = "fa-futbol";
            pg = "from-[#0D3B5C] to-[#0A2947]";
            break;
          case "Health":
            ti = "fa-heart-pulse";
            pg = "from-[#8B0000] to-[#600000]";
            break;
          case "Training":
            ti = "fa-graduation-cap";
            pg = "from-[#1A5276] to-[#0A2947]";
            break;
          case "Celebration":
            ti = "fa-cake-candles";
            pg = "from-[#FFD700] to-[#B8960C]";
            break;
          case "Outreach":
            ti = "fa-hand-holding-heart";
            pg = "from-[#0A2947] to-[#1A5276]";
            break;
          case "Environmental":
            ti = "fa-leaf";
            pg = "from-[#2B0000] to-[#0A2947]";
            break;
          case "Cultural":
            ti = "fa-masks-theater";
            pg = "from-[#FFD700] to-[#CCAC00]";
            break;
          case "Fundraising":
            ti = "fa-sack-dollar";
            pg = "from-[#A52A2A] to-[#800000]";
            break;
          default:
            ti = "fa-calendar-check";
            pg = "from-[#0A2947] to-[#1A5276]";
        }
        const is = hi
          ? `<div class="relative h-40 overflow-hidden"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${ti} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-40 bg-gradient-to-br ${pg} flex items-center justify-center overflow-hidden"><i class="fa-solid ${ti} text-white/30 text-6xl pointer-events-none"></i><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${ti} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;
        let ab = "";
        if (isComp)
          ab =
            '<span class="inline-flex items-center space-x-1.5 text-xs font-medium text-[#0A2947] bg-[#E8F0FE] px-3 py-1.5 rounded-lg border border-[#1A5276]/20 w-full justify-center pointer-events-none"><i class="fa-solid fa-circle-check text-xs"></i><span>Completed</span></span>';
        else if (isReg)
          ab = `<button type="button" onclick="handleUnregisterClick(event,'${id}','${esc(ev.title)}')" class="text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-all border border-red-200 w-full relative z-10"><i class="fa-solid fa-calendar-minus mr-1.5"></i>Cancel Registration</button>`;
        else
          ab = `<button type="button" onclick="handleRegisterClick(event,'${id}','${esc(ev.title)}','${dd}','${td}','${esc(ev.location)}')" class="text-xs font-semibold text-[#0A2947] bg-white border border-[#0A2947] hover:bg-[#E8F0FE] px-4 py-2 rounded-lg transition-all shadow-sm flex items-center justify-center space-x-1.5 w-full relative z-10"><i class="fa-solid fa-calendar-plus text-[#0A2947]"></i><span>Register / Join</span></button>`;
        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${dd}','${td}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${is}<div class="p-4 pb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#800000] transition-colors line-clamp-2 leading-snug mb-2">${ev.title || "Untitled Event"}</h3><div class="space-y-2"><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-calendar text-[#B8960C] w-4"></i><span class="font-medium text-gray-700">${dd}</span>${td ? `<span class="text-gray-400">| ${td}</span>` : ""}</div><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-location-dot text-[#B8960C] w-4"></i><span class="font-medium text-gray-700 truncate">${ev.location || "TBA"}</span></div></div></div></div><div class="px-4 pb-4 pt-3 border-t border-gray-100 mt-auto">${ab}</div></div>`;
      });
      grid.innerHTML = html;
    },
  );
}
function renderMyEvents() {
  const grid = document.getElementById("my-events-grid");
  if (!grid) return;
  if (
    !loggedInUser ||
    (registeredEventIds.size === 0 && completedEventIds.size === 0)
  ) {
    grid.innerHTML =
      '<div class="col-span-full text-center py-16 bg-white rounded-xl border shadow-sm"><p class="text-base text-gray-400">No registered events.</p></div>';
    return;
  }
  getDocs(query(collection(db, "events"), orderBy("date", "asc"))).then(
    (snap) => {
      let html = "",
        found = false;
      snap.forEach((d) => {
        const ev = d.data(),
          id = d.id;
        if (!registeredEventIds.has(id) && !completedEventIds.has(id)) return;
        found = true;
        const esc = (t) => {
          const div = document.createElement("div");
          div.textContent = t || "";
          return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        };
        const isComp = completedEventIds.has(id);
        const sb = isComp
          ? '<span class="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200"><i class="fa-solid fa-circle-check text-[9px]"></i>Completed</span>'
          : '<span class="inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><i class="fa-solid fa-clock text-[9px]"></i>Registered</span>';
        const cb = !isComp
          ? `<button type="button" onclick="handleUnregisterClick(event,'${id}','${esc(ev.title)}')" class="text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-all border border-red-200 w-full mt-2 relative z-10"><i class="fa-solid fa-calendar-minus mr-1.5"></i>Cancel Registration</button>`
          : "";
        let ti, pg;
        switch (ev.type) {
          case "Seminar":
            ti = "fa-chalkboard-user";
            pg = "from-[#800000] to-[#A52A2A]";
            break;
          case "Workshop":
            ti = "fa-toolbox";
            pg = "from-[#A52A2A] to-[#8B0000]";
            break;
          case "Meeting":
            ti = "fa-users";
            pg = "from-[#B8960C] to-[#8B6914]";
            break;
          case "Sports":
            ti = "fa-futbol";
            pg = "from-[#0D3B5C] to-[#0A2947]";
            break;
          case "Health":
            ti = "fa-heart-pulse";
            pg = "from-[#8B0000] to-[#600000]";
            break;
          case "Training":
            ti = "fa-graduation-cap";
            pg = "from-[#1A5276] to-[#0A2947]";
            break;
          case "Celebration":
            ti = "fa-cake-candles";
            pg = "from-[#FFD700] to-[#B8960C]";
            break;
          case "Outreach":
            ti = "fa-hand-holding-heart";
            pg = "from-[#0A2947] to-[#1A5276]";
            break;
          case "Environmental":
            ti = "fa-leaf";
            pg = "from-[#2B0000] to-[#0A2947]";
            break;
          case "Cultural":
            ti = "fa-masks-theater";
            pg = "from-[#FFD700] to-[#CCAC00]";
            break;
          case "Fundraising":
            ti = "fa-sack-dollar";
            pg = "from-[#A52A2A] to-[#800000]";
            break;
          default:
            ti = "fa-calendar-check";
            pg = "from-[#0A2947] to-[#1A5276]";
        }
        const hi = ev.imageUrl && ev.imageUrl !== "";
        const is = hi
          ? `<div class="relative h-32 overflow-hidden"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover pointer-events-none"><div class="absolute top-2 left-2"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full"><i class="fa-solid ${ti} text-[#FFD700] text-[9px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-32 bg-gradient-to-br ${pg} flex items-center justify-center overflow-hidden"><i class="fa-solid ${ti} text-white/30 text-5xl"></i><div class="absolute top-2 left-2"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full"><i class="fa-solid ${ti} text-[#FFD700] text-[9px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;
        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${ev.date || "TBA"}','${ev.time ? formatTimeDisplay(ev.time) : ""}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${is}<div class="p-4 pb-2"><div class="flex items-center justify-between mb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#800000] transition-colors line-clamp-1 leading-snug flex-1 mr-2">${ev.title || "Untitled Event"}</h3>${sb}</div><div class="space-y-1.5"><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-calendar text-[#B8960C] w-4"></i><span class="font-medium text-gray-700">${ev.date || "TBA"}</span>${ev.time ? `<span class="text-gray-400">| ${formatTimeDisplay(ev.time)}</span>` : ""}</div><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-location-dot text-[#B8960C] w-4"></i><span class="font-medium text-gray-700 truncate">${ev.location || "TBA"}</span></div></div></div></div>${cb ? `<div class="px-4 pb-4">${cb}</div>` : ""}</div>`;
      });
      grid.innerHTML = found
        ? html
        : '<div class="col-span-full text-center py-16 bg-white rounded-xl border shadow-sm"><p class="text-base text-gray-400">No active records.</p></div>';
    },
  );
}

// ===== EVENT OPERATIONS =====
window.confirmJoinEvent = function (eid, et, ed, etm, el) {
  if (!loggedInUser) {
    window.showAlert("Error", "Please login.", "error");
    return;
  }
  if (registeredEventIds.has(eid) || completedEventIds.has(eid)) {
    window.showAlert("Already Registered", "", "error");
    return;
  }
  let msg = `Join: "${et}"?`;
  if (ed) msg += `\nDate: ${ed}`;
  if (etm) msg += `\nTime: ${etm}`;
  if (el) msg += `\nLocation: ${el}`;
  window.showConfirmPopup("Join Event?", msg, async () => {
    await performJoinEvent(eid, et);
  });
};
async function performJoinEvent(eid, et) {
  showLoading("Joining...");
  try {
    const snap = await getDocs(
      query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("eventId", "==", eid),
        limit(1),
      ),
    );
    if (!snap.empty) {
      let found = false;
      snap.forEach((d) => {
        if (
          d.data().status === STATUS.REGISTERED ||
          d.data().status === STATUS.COMPLETED
        )
          found = true;
      });
      if (found) {
        hideLoading();
        window.showAlert("Already Registered", "", "error");
        return;
      }
    }
    await addDoc(collection(db, "participants"), {
      residentId: loggedInUser.id,
      residentName: loggedInUser.name,
      residentEmail: loggedInUser.email,
      eventTitle: et,
      eventId: eid,
      timestamp: serverTimestamp(),
      status: STATUS.REGISTERED,
    });
    registeredEventIds.add(eid);
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    renderEvents();
    renderMyEvents();
    hideLoading();
    window.showAlert("Success!", `Registered for "${et}".`, "success");
  } catch (e) {
    hideLoading();
    window.showAlert("Error", "Failed to register.", "error");
  }
}
window.unregisterFromEvent = function (eid, et) {
  if (!loggedInUser) return;
  window.showConfirmPopup("Cancel?", `Unregister from "${et}"?`, async () => {
    showLoading("Cancelling...");
    try {
      const snap = await getDocs(
        query(
          collection(db, "participants"),
          where("residentId", "==", loggedInUser.id),
          where("eventId", "==", eid),
          where("status", "==", STATUS.REGISTERED),
          limit(1),
        ),
      );
      if (!snap.empty) {
        const p = [];
        snap.forEach((d) =>
          p.push(
            updateDoc(doc(db, "participants", d.id), {
              status: STATUS.CANCELLED,
              cancelledAt: serverTimestamp(),
            }),
          ),
        );
        await Promise.all(p);
      }
      registeredEventIds.delete(eid);
      sessionStorage.setItem(
        "registeredEvents",
        JSON.stringify([...registeredEventIds]),
      );
      renderEvents();
      renderMyEvents();
      hideLoading();
      window.showAlert("Cancelled", "Unregistered.", "success");
    } catch (e) {
      hideLoading();
      window.showAlert("Error", "Failed.", "error");
    }
  });
};
eventsUnsubscribe = onSnapshot(
  query(collection(db, "events"), orderBy("date", "asc")),
  () => {
    renderEvents();
    renderPublicEvents();
  },
);

// ===== DONATIONS & HOURS =====
onSnapshot(
  query(collection(db, "donations"), orderBy("createdAt", "desc")),
  (snap) => {
    const tbody = document.getElementById("public-donations-tbody");
    if (!tbody) return;
    let html = "";
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === STATUS.APPROVED)
        html += `<tr class="border-b"><td class="px-3 py-2 font-bold text-xs">${data.donorName || "Anonymous"}</td><td class="px-3 py-2 text-xs">${data.amount ? "₱" + parseFloat(data.amount).toLocaleString() : data.item || ""}</td><td class="px-3 py-2 text-xs">${data.purpose || ""}</td></tr>`;
    });
    tbody.innerHTML =
      html ||
      '<tr><td colspan="3" class="text-center py-4 text-xs text-gray-400">No confirmed donations yet.</td></tr>';
  },
);
function initUserHourTracker() {
  if (!loggedInUser?.id) return;
  if (hoursUnsubscribe) hoursUnsubscribe();
  hoursUnsubscribe = onSnapshot(
    query(
      collection(db, "service_hours"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      const tbody = document.getElementById("user-hours-tbody"),
        display = document.getElementById("total-hours-display");
      if (!tbody || !display) return;
      let html = "",
        total = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === STATUS.APPROVED)
          total += parseFloat(data.hours || 0);
        let badge =
          data.status === STATUS.APPROVED
            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Approved</span>'
            : data.status === STATUS.REJECTED
              ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>'
              : '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.eventTitle || "Community Service"}</td><td class="px-3 py-2 text-xs font-bold">${data.hours || 0} hrs</td><td class="px-3 py-2">${badge}</td></tr>`;
      });
      tbody.innerHTML =
        html ||
        '<tr><td colspan="3" class="text-center py-4 text-xs text-gray-400">No hours recorded yet.</td></tr>';
      display.innerText = `${total} Hours`;
    },
  );
}

// ===== VOLUNTEER FORM =====
document
  .getElementById("volunteer-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      window.showAlert("Error", "Please login first.", "error");
      return;
    }
    const skills = document.getElementById("vol-skills")?.value || "",
      availability = document.getElementById("vol-avail")?.value || "",
      experience = document.getElementById("vol-experience")?.value || "",
      notes = document.getElementById("vol-notes")?.value.trim() || "";
    if (!skills) {
      window.showAlert("Error", "Select your primary skill.", "error");
      return;
    }
    if (!availability) {
      window.showAlert("Error", "Select your availability.", "error");
      return;
    }
    if (!selectedSkillVerificationFile) {
      window.showAlert("Error", "Upload proof of your skill.", "error");
      return;
    }
    showLoading("Submitting...");
    try {
      let vd = null;
      if (selectedSkillVerificationFile)
        vd = await convertFileToBase64(selectedSkillVerificationFile);
      await addDoc(collection(db, "volunteers"), {
        residentId: loggedInUser.id,
        name: loggedInUser.name,
        email: loggedInUser.email,
        skills,
        experience,
        verificationFile: vd
          ? {
              fileName: selectedSkillVerificationFile.name,
              fileType: selectedSkillVerificationFile.type,
              fileSize: selectedSkillVerificationFile.size,
              data: vd,
              uploadedAt: new Date().toISOString(),
            }
          : null,
        notes,
        availability,
        createdAt: serverTimestamp(),
        status: STATUS.PENDING,
      });
      hideLoading();
      document.getElementById("volunteer-form")?.reset();
      removeSkillVerification();
      window.showAlert(
        "Application Submitted!",
        "Your volunteer application has been submitted for review.",
        "success",
      );
    } catch (err) {
      hideLoading();
      window.showAlert("Error", "Failed to submit.", "error");
    }
  });
window.handleSkillVerificationUpload = function (event) {
  const file = event.target.files[0];
  if (!file) return;
  if (
    ![
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.type)
  ) {
    window.showAlert("Error", "Invalid file type.", "error");
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    window.showAlert("Error", "File < 5MB.", "error");
    event.target.value = "";
    return;
  }
  selectedSkillVerificationFile = file;
  const ph = document.getElementById("skill-upload-placeholder"),
    pv = document.getElementById("skill-upload-preview"),
    fn = document.getElementById("skill-file-name"),
    fs = document.getElementById("skill-file-size"),
    dz = document.getElementById("skill-verification-dropzone");
  if (ph) ph.classList.add("hidden");
  if (pv) pv.classList.remove("hidden");
  if (fn) fn.textContent = file.name;
  if (fs) {
    const sk = (file.size / 1024).toFixed(1),
      sm = (file.size / (1024 * 1024)).toFixed(1);
    fs.textContent = file.size > 1024 * 1024 ? `${sm} MB` : `${sk} KB`;
  }
  if (dz) {
    dz.classList.add("border-emerald-500", "bg-emerald-50");
    dz.classList.remove("border-gray-300");
  }
};
window.removeSkillVerification = function () {
  selectedSkillVerificationFile = null;
  const inp = document.getElementById("skill-verification-input"),
    ph = document.getElementById("skill-upload-placeholder"),
    pv = document.getElementById("skill-upload-preview"),
    dz = document.getElementById("skill-verification-dropzone");
  if (inp) inp.value = "";
  if (ph) ph.classList.remove("hidden");
  if (pv) pv.classList.add("hidden");
  if (dz) {
    dz.classList.remove("border-emerald-500", "bg-emerald-50");
    dz.classList.add("border-gray-300");
  }
};
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== DONATION FORM =====
document
  .getElementById("donation-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      window.showAlert("Error", "Please login.", "error");
      return;
    }
    const item = document.getElementById("don-item")?.value.trim() || "",
      purpose = document.getElementById("don-purpose")?.value.trim() || "";
    if (!item || !purpose) {
      window.showAlert("Error", "Fill all fields.", "error");
      return;
    }
    window.openPaymentModal(item, purpose);
  });

// ===== TAB SWITCHER =====
window.switchTab = function (tabId) {
  closeAllHeaderDropdowns();
  closeMobileMenu();
  const nd = document.getElementById("notification-dropdown");
  if (nd && !nd.classList.contains("hidden")) {
    nd.classList.add("hidden");
    showingAllNotifications = false;
  }
  const mnd = document.getElementById("mobile-notification-dropdown");
  if (mnd && !mnd.classList.contains("hidden")) {
    mnd.classList.add("hidden");
    mobileShowingAllNotifications = false;
  }
  if (isTabSwitching) return;
  isTabSwitching = true;
  showLoading("Loading...");
  setTimeout(() => {
    document
      .querySelectorAll(".tab-content")
      .forEach((el) => el.classList.add("hidden"));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove("hidden");
    document.querySelectorAll(".nav-link").forEach((btn) => {
      btn.className =
        "nav-link w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-[11px] text-gray-300 transition-all";
    });
    const activeBtn = Array.from(document.querySelectorAll(".nav-link")).find(
      (b) => b.getAttribute("onclick")?.includes(tabId),
    );
    if (activeBtn)
      activeBtn.className =
        "nav-link w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-[11px] bg-tsu-dark text-tsu-gold border border-tsu-gold/20 shadow-lg";
    saveActiveTab(tabId);
    if (tabId === "my-events") renderMyEvents();
    if (tabId === "profile" && loggedInUser) {
      setTimeout(() => {
        disableAllProfileFields();
        document.getElementById("cancel-edit-btn")?.classList.add("hidden");
      }, 100);
    }
    setTimeout(() => {
      hideLoading();
      isTabSwitching = false;
    }, 300);
  }, 600);
};
window.openEventDetails = function (title, date, time, location, desc) {
  const mT = document.getElementById("modal-event-title"),
    mD = document.getElementById("modal-event-date"),
    mL = document.getElementById("modal-event-location"),
    mDesc = document.getElementById("modal-event-desc");
  if (mT) mT.innerText = title;
  let dd = `Date: ${date || "TBA"}`;
  if (time) dd += ` at ${time}`;
  if (mD) mD.innerHTML = `<i class="fa-solid fa-calendar mr-1.5"></i>${dd}`;
  if (mL)
    mL.innerHTML = `<i class="fa-solid fa-location-dot mr-1.5"></i>Location: ${location || "TBA"}`;
  if (mDesc) mDesc.innerHTML = desc;
  window.toggleModal("view-event-modal");
};
window.toggleModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.toggle("hidden");
};

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", () => {
  setupPhoneRestrictions();
  hideNotificationBell();
  renderPublicEvents();
  closeAllHeaderDropdowns();

  document.addEventListener("click", function (e) {
    const triggers = document.querySelectorAll(".header-dropdown-trigger");
    let inside = false;
    triggers.forEach((t) => {
      if (t.contains(e.target)) inside = true;
    });
    if (!inside) closeAllHeaderDropdowns();
    const tBtn = e.target.closest(".header-dropdown-trigger > button");
    if (tBtn) {
      e.preventDefault();
      e.stopPropagation();
      const p = tBtn.parentElement,
        d = p.querySelector(".header-dropdown");
      const isOpen = d && d.classList.contains("show");
      closeAllHeaderDropdowns();
      if (d && !isOpen) d.classList.add("show");
    }
    const dLink = e.target.closest(".header-dropdown button");
    if (dLink) setTimeout(() => closeAllHeaderDropdowns(), 100);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAllHeaderDropdowns();
      closeMobileMenu();
      const nd = document.getElementById("notification-dropdown");
      if (nd && !nd.classList.contains("hidden")) {
        nd.classList.add("hidden");
        showingAllNotifications = false;
      }
      window.closeNotificationDetail();
    }
  });
  document
    .getElementById("notification-detail-modal")
    ?.addEventListener("click", function (e) {
      if (e.target === this) window.closeNotificationDetail();
    });

  const mobileOverlay = document.getElementById("mobile-overlay");
  if (mobileOverlay)
    mobileOverlay.addEventListener("click", () => window.toggleMobileMenu());
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      if (
        sidebar &&
        sidebar.classList.contains("translate-x-0") &&
        window.innerWidth < 1024
      )
        window.toggleMobileMenu();
    });
  });
  window.addEventListener("resize", () => {
    const sidebar = document.getElementById("sidebar"),
      overlay = document.getElementById("mobile-overlay");
    if (window.innerWidth >= 1024 && sidebar) {
      sidebar.classList.remove("translate-x-0");
      sidebar.classList.add("-translate-x-full");
      if (overlay) overlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
  });

  showLoading("Securing session...");
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await user.reload();
      if (!user.emailVerified) {
        clearUserSession();
        loggedInUser = null;
        stopSessionHeartbeat();
        document.getElementById("auth-screen")?.classList.remove("hidden");
        document.getElementById("dashboard")?.classList.add("hidden");
        hideNotificationBell();
        await signOut(auth);
        hideLoading();
        return;
      }
      try {
        const snap = await getDoc(doc(db, "residents", user.uid));
        if (snap.exists()) {
          const ud = snap.data();
          const ss = localStorage.getItem("barangayUser");
          if (ss) {
            try {
              const ps = JSON.parse(ss);
              if (!currentSessionToken && ud.sessionToken)
                currentSessionToken = ud.sessionToken;
            } catch (e) {}
          }
          loggedInUser = { id: snap.id, ...ud };
          saveUserSession(loggedInUser);
          const se = sessionStorage.getItem("registeredEvents");
          if (se)
            try {
              registeredEventIds = new Set(JSON.parse(se));
            } catch (e) {
              registeredEventIds = new Set();
            }
          const sc = sessionStorage.getItem("completedEvents");
          if (sc)
            try {
              completedEventIds = new Set(JSON.parse(sc));
            } catch (e) {
              completedEventIds = new Set();
            }
          document.getElementById("auth-screen")?.classList.add("hidden");
          document.getElementById("dashboard")?.classList.remove("hidden");
          showNotificationBell();
          updateUIWithUserData(loggedInUser);
          await setUserStatus(loggedInUser.id, true);
          startSessionHeartbeat(loggedInUser.id);
          initUserHourTracker();
          await loadUserRegisteredEvents();
          setupParticipantsListener();
          initializeAllUserListeners();
          initNotificationsListener();
          renderEvents();
          setTimeout(() => window.switchTab(getSavedActiveTab()), 400);
        } else {
          clearUserSession();
          stopSessionHeartbeat();
          await signOut(auth);
          hideLoading();
        }
      } catch (e) {
        hideLoading();
      }
    } else {
      clearUserSession();
      loggedInUser = null;
      stopSessionHeartbeat();
      document.getElementById("auth-screen")?.classList.remove("hidden");
      document.getElementById("dashboard")?.classList.add("hidden");
      hideNotificationBell();
      renderPublicEvents();
      hideLoading();
    }
  });
});
window.addEventListener("beforeunload", () => {
  if (loggedInUser?.id) {
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    sessionStorage.setItem(
      "completedEvents",
      JSON.stringify([...completedEventIds]),
    );
    setUserStatus(loggedInUser.id, false);
  }
  stopSessionHeartbeat();
  if (participantsUnsubscribe) participantsUnsubscribe();
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  if (donationsUnsubscribe) donationsUnsubscribe();
  if (volunteersUnsubscribe) volunteersUnsubscribe();
  if (hoursUnsubscribe) hoursUnsubscribe();
});

// ===== LOGOUT =====
window.triggerLogoutConfirmation = function () {
  window.showConfirmPopup("Log Out", "Are you sure?", async () => {
    showLoading("Logging out...");
    stopSessionHeartbeat();
    if (loggedInUser?.id) {
      await setUserStatus(loggedInUser.id, false);
      try {
        await updateDoc(doc(db, "residents", loggedInUser.id), {
          sessionToken: null,
          isOnline: false,
          lastActive: serverTimestamp(),
        });
      } catch (e) {}
    }
    await signOut(auth);
    clearUserSession();
    loggedInUser = null;
    currentSessionToken = null;
    document.getElementById("login-form")?.reset();
    document.getElementById("register-form")?.reset();
    document.getElementById("login-panel")?.classList.remove("hidden");
    document.getElementById("register-panel")?.classList.add("hidden");
    document.getElementById("auth-screen")?.classList.remove("hidden");
    document.getElementById("dashboard")?.classList.add("hidden");
    hideNotificationBell();
    renderPublicEvents();
    closeMobileMenu();
    if (alertTimeout) clearTimeout(alertTimeout);
    if (participantsUnsubscribe) participantsUnsubscribe();
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    if (donationsUnsubscribe) donationsUnsubscribe();
    if (volunteersUnsubscribe) volunteersUnsubscribe();
    if (hoursUnsubscribe) hoursUnsubscribe();
    hideLoading();
    showLogoutBanner();
  });
};
function showLogoutBanner() {
  const eb = document.getElementById("logout-banner");
  if (eb) eb.remove();
  const b = document.createElement("div");
  b.id = "logout-banner";
  b.className =
    "fixed top-0 left-0 right-0 z-[300] transform -translate-y-full transition-transform duration-500 ease-in-out";
  b.innerHTML = `<div class="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-4 shadow-2xl"><div class="max-w-4xl mx-auto flex items-center justify-between"><div class="flex items-center space-x-3"><div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"><i class="fa-solid fa-circle-check text-white text-lg"></i></div><div><h3 class="font-extrabold text-sm">Successfully Logged Out</h3><p class="text-xs text-emerald-100 mt-0.5">You have been securely signed out.</p></div></div><button onclick="closeLogoutBanner()" class="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><i class="fa-solid fa-xmark text-sm"></i></button></div></div>`;
  document.body.appendChild(b);
  setTimeout(() => {
    b.classList.remove("-translate-y-full");
    b.classList.add("translate-y-0");
  }, 100);
  setTimeout(() => {
    closeLogoutBanner();
  }, 7000);
}
window.closeLogoutBanner = function () {
  const b = document.getElementById("logout-banner");
  if (b) {
    b.classList.add("-translate-y-full");
    b.classList.remove("translate-y-0");
    setTimeout(() => b.remove(), 500);
  }
};
document
  .getElementById("payment-modal-close")
  ?.addEventListener("click", function () {
    currentDonationData = null;
    selectedPaymentMethod = null;
    document.getElementById("payment-form")?.reset();
    document
      .querySelectorAll(".payment-method-btn")
      .forEach((b) => b.classList.remove("selected"));
    const qr = document.getElementById("qr-code-container");
    if (qr) qr.classList.add("hidden");
    window.toggleModal("payment-modal");
  });
document
  .getElementById("payment-modal")
  ?.addEventListener("click", function (e) {
    if (e.target === this) {
      currentDonationData = null;
      selectedPaymentMethod = null;
      document.getElementById("payment-form")?.reset();
      document
        .querySelectorAll(".payment-method-btn")
        .forEach((b) => b.classList.remove("selected"));
      this.classList.add("hidden");
      const qr = document.getElementById("qr-code-container");
      if (qr) qr.classList.add("hidden");
    }
  });

// ===== EXPORT GLOBALS =====
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showPage = window.showPage;
window.closePage = window.closePage;
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.openNotificationDetail = window.openNotificationDetail;
window.closeNotificationDetail = window.closeNotificationDetail;
window.clearAllNotifications = window.clearAllNotifications;
window.joinEvent = window.confirmJoinEvent;
window.confirmJoinEvent = window.confirmJoinEvent;
window.performJoinEvent = performJoinEvent;
window.unregisterFromEvent = window.unregisterFromEvent;
window.selectPaymentMethod = window.selectPaymentMethod;
window.setAmount = window.setAmount;
window.processPayment = window.processPayment;
window.openPaymentModal = window.openPaymentModal;
window.formatTimeDisplay = formatTimeDisplay;
window.triggerProfilePicUpload = window.triggerProfilePicUpload;
window.handleProfilePicChange = window.handleProfilePicChange;
window.removeProfilePic = window.removeProfilePic;
window.toggleEditMode = window.toggleEditMode;
window.cancelEdit = window.cancelEdit;
window.saveProfileChanges = window.saveProfileChanges;
window.openAnnouncementDetails = window.openAnnouncementDetails;
window.handleRegisterClick = window.handleRegisterClick;
window.handleUnregisterClick = window.handleUnregisterClick;
window.handleSkillVerificationUpload = window.handleSkillVerificationUpload;
window.removeSkillVerification = window.removeSkillVerification;
window.toggleNotificationDropdown = window.toggleNotificationDropdown;
window.toggleMoreNotifications = window.toggleMoreNotifications;
window.markNotificationAsRead = window.markNotificationAsRead;
window.markAllNotificationsAsRead = window.markAllNotificationsAsRead;
window.handleNotificationClick = window.handleNotificationClick;
window.toggleMobileNotificationDropdown = window.toggleMobileNotificationDropdown;
window.toggleMoreMobileNotifications = window.toggleMoreMobileNotifications;
