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
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ===== FIREBASE INITIALIZATION =====
const firebaseConfig = {
    apiKey: "AIzaSyD6rgutkYK7MZ3F0Xne6Zs4PyEiPME7ePM",
    authDomain: "onevictoria-23409.firebaseapp.com",
    projectId: "onevictoria-23409",
    storageBucket: "onevictoria-23409.firebasestorage.app",
    messagingSenderId: "334731169631",
    appId: "1:334731169631:web:7484599232fef8b06eb0ea",
    measurementId: "G-0ML9K6JSK8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== GLOBAL STATE =====
let loggedInUser = null;
let alertTimeout = null;
let pendingConfirmCallback = null;
let isSaving = false;
let newUserId = null;
let registeredEventIds = new Set();
let completedEventIds = new Set();
let eventsUnsubscribe = null;
let participantsUnsubscribe = null;
let selectedPaymentMethod = null;
let currentDonationData = null;
let isTabSwitching = false;

// ===== TIME UTILITY FUNCTIONS =====
/**
 * Format time from HH:MM to 12-hour format with AM/PM
 */
function formatTimeDisplay(timeValue) {
    if (!timeValue) return '';
    
    // If time is in HH:MM format
    if (typeof timeValue === 'string' && timeValue.includes(':')) {
        const [hours, minutes] = timeValue.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHour = h % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    }
    
    return timeValue;
}

/**
 * Format date and time for event card display
 */
function formatEventDateTime(dateValue, timeValue) {
    let display = dateValue || 'TBA';
    
    if (timeValue) {
        display += ` | ${formatTimeDisplay(timeValue)}`;
    }
    
    return display;
}

// ===== PAYMENT API CONFIGURATION =====
const PAYMENT_API = {
    gcash: {
        merchantId: 'GCASH_MERCHANT_ID',
        apiKey: 'GCASH_API_KEY',
        endpoint: 'https://api.gcash.com/v1/transactions',
    },
    paymaya: {
        publicKey: 'PAYMAYA_PUBLIC_KEY',
        secretKey: 'PAYMAYA_SECRET_KEY',
        endpoint: 'https://api.paymaya.com/v1/checkouts',
    },
    bank_transfer: {
        bankName: 'GCash',
        accountNumber: '4413-6000-0859-3972',
        accountName: 'Municipality of Victoria',
    },
    cash: {
        officeAddress: 'Municipal Hall, Victoria, Tarlac',
        officeHours: '8:00 AM - 5:00 PM, Monday to Friday',
    }
};

// ===== PAYMENT PROCESSING FUNCTIONS =====
window.selectPaymentMethod = function(method) {
    selectedPaymentMethod = method;
    document.getElementById('selected-payment-method').value = method;
    
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    const selectedBtn = document.querySelector(`[data-method="${method}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('selected');
    }
    
    const qrContainer = document.getElementById('qr-code-container');
    if (method === 'gcash' || method === 'paymaya') {
        qrContainer.classList.remove('hidden');
        generateQRCode(method);
    } else {
        qrContainer.classList.add('hidden');
    }
    
    console.log('💳 Payment method selected:', method);
};

window.setAmount = function(amount) {
    const amountInput = document.getElementById('donation-amount');
    if (amountInput) {
        amountInput.value = amount;
    }
};

function generateQRCode(method) {
    const qrPlaceholder = document.getElementById('qr-code-placeholder');
    if (!qrPlaceholder) return;
    
    let qrContent = '';
    if (method === 'gcash') {
        qrContent = `
            <div class="text-center p-4">
                <i class="fa-solid fa-mobile-screen text-6xl text-blue-600 mb-3"></i>
                <p class="text-xs font-bold text-gray-700">GCash QR</p>
                <p class="text-xs text-gray-500 mt-1">Scan to pay</p>
                <div class="mt-3 bg-gray-200 p-2 rounded text-xs">
                    <p class="font-mono">MERCHANT: ${PAYMENT_API.gcash.merchantId}</p>
                </div>
            </div>`;
    } else if (method === 'paymaya') {
        qrContent = `
            <div class="text-center p-4">
                <i class="fa-solid fa-wallet text-6xl text-purple-600 mb-3"></i>
                <p class="text-xs font-bold text-gray-700">PayMaya QR</p>
                <p class="text-xs text-gray-500 mt-1">Scan to pay</p>
                <div class="mt-3 bg-gray-200 p-2 rounded text-xs">
                    <p class="font-mono">MERCHANT: Victoria Municipality</p>
                </div>
            </div>`;
    }
    
    qrPlaceholder.innerHTML = qrContent;
}

window.openPaymentModal = function(item, purpose) {
    if (!loggedInUser) {
        window.showAlert("Error", "Please login first to make a donation.", "error");
        return;
    }
    
    currentDonationData = {
        item: item,
        purpose: purpose,
        donorName: loggedInUser.name,
        donorId: loggedInUser.id
    };
    
    document.getElementById('payment-item').textContent = item;
    document.getElementById('payment-purpose').textContent = purpose;
    document.getElementById('payment-donor-name').value = loggedInUser.name;
    
    selectedPaymentMethod = null;
    document.getElementById('selected-payment-method').value = '';
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.getElementById('qr-code-container').classList.add('hidden');
    document.getElementById('donation-amount').value = '';
    
    window.toggleModal('payment-modal');
};

window.processPayment = async function() {
    const paymentMethod = selectedPaymentMethod || document.getElementById('selected-payment-method')?.value;
    const amount = parseFloat(document.getElementById('donation-amount')?.value || 0);
    const donorName = document.getElementById('payment-donor-name')?.value.trim();
    
    if (!paymentMethod) {
        window.showAlert("Error", "Please select a payment method.", "error");
        return;
    }
    
    if (!amount || amount <= 0) {
        window.showAlert("Error", "Please enter a valid donation amount.", "error");
        return;
    }
    
    if (!donorName) {
        window.showAlert("Error", "Please enter your name.", "error");
        return;
    }
    
    if (!currentDonationData) {
        window.showAlert("Error", "Donation data is missing. Please try again.", "error");
        return;
    }
    
    showLoading("Processing payment...");
    
    try {
        let paymentResult;
        
        switch(paymentMethod) {
            case 'gcash':
                paymentResult = await processGCashPayment(amount);
                break;
            case 'paymaya':
                paymentResult = await processPayMayaPayment(amount);
                break;
            case 'bank_transfer':
                paymentResult = await processBankTransfer(amount);
                break;
            case 'cash':
                paymentResult = await processCashPayment(amount);
                break;
            default:
                throw new Error('Invalid payment method');
        }
        
        await saveDonation(paymentResult);
        
        window.toggleModal('payment-modal');
        document.getElementById('donation-form')?.reset();
        currentDonationData = null;
        selectedPaymentMethod = null;
        
        hideLoading();
        window.showAlert(
            "Payment Successful!", 
            `Thank you for your donation of ₱${amount.toLocaleString()}! Your contribution will help our community.`,
            "success"
        );
        
    } catch (error) {
        hideLoading();
        console.error('❌ Payment error:', error);
        window.showAlert(
            "Payment Failed", 
            error.message || "Failed to process payment. Please try again.",
            "error"
        );
    }
};

async function processGCashPayment(amount) {
    console.log('💳 Processing GCash payment:', amount);
    return {
        transactionId: `GCASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method: 'gcash',
        amount: amount,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
}

async function processPayMayaPayment(amount) {
    console.log('💳 Processing PayMaya payment:', amount);
    return {
        transactionId: `MAYA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method: 'paymaya',
        amount: amount,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
}

async function processBankTransfer(amount) {
    console.log('🏦 Processing bank transfer:', amount);
    return {
        transactionId: `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method: 'bank_transfer',
        amount: amount,
        status: 'pending',
        bankDetails: {
            bankName: PAYMENT_API.bank_transfer.bankName,
            accountNumber: PAYMENT_API.bank_transfer.accountNumber,
            accountName: PAYMENT_API.bank_transfer.accountName,
        },
        timestamp: new Date().toISOString(),
    };
}

async function processCashPayment(amount) {
    console.log('💵 Processing cash payment:', amount);
    return {
        transactionId: `CASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method: 'cash',
        amount: amount,
        status: 'pending',
        cashDetails: {
            officeAddress: PAYMENT_API.cash.officeAddress,
            officeHours: PAYMENT_API.cash.officeHours,
        },
        timestamp: new Date().toISOString(),
    };
}

async function saveDonation(paymentResult) {
    try {
        const donationData = {
            ...currentDonationData,
            amount: paymentResult.amount,
            paymentMethod: paymentResult.method,
            transactionId: paymentResult.transactionId,
            paymentStatus: paymentResult.status,
            paymentTimestamp: paymentResult.timestamp,
            status: paymentResult.status === 'completed' ? 'confirmed' : 'pending',
            createdAt: serverTimestamp(),
        };
        
        if (paymentResult.bankDetails) donationData.bankDetails = paymentResult.bankDetails;
        if (paymentResult.cashDetails) donationData.cashDetails = paymentResult.cashDetails;
        
        const docRef = await addDoc(collection(db, "donations"), donationData);
        console.log('✅ Donation saved:', docRef.id);
        
        if (paymentResult.status === 'pending') showPaymentInstructions(paymentResult);
    } catch (error) {
        console.error('❌ Failed to save donation:', error);
        throw new Error('Failed to save donation record');
    }
}

function showPaymentInstructions(paymentResult) {
    let message = '';
    if (paymentResult.method === 'bank_transfer') {
        message = `Please transfer to:\nBank: ${paymentResult.bankDetails.bankName}\nAccount: ${paymentResult.bankDetails.accountNumber}\nAccount Name: ${paymentResult.bankDetails.accountName}\n\nReference: ${paymentResult.transactionId}`;
    } else if (paymentResult.method === 'cash') {
        message = `Please visit:\n${paymentResult.cashDetails.officeAddress}\nOffice Hours: ${paymentResult.cashDetails.officeHours}\n\nReference: ${paymentResult.transactionId}`;
    }
    if (message) setTimeout(() => window.showAlert("Payment Instructions", message, "success"), 1500);
}

// ===== DATE UTILITIES =====
function formatFirebaseDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatShortDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ===== SESSION MANAGEMENT =====
function saveUserSession(userData) {
    try {
        const sessionData = {
            ...userData,
            createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate().toISOString() : userData.createdAt,
            lastActive: userData.lastActive?.toDate ? userData.lastActive.toDate().toISOString() : userData.lastActive
        };
        localStorage.setItem('barangayUser', JSON.stringify(sessionData));
    } catch (e) { console.error('Failed to save session:', e); }
}

function clearUserSession() {
    try {
        localStorage.removeItem('barangayUser');
        sessionStorage.removeItem('userActiveTab');
        sessionStorage.removeItem('registeredEvents');
        sessionStorage.removeItem('completedEvents');
    } catch (e) { console.error('Failed to clear session:', e); }
}

function getSavedSession() {
    try {
        const saved = localStorage.getItem('barangayUser');
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed && parsed.id ? parsed : null;
        }
    } catch (e) { console.error('Failed to parse saved session:', e); clearUserSession(); }
    return null;
}

function saveActiveTab(tabId) {
    try { sessionStorage.setItem('userActiveTab', tabId); } catch (e) { console.error('Failed to save active tab:', e); }
}

function getSavedActiveTab() {
    try { return sessionStorage.getItem('userActiveTab') || 'announcements'; } catch (e) { return 'announcements'; }
}

// ===== LOADING MANAGEMENT =====
function showLoading(msg = "Loading...") {
    const loader = document.getElementById('global-loading');
    const text = document.getElementById('loading-text');
    if (loader) { loader.classList.remove('hidden'); loader.style.display = 'flex'; }
    if (text) text.textContent = msg;
}

function hideLoading() {
    const loader = document.getElementById('global-loading');
    if (loader) { loader.classList.add('hidden'); loader.style.display = 'none'; }
}

// ===== UI UTILITIES =====
function updateUIWithUserData(user) {
    if (!user) return;

    const safeSetVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    const safeSetText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };

    const iconFallback = document.getElementById('profile-icon-fallback');
    const imgPreview = document.getElementById('profile-img-preview');
    if (imgPreview) { imgPreview.src = ""; imgPreview.classList.add('hidden'); }
    if (iconFallback) iconFallback.classList.remove('hidden');

    safeSetText('profile-display-name', user.name || "Resident");
    safeSetText('profile-display-email', user.email || "");
    safeSetVal('prof-name', user.name);
    safeSetVal('prof-email', user.email);
    safeSetVal('prof-phone', user.phone);
    safeSetVal('prof-age', user.age);
    safeSetVal('prof-gender', user.gender || "Male");
    safeSetVal('prof-address', user.address);
    safeSetVal('vol-name', user.name);

    document.querySelectorAll('input[type="password"], input[id*="pass"]').forEach(f => { if (f) f.value = user.password || ''; });
}

// ===== ALERT SYSTEM =====
window.showAlert = function(title, message, type = 'success') {
    const alertEl = document.getElementById('custom-alert');
    if (!alertEl) { alert(`${title}\n${message}`); return; }

    clearTimeout(alertTimeout);

    const iconBox = document.getElementById('alert-icon-box');
    const icon = document.getElementById('alert-icon');
    
    if (type === 'success') {
        if (iconBox) iconBox.className = 'p-2 rounded-xl text-white mt-0.5 bg-emerald-500';
        if (icon) icon.className = 'fa-solid fa-circle-check text-lg';
    } else {
        if (iconBox) iconBox.className = 'p-2 rounded-xl text-white mt-0.5 bg-rose-500';
        if (icon) icon.className = 'fa-solid fa-circle-exclamation text-lg';
    }

    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;

    alertEl.classList.remove('translate-x-96', 'opacity-0', 'pointer-events-none');
    alertEl.classList.add('translate-x-0', 'opacity-100');

    alertTimeout = setTimeout(() => window.closeCustomAlert(), 4000);
};

window.closeCustomAlert = function() {
    const el = document.getElementById('custom-alert');
    if (el) { el.classList.remove('translate-x-0', 'opacity-100'); el.classList.add('translate-x-96', 'opacity-0', 'pointer-events-none'); }
};

window.showConfirmPopup = function(title, text, cb) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = text;
    document.getElementById('confirm-modal').classList.remove('hidden');
    pendingConfirmCallback = cb;
};

// ===== FIREBASE USER OPERATIONS =====
async function setUserStatus(userId, status) {
    if (!userId) return;
    try { await updateDoc(doc(db, "residents", userId), { isOnline: status, lastActive: serverTimestamp() }); } catch (e) { console.error('Failed to update user status:', e); }
}

async function loadUserRegisteredEvents() {
    if (!loggedInUser?.id) return;
    try {
        const q = query(collection(db, "participants"), where("residentId", "==", loggedInUser.id), where("status", "==", "registered"));
        const snap = await getDocs(q);
        registeredEventIds.clear();
        snap.forEach(doc => registeredEventIds.add(doc.data().eventId));
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        
        const completedQuery = query(collection(db, "participants"), where("residentId", "==", loggedInUser.id), where("status", "==", "completed"));
        const completedSnap = await getDocs(completedQuery);
        completedEventIds.clear();
        completedSnap.forEach(doc => completedEventIds.add(doc.data().eventId));
        sessionStorage.setItem('completedEvents', JSON.stringify([...completedEventIds]));
        
        return registeredEventIds;
    } catch (error) { console.error('Error loading registered events:', error); return new Set(); }
}

function setupParticipantsListener() {
    if (!loggedInUser?.id) return;
    if (participantsUnsubscribe) participantsUnsubscribe();
    
    const q = query(collection(db, "participants"), where("residentId", "==", loggedInUser.id));
    participantsUnsubscribe = onSnapshot(q, (snap) => {
        registeredEventIds.clear();
        completedEventIds.clear();
        snap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'registered') registeredEventIds.add(data.eventId);
            else if (data.status === 'completed') completedEventIds.add(data.eventId);
        });
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        sessionStorage.setItem('completedEvents', JSON.stringify([...completedEventIds]));
        renderEvents();
        if (document.getElementById('my-events-grid')) renderMyEvents();
    }, (error) => console.error('❌ Participants listener error:', error));
}

// ===== AUTH PANELS =====
window.toggleAuthPanels = function(showRegister) {
    const loginPanel = document.getElementById('login-panel');
    const registerPanel = document.getElementById('register-panel');
    if (loginPanel && registerPanel) {
        loginPanel.classList.toggle('hidden', showRegister);
        registerPanel.classList.toggle('hidden', !showRegister);
    }
};

// ===== REGISTRATION =====
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name')?.value.trim() || '';
    const email = document.getElementById('reg-email')?.value.trim().toLowerCase() || '';
    const phone = document.getElementById('reg-phone')?.value.trim() || '';
    const age = document.getElementById('reg-age')?.value.trim() || '';
    const gender = document.getElementById('reg-gender')?.value || '';
    const address = document.getElementById('reg-address')?.value.trim() || '';
    const pass = document.getElementById('reg-password')?.value || '';
    const confirmPass = document.getElementById('reg-confirm-password')?.value || '';

    if (!name || !email || !phone || !age || !gender || !address || !pass) { window.showAlert("Error", "All fields are required.", "error"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { window.showAlert("Error", "Please enter a valid email address.", "error"); return; }
    if (pass !== confirmPass) { window.showAlert("Error", "Passwords do not match.", "error"); return; }
    if (pass.length < 6) { window.showAlert("Error", "Password must be at least 6 characters.", "error"); return; }

    showLoading("Creating account...");
    try {
        const checkSnap = await getDocs(query(collection(db, "residents"), where("email", "==", email), limit(1)));
        if (!checkSnap.empty) { hideLoading(); window.showAlert("Error", "Email already registered.", "error"); return; }

        const docRef = await addDoc(collection(db, "residents"), {
            name, email, phone, age: parseInt(age) || 0, gender, address,
            password: pass, isOnline: false, profilePic: "",
            createdAt: serverTimestamp(), lastActive: serverTimestamp(), role: "resident"
        });
        newUserId = docRef.id;
        hideLoading();
        document.getElementById('register-form')?.reset();
        window.showAlert("Success!", "Account created successfully! You can now login.", "success");
        window.toggleAuthPanels(false);
        newUserId = null;
    } catch (err) { hideLoading(); console.error('Registration error:', err); window.showAlert("Error", `Registration failed: ${err.message}`, "error"); }
});

// ===== LOGIN =====
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value.trim().toLowerCase() || '';
    const pass = document.getElementById('login-password')?.value || '';
    if (!email || !pass) { window.showAlert("Error", "Please enter your email and password.", "error"); return; }

    showLoading("Logging in...");
    try {
        const q = query(collection(db, "residents"), where("email", "==", email), where("password", "==", pass), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            snap.forEach(d => { loggedInUser = { id: d.id, ...d.data() }; });
            saveUserSession(loggedInUser);
            saveActiveTab('announcements');
            await setUserStatus(loggedInUser.id, true);
            await loadUserRegisteredEvents();
            setupParticipantsListener();
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('dashboard')?.classList.remove('hidden');
            updateUIWithUserData(loggedInUser);
            initUserHourTracker();
            window.switchTab('announcements');
            hideLoading();
            window.showAlert("Welcome!", `Hello ${loggedInUser.name}!`, "success");
        } else { hideLoading(); window.showAlert("Error", "Invalid email or password.", "error"); }
    } catch (err) { hideLoading(); console.error('Login error:', err); window.showAlert("Error", `Login failed: ${err.message}`, "error"); }
});

// ===== PROFILE MANAGEMENT =====
const profileForm = document.getElementById('profile-form');
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving || !loggedInUser?.id) return;
        const submitBtn = profileForm.querySelector('button[type="submit"]');
        const name = document.getElementById('prof-name')?.value.trim() || '';
        const phone = document.getElementById('prof-phone')?.value.trim() || '';
        const ageVal = document.getElementById('prof-age')?.value.trim() || '';
        const gender = document.getElementById('prof-gender')?.value || 'Male';
        const address = document.getElementById('prof-address')?.value.trim() || '';
        const passInput = profileForm.querySelector('input[type="password"]') || document.getElementById('prof-password');
        const password = (passInput && passInput.value.trim() !== "") ? passInput.value.trim() : loggedInUser.password;
        if (!name) { window.showAlert("Error", "Name cannot be empty.", "error"); return; }

        isSaving = true;
        showLoading("Saving profile changes...");
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Saving..."; }
        try {
            const updateData = { name, phone, age: parseInt(ageVal) || 0, gender, address, password, lastProfileUpdate: serverTimestamp() };
            await updateDoc(doc(db, "residents", loggedInUser.id), updateData);
            Object.assign(loggedInUser, updateData);
            saveUserSession(loggedInUser);
            updateUIWithUserData(loggedInUser);
            hideLoading();
            window.showAlert("Success!", "Your profile has been updated successfully!", "success");
        } catch (error) { hideLoading(); console.error('❌ Profile save error:', error); window.showAlert("Error", `Failed to save profile: ${error.message}`, "error"); }
        finally { isSaving = false; if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "Save Profile Changes"; } }
    });
}

// ===== PASSWORD TOGGLE =====
document.getElementById('toggle-prof-password')?.addEventListener('click', function() {
    const fields = document.querySelectorAll('#profile-form input[type="password"], #profile-form input[type="text"][id*="pass"]');
    const icon = document.getElementById('prof-password-icon');
    fields.forEach(f => {
        if (f.type === 'password') { f.type = 'text'; if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); } }
        else { f.type = 'password'; if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); } }
    });
});

// ===== LOGOUT =====
window.triggerLogoutConfirmation = function() {
    window.showConfirmPopup("Leave Portal?", "Are you sure you want to logout?", async () => {
        showLoading("Logging out...");
        try {
            if (loggedInUser?.id) await setUserStatus(loggedInUser.id, false);
            if (participantsUnsubscribe) { participantsUnsubscribe(); participantsUnsubscribe = null; }
            clearUserSession();
            loggedInUser = null;
            registeredEventIds.clear();
            completedEventIds.clear();
            document.getElementById('auth-screen')?.classList.remove('hidden');
            document.getElementById('dashboard')?.classList.add('hidden');
            document.getElementById('login-form')?.reset();
            hideLoading();
            window.showAlert("Goodbye!", "You have been logged out successfully.", "success");
        } catch (err) { hideLoading(); console.error('Logout error:', err); }
    });
};

// ===== CONFIRM MODAL HANDLERS =====
document.getElementById('confirm-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-modal')?.classList.add('hidden');
    pendingConfirmCallback = null;
});

document.getElementById('confirm-proceed-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-modal')?.classList.add('hidden');
    if (typeof pendingConfirmCallback === 'function') pendingConfirmCallback();
    pendingConfirmCallback = null;
});

// ==========================================
//      REAL-TIME PUBLIC DATA RENDERERS
// ==========================================

// 1. ===== ANNOUNCEMENTS =====
onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc")), (snap) => {
    const container = document.getElementById('announcements-container');
    if (!container) return;
    if (snap.empty) { container.innerHTML = `<div class="text-center py-10 text-stone-400"><i class="fa-solid fa-bullhorn text-4xl mb-3 opacity-30"></i><p>No announcements yet.</p></div>`; return; }
    let html = '';
    snap.forEach(d => {
        const a = d.data();
        let priorityClass = "bg-stone-100 text-stone-800";
        if (a.priority === "Important") priorityClass = "bg-amber-100 text-amber-800";
        if (a.priority === "Emergency") priorityClass = "bg-red-100 text-red-800";
        html += `<div class="bg-white p-5 rounded-xl border shadow-sm mb-3"><span class="text-xs font-bold uppercase px-2 py-0.5 rounded ${priorityClass}">${a.priority || 'Notice'}</span><h3 class="font-bold text-stone-900 mt-2">${a.title || ''}</h3><p class="text-sm text-stone-600 mt-1 whitespace-pre-line">${a.desc || ''}</p></div>`;
    });
    container.innerHTML = html;
}, (error) => console.error('❌ Announcements error:', error));

// 2. ===== EVENTS RENDERER (FIXED TIME DISPLAY) =====
function renderEvents() {
    const grid = document.getElementById('events-grid');
    if (!grid) return;

    getDocs(query(collection(db, "events"), orderBy("date", "asc")))
        .then((snap) => {
            if (snap.empty) {
                grid.innerHTML = `<div class="col-span-full text-center py-10 text-stone-400"><i class="fa-solid fa-calendar-xmark text-4xl mb-3 opacity-30"></i><p>No upcoming events.</p></div>`;
                return;
            }

            let html = '';
            snap.forEach(d => {
                const ev = d.data(), id = d.id;
                const esc = (t) => {
                    const div = document.createElement('div');
                    div.textContent = t || '';
                    return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                };

                const isRegistered = registeredEventIds.has(id);
                const isCompleted = completedEventIds.has(id);
                
                // Format date and time for display
                const dateDisplay = ev.date || 'TBA';
                const timeDisplay = ev.time ? formatTimeDisplay(ev.time) : '';
                const dateTimeDisplay = timeDisplay ? `${dateDisplay} | ${timeDisplay}` : dateDisplay;
                
                let buttonHtml = '';
                if (isCompleted) {
                    buttonHtml = `<button disabled class="mt-3 w-full bg-blue-50 border border-blue-200 text-blue-600 font-bold py-2 rounded-xl text-sm cursor-not-allowed opacity-75"><i class="fa-solid fa-circle-check mr-1"></i> Hours Credited</button>`;
                } else if (isRegistered) {
                    buttonHtml = `<button onclick="event.stopPropagation(); window.unregisterFromEvent('${id}', '${esc(ev.title)}')" class="mt-3 w-full bg-red-50 border border-red-200 text-red-600 font-bold py-2 rounded-xl text-sm hover:bg-red-100 transition-colors"><i class="fa-solid fa-user-minus mr-1"></i> Unregister</button>`;
                } else {
                    buttonHtml = `<button onclick="event.stopPropagation(); window.confirmJoinEvent('${id}', '${esc(ev.title)}', '${esc(dateDisplay)}', '${esc(timeDisplay)}', '${esc(ev.location || '')}')" class="mt-3 w-full bg-stone-50 border text-tsu-maroon font-bold py-2 rounded-xl text-sm hover:bg-tsu-maroon hover:text-tsu-gold transition-colors"><i class="fa-solid fa-user-plus mr-1"></i> Join</button>`;
                }

                html += `
                    <div onclick="openEventDetails('${esc(ev.title)}', '${esc(dateDisplay)}', '${esc(timeDisplay)}', '${esc(ev.location)}', '${esc(ev.desc).replace(/\n/g, '<br>')}')" class="bg-white p-6 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all">
                        <span class="text-xs font-bold uppercase bg-red-50 text-tsu-maroon px-2 py-1 rounded">${ev.category || 'Event'}</span>
                        <h3 class="text-lg font-black text-stone-900 mt-2">${ev.title || ''}</h3>
                        <p class="text-xs text-stone-500 mt-2">
                            <i class="fa-solid fa-calendar mr-1"></i>${dateDisplay}
                            ${timeDisplay ? `<span class="ml-2"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</span>` : ''}
                        </p>
                        <p class="text-xs text-stone-500 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>${ev.location || 'TBA'}</p>
                        ${buttonHtml}
                    </div>`;
            });
            grid.innerHTML = html;
        })
        .catch((error) => console.error('❌ Events render error:', error));
}

// ===== MY EVENTS RENDERER (FIXED TIME DISPLAY) =====
function renderMyEvents() {
    const grid = document.getElementById('my-events-grid');
    if (!grid) return;

    if (!loggedInUser) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-stone-400"><i class="fa-solid fa-calendar-xmark text-4xl mb-3 opacity-30"></i><p>Please login to see your events.</p></div>`;
        return;
    }

    if (registeredEventIds.size === 0 && completedEventIds.size === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-stone-400"><i class="fa-solid fa-calendar-xmark text-4xl mb-3 opacity-30"></i><p>You haven't registered for any events yet.</p></div>`;
        return;
    }

    getDocs(query(collection(db, "events"), orderBy("date", "asc")))
        .then((snap) => {
            let html = '';
            let foundEvents = false;

            snap.forEach(d => {
                const ev = d.data(), id = d.id;
                const isRegistered = registeredEventIds.has(id);
                const isCompleted = completedEventIds.has(id);
                
                if (!isRegistered && !isCompleted) return;
                foundEvents = true;
                
                const esc = (t) => {
                    const div = document.createElement('div');
                    div.textContent = t || '';
                    return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                };

                const dateDisplay = ev.date || 'TBA';
                const timeDisplay = ev.time ? formatTimeDisplay(ev.time) : '';

                let statusBadge = isCompleted ? 
                    '<span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-bold"><i class="fa-solid fa-circle-check mr-1"></i>Hours Credited</span>' :
                    '<span class="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-bold"><i class="fa-solid fa-circle-check mr-1"></i>Registered</span>';

                html += `
                    <div class="bg-white p-6 rounded-xl border shadow-sm ${isCompleted ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-emerald-500'}">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold uppercase bg-red-50 text-tsu-maroon px-2 py-1 rounded">${ev.category || 'Event'}</span>
                            ${statusBadge}
                        </div>
                        <h3 class="text-lg font-black text-stone-900 mt-2">${ev.title || ''}</h3>
                        <p class="text-xs text-stone-500 mt-2">
                            <i class="fa-solid fa-calendar mr-1"></i>${dateDisplay}
                            ${timeDisplay ? `<span class="ml-2"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</span>` : ''}
                        </p>
                        <p class="text-xs text-stone-500 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>${ev.location || 'TBA'}</p>
                        <div class="mt-4 flex space-x-2">
                            <button onclick="openEventDetails('${esc(ev.title)}', '${esc(dateDisplay)}', '${esc(timeDisplay)}', '${esc(ev.location)}', '${esc(ev.desc).replace(/\n/g, '<br>')}')" class="flex-1 bg-stone-50 border text-stone-700 font-bold py-2 rounded-xl text-xs hover:bg-stone-100">View Details</button>
                            ${!isCompleted ? `<button onclick="event.stopPropagation(); window.unregisterFromEvent('${id}', '${esc(ev.title)}')" class="flex-1 bg-red-50 border border-red-200 text-red-600 font-bold py-2 rounded-xl text-xs hover:bg-red-100">Unregister</button>` : ''}
                        </div>
                    </div>`;
            });

            grid.innerHTML = foundEvents ? html : `<div class="col-span-full text-center py-10 text-stone-400"><i class="fa-solid fa-calendar-xmark text-4xl mb-3 opacity-30"></i><p>You haven't registered for any events yet.</p></div>`;
        })
        .catch((error) => {
            console.error('❌ My Events render error:', error);
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-stone-400"><i class="fa-solid fa-triangle-exclamation text-4xl mb-3 opacity-30"></i><p>Failed to load events.</p></div>`;
        });
}

// ===== CONFIRM JOIN EVENT (WITH TIME) =====
window.confirmJoinEvent = function(eventId, eventTitle, eventDate, eventTime, eventLocation) {
    if (!loggedInUser) {
        window.showAlert("Error", "Please login first to join events.", "error");
        return;
    }

    if (registeredEventIds.has(eventId) || completedEventIds.has(eventId)) {
        window.showAlert("Already Registered", `You have already registered for "${eventTitle}".`, "error");
        return;
    }

    let confirmMessage = `You are about to join:\n\n"${eventTitle}"`;
    if (eventDate && eventDate !== 'undefined') {
        confirmMessage += `\n📅 Date: ${eventDate}`;
    }
    if (eventTime && eventTime !== 'undefined' && eventTime !== '') {
        confirmMessage += `\n🕐 Time: ${eventTime}`;
    }
    if (eventLocation && eventLocation !== 'undefined') {
        confirmMessage += `\n📍 Location: ${eventLocation}`;
    }
    confirmMessage += `\n\nDo you want to proceed with this registration?`;

    window.showConfirmPopup("Join Event?", confirmMessage, async () => {
        await performJoinEvent(eventId, eventTitle);
    });
};

// ===== PERFORM JOIN EVENT =====
async function performJoinEvent(eventId, eventTitle) {
    showLoading("Joining event...");
    try {
        const existingQuery = query(collection(db, "participants"), where("residentId", "==", loggedInUser.id), where("eventId", "==", eventId), limit(1));
        const existingSnap = await getDocs(existingQuery);
        if (!existingSnap.empty) {
            let alreadyRegistered = false;
            existingSnap.forEach(doc => {
                const data = doc.data();
                if (data.status === 'registered') { registeredEventIds.add(eventId); alreadyRegistered = true; }
                if (data.status === 'completed') { completedEventIds.add(eventId); alreadyRegistered = true; }
            });
            if (alreadyRegistered) { renderEvents(); renderMyEvents(); hideLoading(); window.showAlert("Already Registered", `You are already registered for "${eventTitle}".`, "error"); return; }
        }

        await addDoc(collection(db, "participants"), {
            residentId: loggedInUser.id, residentName: loggedInUser.name, residentEmail: loggedInUser.email,
            eventTitle, eventId, timestamp: serverTimestamp(), status: 'registered'
        });

        registeredEventIds.add(eventId);
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        renderEvents();
        renderMyEvents();
        hideLoading();
        window.showAlert("Success!", `You have successfully joined "${eventTitle}"!`, "success");
    } catch (e) { hideLoading(); console.error('❌ Join event error:', e); window.showAlert("Error", "Failed to join event. Please try again.", "error"); }
}

window.joinEvent = async function(eventId, eventTitle) {
    window.confirmJoinEvent(eventId, eventTitle, '', '', '');
};

// ===== UNREGISTER FROM EVENT =====
window.unregisterFromEvent = async function(eventId, eventTitle) {
    if (!loggedInUser) { window.showAlert("Error", "Please login first.", "error"); return; }
    if (completedEventIds.has(eventId)) { window.showAlert("Cannot Unregister", "This event has already been credited with hours.", "error"); return; }

    window.showConfirmPopup("Cancel Registration?", `Are you sure you want to cancel your registration for "${eventTitle}"?`, async () => {
        showLoading("Cancelling registration...");
        try {
            const existingQuery = query(collection(db, "participants"), where("residentId", "==", loggedInUser.id), where("eventId", "==", eventId), where("status", "==", "registered"), limit(1));
            const existingSnap = await getDocs(existingQuery);
            if (!existingSnap.empty) {
                const updatePromises = [];
                existingSnap.forEach((document) => { updatePromises.push(updateDoc(doc(db, "participants", document.id), { status: 'cancelled', cancelledAt: serverTimestamp() })); });
                await Promise.all(updatePromises);
            }
            registeredEventIds.delete(eventId);
            sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
            renderEvents();
            renderMyEvents();
            hideLoading();
            window.showAlert("Cancelled", `You have successfully unregistered from "${eventTitle}".`, "success");
        } catch (e) { hideLoading(); console.error('❌ Unregister error:', e); window.showAlert("Error", "Failed to cancel registration.", "error"); }
    });
};

eventsUnsubscribe = onSnapshot(query(collection(db, "events"), orderBy("date", "asc")), () => renderEvents(), (error) => console.error('❌ Events listener error:', error));

// 3. ===== DONATIONS (PUBLIC) =====
onSnapshot(query(collection(db, "donations"), orderBy("createdAt", "desc")), (snap) => {
    const tbody = document.getElementById('public-donations-tbody');
    if (!tbody) return;
    let html = '';
    snap.forEach(d => {
        const data = d.data();
        const amountDisplay = data.amount ? `₱${parseFloat(data.amount).toLocaleString()}` : data.item || '';
        const paymentMethod = data.paymentMethod ? `<span class="text-xs text-gray-400">via ${data.paymentMethod.replace('_', ' ')}</span>` : '';
        html += `<tr class="hover:bg-stone-50/60 border-b last:border-0"><td class="px-4 py-3 font-bold text-stone-900">${data.donorName || 'Anonymous'}</td><td class="px-4 py-3 text-emerald-700 font-medium">${amountDisplay} ${paymentMethod}</td><td class="px-4 py-3 text-stone-600">${data.purpose || ''}</td></tr>`;
    });
    if (!html) html = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No donations reported yet.</td></tr>';
    tbody.innerHTML = html;
}, (error) => console.error('❌ Donations error:', error));

// 4. ===== PUBLIC SERVICE HOURS =====
onSnapshot(query(collection(db, "service_hours"), orderBy("hours", "desc")), (snap) => {
    const tbody = document.getElementById('public-hours-tbody');
    if (!tbody) return;
    let html = '';
    snap.forEach(d => {
        const data = d.data();
        if (data.status === "Approved" || data.status === "approved") {
            html += `<tr class="hover:bg-stone-50/60 border-b last:border-0"><td class="px-4 py-3 font-bold text-stone-900">${data.residentName || 'Resident'}</td><td class="px-4 py-3 text-stone-600">${data.eventTitle || 'Community Event'}</td><td class="px-4 py-3 font-mono text-emerald-600 font-black">${data.hours || 0} hrs</td></tr>`;
        }
    });
    if (!html) html = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No approved service hours listed yet.</td></tr>';
    tbody.innerHTML = html;
}, (error) => console.error('❌ Public Service Hours error:', error));

// 5. ===== VOLUNTEERS LIST (PUBLIC) =====
onSnapshot(query(collection(db, "volunteers"), orderBy("createdAt", "desc")), (snap) => {
    const tbody = document.getElementById('public-volunteers-tbody');
    if (!tbody) return;
    let html = '';
    snap.forEach(d => {
        const data = d.data();
        if (data.status === "Approved" || data.status === "approved" || data.status === "pending") {
            html += `<tr class="hover:bg-stone-50/60 border-b last:border-0"><td class="px-4 py-3 font-bold text-stone-900">${data.name || 'Resident'}</td><td class="px-4 py-3 text-stone-600">${data.skills || 'General Help'}</td><td class="px-4 py-3"><span class="text-xs px-2 py-0.5 rounded-full font-bold ${data.status === 'Approved' || data.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${data.status || 'Pending'}</span></td></tr>`;
        }
    });
    if (!html) html = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No active volunteers listed.</td></tr>';
    tbody.innerHTML = html;
}, (error) => console.error('❌ Public Volunteers error:', error));

// ===== VOLUNTEER SUBMISSION =====
document.getElementById('volunteer-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedInUser) { window.showAlert("Error", "Please login first.", "error"); return; }
    const skills = document.getElementById('vol-skills')?.value.trim() || '';
    const availability = document.getElementById('vol-avail')?.value || '';
    if (!skills) { window.showAlert("Error", "Please enter your skills.", "error"); return; }
    showLoading("Submitting...");
    try {
        await addDoc(collection(db, "volunteers"), { residentId: loggedInUser.id, name: loggedInUser.name, email: loggedInUser.email, skills, availability, createdAt: serverTimestamp(), status: 'pending' });
        hideLoading();
        window.showAlert("Success!", "Volunteer application submitted!", "success");
        document.getElementById('volunteer-form')?.reset();
    } catch (err) { hideLoading(); console.error('❌ Volunteer error:', err); window.showAlert("Error", "Failed to submit.", "error"); }
});

// ===== DONATION SUBMISSION =====
document.getElementById('donation-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedInUser) { window.showAlert("Error", "Please login first.", "error"); return; }
    const item = document.getElementById('don-item')?.value.trim() || '';
    const purpose = document.getElementById('don-purpose')?.value.trim() || '';
    if (!item || !purpose) { window.showAlert("Error", "Please fill in all fields.", "error"); return; }
    window.openPaymentModal(item, purpose);
});

