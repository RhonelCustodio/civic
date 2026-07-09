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

// ===== PAYMONGO CONFIGURATION =====
const PAYMONGO_CONFIG = {
  PUBLIC_KEY: "pk_test_pQCrR2WqLRBYuZh2BsCpSwAr",
  SECRET_KEY: "sk_test_PeX2V85sQ9oRUytQeE4aacSU",
  API_URL: "https://api.paymongo.com/v1",
};

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
let sessionCheckInterval = null,
  currentSessionToken = null;

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
  const now = new Date();
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000),
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
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${minutes} ${ampm}`;
  }
  return timeValue;
}

// ===== MOBILE MENU TOGGLE =====
window.toggleMobileMenu = function () {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("mobile-overlay");
  const body = document.body;
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

// ===== PAYMONGO API FUNCTIONS =====

/**
 * Create a PayMongo Payment Intent
 */
async function createPayMongoPaymentIntent(amount, description, paymentMethod, billingDetails = {}) {
  try {
    const amountInCentavos = Math.round(amount * 100);

    const paymentIntentData = {
      data: {
        attributes: {
          amount: amountInCentavos,
          currency: "PHP",
          payment_method_allowed: [paymentMethod],
          description: description || "Donation to Municipality of Victoria",
          statement_descriptor: "Victoria LGU",
          metadata: {
            donor_name: billingDetails.name || "Anonymous",
            purpose: description,
          },
        },
      },
    };

    const response = await fetch(`${PAYMONGO_CONFIG.API_URL}/payment_intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(PAYMONGO_CONFIG.SECRET_KEY + ":")}`,
      },
      body: JSON.stringify(paymentIntentData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors?.[0]?.detail || "Failed to create payment intent");
    }

    return data.data;
  } catch (error) {
    console.error("PayMongo payment intent error:", error);
    throw error;
  }
}

/**
 * Create a payment method for GCash
 */
async function createGCashPaymentMethod(billingDetails = {}) {
  try {
    const paymentMethodData = {
      data: {
        attributes: {
          type: "gcash",
          billing: {
            name: billingDetails.name || "Donor",
            email: billingDetails.email || "",
            phone: billingDetails.phone || "",
          },
        },
      },
    };

    const response = await fetch(`${PAYMONGO_CONFIG.API_URL}/payment_methods`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(PAYMONGO_CONFIG.SECRET_KEY + ":")}`,
      },
      body: JSON.stringify(paymentMethodData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors?.[0]?.detail || "Failed to create GCash payment method");
    }

    return data.data;
  } catch (error) {
    console.error("GCash payment method error:", error);
    throw error;
  }
}

/**
 * Create a payment method for PayMaya
 */
async function createPayMayaPaymentMethod(billingDetails = {}) {
  try {
    const paymentMethodData = {
      data: {
        attributes: {
          type: "paymaya",
          billing: {
            name: billingDetails.name || "Donor",
            email: billingDetails.email || "",
            phone: billingDetails.phone || "",
          },
        },
      },
    };

    const response = await fetch(`${PAYMONGO_CONFIG.API_URL}/payment_methods`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(PAYMONGO_CONFIG.SECRET_KEY + ":")}`,
      },
      body: JSON.stringify(paymentMethodData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors?.[0]?.detail || "Failed to create PayMaya payment method");
    }

    return data.data;
  } catch (error) {
    console.error("PayMaya payment method error:", error);
    throw error;
  }
}

/**
 * Attach payment method to payment intent
 */
async function attachPaymentMethodToIntent(paymentIntentId, paymentMethodId, returnUrl) {
  try {
    const response = await fetch(
      `${PAYMONGO_CONFIG.API_URL}/payment_intents/${paymentIntentId}/attach`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(PAYMONGO_CONFIG.SECRET_KEY + ":")}`,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: paymentMethodId,
              return_url: returnUrl || `${window.location.origin}/payment-success`,
            },
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors?.[0]?.detail || "Failed to attach payment method");
    }

    return data.data;
  } catch (error) {
    console.error("PayMongo attach payment method error:", error);
    throw error;
  }
}

/**
 * Check payment status
 */
