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
let eventsUnsubscribe = null;
let participantsUnsubscribe = null;

// ===== DATE UTILITIES =====
function formatFirebaseDate(timestamp) {
    if (!timestamp) return 'N/A';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    
    return date.toLocaleDateString('en-US', options);
}

function formatShortDate(timestamp) {
    if (!timestamp) return 'N/A';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric'
    };
    
    return date.toLocaleDateString('en-US', options);
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
    } catch (e) {
        console.error('Failed to save session:', e);
    }
}

function clearUserSession() {
    try {
        localStorage.removeItem('barangayUser');
        sessionStorage.removeItem('userActiveTab');
        sessionStorage.removeItem('registeredEvents');
    } catch (e) {
        console.error('Failed to clear session:', e);
    }
}

function getSavedSession() {
    try {
        const saved = localStorage.getItem('barangayUser');
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed && parsed.id ? parsed : null;
        }
    } catch (e) {
        console.error('Failed to parse saved session:', e);
        clearUserSession();
    }
    return null;
}

function saveActiveTab(tabId) {
    try {
        sessionStorage.setItem('userActiveTab', tabId);
    } catch (e) {
        console.error('Failed to save active tab:', e);
    }
}

function getSavedActiveTab() {
    try {
        return sessionStorage.getItem('userActiveTab') || 'announcements';
    } catch (e) {
        return 'announcements';
    }
}

// ===== LOADING MANAGEMENT =====
function showLoading(msg = "Loading...") {
    const loader = document.getElementById('global-loading');
    const text = document.getElementById('loading-text');
    if (loader) {
        loader.classList.remove('hidden');
        loader.style.display = 'flex';
    }
    if (text) {
        text.textContent = msg;
    }
}

function hideLoading() {
    const loader = document.getElementById('global-loading');
    if (loader) {
        loader.classList.add('hidden');
        loader.style.display = 'none';
    }
}

// ===== UI UTILITIES =====
function updateUIWithUserData(user) {
    if (!user) return;

    const safeSetVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    const safeSetText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '';
    };

    const iconFallback = document.getElementById('profile-icon-fallback');
    const imgPreview = document.getElementById('profile-img-preview');
    if (imgPreview) {
        imgPreview.src = "";
        imgPreview.classList.add('hidden');
    }
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

    document.querySelectorAll('input[type="password"], input[id*="pass"]').forEach(f => {
        if (f) f.value = user.password || '';
    });

    displayFormattedDates(user);
}

function displayFormattedDates(user) {
    const createdDate = formatFirebaseDate(user.createdAt);
    const lastActiveDate = formatFirebaseDate(user.lastActive);
    
    console.log('📅 Account created:', createdDate);
    console.log('🕐 Last active:', lastActiveDate);
    
    const createdEl = document.getElementById('profile-created-date');
    const activeEl = document.getElementById('profile-last-active');
    
    if (createdEl) createdEl.textContent = `Member since: ${createdDate}`;
    if (activeEl) activeEl.textContent = `Last active: ${lastActiveDate}`;
}

// ===== ALERT SYSTEM =====
window.showAlert = function(title, message, type = 'success') {
    const alertEl = document.getElementById('custom-alert');
    if (!alertEl) {
        alert(`${title}\n${message}`);
        return;
    }

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

    alertTimeout = setTimeout(() => {
        window.closeCustomAlert();
    }, 4000);
};

window.closeCustomAlert = function() {
    const el = document.getElementById('custom-alert');
    if (el) {
        el.classList.remove('translate-x-0', 'opacity-100');
        el.classList.add('translate-x-96', 'opacity-0', 'pointer-events-none');
    }
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
    try {
        await updateDoc(doc(db, "residents", userId), {
            isOnline: status,
            lastActive: serverTimestamp()
        });
    } catch (e) {
        console.error('Failed to update user status:', e);
    }
}

async function loadUserRegisteredEvents() {
    if (!loggedInUser?.id) return;
    
    try {
        const q = query(
            collection(db, "participants"),
            where("residentId", "==", loggedInUser.id),
            where("status", "==", "registered")
        );
        
        const snap = await getDocs(q);
        registeredEventIds.clear();
        
        snap.forEach(doc => {
            registeredEventIds.add(doc.data().eventId);
        });
        
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        
        console.log('📋 Loaded registered events:', registeredEventIds.size);
        return registeredEventIds;
    } catch (error) {
        console.error('Error loading registered events:', error);
        return new Set();
    }
}