// ===== USER HOUR TRACKER =====
function initUserHourTracker() {
    if (!loggedInUser || !loggedInUser.id) return;
    const q = query(collection(db, "service_hours"), where("residentId", "==", loggedInUser.id));
    onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('user-hours-tbody');
        const display = document.getElementById('total-hours-display');
        if (!tbody || !display) return;
        tbody.innerHTML = '';
        let total = 0;
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.status === "Approved") {
                total += parseFloat(data.hours || 0);
                tbody.innerHTML += `<tr class="border-b border-stone-100"><td class="px-4 py-3">${data.eventTitle || 'N/A'}</td><td class="px-4 py-3">${data.hours || 0}</td><td class="px-4 py-3 text-emerald-600 font-bold">Approved</td></tr>`;
            }
        });
        if (!tbody.innerHTML) tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No approved records yet.</td></tr>';
        display.innerText = total.toFixed(1);
    });
}
window.initUserHourTracker = initUserHourTracker;

// ===== UI NAV & MODAL HANDLING =====
window.switchTab = function(tabId) {
    if (isTabSwitching) { console.log('⚠️ Tab switch in progress, please wait...'); return; }
    isTabSwitching = true;
    const tabMessages = { 'announcements': 'Loading announcements...', 'events': 'Loading events...', 'my-events': 'Loading your events...', 'volunteers': 'Loading volunteer registration...', 'hours': 'Loading service hours...', 'donations': 'Loading donations...', 'profile': 'Loading profile settings...' };
    showLoading(tabMessages[tabId] || 'Loading...');
    setTimeout(() => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(tabId);
        if (target) target.classList.remove('hidden');
        document.querySelectorAll('.nav-link').forEach(btn => { btn.className = "nav-link w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm text-stone-200 hover:bg-tsu-dark/50 transition-all"; });
        const activeBtn = Array.from(document.querySelectorAll('.nav-link')).find(b => b.getAttribute('onclick')?.includes(tabId));
        if (activeBtn) activeBtn.className = "nav-link w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm bg-tsu-dark text-tsu-gold border border-tsu-gold/20 shadow-lg";
        saveActiveTab(tabId);
        if (tabId === 'my-events') renderMyEvents();
        setTimeout(() => { hideLoading(); isTabSwitching = false; console.log(`✅ Switched to tab: ${tabId}`); }, 300);
    }, 800);
};