async function checkPaymentStatus(paymentIntentId) {
  try {
    const response = await fetch(
      `${PAYMONGO_CONFIG.API_URL}/payment_intents/${paymentIntentId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${btoa(PAYMONGO_CONFIG.SECRET_KEY + ":")}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors?.[0]?.detail || "Failed to check payment status");
    }

    return data.data;
  } catch (error) {
    console.error("Payment status check error:", error);
    throw error;
  }
}

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

// ==========================================
// UPDATED PAYMONGO QR GENERATION CODE START
// ==========================================
async function generateQRCode(method) {
  const ph = document.getElementById("qr-code-placeholder");
  if (!ph) return;

  // Kunin ang amount dynamically galing sa input field (default to 150 kung walang laman)
  const amountInput = document.getElementById("donation-amount");
  let amountInCentavos = 15000;
  if (amountInput && amountInput.value) {
    const parsedAmount = parseFloat(amountInput.value);
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      amountInCentavos = Math.round(parsedAmount * 100);
    }
  }

  // 1. I-set ang loading state habang hinihintay ang sagot ng PayMongo
  ph.innerHTML = `
    <div class="text-center p-3">
      <i class="fa-solid fa-spinner fa-spin text-2xl text-gray-400 mb-2"></i>
      <p class="text-[10px] text-gray-500">Generating ${method.toUpperCase()} QR...</p>
    </div>`;

  try {
    const response = {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: 'Basic 4oCi4oCi4oCi4oCiOuKAouKAouKAouKAog=='
      },
      body: JSON.stringify({
        nation: 'ph',
        mode: 'p2p',
        type: 'dynamic',
        transaction_currency: 'PHP',
        expiry_seconds: 1800,
        qr_image: false,
        transaction_amount: 150000
      })
    };

    fetch('https://api.paymongo.com/v3/qr/mpm/generate', response)
      .then(res => res.json())
      .then(res => console.log(res))
      .catch(err => console.error(err));

    if (!response.ok) throw new Error("PayMongo API Request Failed");

    const data = await response.json();

    // 3. Kunin ang image data mula sa tamang structure ng response (data.data.qr_image)
    const qrImageString = data.data?.qr_image;

    if (!qrImageString) throw new Error("No QR image found in response");

    // 4. I-render ang <img> tag sa loob ng placeholder mo gamit ang Base64 string.
    const methodColor = method === "gcash" ? "text-blue-600" : "text-purple-600";

    ph.innerHTML = `
      <div class="text-center p-3">
        <img src="${qrImageString}" alt="${method} QR Code" class="mx-auto mb-2 border p-1 rounded shadow-sm w-32 h-32 object-contain bg-white" />
        <p class="text-[10px] font-bold ${methodColor}">${method.toUpperCase()} QR</p>
        <p class="text-[10px] text-gray-500">Scan to pay ₱${(amountInCentavos / 100).toFixed(2)}</p>
      </div>
    `;

  } catch (error) {
    console.error("Error generating QR:", error);
    ph.innerHTML = `
      <div class="text-center p-3">
        <i class="fa-solid fa-triangle-exclamation text-2xl text-red-500 mb-2"></i>
        <p class="text-[10px] font-bold text-red-500">Failed to generate QR</p>
      </div>
    `;
  }
}
// ==========================================
// UPDATED PAYMONGO QR GENERATION CODE END
// ==========================================

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
    donorEmail: loggedInUser.email || "",
    donorPhone: loggedInUser.phone || "",
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

/**
 * Save donation to Firestore
 */
async function saveDonation(donationData) {
  try {
    await addDoc(collection(db, "donations"), {
      donorName: donationData.donorName || "Anonymous",
      donorId: donationData.donorId || "",
      donorEmail: donationData.donorEmail || "",
      donorPhone: donationData.donorPhone || "",
      item: donationData.item || "Donation",
      purpose: donationData.purpose || "General",
      amount: donationData.amount || 0,
      paymentMethod: donationData.paymentMethod || "unknown",
      transactionId: donationData.transactionId,
      paymentIntentId: donationData.paymentIntentId || null,
      paymentStatus: donationData.status || STATUS.PENDING,
      paymentTimestamp: donationData.timestamp || new Date().toISOString(),
      status: STATUS.PENDING,
      createdAt: serverTimestamp(),
      metadata: donationData.metadata || {},
    });
  } catch (e) {
    console.error("Save donation error:", e);
    throw new Error("Failed to save donation: " + e.message);
  }
}

/**
 * Main payment processing function
 */
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
    let result;

    switch (pm) {
      case "gcash":
        result = await processGCashPayment(amount, currentDonationData);
        break;
      case "paymaya":
        result = await processPayMayaPayment(amount, currentDonationData);
        break;
      case "bank_transfer":
        result = await processBankTransfer(amount, currentDonationData);
        break;
      case "cash":
        result = await processCashPayment(amount, currentDonationData);
        break;
      default:
        throw new Error("Invalid payment method");
    }

    await saveDonation(result);
    window.toggleModal("payment-modal");
    document.getElementById("donation-form")?.reset();
    document.getElementById("payment-form")?.reset();
    currentDonationData = null;
    selectedPaymentMethod = null;
    hideLoading();

    if (result.status === STATUS.PENDING && (pm === "gcash" || pm === "paymaya")) {
      window.showAlert(
        "Payment Processing",
        `Please complete the payment in the opened window. Amount: ₱${amount.toLocaleString()}`,
        "success",
      );
    } else {
      window.showAlert(
        "Donation Submitted!",
        `Thank you for your donation of ₱${amount.toLocaleString()}! Your donation is pending confirmation.`,
        "success",
      );
    }
  } catch (e) {
    hideLoading();
    console.error("Payment processing error:", e);
    window.showAlert(
      "Payment Failed",
      e.message || "An error occurred during payment processing.",
      "error",
    );
  }
};

/**
 * Process GCash payment via PayMongo
 */
async function processGCashPayment(amount, donationData) {
  try {
    const description = `Donation: ${donationData.purpose} - ${donationData.donorName}`;

    // Create payment intent
    const paymentIntent = await createPayMongoPaymentIntent(
      amount,
      description,
      "gcash",
      {
        name: donationData.donorName,
        email: donationData.donorEmail,
        phone: donationData.donorPhone,
      }
    );

    // Create GCash payment method
    const paymentMethod = await createGCashPaymentMethod({
      name: donationData.donorName,
      email: donationData.donorEmail,
      phone: donationData.donorPhone,
    });

    // Attach payment method to intent
    const result = await attachPaymentMethodToIntent(
      paymentIntent.id,
      paymentMethod.id,
      `${window.location.origin}/payment-success`
    );

    // Check if redirect is needed
    if (result.attributes?.next_action?.type === "redirect") {
      const redirectUrl = result.attributes.next_action.redirect.url;
      window.open(redirectUrl, "_blank");
    }

    return {
      transactionId: paymentIntent.id,
      paymentIntentId: paymentIntent.id,
      method: "gcash",
      amount: amount,
      status: STATUS.PENDING,
      timestamp: new Date().toISOString(),
      donorName: donationData.donorName,
      donorId: donationData.donorId,
      donorEmail: donationData.donorEmail,
      donorPhone: donationData.donorPhone,
      item: donationData.item,
      purpose: donationData.purpose,
      paymentMethod: "gcash",
      metadata: {
        paymentIntentId: paymentIntent.id,
        paymentMethodId: paymentMethod.id,
      },
    };
  } catch (error) {
    console.error("GCash payment error:", error);
    // Fallback to manual processing if PayMongo fails
    return {
      transactionId: `GCASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      paymentIntentId: null,
      method: "gcash",
      amount: amount,
      status: STATUS.PENDING,
      timestamp: new Date().toISOString(),
      donorName: donationData.donorName,
      donorId: donationData.donorId,
      donorEmail: donationData.donorEmail,
      donorPhone: donationData.donorPhone,
      item: donationData.item,
      purpose: donationData.purpose,
      paymentMethod: "gcash",
      metadata: { fallback: true },
    };
  }
}

/**
 * Process PayMaya payment via PayMongo
 */