function setupParticipantsListener() {
    if (!loggedInUser?.id) return;
    
    // Unsubscribe from previous listener if exists
    if (participantsUnsubscribe) {
        participantsUnsubscribe();
    }
    
    const q = query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("status", "==", "registered")
    );
    
    participantsUnsubscribe = onSnapshot(q, (snap) => {
        registeredEventIds.clear();
        snap.forEach(doc => {
            registeredEventIds.add(doc.data().eventId);
        });
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        renderEvents();
    }, (error) => {
        console.error('❌ Participants listener error:', error);
    });
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

    if (!name || !email || !phone || !age || !gender || !address || !pass) {
        window.showAlert("Error", "All fields are required.", "error");
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        window.showAlert("Error", "Please enter a valid email address.", "error");
        return;
    }

    if (pass !== confirmPass) {
        window.showAlert("Error", "Passwords do not match.", "error");
        return;
    }

    if (pass.length < 6) {
        window.showAlert("Error", "Password must be at least 6 characters.", "error");
        return;
    }

    showLoading("Creating account...");

    try {
        const checkSnap = await getDocs(
            query(collection(db, "residents"), where("email", "==", email), limit(1))
        );

        if (!checkSnap.empty) {
            hideLoading();
            window.showAlert("Error", "Email already registered. Please use a different email.", "error");
            return;
        }

        const userData = {
            name,
            email,
            phone,
            age: parseInt(age) || 0,
            gender,
            address,
            password: pass,
            isOnline: false,
            profilePic: "", 
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp(),
            role: "resident"
        };

        const docRef = await addDoc(collection(db, "residents"), userData);
        newUserId = docRef.id;

        hideLoading();
        document.getElementById('register-form')?.reset();
        
        window.showAlert("Success!", "Account created successfully! You can now login.", "success");
        window.toggleAuthPanels(false);
        newUserId = null;

    } catch (err) {
        hideLoading();
        console.error('Registration error:', err);
        window.showAlert("Error", `Registration failed: ${err.message}`, "error");
    }
});

// ===== LOGIN =====
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email')?.value.trim().toLowerCase() || '';
    const pass = document.getElementById('login-password')?.value || '';

    if (!email || !pass) {
        window.showAlert("Error", "Please enter your email and password.", "error");
        return;
    }

    showLoading("Logging in...");

    try {
        const q = query(
            collection(db, "residents"),
            where("email", "==", email),
            where("password", "==", pass),
            limit(1)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
            snap.forEach(d => {
                loggedInUser = { id: d.id, ...d.data() };
            });

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

        } else {
            hideLoading();
            window.showAlert("Error", "Invalid email or password. Please try again.", "error");
        }
    } catch (err) {
        hideLoading();
        console.error('Login error:', err);
        window.showAlert("Error", `Login failed: ${err.message}`, "error");
    }
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

        const passInput = profileForm.querySelector('input[type="password"]') || 
                         document.getElementById('prof-password');
        const password = (passInput && passInput.value.trim() !== "") ? 
                        passInput.value.trim() : loggedInUser.password;

        if (!name) {
            window.showAlert("Error", "Name cannot be empty.", "error");
            return;
        }

        isSaving = true;
        showLoading("Saving profile changes...");

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Saving...";
        }

        try {
            const updateData = {
                name,
                phone,
                age: parseInt(ageVal) || 0,
                gender,
                address,
                password,
                lastProfileUpdate: serverTimestamp()
            };

            await updateDoc(doc(db, "residents", loggedInUser.id), updateData);
            Object.assign(loggedInUser, updateData);
            saveUserSession(loggedInUser);
            updateUIWithUserData(loggedInUser);

            hideLoading();
            window.showAlert("Success!", "Your profile has been updated successfully!", "success");

        } catch (error) {
            hideLoading();
            console.error('❌ Profile save error:', error);
            window.showAlert("Error", `Failed to save profile: ${error.message}`, "error");
        } finally {
            isSaving = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Save Profile Changes";
            }
        }
    });
}

