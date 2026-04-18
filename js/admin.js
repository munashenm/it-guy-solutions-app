window.adminPanel = {
    // Secondary App instance
    secondaryApp: null,
    allStaff: [],
    allCustomers: [],

    init() {
        this.container = document.getElementById('team-content');
        if(window.authSystem && window.authSystem.currentUser && window.authSystem.currentUser.role === 'admin') {
            this.initSecondaryApp();
            this.render();
        }
    },

    initSecondaryApp() {
        if (!this.secondaryApp && typeof firebaseConfig !== 'undefined') {
            this.secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
        }
    },

    async render() {
        if (!window.authSystem.currentUser || window.authSystem.currentUser.role !== 'admin') {
            if(this.container) this.container.innerHTML = `<div style="padding: 32px; text-align: center; color: #ff7675;">Access Denied</div>`;
            return;
        }

        let html = `
            <div class="section-header">
                <div>
                    <h1>Team & User Management</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage staff access, roles, and customer profiles.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-secondary" onclick="adminPanel.showCreateCustomerModal()"><span class="material-symbols-outlined">person_add</span> Pre-register Customer</button>
                    <button class="btn-primary" onclick="adminPanel.showCreateStaffModal()"><span class="material-symbols-outlined">badge</span> Create Staff</button>
                </div>
            </div>
            
            <div id="admin-error-msg" class="hidden" style="background: rgba(var(--danger-rgb), 0.1); border: 1px solid var(--danger); color: #ff7675; padding: 12px; border-radius: 6px; margin-bottom: 24px;"></div>
            <div id="admin-success-msg" class="hidden" style="background: rgba(0, 184, 148, 0.1); border: 1px solid #00b894; color: #00b894; padding: 12px; border-radius: 6px; margin-bottom: 24px;"></div>
            
            <div class="glass-card" style="margin-bottom: 24px; padding: 16px;">
                <div class="search-bar" style="max-width: 100%;">
                    <span class="material-symbols-outlined">search</span>
                    <input type="text" placeholder="Search staff or customers by name, email, username or employee ID..." onkeyup="adminPanel.handleSearch(event)" id="admin-user-search">
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
                <!-- Staff List -->
                <div class="glass-card" style="padding: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #e0e0e0;">
                        <h3 style="margin: 0; color: #a29bfe;">Staff Directory</h3>
                        <button class="btn-icon" onclick="adminPanel.fetchUsers()" title="Refresh"><span class="material-symbols-outlined" style="font-size: 1.1rem;">refresh</span></button>
                    </div>
                    <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                        <table id="staff-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th style="text-align: right;">Action</th>
                                </tr>
                            </thead>
                            <tbody><tr><td colspan="3" style="text-align: center; padding: 24px; color: #a0a0a0;">Loading staff...</td></tr></tbody>
                        </table>
                    </div>
                </div>

                <!-- Customer List -->
                <div class="glass-card" style="padding: 0;">
                    <h3 style="padding: 16px 24px; border-bottom: 1px solid #e0e0e0; margin: 0; color: #00b894;">Customer Directory</h3>
                    <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                        <table id="customer-table">
                            <thead>
                                <tr>
                                    <th>Phone / Email</th>
                                    <th>Role</th>
                                </tr>
                            </thead>
                            <tbody><tr><td colspan="2" style="text-align: center; padding: 24px; color: #a0a0a0;">Loading customers...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.fetchUsers();
    },

    async fetchUsers() {
        if(!window.fbDb) return;
        try {
            const usersSnap = await window.fbDb.collection("users").orderBy("createdAt", "desc").get();
            this.allStaff = [];
            this.allCustomers = [];

            usersSnap.forEach(doc => {
                const data = doc.data();
                if (data.role === 'admin' || data.role === 'technician' || data.role === 'frontdesk') {
                    this.allStaff.push(data);
                } else {
                    this.allCustomers.push(data);
                }
            });

            this.renderStaffTable(this.allStaff);
            this.renderCustomerTable(this.allCustomers);
        } catch(e) {
            console.error("Error fetching users:", e);
        }
    },

    handleSearch(e) {
        const query = e.target.value.toLowerCase().trim();
        if(!query) {
            this.renderStaffTable(this.allStaff);
            this.renderCustomerTable(this.allCustomers);
            return;
        }

        const filteredStaff = this.allStaff.filter(u => 
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.username && u.username.toLowerCase().includes(query)) ||
            (u.firstName && u.firstName.toLowerCase().includes(query)) ||
            (u.lastName && u.lastName.toLowerCase().includes(query)) ||
            (u.employeeId && u.employeeId.toLowerCase().includes(query))
        );

        const filteredCustomers = this.allCustomers.filter(u => 
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.phone && u.phone.toLowerCase().includes(query)) ||
            (u.firstName && u.firstName.toLowerCase().includes(query)) ||
            (u.lastName && u.lastName.toLowerCase().includes(query))
        );

        this.renderStaffTable(filteredStaff);
        this.renderCustomerTable(filteredCustomers);
    },

    renderStaffTable(staffList) {
        const tbody = document.querySelector('#staff-table tbody');
        if(!tbody) return;
        
        if(staffList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #a0a0a0;">No staff found.</td></tr>`;
            return;
        }

        tbody.innerHTML = staffList.map(s => {
            let displayName = s.firstName || s.lastName ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : s.username || s.email;
            let subDisplay = s.employeeId ? `EMP ID: ${s.employeeId} | ${s.email}` : s.email;
            return `
            <tr>
                <td>
                    <strong>${displayName}</strong><br>
                    <span style="font-size: 0.8rem; color: #a0a0a0;">${subDisplay}</span>
                </td>
                <td><span class="badge ${s.role === 'admin' ? 'completed' : 'active'}">${s.role}</span></td>
                <td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                    <button class="btn-icon" title="Edit User" onclick="adminPanel.showEditUserModal('${s.uid}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #a29bfe;">edit</span></button>
                    <button class="btn-icon" title="Reset Password" onclick="adminPanel.showAdminPasswordResetModal('${s.uid}', '${s.email}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #fdcb6e;">lock_reset</span></button>
                    <button class="btn-icon" title="Delete User" onclick="adminPanel.deleteUser('${s.uid}', '${s.email}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #ff7675;">delete</span></button>
                </td>
            </tr>
            `;
        }).join('');
    },

    renderCustomerTable(customerList) {
        const tbody = document.querySelector('#customer-table tbody');
        if(!tbody) return;

        if(customerList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #a0a0a0;">No customers found.</td></tr>`;
            return;
        }

        tbody.innerHTML = customerList.map(c => `
            <tr>
                <td><strong>${c.firstName ? `${c.firstName} ${c.lastName || ''}` : (c.phone || c.email || 'Unknown')}</strong><br><small style="color:#a0a0a0">${c.email || ''}</small></td>
                <td><span class="badge pending">${c.role}</span></td>
                <td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                    <button class="btn-icon" title="Edit" onclick="adminPanel.showEditUserModal('${c.uid}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #a29bfe;">edit</span></button>
                    <button class="btn-icon" title="Delete" onclick="adminPanel.deleteUser('${c.uid}', '${c.phone || c.email}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #ff7675;">delete</span></button>
                </td>
            </tr>
        `).join('');
    },

    async sendResetEmail(email) {
        if(!email) return;
        if(confirm(`Send a password reset email to ${email}?`)) {
            try {
                await window.fbAuth.sendPasswordResetEmail(email);
                this.showMessage(`Password reset email sent successfully to ${email}.`, true);
            } catch (e) {
                console.error(e);
                this.showMessage(`Error sending reset email: ${e.message}`, false);
            }
        }
    },

    showMessage(msg, isSuccess) {
        const errEl = document.getElementById('admin-error-msg');
        const sucEl = document.getElementById('admin-success-msg');
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
    },


    showCreateStaffModal() {
        const autoEmpId = 'EMP-' + Math.floor(1000 + Math.random() * 9000);

        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Create Staff Member</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #fdcb6e; font-size: 0.85rem; background: rgba(253, 203, 110, 0.1); padding: 8px; border-radius: 4px; margin-bottom: 16px;">
                        Staff will be created with a temporary password. You can send them a password reset link from the directory later.
                    </p>
                    <form onsubmit="adminPanel.handleCreateStaff(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" id="new-staff-fn" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" id="new-staff-ln" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Username <span style="font-size: 0.7rem; color: #a0a0a0;">(For login)</span></label>
                                <input type="text" id="new-staff-un" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Employee ID</label>
                                <input type="text" id="new-staff-ei" class="form-control" value="${autoEmpId}" readonly style="background: rgba(0,0,0,0.1); cursor: not-allowed; color: var(--text-secondary);">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="new-staff-email" class="form-control" placeholder="e.g. tech@techguy.pl" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Temporary Password</label>
                                <input type="text" id="new-staff-pwd" class="form-control" value="Welcome123!" required>
                            </div>
                            <div class="form-group">
                                <label>Assign Role</label>
                                <select id="new-staff-role" class="form-control" required style="appearance: auto;">
                                    <option value="technician" style="background: #1a1d2d; color: #fff;">Technician</option>
                                    <option value="frontdesk" style="background: #1a1d2d; color: #fff;">Frontdesk</option>
                                    <option value="admin" style="background: #1a1d2d; color: #fff;">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" id="btn-create-staff">Create Staff</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleCreateStaff(e) {
        e.preventDefault();
        const email = document.getElementById('new-staff-email').value;
        const pwd = document.getElementById('new-staff-pwd').value;
        const role = document.getElementById('new-staff-role').value;
        const firstName = document.getElementById('new-staff-fn').value;
        const lastName = document.getElementById('new-staff-ln').value;
        const username = document.getElementById('new-staff-un').value;
        const employeeId = document.getElementById('new-staff-ei').value;
        
        const btn = document.getElementById('btn-create-staff');
        
        btn.disabled = true;
        btn.innerText = "Creating...";

        try {
            if (typeof window.localAuth !== 'undefined') {
                // We are using the local-db adapter. Use the dedicated backend endpoint.
                await window.safeFetch(`${window.API_BASE || '/api'}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password: pwd, role, firstName, lastName, username, employeeId })
                });
            } else {
                // Real Firebase flow
                if(!this.secondaryApp) this.initSecondaryApp();
                const secAuth = this.secondaryApp.auth();
                
                // Create in secondary instance so main admin isn't logged out
                const userCredential = await secAuth.createUserWithEmailAndPassword(email, pwd);
                const newUid = userCredential.user.uid;

                // Save to Firestore users collection so they appear everywhere properly
                await window.fbDb.collection("users").doc(newUid).set({
                    uid: newUid,
                    email: email,
                    role: role,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Sign out the secondary instance to clean up
                await secAuth.signOut();
            }

            app.closeModal();
            this.showMessage(`Staff member ${email} created successfully!`, true);
            this.fetchUsers();

        } catch (error) {
            console.error(error);
            alert(`Error creating staff: ${error.message}`);
            btn.disabled = false;
            btn.innerText = "Create Staff";
        }
    },

    showCreateCustomerModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Manual Customer Entry</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; font-size: 0.9rem; margin-bottom: 16px;">
                        Save customer details to the directory. Note: Formal Auth generation happens automatically when they first log in via Phone Auth.
                    </p>
                    <form onsubmit="adminPanel.handleCreateCustomer(event)">
                        <div class="form-group">
                            <label>Name / Company Name</label>
                            <input type="text" id="new-cust-name" class="form-control" placeholder="Acme Corp" required>
                        </div>
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" id="new-cust-phone" class="form-control" placeholder="+27 82 123 4567" required>
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="new-cust-email" class="form-control" placeholder="contact@acme.com">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Save Profile</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleCreateCustomer(e) {
        e.preventDefault();
        const name = document.getElementById('new-cust-name').value;
        const phone = document.getElementById('new-cust-phone').value;
        const email = document.getElementById('new-cust-email').value;

        try {
            await window.fbDb.collection("users").add({
                firstName: name,
                phone: phone,
                email: email,
                role: 'client',
                isManualEntry: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            app.closeModal();
            this.showMessage(`Customer ${name} profile saved.`, true);
            this.fetchUsers();
        } catch(error) {
            console.error(error);
            alert(`Error: ${error.message}`);
        }
    },

    showEditUserModal(uid) {
        const user = [...this.allStaff, ...this.allCustomers].find(u => u.uid === uid);
        if(!user) return;

        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Edit User Profile</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="adminPanel.handleUpdateUser(event, '${uid}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" id="edit-user-fn" class="form-control" value="${user.firstName || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" id="edit-user-ln" class="form-control" value="${user.lastName || ''}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="edit-user-un" class="form-control" value="${user.username || ''}">
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="edit-user-email" class="form-control" value="${user.email || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="text" id="edit-user-phone" class="form-control" value="${user.phone || ''}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Role</label>
                                <select id="edit-user-role" class="form-control" required style="appearance: auto;">
                                    <option value="technician" ${user.role === 'technician' ? 'selected' : ''}>Technician</option>
                                    <option value="frontdesk" ${user.role === 'frontdesk' ? 'selected' : ''}>Frontdesk</option>
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    <option value="client" ${user.role === 'client' ? 'selected' : ''}>Client</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Employee ID</label>
                                <input type="text" id="edit-user-ei" class="form-control" value="${user.employeeId || ''}">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" id="btn-update-user">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleUpdateUser(e, uid) {
        e.preventDefault();
        const btn = document.getElementById('btn-update-user');
        btn.disabled = true; btn.innerText = "Saving...";

        const payload = {
            firstName: document.getElementById('edit-user-fn').value,
            lastName: document.getElementById('edit-user-ln').value,
            username: document.getElementById('edit-user-un').value,
            email: document.getElementById('edit-user-email').value,
            phone: document.getElementById('edit-user-phone').value,
            role: document.getElementById('edit-user-role').value,
            employeeId: document.getElementById('edit-user-ei').value
        };

        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/users/${uid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            app.closeModal();
            this.showMessage("User profile updated successfully.", true);
            this.fetchUsers();
        } catch(err) {
            alert("Error: " + err.message);
            btn.disabled = false; btn.innerText = "Save Changes";
        }
    },

    showAdminPasswordResetModal(uid, email) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Force Password Reset</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 16px;">Set a new password for <strong>${email}</strong>.</p>
                    <form onsubmit="adminPanel.handleAdminResetPassword(event, '${uid}')">
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="text" id="admin-reset-pwd" class="form-control" required placeholder="Enter new password">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" id="btn-admin-reset-pwd">Update Password</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleAdminResetPassword(e, uid) {
        e.preventDefault();
        const pwd = document.getElementById('admin-reset-pwd').value;
        const btn = document.getElementById('btn-admin-reset-pwd');
        btn.disabled = true;

        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/users/admin-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, newPassword: pwd })
            });

            app.closeModal();
            this.showMessage("Password updated successfully.", true);
        } catch(err) {
            alert("Error: " + err.message);
            btn.disabled = false;
        }
    },

    async deleteUser(uid, label) {
        if(uid === window.authSystem.currentUser.uid) {
            alert("Error: You cannot delete your own account.");
            return;
        }

        if(!confirm(`Are you absolutely sure you want to delete ${label}?\n\nThis action cannot be undone and will remove all access immediately.`)) {
            return;
        }

        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/users/${uid}`, {
                method: 'DELETE'
            });

            this.showMessage(`User ${label} deleted successfully.`, true);
            this.fetchUsers();
        } catch(err) {
            this.showMessage(`Error deleting user: ${err.message}`, false);
        }
    },

    showMessage(msg, isSuccess) {
        const errEl = document.getElementById('admin-error-msg');
        const sucEl = document.getElementById('admin-success-msg');
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