async function processPayMayaPayment(amount, donationData) {
  try {
    const description = `Donation: ${donationData.purpose} - ${donationData.donorName}`;

    const paymentIntent = await createPayMongoPaymentIntent(
      amount,
      description,
      "paymaya",
      {
        name: donationData.donorName,
        email: donationData.donorEmail,
        phone: donationData.donorPhone,
      }
    );

    const paymentMethod = await createPayMayaPaymentMethod({
      name: donationData.donorName,
      email: donationData.donorEmail,
      phone: donationData.donorPhone,
    });

    const result = await attachPaymentMethodToIntent(
      paymentIntent.id,
      paymentMethod.id,
      `${window.location.origin}/payment-success`
    );

    if (result.attributes?.next_action?.type === "redirect") {
      const redirectUrl = result.attributes.next_action.redirect.url;
      window.open(redirectUrl, "_blank");
    }

    return {
      transactionId: paymentIntent.id,
      paymentIntentId: paymentIntent.id,
      method: "paymaya",
      amount: amount,
      status: STATUS.PENDING,
      timestamp: new Date().toISOString(),
      donorName: donationData.donorName,
      donorId: donationData.donorId,
      donorEmail: donationData.donorEmail,
      donorPhone: donationData.donorPhone,
      item: donationData.item,
      purpose: donationData.purpose,
      paymentMethod: "paymaya",
      metadata: {
        paymentIntentId: paymentIntent.id,
        paymentMethodId: paymentMethod.id,
      },
    };
  } catch (error) {
    console.error("PayMaya payment error:", error);
    return {
      transactionId: `MAYA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      paymentIntentId: null,
      method: "paymaya",
      amount: amount,
      status: STATUS.PENDING,
      timestamp: new Date().toISOString(),
      donorName: donationData.donorName,
      donorId: donationData.donorId,
      donorEmail: donationData.donorEmail,
      donorPhone: donationData.donorPhone,
      item: donationData.item,
      purpose: donationData.purpose,
      paymentMethod: "paymaya",
      metadata: { fallback: true },
    };
  }
}

/**
 * Process bank transfer payment
 */
async function processBankTransfer(amount, donationData) {
  const reference = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Show bank details to user
  setTimeout(() => {
    window.showAlert(
      "Bank Transfer Instructions",
      `Please transfer ₱${amount.toFixed(2)} to:\n\nBank: Land Bank of the Philippines\nAccount: 1234-5678-9012\nAccount Name: Municipality of Victoria\nReference: ${reference}\n\nYour donation will be confirmed after verification.`,
      "success",
    );
  }, 1500);

  return {
    transactionId: reference,
    paymentIntentId: null,
    method: "bank_transfer",
    amount: amount,
    status: STATUS.PENDING,
    timestamp: new Date().toISOString(),
    donorName: donationData.donorName,
    donorId: donationData.donorId,
    donorEmail: donationData.donorEmail,
    donorPhone: donationData.donorPhone,
    item: donationData.item,
    purpose: donationData.purpose,
    paymentMethod: "bank_transfer",
    metadata: {
      bankName: "Land Bank of the Philippines",
      accountNumber: "1234-5678-9012",
      accountName: "Municipality of Victoria",
      reference: reference,
    },
  };
}

/**
 * Process cash payment
 */
async function processCashPayment(amount, donationData) {
  const reference = `CASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  setTimeout(() => {
    window.showAlert(
      "Cash Donation",
      `Please visit the Municipal Treasurer's Office to complete your cash donation of ₱${amount.toFixed(2)}.\n\nAddress: Municipal Hall, Victoria, Tarlac\nHours: 8:00 AM - 5:00 PM, Monday to Friday\nReference: ${reference}`,
      "success",
    );
  }, 1500);

  return {
    transactionId: reference,
    paymentIntentId: null,
    method: "cash",
    amount: amount,
    status: STATUS.PENDING,
    timestamp: new Date().toISOString(),
    donorName: donationData.donorName,
    donorId: donationData.donorId,
    donorEmail: donationData.donorEmail,
    donorPhone: donationData.donorPhone,
    item: donationData.item,
    purpose: donationData.purpose,
    paymentMethod: "cash",
    metadata: {
      officeAddress: "Municipal Hall, Victoria, Tarlac",
      officeHours: "8:00 AM - 5:00 PM, Monday to Friday",
      reference: reference,
    },
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
    const userData = userDoc.data();
    const storedToken = userData.sessionToken;
    if (storedToken && storedToken !== currentSessionToken) {
      const lastActive = userData.lastActive?.toDate
        ? userData.lastActive.toDate()
        : new Date(0);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (lastActive > fiveMinutesAgo) {
        window.showAlert(
          "Session Terminated",
          "This account is already logged in on another device. For security reasons, only one device can be active at a time.",
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
        } catch (e) {
          console.error("Error clearing session:", e);
        }
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
      const userData = userDoc.data();
      const storedToken = userData.sessionToken;
      if (storedToken && storedToken !== currentSessionToken) {
        clearInterval(sessionCheckInterval);
        window.showAlert(
          "Session Expired",
          "This account has been logged in from another device. You have been automatically logged out.",
          "error",
        );
        await signOut(auth);
        clearUserSession();
        loggedInUser = null;
        document.getElementById("auth-screen")?.classList.remove("hidden");
        document.getElementById("dashboard")?.classList.add("hidden");
        hideNotificationBell();
        document
          .querySelectorAll(".modal")
          .forEach((modal) => modal.classList.add("hidden"));
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
  } catch (e) { }
}
function clearUserSession() {
  try {
    localStorage.removeItem("barangayUser");
    sessionStorage.removeItem("userActiveTab");
    sessionStorage.removeItem("registeredEvents");
    sessionStorage.removeItem("completedEvents");
  } catch (e) { }
}
function saveActiveTab(t) {
  try {
    sessionStorage.setItem("userActiveTab", t);
  } catch (e) { }
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
  const ee = document.getElementById("prof-email");
  if (ee) {
    ee.disabled = true;
    ee.classList.add("bg-gray-100", "cursor-not-allowed");
  }
  const ge = document.getElementById("prof-gender");
  if (ge) {
    ge.disabled = true;
    ge.classList.add("bg-gray-100", "cursor-not-allowed");
  }
  const ne = document.getElementById("prof-name");
  if (ne) {
    ne.disabled = true;
    ne.classList.add("bg-gray-100", "cursor-not-allowed");
  }
  const ae = document.getElementById("prof-age");
  if (ae) {
    ae.disabled = true;
    ae.classList.add("bg-gray-100", "cursor-not-allowed");
  }
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
  } else {
    if (ib) ib.className = "p-1.5 rounded-lg text-white bg-rose-500";
    if (ic) ic.className = "fa-solid fa-circle-exclamation text-sm";
  }
  const at = document.getElementById("alert-title");
  if (at) at.innerText = title;
  const am = document.getElementById("alert-message");
  if (am) am.innerText = message;
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
  const ct = document.getElementById("confirm-title"),
    cm = document.getElementById("confirm-msg"),
    cmod = document.getElementById("confirm-modal");
  if (ct) ct.innerText = title;
  if (cm) cm.innerText = text;
  if (cmod) cmod.classList.remove("hidden");
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
    const q1 = query(
      collection(db, "participants"),
      where("residentId", "==", loggedInUser.id),
      where("status", "==", STATUS.REGISTERED),
    );
    const s1 = await getDocs(q1);
    registeredEventIds.clear();
    s1.forEach((d) => registeredEventIds.add(d.data().eventId));
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    const q2 = query(
      collection(db, "participants"),
      where("residentId", "==", loggedInUser.id),
      where("status", "==", STATUS.COMPLETED),
    );
    const s2 = await getDocs(q2);
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
  const q = query(
    collection(db, "participants"),
    where("residentId", "==", loggedInUser.id),
  );
  participantsUnsubscribe = onSnapshot(q, (snap) => {
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
  });
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
    const sessionValid = await enforceSingleSession(uc.user.uid);
    if (!sessionValid) {
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

// ===== INITIALIZE ALL REAL-TIME LISTENERS FOR USER DATA =====
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
      snap.forEach((d) => {
        donations.push({ id: d.id, ...d.data() });
      });
      donations.sort((a, b) => {
        const timeA = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const timeB = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return timeB - timeA;
      });
      let html = "";
      donations.forEach((data) => {
        let statusBadge = "";
        if (data.status === STATUS.APPROVED)
          statusBadge =
            '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Confirmed</span>';
        else if (data.status === STATUS.REJECTED)
          statusBadge =
            '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>';
        else
          statusBadge =
            '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.item || ""}</td><td class="px-3 py-2 text-xs">${data.purpose || ""}</td><td class="px-3 py-2 text-xs">${data.amount ? "₱" + parseFloat(data.amount).toLocaleString() : data.item || ""}</td><td class="px-3 py-2">${statusBadge}</td><td class="px-3 py-2 text-xs text-gray-400">${data.createdAt ? formatShortDate(data.createdAt) : "N/A"}</td></tr>`;
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
      snap.forEach((d) => {
        volunteers.push({ id: d.id, ...d.data() });
      });
      volunteers.sort((a, b) => {
        const timeA = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const timeB = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return timeB - timeA;
      });
      let html = "";
      volunteers.forEach((data) => {
        let statusBadge = "";
        if (data.status === STATUS.APPROVED)
          statusBadge =
            '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Approved</span>';
        else if (data.status === STATUS.REJECTED)
          statusBadge =
            '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>';
        else
          statusBadge =
            '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.skills || ""}</td><td class="px-3 py-2 text-xs">${data.availability || ""}</td><td class="px-3 py-2">${statusBadge}</td><td class="px-3 py-2 text-xs text-gray-400">${data.createdAt ? formatShortDate(data.createdAt) : "N/A"}</td></tr>`;
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
        const timeA = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const timeB = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return timeB - timeA;
      });
      updateNotificationBadge();
      renderNotificationDropdown();
      renderMobileNotificationDropdown();
    },
  );
}
function updateNotificationBadge() {
  const badge = document.getElementById("notification-count-badge");
  const mBadge = document.getElementById("mobile-notification-count-badge");
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
    unreadSpan = document.getElementById("dropdown-unread-count"),
    toggleBtn = document.getElementById("notification-toggle-more-btn"),
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
  const notificationsToShow = showingAllNotifications
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
  notificationsToShow.forEach((notif) => {
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
    }
    const isUnread = !notif.read;
    const timeDisplay = notif.createdAt
      ? formatRelativeTime(notif.createdAt)
      : "Just now";
    html += `<div onclick="window.handleNotificationClick('${notif.id}', '${notif.type || "default"}')" class="p-4 hover:bg-gray-100 cursor-pointer transition-all duration-200 ${isUnread ? "bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-gray-50"} border-b border-gray-100 last:border-b-0 group"><div class="flex items-start space-x-3"><div class="w-10 h-10 ${iconBg} rounded-full flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform"><i class="fa-solid ${icon} text-sm"></i></div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-gray-800 truncate group-hover:text-tsu-blue transition-colors">${notif.title || "Notification"}</p>${isUnread ? '<div class="w-2.5 h-2.5 bg-blue-500 rounded-full shrink-0 animate-pulse"></div>' : ""}</div><p class="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">${notif.message || ""}</p><div class="flex items-center justify-between mt-2"><p class="text-[10px] text-gray-400 flex items-center"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</p><span class="text-[10px] text-tsu-blue font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center">Tap to view <i class="fa-solid fa-arrow-right ml-0.5 text-[9px]"></i></span></div></div></div></div>`;
  });
  container.innerHTML = html;
}
window.toggleMoreNotifications = function () {
  showingAllNotifications = !showingAllNotifications;
  renderNotificationDropdown();
};
window.toggleNotificationDropdown = function () {
  const dropdown = document.getElementById("notification-dropdown");
  const bellBtn = document.getElementById("notification-bell-btn");
  if (!dropdown || !bellBtn) return;
  if (dropdown.classList.contains("hidden")) {
    const rect = bellBtn.getBoundingClientRect();
    const dropdownWidth = 320;
    const viewportWidth = window.innerWidth;

    let leftPosition = rect.right + 15;
    if (leftPosition + dropdownWidth > viewportWidth) {
      leftPosition = viewportWidth - dropdownWidth - 10;
    }

    let topPosition = rect.bottom + 8;
    dropdown.style.position = "fixed";
    dropdown.style.top = topPosition + "px";
    dropdown.style.left = leftPosition + "px";
    dropdown.style.right = "auto";
    dropdown.style.bottom = "auto";
    dropdown.style.transform = "none";
    dropdown.style.width = dropdownWidth + "px";

    showingAllNotifications = false;
    renderNotificationDropdown();
    dropdown.classList.remove("hidden");
    setTimeout(() => {
      document.addEventListener("click", closeNotificationOnClickOutside);
    }, 100);
  } else {
    closeNotificationDropdown();
  }
};
function closeNotificationDropdown() {
  const dropdown = document.getElementById("notification-dropdown");
  if (dropdown) {
    dropdown.classList.add("hidden");
    showingAllNotifications = false;
  }
  document.removeEventListener("click", closeNotificationOnClickOutside);
}
function closeNotificationOnClickOutside(e) {
  const dropdown = document.getElementById("notification-dropdown");
  const bellBtn = document.getElementById("notification-bell-btn");
  if (
    dropdown &&
    !dropdown.classList.contains("hidden") &&
    !dropdown.contains(e.target) &&
    bellBtn &&
    !bellBtn.contains(e.target)
  ) {
    closeNotificationDropdown();
  }
}
window.handleNotificationClick = async function (notifId, type) {
  await window.markNotificationAsRead(notifId);
  closeNotificationDropdown();
  closeMobileNotificationDropdown();
  switch (type) {
    case "volunteer_approved":
    case "volunteer_rejected":
      window.switchTab("volunteers");
      break;
    case "donation_confirmed":
    case "donation_rejected":
      window.switchTab("donations");
      break;
    case "hours_credited":
      window.switchTab("hours");
      break;
    default:
      window.switchTab("notifications");
      break;
  }
  const notif = allNotifications.find((n) => n.id === notifId);
  if (notif)
    setTimeout(() => {
      window.showAlert(
        notif.title || "Notification",
        notif.message || "",
        "success",
      );
    }, 500);
};
window.markNotificationAsRead = async function (notifId) {
  try {
    await updateDoc(doc(db, "notifications", notifId), { read: true });
  } catch (e) {
    console.error("Error marking notification as read:", e);
  }
};
window.markAllNotificationsAsRead = async function () {
  if (!loggedInUser?.id) return;
  window.showLoading();
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
    window.hideLoading();
    window.showAlert("Success", "All notifications marked as read.", "success");
  } catch (e) {
    window.hideLoading();
    console.error("Error marking all as read:", e);
  }
};

let mobileShowingAllNotifications = false;
window.toggleMobileNotificationDropdown = function () {
  const dropdown = document.getElementById("mobile-notification-dropdown");
  const bellBtn = document.getElementById("mobile-notification-bell-btn");
  const desktopDropdown = document.getElementById("notification-dropdown");
  if (!dropdown || !bellBtn) return;
  if (desktopDropdown && !desktopDropdown.classList.contains("hidden")) {
    desktopDropdown.classList.add("hidden");
    showingAllNotifications = false;
  }
  if (dropdown.classList.contains("hidden")) {
    mobileShowingAllNotifications = false;
    renderMobileNotificationDropdown();
    dropdown.classList.remove("hidden");
    setTimeout(() => {
      document.addEventListener("click", closeMobileNotificationOnClickOutside);
    }, 100);
  } else {
    closeMobileNotificationDropdown();
  }
};
function closeMobileNotificationDropdown() {
  const dropdown = document.getElementById("mobile-notification-dropdown");
  if (dropdown) {
    dropdown.classList.add("hidden");
    mobileShowingAllNotifications = false;
  }
  document.removeEventListener("click", closeMobileNotificationOnClickOutside);
}
function closeMobileNotificationOnClickOutside(e) {
  const dropdown = document.getElementById("mobile-notification-dropdown");
  const bellBtn = document.getElementById("mobile-notification-bell-btn");
  if (
    dropdown &&
    !dropdown.classList.contains("hidden") &&
    !dropdown.contains(e.target) &&
    bellBtn &&
    !bellBtn.contains(e.target)
  ) {
    closeMobileNotificationDropdown();
  }
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
  const notificationsToShow = mobileShowingAllNotifications
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
  notificationsToShow.forEach((notif) => {
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
    }
    const isUnread = !notif.read;
    const timeDisplay = notif.createdAt
      ? formatRelativeTime(notif.createdAt)
      : "Just now";
    html += `<div onclick="window.handleNotificationClick('${notif.id}', '${notif.type || "default"}'); closeMobileNotificationDropdown();" class="p-4 hover:bg-gray-100 cursor-pointer transition-all duration-200 ${isUnread ? "bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-gray-50"} border-b border-gray-100 last:border-b-0"><div class="flex items-start space-x-3"><div class="w-9 h-9 ${iconBg} rounded-full flex items-center justify-center shrink-0 shadow-sm"><i class="fa-solid ${icon} text-xs"></i></div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><p class="text-xs font-semibold text-gray-800 truncate">${notif.title || "Notification"}</p>${isUnread ? '<div class="w-2 h-2 bg-blue-500 rounded-full shrink-0"></div>' : ""}</div><p class="text-[11px] text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">${notif.message || ""}</p><p class="text-[9px] text-gray-400 mt-1.5 flex items-center"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</p></div></div></div>`;
  });
  container.innerHTML = html;
}
window.toggleMoreMobileNotifications = function () {
  mobileShowingAllNotifications = !mobileShowingAllNotifications;
  renderMobileNotificationDropdown();
};

// ===== DISABLE/ENABLE PROFILE FIELDS =====
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
  const ge = document.getElementById("prof-gender");
  if (ge) {
    ge.disabled = true;
    ge.classList.add("bg-gray-100", "cursor-not-allowed");
  }
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
  const rb = document.getElementById("remove-profile-pic-btn");
  if (rb) rb.classList.add("hidden");
  const pi = document.getElementById("profile-pic-pending");
  if (pi) pi.classList.add("hidden");
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
  const hasPic = loggedInUser?.profilePic && loggedInUser.profilePic !== "";
  const hasPend = selectedProfilePicFile instanceof File;
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

// ===== TOGGLE EDIT MODE =====
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
      const cb = document.getElementById("cancel-edit-btn");
      if (cb) cb.classList.remove("hidden");
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
    const pi = document.getElementById("profile-pic-pending");
    if (pi) pi.classList.add("hidden");
    const fi = document.getElementById("profile-pic-input");
    if (fi) fi.value = "";
    if (loggedInUser) updateUIWithUserData(loggedInUser);
    disableAllProfileFields();

    const cb = document.getElementById("cancel-edit-btn");
    if (cb) cb.classList.add("hidden");
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

// ===== PROFILE MANAGEMENT =====
const profileForm = document.getElementById("profile-form");
if (profileForm) {
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ab = document.getElementById("profile-action-btn");
    if (!ab || ab.getAttribute("data-mode") !== "save") return;
    if (isSaving || !loggedInUser?.id) return;

    const phone = document.getElementById("prof-phone")?.value.trim() || "";
    const address = document.getElementById("prof-address")?.value.trim() || "";
    const pi = document.getElementById("prof-password");
    const password = pi && pi.value.trim() !== "" ? pi.value.trim() : loggedInUser.password;

    const hasNonPwdChanges = phone !== (loggedInUser.phone || "") || address !== (loggedInUser.address || "");
    const hasPwdChange = password !== (loggedInUser.password || "");
    const hasInfoChanges = hasNonPwdChanges || hasPwdChange;
    const hasPicChange = selectedProfilePicFile !== undefined;
    const isNewPic = selectedProfilePicFile instanceof File;
    const isRemoving = selectedProfilePicFile === null;

    if (!hasInfoChanges && !hasPicChange) {
      window.showAlert("No Changes", "Nothing to save.", "error");
      return;
    }

    if (hasNonPwdChanges) {
      if (phone && !/^09\d{9}$/.test(phone)) {
        window.showAlert("Error", "Invalid phone.", "error");
        return;
      }
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
      if (hasPicChange) {
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
      if (hasInfoChanges) {
        if (hasPwdChange && auth.currentUser)
          await updatePassword(auth.currentUser, password);
        if (hasNonPwdChanges) {
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

      const cb = document.getElementById("cancel-edit-btn");
      if (cb) cb.classList.add("hidden");
      let msg = hasNonPwdChanges ? "Profile updated" : "";
      if (hasPwdChange) msg += (msg ? " & " : "") + "password changed";
      if (isNewPic) msg += (msg ? " & " : "") + "picture updated";
      if (isRemoving) msg += (msg ? " & " : "") + "picture removed";

      window.showAlert("Success!", msg + "! Fields locked.", "success");
      document.getElementById('prof-password').type = 'password';
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

// ===== PASSWORD TOGGLE =====
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
    const container = document.getElementById("announcements-container");
    const publicContainer = document.getElementById(
      "public-announcements-container",
    );
    if (snap.empty) {
      const emptyHtml =
        '<div class="text-center py-16 bg-white rounded-xl border shadow-sm"><div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-bullhorn text-2xl text-gray-300"></i></div><p class="text-base text-gray-400">No announcements yet.</p></div>';
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
      const relativeTime = a.createdAt
        ? formatRelativeTime(a.createdAt)
        : "Recently";
      const exactTime = a.createdAt
        ? formatFullDateTime(a.createdAt)
        : "Recently";
      const escT = (a.title || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const escD = (a.desc || "")
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, "\\n");
      const escP = (a.priority || "Notice").replace(/'/g, "\\'");
      const escDt = exactTime.replace(/'/g, "\\'");
      html += `<div onclick="openAnnouncementDetails('${annId}','${escT}','${escD}','${escP}','${escDt}')" class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden group"><div class="p-5 sm:p-6"><div class="flex items-center justify-between mb-3"><div class="flex items-center space-x-3"><div class="w-10 h-10 bg-gradient-to-br from-tsu-blue to-tsu-dark rounded-xl flex items-center justify-center shadow-sm shrink-0"><i class="fa-solid fa-building-columns text-tsu-gold text-sm"></i></div><div class="min-w-0"><h4 class="font-bold text-sm text-gray-900">Municipality of Victoria</h4><div class="flex items-center space-x-2 mt-1"><span class="text-[11px] text-gray-400" title="${exactTime}"><i class="fa-solid fa-clock mr-1"></i>${relativeTime}</span><span class="text-[11px] px-2 py-0.5 rounded-full font-bold ${badgeClass}"><i class="fa-solid ${badgeIcon} mr-1 text-[10px]"></i>${a.priority || "Notice"}</span></div></div></div></div><h3 class="text-base sm:text-lg font-extrabold text-gray-900 group-hover:text-tsu-blue transition-colors line-clamp-2 leading-snug mb-2">${a.title || "Untitled"}</h3><p class="text-sm text-gray-500 mt-2 line-clamp-3 leading-relaxed">${a.desc || ""}</p>${a.createdBy ? `<p class="text-xs text-gray-400 mt-3 flex items-center">` : ""}</div><div class="px-5 sm:px-6 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between"><span class="text-[11px] text-gray-400"><i class="fa-solid fa-eye mr-1"></i>Tap to view</span></div></div>`;
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

// ===== EVENT CLICK HANDLERS =====
window.handleRegisterClick = function (
  event,
  eventId,
  eventTitle,
  eventDate,
  eventTime,
  eventLocation,
) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  window.confirmJoinEvent(
    eventId,
    eventTitle,
    eventDate,
    eventTime,
    eventLocation,
  );
  return false;
};
window.handleUnregisterClick = function (event, eventId, eventTitle) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  window.unregisterFromEvent(eventId, eventTitle);
  return false;
};
window.promptLoginForEvent = function () {
  window.showAlert(
    "Authentication Required",
    "Please log in or create an account to join community events.",
    "error",
  );
};

// ===== EVENTS RENDERER =====
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
        const dateDisplay = ev.date || "TBA",
          timeDisplay = ev.time ? formatTimeDisplay(ev.time) : "";
        const hasImage = ev.imageUrl && ev.imageUrl !== "";
        let typeIcon, placeholderGradient;
        switch (ev.type) {
          case "Seminar":
            typeIcon = "fa-chalkboard-user";
            placeholderGradient = "from-[#800000] to-[#A52A2A]";
            break;
          case "Workshop":
            typeIcon = "fa-toolbox";
            placeholderGradient = "from-[#A52A2A] to-[#8B0000]";
            break;
          case "Meeting":
            typeIcon = "fa-users";
            placeholderGradient = "from-[#B8960C] to-[#8B6914]";
            break;
          case "Sports":
            typeIcon = "fa-futbol";
            placeholderGradient = "from-[#0D3B5C] to-[#0A2947]";
            break;
          case "Health":
            typeIcon = "fa-heart-pulse";
            placeholderGradient = "from-[#8B0000] to-[#600000]";
            break;
          case "Training":
            typeIcon = "fa-graduation-cap";
            placeholderGradient = "from-[#1A5276] to-[#0A2947]";
            break;
          case "Celebration":
            typeIcon = "fa-cake-candles";
            placeholderGradient = "from-[#FFD700] to-[#B8960C]";
            break;
          case "Outreach":
            typeIcon = "fa-hand-holding-heart";
            placeholderGradient = "from-[#0A2947] to-[#1A5276]";
            break;
          case "Environmental":
            typeIcon = "fa-leaf";
            placeholderGradient = "from-[#2B0000] to-[#0A2947]";
            break;
          case "Cultural":
            typeIcon = "fa-masks-theater";
            placeholderGradient = "from-[#FFD700] to-[#CCAC00]";
            break;
          case "Fundraising":
            typeIcon = "fa-sack-dollar";
            placeholderGradient = "from-[#A52A2A] to-[#800000]";
            break;
          default:
            typeIcon = "fa-calendar-check";
            placeholderGradient = "from-[#0A2947] to-[#1A5276]";
        }
        const imageSection = hasImage
          ? `<div class="relative h-40 overflow-hidden"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${typeIcon} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-40 bg-gradient-to-br ${placeholderGradient} flex items-center justify-center overflow-hidden"><i class="fa-solid ${typeIcon} text-white/30 text-6xl pointer-events-none"></i><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${typeIcon} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;
        let actionBtn = "";
        if (isComp)
          actionBtn =
            '<span class="inline-flex items-center space-x-1.5 text-xs font-medium text-[#0A2947] bg-[#E8F0FE] px-3 py-1.5 rounded-lg border border-[#1A5276]/20 w-full justify-center pointer-events-none"><i class="fa-solid fa-circle-check text-xs"></i><span>Completed</span></span>';
        else if (isReg)
          actionBtn = `<button type="button" onclick="handleUnregisterClick(event, '${id}','${esc(ev.title)}')" class="text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-all border border-red-200 w-full relative z-10"><i class="fa-solid fa-calendar-minus mr-1.5"></i>Cancel Registration</button>`;
        else
          actionBtn = `<button type="button" onclick="handleRegisterClick(event, '${id}','${esc(ev.title)}','${dateDisplay}','${timeDisplay}','${esc(ev.location)}')" class="text-xs font-semibold text-[#0A2947] bg-white border border-[#0A2947] hover:bg-[#E8F0FE] px-4 py-2 rounded-lg transition-all shadow-sm flex items-center justify-center space-x-1.5 w-full relative z-10"><i class="fa-solid fa-calendar-plus text-[#0A2947]"></i><span>Register / Join</span></button>`;
        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${dateDisplay}','${timeDisplay}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${imageSection}<div class="p-4 pb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#800000] transition-colors line-clamp-2 leading-snug mb-2">${ev.title || "Untitled Event"}</h3><div class="space-y-2"><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-calendar text-[#B8960C] w-4 text-center"></i><span class="font-medium text-gray-700">${dateDisplay}</span>${timeDisplay ? `<span class="text-gray-400">| ${timeDisplay}</span>` : ""}</div><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-location-dot text-[#B8960C] w-4 text-center"></i><span class="font-medium text-gray-700 truncate">${ev.location || "TBA"}</span></div></div>${ev.createdAt ? `<p class="text-[9px] text-gray-400 mt-2 flex items-center"><i class="fa-solid fa-clock mr-1"></i>Posted ${formatRelativeTime(ev.createdAt)}</p>` : ""}</div></div><div class="px-4 pb-4 pt-3 border-t border-gray-100 mt-auto">${actionBtn}</div></div>`;
      });
      grid.innerHTML = html;
    },
  );
}

function renderPublicEvents() {
  const publicGrid = document.getElementById("public-events-grid");
  if (!publicGrid) return;
  getDocs(query(collection(db, "events"), orderBy("date", "asc"))).then(
    (snap) => {
      if (snap.empty) {
        publicGrid.innerHTML =
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
        const dateDisplay = ev.date || "TBA",
          timeDisplay = ev.time ? formatTimeDisplay(ev.time) : "";
        const actionBtn = `<button type="button" onclick="promptLoginForEvent()" class="text-xs font-semibold text-[#0A2947] bg-white border border-[#0A2947] hover:bg-[#E8F0FE] px-4 py-2 rounded-lg transition-all shadow-sm flex items-center justify-center space-x-1.5 w-full relative z-10"><i class="fa-solid fa-calendar-plus text-[#0A2947]"></i><span>Register / Join</span></button>`;

        let typeIcon, placeholderGradient;
        switch (ev.type) {
          case "Seminar": typeIcon = "fa-chalkboard-user"; placeholderGradient = "from-[#800000] to-[#A52A2A]"; break;
          case "Workshop": typeIcon = "fa-toolbox"; placeholderGradient = "from-[#A52A2A] to-[#8B0000]"; break;
          case "Meeting": typeIcon = "fa-users"; placeholderGradient = "from-[#B8960C] to-[#8B6914]"; break;
          case "Sports": typeIcon = "fa-futbol"; placeholderGradient = "from-[#0D3B5C] to-[#0A2947]"; break;
          case "Health": typeIcon = "fa-heart-pulse"; placeholderGradient = "from-[#8B0000] to-[#600000]"; break;
          case "Training": typeIcon = "fa-graduation-cap"; placeholderGradient = "from-[#1A5276] to-[#0A2947]"; break;
          case "Celebration": typeIcon = "fa-cake-candles"; placeholderGradient = "from-[#FFD700] to-[#B8960C]"; break;
          case "Outreach": typeIcon = "fa-hand-holding-heart"; placeholderGradient = "from-[#0A2947] to-[#1A5276]"; break;
          case "Environmental": typeIcon = "fa-leaf"; placeholderGradient = "from-[#2B0000] to-[#0A2947]"; break;
          case "Cultural": typeIcon = "fa-masks-theater"; placeholderGradient = "from-[#FFD700] to-[#CCAC00]"; break;
          case "Fundraising": typeIcon = "fa-sack-dollar"; placeholderGradient = "from-[#A52A2A] to-[#800000]"; break;
          default: typeIcon = "fa-calendar-check"; placeholderGradient = "from-[#0A2947] to-[#1A5276]";
        }

        const hasImage = ev.imageUrl && ev.imageUrl !== "";
        const imageSection = hasImage
          ? `<div class="relative h-40 overflow-hidden"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${typeIcon} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-40 bg-gradient-to-br ${placeholderGradient} flex items-center justify-center overflow-hidden"><i class="fa-solid ${typeIcon} text-white/30 text-5xl pointer-events-none"></i><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${typeIcon} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;

        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${dateDisplay}','${timeDisplay}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${imageSection}<div class="p-4 pb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#800000] transition-colors line-clamp-2 leading-snug mb-2">${ev.title || "Untitled Event"}</h3><div class="space-y-2"><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-calendar text-[#B8960C] w-4 text-center"></i><span class="font-medium text-gray-700">${dateDisplay}</span>${timeDisplay ? `<span class="text-gray-400">| ${timeDisplay}</span>` : ""}</div></div></div></div><div class="px-4 pb-4 pt-3 border-t border-gray-100 mt-auto">${actionBtn}</div></div>`;
      });
      publicGrid.innerHTML = html;
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
        const statusBadge = isComp
          ? '<span class="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 pointer-events-none"><i class="fa-solid fa-circle-check text-[9px]"></i>Completed</span>'
          : '<span class="inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 pointer-events-none"><i class="fa-solid fa-clock text-[9px]"></i>Registered</span>';
        const cancelBtn = !isComp
          ? `<button type="button" onclick="handleUnregisterClick(event, '${id}','${esc(ev.title)}')" class="text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-all border border-red-200 w-full mt-2 relative z-10"><i class="fa-solid fa-calendar-minus mr-1.5"></i>Cancel Registration</button>`
          : "";

        let typeIcon, placeholderGradient;
        switch (ev.type) {
          case "Seminar": typeIcon = "fa-chalkboard-user"; placeholderGradient = "from-[#800000] to-[#A52A2A]"; break;
          case "Workshop": typeIcon = "fa-toolbox"; placeholderGradient = "from-[#A52A2A] to-[#8B0000]"; break;
          case "Meeting": typeIcon = "fa-users"; placeholderGradient = "from-[#B8960C] to-[#8B6914]"; break;
          case "Sports": typeIcon = "fa-futbol"; placeholderGradient = "from-[#0D3B5C] to-[#0A2947]"; break;
          case "Health": typeIcon = "fa-heart-pulse"; placeholderGradient = "from-[#8B0000] to-[#600000]"; break;
          case "Training": typeIcon = "fa-graduation-cap"; placeholderGradient = "from-[#1A5276] to-[#0A2947]"; break;
          case "Celebration": typeIcon = "fa-cake-candles"; placeholderGradient = "from-[#FFD700] to-[#B8960C]"; break;
          case "Outreach": typeIcon = "fa-hand-holding-heart"; placeholderGradient = "from-[#0A2947] to-[#1A5276]"; break;
          case "Environmental": typeIcon = "fa-leaf"; placeholderGradient = "from-[#2B0000] to-[#0A2947]"; break;
          case "Cultural": typeIcon = "fa-masks-theater"; placeholderGradient = "from-[#FFD700] to-[#CCAC00]"; break;
          case "Fundraising": typeIcon = "fa-sack-dollar"; placeholderGradient = "from-[#A52A2A] to-[#800000]"; break;
          default: typeIcon = "fa-calendar-check"; placeholderGradient = "from-[#0A2947] to-[#1A5276]";
        }

        const hasImage = ev.imageUrl && ev.imageUrl !== "";
        const imageSection = hasImage
          ? `<div class="relative h-40 overflow-hidden rounded-t-xl"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${typeIcon} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-40 bg-gradient-to-br ${placeholderGradient} flex items-center justify-center overflow-hidden rounded-t-xl"><i class="fa-solid ${typeIcon} text-white/30 text-5xl pointer-events-none"></i><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${typeIcon} text-[#FFD700] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;

        const dateDisplay = ev.date || "TBA";
        const timeDisplay = ev.time ? formatTimeDisplay(ev.time) : "";

        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col group">
          <div onclick="openEventDetails('${esc(ev.title)}','${dateDisplay}','${timeDisplay}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer">
            ${imageSection}
            <div class="p-4 pb-2">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold text-gray-900 line-clamp-1 flex-1 mr-2 group-hover:text-[#800000] transition-colors">${ev.title || "Untitled Event"}</h3>
                ${statusBadge}
              </div>
              <div class="space-y-1.5">
                <div class="flex items-center space-x-1.5 text-xs text-gray-500">
                  <i class="fa-solid fa-calendar text-[#B8960C] w-4 text-center"></i>
                  <span class="font-medium text-gray-700">${dateDisplay}</span>
                  ${timeDisplay ? `<span class="text-gray-400">| ${timeDisplay}</span>` : ""}
                </div>
                <div class="flex items-center space-x-1.5 text-xs text-gray-500">
                  <i class="fa-solid fa-location-dot text-[#B8960C] w-4 text-center"></i>
                  <span class="font-medium text-gray-700 truncate">${ev.location || "TBA"}</span>
                </div>
              </div>
            </div>
          </div>
          ${cancelBtn ? `<div class="px-4 pb-4 pt-1 border-t border-gray-100">${cancelBtn}</div>` : `<div class="px-4 pb-4 pt-2"></div>`}
        </div>`;
      });
      grid.innerHTML = found
        ? html
        : '<div class="col-span-full text-center py-16 bg-white rounded-xl border shadow-sm"><p class="text-base text-gray-400">No active records.</p></div>';
    },
  );
}