// ===== PASSWORD TOGGLE =====
document.getElementById('toggle-prof-password')?.addEventListener('click', function() {
    const fields = document.querySelectorAll('#profile-form input[type="password"], #profile-form input[type="text"][id*="pass"]');
    const icon = document.getElementById('prof-password-icon');

    fields.forEach(f => {
        if (f.type === 'password') {
            f.type = 'text';
            if (icon) {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        } else {
            f.type = 'password';
            if (icon) {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    });
});

// ===== LOGOUT =====
window.triggerLogoutConfirmation = function() {
    window.showConfirmPopup(
        "Leave Portal?",
        "Are you sure you want to logout?",
        async () => {
            showLoading("Logging out...");
            try {
                if (loggedInUser?.id) {
                    await setUserStatus(loggedInUser.id, false);
                }
                
                // Unsubscribe from listeners
                if (participantsUnsubscribe) {
                    participantsUnsubscribe();
                    participantsUnsubscribe = null;
                }
                
                clearUserSession();
                loggedInUser = null;
                registeredEventIds.clear();
                
                document.getElementById('auth-screen')?.classList.remove('hidden');
                document.getElementById('dashboard')?.classList.add('hidden');
                document.getElementById('login-form')?.reset();
                
                hideLoading();
                window.showAlert("Goodbye!", "You have been logged out successfully.", "success");
            } catch (err) {
                hideLoading();
                console.error('Logout error:', err);
            }
        }
    );
};

// ===== CONFIRM MODAL HANDLERS =====
document.getElementById('confirm-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-modal')?.classList.add('hidden');
    pendingConfirmCallback = null;
});

document.getElementById('confirm-proceed-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-modal')?.classList.add('hidden');
    if (typeof pendingConfirmCallback === 'function') {
        pendingConfirmCallback();
    }
    pendingConfirmCallback = null;
});

// ==========================================
//      REAL-TIME PUBLIC DATA RENDERERS
// ==========================================

// 1. ===== ANNOUNCEMENTS (PUBLIC) =====
onSnapshot(
    query(collection(db, "announcements"), orderBy("createdAt", "desc")),
    (snap) => {
        const container = document.getElementById('announcements-container');
        if (!container) return;

        if (snap.empty) {
            container.innerHTML = `
                <div class="text-center py-10 text-stone-400">
                    <i class="fa-solid fa-bullhorn text-4xl mb-3 opacity-30"></i>
                    <p>No announcements yet.</p>
                </div>`;
            return;
        }

        let html = '';
        snap.forEach(d => {
            const a = d.data();
            let priorityClass = "bg-stone-100 text-stone-800";
            if (a.priority === "Important") priorityClass = "bg-amber-100 text-amber-800";
            if (a.priority === "Emergency") priorityClass = "bg-red-100 text-red-800";

            html += `
                <div class="bg-white p-5 rounded-xl border shadow-sm mb-3">
                    <span class="text-xs font-bold uppercase px-2 py-0.5 rounded ${priorityClass}">
                        ${a.priority || 'Notice'}
                    </span>
                    <h3 class="font-bold text-stone-900 mt-2">${a.title || ''}</h3>
                    <p class="text-sm text-stone-600 mt-1 whitespace-pre-line">${a.desc || ''}</p>
                </div>`;
        });
        container.innerHTML = html;
    },
    (error) => console.error('❌ Announcements error:', error)
);