// UPDATED openEventDetails with time parameter
window.openEventDetails = function(title, date, time, location, desc) {
    document.getElementById('modal-event-title').innerText = title;
    
    let dateDisplay = `Date: ${date || 'TBA'}`;
    if (time && time !== 'undefined' && time !== '') {
        dateDisplay += ` at ${time}`;
    }
    document.getElementById('modal-event-date').innerHTML = `<i class="fa-solid fa-calendar mr-2"></i>${dateDisplay}`;
    document.getElementById('modal-event-location').innerHTML = `<i class="fa-solid fa-location-dot mr-2"></i>Location: ${location || 'TBA'}`;
    document.getElementById('modal-event-desc').innerHTML = desc;
    window.toggleModal('view-event-modal');
};

window.toggleModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) { modal.classList.toggle('hidden'); document.body.style.overflow = modal.classList.contains('hidden') ? '' : 'hidden'; }
};

document.getElementById('view-event-modal')?.addEventListener('click', function(e) { if (e.target === this) window.toggleModal('view-event-modal'); });
document.getElementById('confirm-modal')?.addEventListener('click', function(e) { if (e.target === this) { this.classList.add('hidden'); pendingConfirmCallback = null; } });
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        ['view-event-modal', 'confirm-modal', 'payment-modal'].forEach(id => {
            const modal = document.getElementById(id);
            if (modal && !modal.classList.contains('hidden')) window.toggleModal(id);
        });
    }
});

