window.userProfile = {
    profileData: null,

    init() {
        if(!window.authSystem || !window.authSystem.currentUser) return;
        this.fetchProfile();
    },

    async fetchProfile() {
        const uid = window.authSystem.currentUser.uid;
        if(!uid || !window.fbDb) return;

        try {
            const docRef = window.fbDb.collection("users").doc(uid);
            const doc = await docRef.get();
            
            if(doc.exists) {
                this.profileData = doc.data();
                this.updateSidebar();
                this.populateForm();
            } else {
                 console.warn("User document not found in DB.");
                 // Create fallback data so UI doesn't break
                 this.profileData = {
                     email: window.authSystem.currentUser.email || '',
                     phone: window.authSystem.currentUser.phone || '',
                     role: window.authSystem.currentUser.role || 'client'
                 };
                 this.updateSidebar();
                 this.populateForm();
            }
        } catch(e) {
            console.error("Error fetching user profile", e);
        }
    },

    updateSidebar() {
        if(!this.profileData) return;
        
        let dName = this.profileData.firstName && this.profileData.firstName.trim() !== '' 
            ? this.profileData.firstName 
            : (this.profileData.username ? this.profileData.username : (this.profileData.email ? this.profileData.email.split('@')[0] : 'User'));
            
        if(dName === 'User' && this.profileData.phone) dName = this.profileData.phone;

        const role = this.profileData.role || 'client';

        const sbName = document.getElementById('sidebar-user-name');
        const sbRole = document.getElementById('sidebar-user-role');
        const sbAvatar = document.getElementById('sidebar-user-avatar');

        if(sbName) sbName.innerText = dName;
        if(sbRole) sbRole.innerText = role;
        if(sbAvatar) {
            sbAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(dName)}&background=6c5ce7&color=fff&rounded=true`;
        }
    },

    populateForm() {
        if(!this.profileData) return;
        
        document.getElementById('my-profile-fn').value = this.profileData.firstName || '';
        document.getElementById('my-profile-ln').value = this.profileData.lastName || '';
        document.getElementById('my-profile-un').value = this.profileData.username || '';
        document.getElementById('my-profile-email').value = this.profileData.email || '';
        document.getElementById('my-profile-phone').value = this.profileData.phone || '';

        let dName = `${this.profileData.firstName || ''} ${this.profileData.lastName || ''}`.trim();
        if(!dName) dName = this.profileData.username || (this.profileData.email ? this.profileData.email.split('@')[0] : 'User');
        if(dName === 'User' && this.profileData.phone) dName = this.profileData.phone;
        
        document.getElementById('my-profile-title').innerText = dName;
        document.getElementById('my-profile-badge').innerText = this.profileData.role || 'client';
        document.getElementById('my-profile-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(dName)}&background=6c5ce7&color=fff&rounded=true&size=80`;
    },

    async saveProfile(e) {
        e.preventDefault();
        const uid = window.authSystem.currentUser.uid;
        if(!uid || !window.fbDb) return;

        const btn = document.getElementById('btn-save-profile');
        if(btn) { btn.disabled = true; btn.innerText = "Saving..."; }

        const updates = {
            firstName: document.getElementById('my-profile-fn').value,
            lastName: document.getElementById('my-profile-ln').value,
            phone: document.getElementById('my-profile-phone').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            // Update or set if the document doesn't strictly exist
            await window.fbDb.collection("users").doc(uid).set(updates, { merge: true });
            
            this.profileData = { ...this.profileData, ...updates };
            this.updateSidebar();
            this.populateForm();
            this.showMessage("Profile updated successfully!", true);
        } catch(error) {
            console.error("Failed to update profile:", error);
            
            // Helpful debugging if Firestore isn't created in console
            if(error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
               alert("CRITICAL ERROR: Failed to save to database. Admin: Please ensure you have clicked 'Create Database' under Firestore Database in your Firebase Console, and set the rules to 'Test Mode'.");
            }
            
            this.showMessage("Failed to update profile. Check console for database errors.", false);
        }

        if(btn) { btn.disabled = false; btn.innerText = "Save Details"; }
    },

    async changePassword(e) {
        e.preventDefault();
        const uid = window.authSystem.currentUser.uid;
        if(!uid || !window.fbDb) return;

        const oldPwd = document.getElementById('my-profile-old-pwd').value;
        const newPwd = document.getElementById('my-profile-new-pwd').value;
        const btn = document.getElementById('btn-save-password');

        if(!oldPwd || !newPwd) return;

        btn.disabled = true;
        btn.innerText = "Updating...";

        try {
            const res = await fetch(`${window.API_BASE || '/api'}/users/password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, oldPassword: oldPwd, newPassword: newPwd })
            });

            if(!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to update password");
            }

            document.getElementById('my-password-form').reset();
            this.showMessage("Password successfully updated!", true);
        } catch(error) {
            console.error("Password update error:", error);
            this.showMessage(`Error: ${error.message}`, false);
        }

        btn.disabled = false;
        btn.innerText = "Update Password";
    },

    showMessage(msg, isSuccess) {
        const errEl = document.getElementById('profile-error-msg');
        const sucEl = document.getElementById('profile-success-msg');
        if(!errEl || !sucEl) return;
        errEl.classList.add('hidden');
        sucEl.classList.add('hidden');

        if(isSuccess) {
            sucEl.innerText = msg;
            sucEl.classList.remove('hidden');
            setTimeout(() => sucEl.classList.add('hidden'), 5000);
        } else {
            errEl.innerText = msg;
            errEl.classList.remove('hidden');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // We bind init to app boot slightly delayed to ensure auth configures
    setTimeout(() => { if(window.userProfile) window.userProfile.init(); }, 1800);
});