// 2. ===== EVENTS RENDERER =====
function renderEvents() {
    const grid = document.getElementById('events-grid');
    if (!grid) return;

    getDocs(query(collection(db, "events"), orderBy("date", "asc")))
        .then((snap) => {
            if (snap.empty) {
                grid.innerHTML = `
                    <div class="col-span-full text-center py-10 text-stone-400">
                        <i class="fa-solid fa-calendar-xmark text-4xl mb-3 opacity-30"></i>
                        <p>No upcoming events.</p>
                    </div>`;
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
                const buttonHtml = isRegistered 
                    ? `<button onclick="event.stopPropagation(); window.unregisterFromEvent('${id}', '${esc(ev.title)}')" 
                              class="mt-3 w-full bg-red-50 border border-red-200 text-red-600 font-bold py-2 rounded-xl text-sm hover:bg-red-100 transition-colors">
                              <i class="fa-solid fa-user-minus mr-1"></i> Unregister
                        </button>`
                    : `<button onclick="event.stopPropagation(); window.joinEvent('${id}', '${esc(ev.title)}')" 
                              class="mt-3 w-full bg-stone-50 border text-tsu-maroon font-bold py-2 rounded-xl text-sm hover:bg-tsu-maroon hover:text-tsu-gold transition-colors">
                              <i class="fa-solid fa-user-plus mr-1"></i> Join
                        </button>`;

                html += `
                    <div onclick="openEventDetails('${esc(ev.title)}', '${esc(ev.date)}', '${esc(ev.location)}', '${esc(ev.desc).replace(/\n/g, '<br>')}')" 
                         class="bg-white p-6 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all">
                        <span class="text-xs font-bold uppercase bg-red-50 text-tsu-maroon px-2 py-1 rounded">
                            ${ev.category || 'Event'}
                        </span>
                        <h3 class="text-lg font-black text-stone-900 mt-2">${ev.title || ''}</h3>
                        <p class="text-xs text-stone-500 mt-2">
                            <i class="fa-solid fa-map-pin mr-2"></i>${ev.location || ''} | ${ev.date || ''}
                        </p>
                        ${buttonHtml}
                    </div>`;
            });
            grid.innerHTML = html;
        })
        .catch((error) => console.error('❌ Events render error:', error));
}
// ===== MY EVENTS RENDERER =====
function renderMyEvents() {
    const grid = document.getElementById('my-events-grid');
    if (!grid) return;

    // If user not logged in or no registered events
    if (!loggedInUser || registeredEventIds.size === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-10 text-stone-400">
                <i class="fa-solid fa-calendar-xmark text-4xl mb-3 opacity-30"></i>
                <p>You haven't registered for any events yet.</p>
                <p class="text-xs mt-2">Browse events and click "Join" to register.</p>
            </div>`;
        return;
    }

    showLoading("Loading your events...");

    // Get all events and filter to only show registered ones
    getDocs(query(collection(db, "events"), orderBy("date", "asc")))
        .then((snap) => {
            let html = '';
            let foundEvents = false;

            snap.forEach(d => {
                const ev = d.data(), id = d.id;
                
                // Only show events the user is registered for
                if (!registeredEventIds.has(id)) return;
                
                foundEvents = true;
                
                const esc = (t) => {
                    const div = document.createElement('div');
                    div.textContent = t || '';
                    return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                };

                html += `
                    <div class="bg-white p-6 rounded-xl border shadow-sm border-l-4 border-l-emerald-500">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold uppercase bg-red-50 text-tsu-maroon px-2 py-1 rounded">
                                ${ev.category || 'Event'}
                            </span>
                            <span class="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-bold">
                                <i class="fa-solid fa-circle-check mr-1"></i>Registered
                            </span>
                        </div>
                        <h3 class="text-lg font-black text-stone-900 mt-2">${ev.title || ''}</h3>
                        <p class="text-xs text-stone-500 mt-2">
                            <i class="fa-solid fa-map-pin mr-2"></i>${ev.location || ''} | ${ev.date || ''}
                        </p>
                        <p class="text-xs text-stone-600 mt-2 line-clamp-2">${ev.desc || 'No description available.'}</p>
                        <div class="mt-4 flex space-x-2">
                            <button onclick="openEventDetails('${esc(ev.title)}', '${esc(ev.date)}', '${esc(ev.location)}', '${esc(ev.desc).replace(/\n/g, '<br>')}')" 
                                    class="flex-1 bg-stone-50 border text-stone-700 font-bold py-2 rounded-xl text-xs hover:bg-stone-100 transition-colors">
                                <i class="fa-solid fa-info-circle mr-1"></i> View Details
                            </button>
                            <button onclick="event.stopPropagation(); window.unregisterFromEvent('${id}', '${esc(ev.title)}')" 
                                    class="flex-1 bg-red-50 border border-red-200 text-red-600 font-bold py-2 rounded-xl text-xs hover:bg-red-100 transition-colors">
                                <i class="fa-solid fa-user-minus mr-1"></i> Unregister
                            </button>
                        </div>
                    </div>`;
            });

            if (!foundEvents) {
                html = `
                    <div class="col-span-full text-center py-10 text-stone-400">
                        <i class="fa-solid fa-calendar-xmark text-4xl mb-3 opacity-30"></i>
                        <p>You haven't registered for any events yet.</p>
                        <p class="text-xs mt-2">Browse events and click "Join" to register.</p>
                    </div>`;
            }

            grid.innerHTML = html;
            hideLoading();
        })
        .catch((error) => {
            console.error('❌ My Events render error:', error);
            grid.innerHTML = `
                <div class="col-span-full text-center py-10 text-stone-400">
                    <i class="fa-solid fa-triangle-exclamation text-4xl mb-3 opacity-30"></i>
                    <p>Failed to load your events. Please try again.</p>
                </div>`;
            hideLoading();
        });
}

// Update renderEvents to also refresh My Events
const originalRenderEvents = renderEvents;
renderEvents = function() {
    originalRenderEvents();
    if (loggedInUser) {
        renderMyEvents();
    }
};

// Update joinEvent to also refresh My Events
const originalJoinEvent = window.joinEvent;
window.joinEvent = async function(eventId, eventTitle) {
    await originalJoinEvent(eventId, eventTitle);
    renderMyEvents();
};

// Update unregisterFromEvent to also refresh My Events
const originalUnregisterFromEvent = window.unregisterFromEvent;
window.unregisterFromEvent = async function(eventId, eventTitle) {
    await originalUnregisterFromEvent(eventId, eventTitle);
    renderMyEvents();
};

// Update switchTab to refresh My Events when switching to it
const originalSwitchTab = window.switchTab;
window.switchTab = function(tabId) {
    originalSwitchTab(tabId);
    if (tabId === 'my-events') {
        renderMyEvents();
    }
};

// Make renderMyEvents available globally
window.renderMyEvents = renderMyEvents;

// 3. ===== DONATIONS (PUBLIC) =====
onSnapshot(
    query(collection(db, "donations"), orderBy("createdAt", "desc")),
    (snap) => {
        const tbody = document.getElementById('public-donations-tbody');
        if (!tbody) return;

        let html = '';
        snap.forEach(d => {
            const data = d.data();
            html += `
                <tr class="hover:bg-stone-50/60 border-b last:border-0">
                    <td class="px-4 py-3 font-bold text-stone-900">${data.donorName || 'Anonymous'}</td>
                    <td class="px-4 py-3 text-emerald-700 font-medium">${data.item || ''}</td>
                    <td class="px-4 py-3 text-stone-600">${data.purpose || ''}</td>
                </tr>`;
        });

        if (!html) {
            html = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No donations reported yet.</td></tr>';
        }
        tbody.innerHTML = html;
    },
    (error) => console.error('❌ Donations error:', error)
);

// 4. ===== PUBLIC SERVICE HOURS LEADERBOARD/LOG =====
onSnapshot(
    query(collection(db, "service_hours"), orderBy("hours", "desc")),
    (snap) => {
        const tbody = document.getElementById('public-hours-tbody');
        if (!tbody) return;

        let html = '';
        snap.forEach(d => {
            const data = d.data();
            if (data.status === "Approved" || data.status === "approved") {
                html += `
                    <tr class="hover:bg-stone-50/60 border-b last:border-0">
                        <td class="px-4 py-3 font-bold text-stone-900">${data.residentName || 'Resident'}</td>
                        <td class="px-4 py-3 text-stone-600">${data.eventTitle || 'Community Event'}</td>
                        <td class="px-4 py-3 font-mono text-emerald-600 font-black">${data.hours || 0} hrs</td>
                    </tr>`;
            }
        });

        if (!html) {
            html = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No approved service hours listed yet.</td></tr>';
        }
        tbody.innerHTML = html;
    },
    (error) => console.error('❌ Public Service Hours error:', error)
);

// 5. ===== VOLUNTEERS LIST (PUBLIC) =====
onSnapshot(
    query(collection(db, "volunteers"), orderBy("createdAt", "desc")),
    (snap) => {
        const tbody = document.getElementById('public-volunteers-tbody');
        if (!tbody) return;

        let html = '';
        snap.forEach(d => {
            const data = d.data();
            if (data.status === "Approved" || data.status === "approved" || data.status === "pending") {
                html += `
                    <tr class="hover:bg-stone-50/60 border-b last:border-0">
                        <td class="px-4 py-3 font-bold text-stone-900">${data.name || 'Resident'}</td>
                        <td class="px-4 py-3 text-stone-600">${data.skills || 'General Help'}</td>
                        <td class="px-4 py-3">
                            <span class="text-xs px-2 py-0.5 rounded-full font-bold ${data.status === 'Approved' || data.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                                ${data.status || 'Pending'}
                            </span>
                        </td>
                    </tr>`;
            }
        });

        if (!html) {
            html = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No active volunteers listed.</td></tr>';
        }
        tbody.innerHTML = html;
    },
    (error) => console.error('❌ Public Volunteers error:', error)
);

// ==========================================
//      FORMS & USER-SPECIFIC ACTIONS
// ==========================================

// ===== JOIN EVENT =====
window.joinEvent = async function(eventId, eventTitle) {
    if (!loggedInUser) {
        window.showAlert("Error", "Please login first to join events.", "error");
        return;
    }

    if (registeredEventIds.has(eventId)) {
        window.showAlert("Already Registered", `You are already registered for "${eventTitle}".`, "error");
        return;
    }

    showLoading("Joining event...");

    try {
        const existingQuery = query(
            collection(db, "participants"),
            where("residentId", "==", loggedInUser.id),
            where("eventId", "==", eventId),
            where("status", "==", "registered"),
            limit(1)
        );
        
        const existingSnap = await getDocs(existingQuery);
        
        if (!existingSnap.empty) {
            registeredEventIds.add(eventId);
            sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
            renderEvents();
            
            hideLoading();
            window.showAlert("Already Registered", `You are already registered for "${eventTitle}".`, "error");
            return;
        }

        await addDoc(collection(db, "participants"), {
            residentId: loggedInUser.id,
            residentName: loggedInUser.name,
            residentEmail: loggedInUser.email,
            eventTitle,
            eventId,
            timestamp: serverTimestamp(),
            status: 'registered'
        });

        registeredEventIds.add(eventId);
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        renderEvents();

        hideLoading();
        window.showAlert("Success!", `You have successfully joined "${eventTitle}"!`, "success");
        
    } catch (e) {
        hideLoading();
        console.error('❌ Join event error:', e);
        window.showAlert("Error", "Failed to join event. Please try again.", "error");
    }
};

// ===== UNREGISTER FROM EVENT =====
window.unregisterFromEvent = async function(eventId, eventTitle) {
    if (!loggedInUser) {
        window.showAlert("Error", "Please login first.", "error");
        return;
    }

    window.showConfirmPopup(
        "Cancel Registration?",
        `Are you sure you want to cancel your registration for "${eventTitle}"?`,
        async () => {
            showLoading("Cancelling registration...");
            
            try {
                const existingQuery = query(
                    collection(db, "participants"),
                    where("residentId", "==", loggedInUser.id),
                    where("eventId", "==", eventId),
                    where("status", "==", "registered"),
                    limit(1)
                );
                
                const existingSnap = await getDocs(existingQuery);
                
                if (!existingSnap.empty) {
                    const deletePromises = [];
                    existingSnap.forEach((document) => {
                        deletePromises.push(deleteDoc(doc(db, "participants", document.id)));
                    });
                    
                    await Promise.all(deletePromises);
                }
                
                registeredEventIds.delete(eventId);
                sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
                renderEvents();
                
                hideLoading();
                window.showAlert("Cancelled", `You have successfully unregistered from "${eventTitle}".`, "success");
                
            } catch (e) {
                hideLoading();
                console.error('❌ Unregister error:', e);
                window.showAlert("Error", "Failed to cancel registration. Please try again.", "error");
            }
        }
    );
};

// ===== VOLUNTEER SUBMISSION =====
document.getElementById('volunteer-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!loggedInUser) {
        window.showAlert("Error", "Please login first.", "error");
        return;
    }

    const skills = document.getElementById('vol-skills')?.value.trim() || '';
    const availability = document.getElementById('vol-avail')?.value || '';

    if (!skills) {
        window.showAlert("Error", "Please enter your skills.", "error");
        return;
    }

    showLoading("Submitting volunteer registration...");

    try {
        await addDoc(collection(db, "volunteers"), {
            residentId: loggedInUser.id,
            name: loggedInUser.name,
            email: loggedInUser.email,
            skills,
            availability,
            createdAt: serverTimestamp(),
            status: 'pending'
        });

        hideLoading();
        window.showAlert("Success!", "Thank you for volunteering! Your application is pending approval.", "success");
        document.getElementById('volunteer-form')?.reset();
    } catch (err) {
        hideLoading();
        console.error('❌ Volunteer error:', err);
        window.showAlert("Error", "Failed to submit volunteer registration.", "error");
    }
});

// ===== DONATION SUBMISSION =====
document.getElementById('donation-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!loggedInUser) {
        window.showAlert("Error", "Please login first.", "error");
        return;
    }

    const item = document.getElementById('don-item')?.value.trim() || '';
    const purpose = document.getElementById('don-purpose')?.value.trim() || '';

    if (!item || !purpose) {
        window.showAlert("Error", "Please fill in all fields.", "error");
        return;
    }

    showLoading("Submitting donation...");

    try {
        await addDoc(collection(db, "donations"), {
            donorName: loggedInUser.name,
            donorId: loggedInUser.id,
            item,
            purpose,
            createdAt: serverTimestamp(),
            status: 'pending'
        });

        hideLoading();
        window.showAlert("Success!", "Donation reported successfully! Thank you for your contribution.", "success");
        document.getElementById('donation-form')?.reset();
    } catch (err) {
        hideLoading();
        console.error('❌ Donation error:', err);
        window.showAlert("Error", "Failed to submit donation.", "error");
    }
});

// ===== USER HOUR TRACKER =====
function initUserHourTracker() {
    if (!loggedInUser || !loggedInUser.id) {
        console.warn("User ID not available for hour tracker.");
        return;
    }

    const q = query(
        collection(db, "service_hours"), 
        where("residentId", "==", loggedInUser.id)
    );

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
                
                tbody.innerHTML += `
                    <tr class="border-b border-stone-100">
                        <td class="px-4 py-3">${data.eventTitle || 'N/A'}</td>
                        <td class="px-4 py-3">${data.hours || 0}</td>
                        <td class="px-4 py-3 text-emerald-600 font-bold">Approved</td>
                    </tr>`;
            }
        });

        if (!tbody.innerHTML) {
            tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-center text-stone-400">No approved service records yet.</td></tr>';
        }

        display.innerText = total.toFixed(1);
    }, (error) => {
        console.error('❌ User hours tracker error:', error);
    });
}

window.initUserHourTracker = initUserHourTracker;

// ===== UI NAV & MODAL HANDLING =====
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
    });

    const target = document.getElementById(tabId);
    if (target) {
        target.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.className = "nav-link w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm text-stone-200 hover:bg-tsu-dark/50";
    });

    const activeBtn = Array.from(document.querySelectorAll('.nav-link')).find(b =>
        b.getAttribute('onclick')?.includes(tabId)
    );

    if (activeBtn) {
        activeBtn.className = "nav-link w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm bg-tsu-dark text-tsu-gold border border-tsu-gold/20";
    }

    saveActiveTab(tabId);
};

window.openEventDetails = function(title, date, location, desc) {
    document.getElementById('modal-event-title').innerText = title;
    document.getElementById('modal-event-date').innerText = `Date: ${date}`;
    document.getElementById('modal-event-location').innerText = `Location: ${location}`;
    document.getElementById('modal-event-desc').innerHTML = desc;
    window.toggleModal('view-event-modal');
};

window.toggleModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.toggle('hidden');
        document.body.style.overflow = modal.classList.contains('hidden') ? '' : 'hidden';
    }
};

document.getElementById('view-event-modal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        window.toggleModal('view-event-modal');
    }
});

document.getElementById('confirm-modal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.add('hidden');
        pendingConfirmCallback = null;
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const eventModal = document.getElementById('view-event-modal');
        const confirmModal = document.getElementById('confirm-modal');

        if (eventModal && !eventModal.classList.contains('hidden')) {
            window.toggleModal('view-event-modal');
        }
        if (confirmModal && !confirmModal.classList.contains('hidden')) {
            confirmModal.classList.add('hidden');
            pendingConfirmCallback = null;
        }
    }
});

// ===== MOBILE MENU =====
const mobileMenu = document.getElementById('mobile-menu');
const menuPanel = document.getElementById('menu-panel');

window.toggleMobileMenu = function() {
    if (!mobileMenu || !menuPanel) return;

    if (mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
            mobileMenu.classList.remove('opacity-0');
            mobileMenu.classList.add('opacity-100');
            menuPanel.classList.remove('translate-x-full');
        }, 10);
    } else {
        menuPanel.classList.add('translate-x-full');
        mobileMenu.classList.remove('opacity-100');
        mobileMenu.classList.add('opacity-0');
        document.body.style.overflow = '';
        
        setTimeout(() => {
            mobileMenu.classList.add('hidden');
        }, 300);
    }
};

if (mobileMenu) {
    mobileMenu.addEventListener('click', (e) => {
        if (e.target === mobileMenu) {
            window.toggleMobileMenu();
        }
    });
}

if (menuPanel) {
    menuPanel.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', window.toggleMobileMenu);
    });
}

// ===== APPLICATION INITIALIZATION =====
window.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Application initializing...');
    showLoading("Initializing...");

    const savedUser = getSavedSession();

    if (savedUser?.id) {
        console.log('👤 Restoring session for:', savedUser.email);
        showLoading("Restoring session...");

        try {
            const snap = await getDoc(doc(db, "residents", savedUser.id));
            
            if (snap.exists()) {
                loggedInUser = { id: snap.id, ...snap.data() };
                
                const savedEvents = sessionStorage.getItem('registeredEvents');
                if (savedEvents) {
                    try {
                        const eventsArray = JSON.parse(savedEvents);
                        registeredEventIds = new Set(eventsArray);
                    } catch (e) {
                        registeredEventIds = new Set();
                    }
                }
                
                document.getElementById('auth-screen')?.classList.add('hidden');
                document.getElementById('dashboard')?.classList.remove('hidden');
                
                updateUIWithUserData(loggedInUser);
                await setUserStatus(loggedInUser.id, true);
                initUserHourTracker();
                await loadUserRegisteredEvents();
                setupParticipantsListener();

                const activeTab = getSavedActiveTab();
                window.switchTab(activeTab);

                hideLoading();
                console.log('✅ Session restored successfully');
            } else {
                console.log('⚠️ Saved user not found in database');
                clearUserSession();
                hideLoading();
            }
        } catch (error) {
            console.error('❌ Session restore error:', error);
            loggedInUser = savedUser;
            
            const savedEvents = sessionStorage.getItem('registeredEvents');
            if (savedEvents) {
                try {
                    const eventsArray = JSON.parse(savedEvents);
                    registeredEventIds = new Set(eventsArray);
                } catch (e) {
                    registeredEventIds = new Set();
                }
            }
            
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('dashboard')?.classList.remove('hidden');
            updateUIWithUserData(loggedInUser);
            initUserHourTracker();
            
            const activeTab = getSavedActiveTab();
            window.switchTab(activeTab);

            hideLoading();
        }
    } else {
        console.log('👋 No saved session found');
        setTimeout(hideLoading, 500);
    }

    console.log('✅ Application initialized');
});

// ===== CLEANUP ON UNLOAD =====
window.addEventListener('beforeunload', () => {
    if (loggedInUser?.id) {
        sessionStorage.setItem('registeredEvents', JSON.stringify([...registeredEventIds]));
        setUserStatus(loggedInUser.id, false);
    }
    
    // Clean up listeners
    if (participantsUnsubscribe) {
        participantsUnsubscribe();
    }
});

// ===== EXPORT GLOBALS =====
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.toggleMobileMenu = toggleMobileMenu;
window.triggerLogoutConfirmation = window.triggerLogoutConfirmation;
window.formatFirebaseDate = formatFirebaseDate;
window.formatShortDate = formatShortDate;
window.loadUserRegisteredEvents = loadUserRegisteredEvents;
window.unregisterFromEvent = unregisterFromEvent;
window.joinEvent = joinEvent;
window.renderEvents = renderEvents;
