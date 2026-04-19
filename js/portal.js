/**
 * it-guy-solutions-app/js/portal.js
 * 
 * Manages the Customer Self-Service Portal logic.
 * Version 3.0.final
 */

console.log("--- PORTAL CORE BOOTING (v3.0.final) ---");

window.clientPortal = {
    init() {
        console.log("Portal: init() called");
        this.render();
    },

    render() {
        console.log("Portal: render() starting...");
        const container = document.getElementById('client-content');
        if (!container) {
            console.warn("Portal: Waiting for 'client-content' target...");
            setTimeout(() => this.render(), 100);
            return;
        }

        const user = window.authSystem ? window.authSystem.currentUser : null;
        if (!user) {
            console.warn("Portal: No authenticated user. Redirecting auth check...");
            container.innerHTML = `<div style="padding:60px; text-align:center; color:#555;"><span class="material-symbols-outlined rotating">sync</span><p>Waiting for session...</p></div>`;
            return;
        }

        const curEmail = (user.email || '').toLowerCase();
        const displayName = user.firstName || curEmail.split('@')[0] || "Customer";
        
        if (!window.app || !window.app.state) {
            console.error("Portal: window.app.state missing - cannot render dashboard data.");
            return;
        }

        const allJobs = window.app.state.jobs || [];
        const allQuos = window.app.state.quotations || [];
        const allInvs = window.app.state.invoices || [];

        const myJobs = allJobs.filter(j => (j.email || j.customerEmail || '').toLowerCase() === curEmail);
        const myQuotations = allQuos.filter(q => (q.email || q.customerEmail || '').toLowerCase() === curEmail);
        const myInvoices = allInvs.filter(i => (i.email || i.clientEmail || i.customerEmail || '').toLowerCase() === curEmail);
        
        console.log(`Portal Data Found: ${myJobs.length} repairs, ${myQuotations.length} quotes, ${myInvoices.length} invoices`);

        // Start HTML Construction
        let html = `
            <div style="animation: fade-in 0.5s ease;">
                <!-- Header Greeting -->
                <div class="section-header" style="margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <h1 style="font-size: 2.25rem; color: #fff; margin:0; font-family: 'Outfit', sans-serif;">Hello, ${displayName}!</h1>
                        <p style="color: #a0a0a0; margin-top: 6px; font-size: 1.1rem;">Welcome to your IT Guy Solutions dashboard.</p>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-secondary" style="padding: 12px 20px; display: flex; align-items: center; gap: 8px;" onclick="window.clientPortal.showBookRepairModal()">
                            <span class="material-symbols-outlined">handyman</span> Book a Repair
                        </button>
                        <button class="btn-primary" style="padding: 12px 20px; display: flex; align-items: center; gap: 8px;" onclick="window.clientPortal.showLogCallModal()">
                            <span class="material-symbols-outlined">support_agent</span> Log Support Call
                        </button>
                    </div>
                </div>
        `;

        // Action Items Box
        const pendingQuos = myQuotations.filter(q => ['Pending', 'Requested', 'Sent', 'Draft'].includes(q.status));
        const unpaidInvs = myInvoices.filter(i => ['Unpaid', 'Overdue'].includes(i.status));

        if(pendingQuos.length > 0 || unpaidInvs.length > 0) {
            html += `
            <div class="glass-card" style="margin-bottom: 40px; border: 1px solid rgba(108, 92, 231, 0.4); background: rgba(108, 92, 231, 0.05); padding: 24px; border-radius: 12px; animation: pulse-border 3s infinite;">
                <h4 style="color: var(--primary); margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem;">priority_high</span> Action Required
                </h4>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${pendingQuos.map(q => `
                        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                            <span style="font-size: 0.95rem; color: #eee;">Quotation <strong>${q.id}</strong> needs your approval.</span>
                            <button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="window.clientPortal.viewQuotation('${q.id}')">Review & Approve</button>
                        </div>
                    `).join('')}
                    ${unpaidInvs.map(i => `
                        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                            <span style="font-size: 0.95rem; color: #eee;">Invoice <strong>${i.id}</strong> has a balance of <strong>${i.amount}</strong>.</span>
                            <button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem; background: var(--success); border-color: var(--success);" onclick="window.clientPortal.viewInvoice('${i.id}')">Pay Now</button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // Repairs Section
        html += `
            <div style="margin-bottom: 40px;">
                <h3 style="color: #fff; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                    <span class="material-symbols-outlined" style="color: var(--primary);">my_location</span>
                    Active Repair Tracking
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px;">
                    ${myJobs.length > 0 ? myJobs.map(job => `
                        <div class="glass-card" style="padding: 24px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); border-radius: 12px; transition: transform 0.2s hover;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                <span style="font-family: 'Space Mono', monospace; color: var(--primary); font-size: 0.85rem;">${job.id}</span>
                                <span class="badge ${job.status.toLowerCase().replace(/ /g, '-')}">${job.status}</span>
                            </div>
                            <h4 style="margin: 0; color: #fff; font-size: 1.15rem;">${job.device}</h4>
                            <p style="color: #666; font-size: 0.9rem; margin: 6px 0 20px 0;">${job.issue || "General Repair"}</p>
                            
                            <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; margin-bottom: 15px;">
                                <div style="height: 100%; background: var(--primary); width: ${this.getStatusProgress(job.status)}%;"></div>
                            </div>
                            
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button class="btn-icon" style="background: rgba(255,255,255,0.05); color: #888;" onclick="window.app.executeDocumentAction('Print', 'Job Card', '${job.id}')">
                                    <span class="material-symbols-outlined">visibility</span>
                                </button>
                            </div>
                        </div>
                    `).join('') : `
                        <div style="grid-column: 1/-1; padding: 60px; text-align: center; border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px; color: #444;">
                            <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3;">handyman</span>
                            <p style="margin-top: 15px;">You don't have any active repairs with us at the moment.</p>
                            <button class="btn-secondary" style="margin-top: 10px;" onclick="window.clientPortal.showBookRepairModal()">Book One Now</button>
                        </div>
                    `}
                </div>
            </div>
        `;

        // History Tables
        html += `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 32px;">
                <!-- Quotes History -->
                <div>
                    <h3 style="color: #fff; margin-bottom: 20px; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                        <span class="material-symbols-outlined" style="color: var(--primary);">request_quote</span>
                        Quotations History
                    </h3>
                    <div class="glass-card" style="padding: 0; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; border-radius: 12px;">
                        <table style="width: 100%; border-collapse: collapse; color: #ccc; font-size:0.9rem;">
                            <thead style="background: rgba(255,255,255,0.02); color: #666; text-transform: uppercase; font-size: 0.75rem;">
                                <tr>
                                    <th style="padding: 12px; text-align: left;">Quote ID</th>
                                    <th style="padding: 12px; text-align: left;">Date</th>
                                    <th style="padding: 12px; text-align: center;">Status</th>
                                    <th style="padding: 12px; text-align: right;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${myQuotations.length > 0 ? myQuotations.map(q => `
                                    <tr style="border-top: 1px solid rgba(255,255,255,0.03);">
                                        <td style="padding: 12px; color: #fff;">${q.id}</td>
                                        <td style="padding: 12px;">${q.date}</td>
                                        <td style="padding: 12px; text-align: center;"><span class="badge ${q.status.toLowerCase()}">${q.status}</span></td>
                                        <td style="padding: 12px; text-align: right;">
                                            <button class="btn-icon" style="color: var(--primary);" onclick="window.clientPortal.viewQuotation('${q.id}')">
                                                <span class="material-symbols-outlined">keyboard_arrow_right</span>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #555;">No quotes found.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Invoices History -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3 style="color: #fff; font-size: 1.1rem; margin: 0; display: flex; align-items: center; gap: 10px;">
                            <span class="material-symbols-outlined" style="color: var(--success);">receipt</span>
                            Invoice History
                        </h3>
                        <button class="btn-secondary" style="font-size: 0.75rem; padding: 6px 12px;" onclick="window.clientPortal.downloadStatement()">
                            <span class="material-symbols-outlined" style="font-size: 1rem; margin-right: 6px;">download</span> Statement
                        </button>
                    </div>
                    <div class="glass-card" style="padding: 0; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; border-radius: 12px;">
                        <table style="width: 100%; border-collapse: collapse; color: #ccc; font-size:0.9rem;">
                            <thead style="background: rgba(255,255,255,0.02); color: #666; text-transform: uppercase; font-size: 0.75rem;">
                                <tr>
                                    <th style="padding: 12px; text-align: left;">Invoice ID</th>
                                    <th style="padding: 12px; text-align: left;">Date</th>
                                    <th style="padding: 12px; text-align: right;">Amount</th>
                                    <th style="padding: 12px; text-align: center;">Get</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${myInvoices.length > 0 ? myInvoices.map(i => `
                                    <tr style="border-top: 1px solid rgba(255,255,255,0.03);">
                                        <td style="padding: 12px; color: #fff;">${i.id}</td>
                                        <td style="padding: 12px;">${i.date}</td>
                                        <td style="padding: 12px; text-align: right; color: var(--success); font-weight: 600;">${i.amount}</td>
                                        <td style="padding: 12px; text-align: center;">
                                            <button class="btn-icon" style="color: #888;" onclick="window.clientPortal.viewInvoice('${i.id}')">
                                                <span class="material-symbols-outlined">cloud_download</span>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #555;">No invoices found.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;

        container.innerHTML = html;
        console.log("Portal: Main dashboard content updated.");

        // Sync Header Info
        const hdrName = document.getElementById('client-name');
        if (hdrName) hdrName.textContent = displayName;
        const hdrEmail = document.getElementById('client-email');
        if (hdrEmail) hdrEmail.textContent = user.email;
    },

    getStatusProgress(status) {
        const states = ['Requested', 'Received', 'In Diagnosis', 'In Progress', 'Repairing', 'Testing', 'Ready', 'Collected', 'Delivered'];
        const idx = states.indexOf(status);
        if (idx === -1) return 10;
        return ((idx + 1) / states.length) * 100;
    },

    // --- SUPPORT ACTIONS ---

    showLogCallModal() {
        const user = window.authSystem ? window.authSystem.currentUser : {};
        window.app.showModal(`
            <div class="modal-content" style="max-width: 500px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Log a Support Ticket</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <p style="color: #888; font-size: 0.9rem; margin-bottom: 24px;">Briefly describe the issue and a technician will get back to you.</p>
                    <form onsubmit="window.clientPortal.submitSupportTicket(event)">
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="color: #ccc; display: block; margin-bottom: 8px;">Issue Description</label>
                            <textarea id="ticket-issue" class="form-control" style="width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color:#fff; border-radius: 8px; padding: 12px;" placeholder="What's wrong?" required rows="4"></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom: 24px;">
                            <label style="color: #ccc; display: block; margin-bottom: 8px;">Prefered Contact Number</label>
                            <input type="text" id="ticket-phone" class="form-control" style="width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color:#fff; border-radius: 8px; padding: 12px;" value="${user.phone || ''}" required>
                        </div>
                        <button type="submit" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 8px;">Submit Ticket</button>
                    </form>
                </div>
            </div>
        `);
    },

    async submitSupportTicket(e) {
        e.preventDefault();
        const issue = document.getElementById('ticket-issue').value;
        const phone = document.getElementById('ticket-phone').value;
        const user = window.authSystem.currentUser;

        try {
            const ticketId = 'SUP-' + Math.random().toString(36).substr(2, 5).toUpperCase();
            await window.fbDb.collection('tickets').doc(ticketId).set({
                id: ticketId,
                customer: (user.firstName || '') + ' ' + (user.lastName || ''),
                email: user.email,
                phone: phone,
                issue: issue,
                status: 'Open',
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            });
            window.app.closeModal();
            alert("Support ticket logged! Reference: " + ticketId);
        } catch(err) {
            alert("Could not log ticket. Please try again.");
        }
    },

    showBookRepairModal() {
        window.app.showModal(`
            <div class="modal-content" style="max-width: 500px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Book a Repair</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <form onsubmit="window.clientPortal.submitRepairBooking(event)">
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="color: #ccc; display: block; margin-bottom: 8px;">Device Name / Serial</label>
                            <input type="text" id="rep-device" class="form-control" style="width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color:#fff; border-radius: 8px; padding: 12px;" placeholder="e.g. Dell Latitude 5490" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 24px;">
                            <label style="color: #ccc; display: block; margin-bottom: 8px;">Issue / Fault</label>
                            <textarea id="rep-issue" class="form-control" style="width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color:#fff; border-radius: 8px; padding: 12px;" placeholder="What needs fixing?" required rows="3"></textarea>
                        </div>
                        <button type="submit" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 8px;">Confirm Booking</button>
                    </form>
                </div>
            </div>
        `);
    },

    async submitRepairBooking(e) {
        e.preventDefault();
        const device = document.getElementById('rep-device').value;
        const issue = document.getElementById('rep-issue').value;
        const user = window.authSystem.currentUser;

        try {
            const jobId = 'JOB-' + Math.random().toString(36).substr(2, 5).toUpperCase();
            const jobData = {
                id: jobId,
                device: device,
                issue: issue,
                status: 'Requested',
                customerEmail: user.email,
                customer: (user.firstName || '') + ' ' + (user.lastName || ''),
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            };
            await window.fbDb.collection('jobs').doc(jobId).set(jobData);
            window.app.state.jobs.unshift(jobData);
            window.app.closeModal();
            alert("Repair booked! Job Reference: " + jobId);
            this.render();
        } catch(err) { alert("Error booking repair."); }
    },

    // --- ACCOUNT ACTIONS ---

    showProfileModal() {
        const user = window.authSystem.currentUser || {};
        window.app.showModal(`
            <div class="modal-content" style="max-width: 500px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Edit My Account</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <form onsubmit="window.clientPortal.updateProfile(event)">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group">
                                <label style="font-size:0.8rem; color:#888;">First Name</label>
                                <input id="p-fname" type="text" class="form-control" value="${user.firstName || ''}" required>
                            </div>
                            <div class="form-group">
                                <label style="font-size:0.8rem; color:#888;">Last Name</label>
                                <input id="p-lname" type="text" class="form-control" value="${user.lastName || ''}">
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="font-size:0.8rem; color:#888;">Mobile Phone</label>
                            <input id="p-phone" type="text" class="form-control" value="${user.phone || ''}">
                        </div>
                        <div class="form-group" style="margin-bottom: 24px;">
                            <label style="font-size:0.8rem; color:#888;">Email (Locked)</label>
                            <input type="text" class="form-control" value="${user.email}" disabled style="background:rgba(255,255,255,0.05); color:#666;">
                        </div>
                        <button type="submit" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 8px;">Save Profile</button>
                        
                        <div style="margin-top: 25px; pt: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <button type="button" class="btn-secondary" style="width: 100%; margin-top: 20px;" onclick="window.clientPortal.showChangePasswordModal()">Change Password</button>
                        </div>
                    </form>
                </div>
            </div>
        `);
    },

    async updateProfile(e) {
        e.preventDefault();
        const user = window.authSystem.currentUser;
        const data = {
            firstName: document.getElementById('p-fname').value,
            lastName: document.getElementById('p-lname').value,
            phone: document.getElementById('p-phone').value
        };
        try {
            await window.fbDb.collection('users').doc(user.uid).update(data);
            Object.assign(user, data);
            sessionStorage.setItem('it-guy-user', JSON.stringify(user));
            window.app.closeModal();
            alert("Profile updated!");
            this.render();
        } catch(err) { alert("Update failed."); }
    },

    showChangePasswordModal() {
        window.app.showModal(`
            <div class="modal-content" style="max-width: 400px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>New Password</h2>
                    <button class="btn-icon" onclick="window.clientPortal.showProfileModal()"><span class="material-symbols-outlined">arrow_back</span></button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <form onsubmit="window.clientPortal.submitPassword(event)">
                        <input id="new-pw" type="password" class="form-control" placeholder="New Password" required minlength="6" style="margin-bottom: 12px;">
                        <input id="new-pw-confirm" type="password" class="form-control" placeholder="Confirm Password" required minlength="6" style="margin-bottom: 24px;">
                        <button type="submit" class="btn-primary" style="width: 100%; padding: 14px;">Update Password</button>
                    </form>
                </div>
            </div>
        `);
    },

    async submitPassword(e) {
        e.preventDefault();
        const p1 = document.getElementById('new-pw').value;
        const p2 = document.getElementById('new-pw-confirm').value;
        if(p1 !== p2) return alert("Passwords do not match!");
        try {
            await window.fbAuth.currentUser.updatePassword(p1);
            alert("Password updated!");
            window.clientPortal.showProfileModal();
        } catch(err) { alert("Error: " + err.message); }
    },

    viewQuotation(id) { window.app.executeDocumentAction('Print', 'Quotation', id); },
    viewInvoice(id) { window.app.executeDocumentAction('Print', 'Invoice', id); },
    downloadStatement() { 
        const user = window.authSystem.currentUser;
        window.app.executeDocumentAction('Download', 'Statement', user.email, {
            customer: (user.firstName || '') + ' ' + (user.lastName || ''),
            invoices: window.app.state.invoices.filter(i => (i.customerEmail || i.email || '').toLowerCase() === user.email.toLowerCase())
        });
    }
};

// Global for compatibility
window.client = window.clientPortal;

// --- INITIALIZATION ---
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log("Portal: Booting...");
    window.clientPortal.init();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("Portal: Booting after DOM content...");
        window.clientPortal.init();
    });
}