// ===== MOBILE MENU =====
const mobileMenu = document.getElementById('mobile-menu');
const menuPanel = document.getElementById('menu-panel');

window.toggleMobileMenu = function() {
    if (!mobileMenu || !menuPanel) return;
    if (mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.remove('hidden'); document.body.style.overflow = 'hidden';
        setTimeout(() => { mobileMenu.classList.remove('opacity-0'); mobileMenu.classList.add('opacity-100'); menuPanel.classList.remove('translate-x-full'); }, 10);
    } else {
        menuPanel.classList.add('translate-x-full'); mobileMenu.classList.remove('opacity-100'); mobileMenu.classList.add('opacity-0'); document.body.style.overflow = '';
        setTimeout(() => mobileMenu.classList.add('hidden'), 300);
    }
};
if (mobileMenu) mobileMenu.addEventListener('click', (e) => { if (e.target === mobileMenu) window.toggleMobileMenu(); });
if (menuPanel) menuPanel.querySelectorAll('button').forEach(b => b.addEventListener('click', window.toggleMobileMenu));

// ===== APPLICATION INITIALIZATION =====
window.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Application initializing...');
    showLoading("Initializing application...");
    const savedUser = getSavedSession();
    if (savedUser?.id) {
        console.log('👤 Restoring session for:', savedUser.email);
        showLoading("Restoring your session...");
        try {
            const snap = await getDoc(doc(db, "residents", savedUser.id));
            if (snap.exists()) {
                loggedInUser = { id: snap.id, ...snap.data() };
                const savedEvents = sessionStorage.getItem('registeredEvents');
                if (savedEvents) { try { registeredEventIds = new Set(JSON.parse(savedEvents)); } catch (e) { registeredEventIds = new Set(); } }
                const savedCompleted = sessionStorage.getItem('completedEvents');
                if (savedCompleted) { try { completedEventIds = new Set(JSON.parse(savedCompleted)); } catch (e) { completedEventIds = new Set(); } }
                document.getElementById('auth-screen')?.classList.add('hidden');
                document.getElementById('dashboard')?.classList.remove('hidden');
                updateUIWithUserData(loggedInUser);
                await setUserStatus(loggedInUser.id, true);
                initUserHourTracker();
                await loadUserRegisteredEvents();
                setupParticipantsListener();
                const activeTab = getSavedActiveTab();
                setTimeout(() => window.switchTab(activeTab), 500);
                console.log('✅ Session restored successfully');
            } else { console.log('⚠️ Saved user not found in database'); clearUserSession(); hideLoading(); }
        } catch (error) {
            console.error('❌ Session restore error:', error);
            loggedInUser = savedUser;
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('dashboard')?.classList.remove('hidden');
            updateUIWithUserData(loggedInUser);
            initUserHourTracker();
            setTimeout(() => window.switchTab(getSavedActiveTab()), 500);
        }
    } else { console.log('👋 No saved session found'); setTimeout(hideLoading, 500); }
    console.log('✅ Application initialized');
});

// ===== CLEANUP =====
window.addEventListener('beforeunload', () => {
    if (loggedInUser?.id) {
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        sessionStorage.setItem('completedEvents', JSON.stringify([...completedEventIds]));
        setUserStatus(loggedInUser.id, false);
    }
    if (participantsUnsubscribe) participantsUnsubscribe();
});

// ===== EXPORT GLOBALS =====
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.toggleMobileMenu = toggleMobileMenu;
window.triggerLogoutConfirmation = window.triggerLogoutConfirmation;
window.joinEvent = joinEvent;
window.confirmJoinEvent = confirmJoinEvent;
window.performJoinEvent = performJoinEvent;
window.unregisterFromEvent = unregisterFromEvent;
window.selectPaymentMethod = selectPaymentMethod;
window.setAmount = setAmount;
window.processPayment = processPayment;
window.openPaymentModal = openPaymentModal;
window.formatTimeDisplay = formatTimeDisplay;
