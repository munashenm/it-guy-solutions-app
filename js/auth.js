window.authSystem = {
    currentUser: null,
    
    init() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Fetch branding early for Login/Landing screen
        if(window.fbDb) {
            window.fbDb.collection('settings').doc('companyProfile').get().then(doc => {
                if(doc.exists && window.app && typeof window.app.applyBranding === 'function') {
                    window.app.applyBranding(doc.data());
                }
            }).catch(e => console.log("Branding fetch silent fail"));
        }

        // Delay slightly to ensure local-db adapter is ready
        setTimeout(() => this.listenToAuth(), 200);
    },
    
    listenToAuth() {
        console.log("Listening for Local Auth changes...");
        window.fbAuth.onAuthStateChanged(async (user) => {
            if (user) {
                // In local mode, user object from localStorage already contains the role
                this.setAndBootUser(user.uid, user.email, user.role);
            } else {
                this.handleLogoutUI();
            }
        });
    },

    setAndBootUser(uid, email, role) {
        console.log(`Setting up session for ${email} (${role})`);
        this.currentUser = { uid, email, role };
        
        const loginScreen = document.getElementById('login-screen');
        const appContainer = document.querySelector('.app-container');
        
        if (loginScreen) loginScreen.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('hidden');
        
        if (window.app) {
            if (!window.app.initialized) {
                window.app.initialized = true;
                window.app.init();
            }
            window.app.applyRolePermissions(this.currentUser);
        }

        // Update UI
        const profileName = document.getElementById('topbar-user-name');
        const profileRole = document.getElementById('topbar-user-role');
        const profileAvatar = document.getElementById('topbar-user-avatar');

        if(profileName) profileName.textContent = email.split('@')[0];
        if(profileRole) profileRole.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        if(profileAvatar) profileAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(email)}&background=6c5ce7&color=fff&rounded=true`;
    },

    handleLogoutUI() {
        this.currentUser = null;
        const loginScreen = document.getElementById('login-screen');
        const appContainer = document.querySelector('.app-container');
        if (appContainer) appContainer.classList.add('hidden');
        if (loginScreen) loginScreen.classList.remove('hidden');
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        
        errorEl.classList.add('hidden');
        errorEl.innerText = '';

        try {
            const btn = e.target.querySelector('button[type="submit"]');
            btn.innerHTML = "Authenticating...";
            btn.disabled = true;

            await window.fbAuth.signInWithEmailAndPassword(email, pass);
            if(window.app) window.app.logActivity('Staff Login', `User ${email} authenticated successfully.`);
        } catch (error) {
            console.error("Login Error:", error);
            const btn = e.target.querySelector('button[type="submit"]');
            btn.innerHTML = "Log In";
            btn.disabled = false;

            if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
                errorEl.innerText = "❌ SERVER OFFLINE: Please run 'npm start' in the backend folder.";
            } else {
                errorEl.innerText = "❌ " + (error.message || "Invalid Email or Password");
            }
            errorEl.classList.remove('hidden');
        }
    },

    async logout() {
        await window.fbAuth.signOut();
    },

    switchTab(tab) {
        const tabs = document.querySelectorAll('.login-tab');
        tabs.forEach(t => t.classList.remove('active'));
        
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('customer-login-form').classList.add('hidden');

        if (tab === 'staff') {
            if(tabs[0]) tabs[0].classList.add('active');
            document.getElementById('login-form').classList.remove('hidden');
        } else {
            if(tabs[1]) tabs[1].classList.add('active');
            document.getElementById('customer-login-form').classList.remove('hidden');
            alert("Customer Portal Phone Login is disabled in Local Database mode. Please use Staff Login.");
        }
    },


};

document.addEventListener('DOMContentLoaded', () => {
    window.authSystem.init();
});
