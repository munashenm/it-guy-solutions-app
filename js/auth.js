window.authSystem = {
    currentUser: null,
    
    init() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
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
        document.getElementById('track-job-form').classList.add('hidden');

        if (tab === 'staff') {
            if(tabs[0]) tabs[0].classList.add('active');
            document.getElementById('login-form').classList.remove('hidden');
        } else if (tab === 'track') {
            if(tabs[2]) tabs[2].classList.add('active');
            document.getElementById('track-job-form').classList.remove('hidden');
        } else {
            if(tabs[1]) tabs[1].classList.add('active');
            document.getElementById('customer-login-form').classList.remove('hidden');
            alert("Customer Portal Phone Login is disabled in Local Database mode. Please use Staff Login.");
        }
    },

    async handleTrackJob(e) {
        e.preventDefault();
        const jobId = document.getElementById('track-job-id').value.trim().toUpperCase();
        const resEl = document.getElementById('track-job-result');
        if(!jobId) return;

        const btn = e.target.querySelector('button[type="submit"]');
        btn.innerHTML = "Searching...";
        btn.disabled = true;
        resEl.innerHTML = '';

        try {
            let foundJob = null;
            let jobType = '';

            // Check standard workshop jobs
            const wDoc = await window.fbDb.collection('jobs').doc(jobId).get();
            if(wDoc.exists) {
                foundJob = wDoc.data();
                jobType = 'Workshop Repair';
            } else {
                // Check field jobs
                const fDoc = await window.fbDb.collection('fieldJobs').doc(jobId).get();
                if(fDoc.exists) {
                    foundJob = fDoc.data();
                    jobType = 'Field Service';
                }
            }

            if(foundJob) {
                let statusBadge = 'pending';
                if(foundJob.status.toLowerCase() === 'completed' || foundJob.status.toLowerCase() === 'ready for collection') statusBadge = 'success';
                if(foundJob.status.toLowerCase() === 'in repair' || foundJob.status.toLowerCase() === 'on-site') statusBadge = 'active';

                let techOutput = foundJob.technician || 'Not Assigned Yet';
                if(foundJob.technician && window.fbDb) {
                    try {
                        const uQuery = await window.fbDb.collection('users').get();
                        const tUser = uQuery.docs.map(d=>d.data()).find(u => 
                            (u.username && u.username.toLowerCase() === foundJob.technician.toLowerCase()) || 
                            (`${u.firstName || ''} ${u.lastName || ''}`).toLowerCase().includes(foundJob.technician.toLowerCase()) ||
                            (u.email && u.email.split('@')[0].toLowerCase() === foundJob.technician.toLowerCase())
                        );
                        if(tUser && tUser.employeeId) {
                            techOutput += ` <span style="color: #fdcb6e; font-size: 0.8rem;">(ID: ${tUser.employeeId})</span>`;
                        }
                    } catch(e) {}
                }

                resEl.innerHTML = `
                    <div style="background: rgba(108, 92, 231, 0.1); padding: 16px; border-radius: 8px; border: 1px solid rgba(108, 92, 231, 0.3);">
                        <div style="font-size: 0.8rem; color: #a29bfe; margin-bottom: 4px;">${jobType}</div>
                        <h3 style="margin: 0 0 12px 0;">${foundJob.id}</h3>
                        <div style="margin-bottom: 12px;"><strong>Status:</strong> <span class="badge ${statusBadge}">${foundJob.status}</span></div>
                        <div style="margin-bottom: 8px;"><strong>Device/Call:</strong> ${foundJob.device || foundJob.description || 'N/A'}</div>
                        <div style="margin-bottom: 8px;"><strong>Assigned To:</strong> ${techOutput}</div>
                        <div style="font-size: 0.85rem; color: #a0a0a0;">Created: ${foundJob.date || foundJob.dateBooked || 'N/A'}</div>
                    </div>
                `;
            } else {
                resEl.innerHTML = `
                    <div style="background: rgba(255, 118, 117, 0.1); color: #ff7675; padding: 16px; border-radius: 8px; border: 1px solid rgba(255, 118, 117, 0.3); text-align: center;">
                        <span class="material-symbols-outlined" style="font-size: 2rem; margin-bottom: 8px;">search_off</span><br>
                        Could not find a job with ID <strong>${jobId}</strong>.
                    </div>
                `;
            }

        } catch (err) {
            console.error("Tracking Error:", err);
            resEl.innerHTML = `<div style="color: #ff7675;">An error occurred while tracking.</div>`;
        }

        btn.innerHTML = "Track Progress";
        btn.disabled = false;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.authSystem.init();
});