// ===== EVENT OPERATIONS =====
window.confirmJoinEvent = function (
  eventId,
  eventTitle,
  eventDate,
  eventTime,
  eventLocation,
) {
  if (!loggedInUser) {
    window.showAlert("Error", "Please login.", "error");
    return;
  }
  if (registeredEventIds.has(eventId) || completedEventIds.has(eventId)) {
    window.showAlert("Already Registered", "", "error");
    return;
  }
  let msg = `Join: "${eventTitle}"?`;
  if (eventDate) msg += `\nDate: ${eventDate}`;
  if (eventTime) msg += `\nTime: ${eventTime}`;
  if (eventLocation) msg += `\nLocation: ${eventLocation}`;
  window.showConfirmPopup("Join Event?", msg, async () => {
    await performJoinEvent(eventId, eventTitle);
  });
};
async function performJoinEvent(eventId, eventTitle) {
  showLoading("Joining...");
  try {
    const snap = await getDocs(
      query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("eventId", "==", eventId),
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
      eventTitle,
      eventId,
      timestamp: serverTimestamp(),
      status: STATUS.REGISTERED,
    });
    registeredEventIds.add(eventId);
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    renderEvents();
    renderMyEvents();
    hideLoading();
    window.showAlert("Success!", `Registered for "${eventTitle}".`, "success");
  } catch (e) {
    hideLoading();
    window.showAlert("Error", "Failed to register.", "error");
  }
}
window.unregisterFromEvent = function (eventId, eventTitle) {
  if (!loggedInUser) return;
  window.showConfirmPopup(
    "Cancel?",
    `Unregister from "${eventTitle}"?`,
    async () => {
      showLoading("Cancelling...");
      try {
        const snap = await getDocs(
          query(
            collection(db, "participants"),
            where("residentId", "==", loggedInUser.id),
            where("eventId", "==", eventId),
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
        registeredEventIds.delete(eventId);
        sessionStorage.setItem(
          "registeredEvents",
          JSON.stringify([...registeredEventIds]),
        );
        renderEvents();
        renderMyEvents();
        hideLoading();
        window.showAlert("Cancelled", `Unregistered.`, "success");
      } catch (e) {
        hideLoading();
        window.showAlert("Error", "Failed.", "error");
      }
    },
  );
};
eventsUnsubscribe = onSnapshot(
  query(collection(db, "events"), orderBy("date", "asc")),
  () => {
    renderEvents();
    renderPublicEvents();
  },
);

// ===== DONATIONS, HOURS, VOLUNTEERS =====
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
onSnapshot(
  query(collection(db, "service_hours"), orderBy("hours", "desc")),
  (snap) => {
    const tbody = document.getElementById("public-hours-tbody");
    if (!tbody) return;
    let html = "",
      rank = 1;
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === STATUS.APPROVED) {
        let medal =
          rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${rank}</td><td class="px-3 py-2 font-bold text-xs">${medal} ${data.residentName || "Volunteer"}</td><td class="px-3 py-2 text-xs">${data.hours || 0} hrs</td></tr>`;
        rank++;
      }
    });
    tbody.innerHTML =
      html ||
      '<tr><td colspan="3" class="text-center py-4 text-xs text-gray-400">No volunteers listed.</td></tr>';
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
        let statusBadge =
          data.status === STATUS.APPROVED
            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Approved</span>'
            : data.status === STATUS.REJECTED
              ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>'
              : '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.eventTitle || "Community Service"}</td><td class="px-3 py-2 text-xs font-bold">${data.hours || 0} hrs</td><td class="px-10 py-2">${statusBadge}</td></tr>`;
      });
      tbody.innerHTML =
        html ||
        '<tr><td colspan="3" class="text-center py-4 text-xs text-gray-400">No hours recorded yet.</td></tr>';
      display.innerText = `${total} Hours`;
    },
  );
}
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
      window.showAlert("Error", "Please select your primary skill.", "error");
      return;
    }
    if (!availability) {
      window.showAlert("Error", "Please select your availability.", "error");
      return;
    }
    if (!selectedSkillVerificationFile) {
      window.showAlert(
        "Error",
        "Please upload a certificate or proof of your skill.",
        "error",
      );
      return;
    }
    showLoading("Submitting application...");
    try {
      let verificationData = null;
      if (selectedSkillVerificationFile)
        verificationData = await convertFileToBase64(
          selectedSkillVerificationFile,
        );
      await addDoc(collection(db, "volunteers"), {
        residentId: loggedInUser.id,
        name: loggedInUser.name,
        email: loggedInUser.email,
        skills,
        experience,
        verificationFile: verificationData
          ? {
            fileName: selectedSkillVerificationFile.name,
            fileType: selectedSkillVerificationFile.type,
            fileSize: selectedSkillVerificationFile.size,
            data: verificationData,
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
      window.showAlert("Error", "Failed to submit application.", "error");
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
    window.showAlert("Error", "File size must be less than 5MB.", "error");
    event.target.value = "";
    return;
  }
  selectedSkillVerificationFile = file;
  const placeholder = document.getElementById("skill-upload-placeholder"),
    preview = document.getElementById("skill-upload-preview"),
    fileName = document.getElementById("skill-file-name"),
    fileSize = document.getElementById("skill-file-size"),
    dropzone = document.getElementById("skill-verification-dropzone");
  if (placeholder) placeholder.classList.add("hidden");
  if (preview) preview.classList.remove("hidden");
  if (fileName) fileName.textContent = file.name;
  if (fileSize) {
    const sizeKB = (file.size / 1024).toFixed(1),
      sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    fileSize.textContent =
      file.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
  }
  if (dropzone) {
    dropzone.classList.add("border-emerald-500", "bg-emerald-50");
    dropzone.classList.remove("border-gray-300");
  }
};
window.removeSkillVerification = function () {
  selectedSkillVerificationFile = null;
  const input = document.getElementById("skill-verification-input"),
    placeholder = document.getElementById("skill-upload-placeholder"),
    preview = document.getElementById("skill-upload-preview"),
    dropzone = document.getElementById("skill-verification-dropzone");
  if (input) input.value = "";
  if (placeholder) placeholder.classList.remove("hidden");
  if (preview) preview.classList.add("hidden");
  if (dropzone) {
    dropzone.classList.remove("border-emerald-500", "bg-emerald-50");
    dropzone.classList.add("border-gray-300");
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
        const cb = document.getElementById("cancel-edit-btn");
        if (cb) cb.classList.add("hidden");
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

// ===== PRIVACY POLICY LOADING =====
function handlePrivacyPolicyClick(event) {
  event.preventDefault();
  const overlay = document.getElementById('page-loading-overlay');
  const href = event.currentTarget.getAttribute('href');
  overlay.classList.add('active');
  const minLoadTime = 2000;
  const startTime = Date.now();
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
  function navigateToPrivacy() {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minLoadTime - elapsed);
    setTimeout(() => { window.location.href = href; }, remaining);
  }
  navigateToPrivacy();
}

document.addEventListener('DOMContentLoaded', function () {
  const privacyLinks = document.querySelectorAll('a[href="privacy-policy.html"]');
  privacyLinks.forEach(link => {
    link.addEventListener('click', handlePrivacyPolicyClick);
  });
  document.addEventListener('click', function (e) {
    const privacyLink = e.target.closest('a[href="privacy-policy.html"]');
    if (privacyLink && !privacyLink.hasAttribute('data-listener-attached')) {
      e.preventDefault();
      privacyLink.setAttribute('data-listener-attached', 'true');
      handlePrivacyPolicyClick(e);
    }
  });
});

window.addEventListener('pageshow', function (event) {
  const overlay = document.getElementById('page-loading-overlay');
  if (overlay && event.persisted) overlay.classList.remove('active');
});

window.addEventListener('load', function () {
  const overlay = document.getElementById('page-loading-overlay');
  if (overlay) setTimeout(() => { overlay.classList.remove('active'); }, 300);
});

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", () => {
  setupPhoneRestrictions();
  hideNotificationBell();
  const mobileOverlay = document.getElementById("mobile-overlay");
  if (mobileOverlay)
    mobileOverlay.addEventListener("click", () => {
      window.toggleMobileMenu();
    });
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
          const userData = snap.data();
          const savedSession = localStorage.getItem("barangayUser");
          if (savedSession) {
            try {
              const parsedSession = JSON.parse(savedSession);
              if (!currentSessionToken && userData.sessionToken)
                currentSessionToken = userData.sessionToken;
            } catch (e) { }
          }
          loggedInUser = { id: snap.id, ...userData };
          saveUserSession(loggedInUser);
          const se = sessionStorage.getItem("registeredEvents");
          if (se)
            try { registeredEventIds = new Set(JSON.parse(se)); } catch (e) { registeredEventIds = new Set(); }
          const sc = sessionStorage.getItem("completedEvents");
          if (sc)
            try { completedEventIds = new Set(JSON.parse(sc)); } catch (e) { completedEventIds = new Set(); }
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
      } catch (e) { hideLoading(); }
    } else {
      clearUserSession();
      loggedInUser = null;
      stopSessionHeartbeat();
      document.getElementById("auth-screen")?.classList.remove("hidden");
      document.getElementById("dashboard")?.classList.add("hidden");
      hideNotificationBell();
      hideLoading();
    }
  });
});
window.addEventListener("beforeunload", () => {
  if (loggedInUser?.id) {
    sessionStorage.setItem("registeredEvents", JSON.stringify([...registeredEventIds]));
    sessionStorage.setItem("completedEvents", JSON.stringify([...completedEventIds]));
    setUserStatus(loggedInUser.id, false);
  }
  stopSessionHeartbeat();
  if (participantsUnsubscribe) participantsUnsubscribe();
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  if (donationsUnsubscribe) donationsUnsubscribe();
  if (volunteersUnsubscribe) volunteersUnsubscribe();
  if (hoursUnsubscribe) hoursUnsubscribe();
});
document.addEventListener("click", function (event) {
  const sidebar = document.getElementById("sidebar"),
    mobileMenuBtn = document.getElementById("mobile-menu-btn"),
    isMobile = window.innerWidth < 1024;
  if (!isMobile || !sidebar) return;
  const isOpen = sidebar.classList.contains("translate-x-0");
  if (isOpen) {
    const clickedInsideSidebar = sidebar.contains(event.target),
      clickedMenuButton = mobileMenuBtn && mobileMenuBtn.contains(event.target);
    if (!clickedInsideSidebar && !clickedMenuButton) {
      sidebar.classList.remove("translate-x-0");
      sidebar.classList.add("-translate-x-full");
      const overlay = document.getElementById("mobile-overlay");
      if (overlay) overlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }
});
window.addEventListener("resize", function () {
  if (window.innerWidth >= 1024) {
    const sidebar = document.getElementById("sidebar"),
      overlay = document.getElementById("mobile-overlay");
    if (sidebar) {
      sidebar.classList.remove("-translate-x-full");
      sidebar.classList.add("translate-x-0");
    }
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "";
  }
});

// ===== EXPORT GLOBALS =====
window.showLoading = showLoading;
window.hideLoading = hideLoading;
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
      } catch (e) { }
    }
    await signOut(auth);
    clearUserSession();
    loggedInUser = null;
    currentSessionToken = null;
    const loginForm = document.getElementById("login-form"),
      registerForm = document.getElementById("register-form");
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
    document.getElementById("login-panel")?.classList.remove("hidden");
    document.getElementById("register-panel")?.classList.add("hidden");
    document.getElementById("auth-screen")?.classList.remove("hidden");
    document.getElementById("dashboard")?.classList.add("hidden");
    hideNotificationBell();
    const sidebar = document.getElementById("sidebar"),
      overlay = document.getElementById("mobile-overlay");
    if (sidebar && sidebar.classList.contains("translate-x-0")) {
      sidebar.classList.remove("translate-x-0");
      sidebar.classList.add("-translate-x-full");
      if (overlay) overlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
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
  const existingBanner = document.getElementById("logout-banner");
  if (existingBanner) existingBanner.remove();
  const banner = document.createElement("div");
  banner.id = "logout-banner";
  banner.className = "fixed top-0 left-0 right-0 z-[300] transform -translate-y-full transition-transform duration-500 ease-in-out";
  banner.innerHTML = `<div class="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-4 shadow-2xl"><div class="max-w-4xl mx-auto flex items-center justify-between"><div class="flex items-center space-x-3"><div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"><i class="fa-solid fa-circle-check text-white text-lg"></i></div><div><h3 class="font-extrabold text-sm">Successfully Logged Out</h3><p class="text-xs text-emerald-100 mt-0.5">You have been securely signed out of your account.</p></div></div><button onclick="closeLogoutBanner()" class="text-white/80 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"><i class="fa-solid fa-xmark text-sm"></i></button></div></div>`;
  document.body.appendChild(banner);
  setTimeout(() => { banner.classList.remove("-translate-y-full"); banner.classList.add("translate-y-0"); }, 100);
  setTimeout(() => { closeLogoutBanner(); }, 7000);
}
window.closeLogoutBanner = function () {
  const banner = document.getElementById("logout-banner");
  if (banner) {
    banner.classList.add("-translate-y-full");
    banner.classList.remove("translate-y-0");
    setTimeout(() => { banner.remove(); }, 500);
  }
};
document.getElementById("payment-modal-close")?.addEventListener("click", function () {
  currentDonationData = null;
  selectedPaymentMethod = null;
  document.getElementById("payment-form")?.reset();
  document.querySelectorAll(".payment-method-btn").forEach((b) => b.classList.remove("selected"));
  const qr = document.getElementById("qr-code-container");
  if (qr) qr.classList.add("hidden");
  window.toggleModal("payment-modal");
});
document.getElementById("payment-modal")?.addEventListener("click", function (e) {
  if (e.target === this) {
    currentDonationData = null;
    selectedPaymentMethod = null;
    document.getElementById("payment-form")?.reset();
    document.querySelectorAll(".payment-method-btn").forEach((b) => b.classList.remove("selected"));
    this.classList.add("hidden");
    const qr = document.getElementById("qr-code-container");
    if (qr) qr.classList.add("hidden");
  }
});

// Global function exports
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
window.promptLoginForEvent = window.promptLoginForEvent;
window.handleSkillVerificationUpload = window.handleSkillVerificationUpload;
window.removeSkillVerification = window.removeSkillVerification;
window.toggleNotificationDropdown = window.toggleNotificationDropdown;
window.toggleMoreNotifications = window.toggleMoreNotifications;
window.markNotificationAsRead = window.markNotificationAsRead;
window.markAllNotificationsAsRead = window.markAllNotificationsAsRead;
window.handleNotificationClick = window.handleNotificationClick;
window.toggleMobileNotificationDropdown = window.toggleMobileNotificationDropdown;
window.toggleMoreMobileNotifications = window.toggleMoreMobileNotifications;
