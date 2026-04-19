/**
 * it-guy-solutions-app/js/client.js
 * 
 * Manages the Customer Self-Service Portal logic.
 */

console.log("--- CLIENT.JS LOADED (v1.3) ---");

window.client = {
    init() {
        console.log("--- CLIENT.INIT() CALLED ---");
        this.container = document.getElementById('client-content');
        if (!this.container) {
            console.warn("Retrying container lookup...");
            setTimeout(() => this.init(), 100);
            return;
        }
        this.render();
    },

    render() {
        console.log("--- CLIENT.RENDER() STARTING ---");
        if (!window.authSystem || !window.authSystem.currentUser) {
            console.warn("Render skipped: No authSystem or currentUser");
            return;
        }
        
        const user = window.authSystem.currentUser;
        console.log("Current User:", user);

        const curEmail = (user.email || '').toLowerCase();
        const displayName = user.firstName || curEmail.split('@')[0] || "Customer";
        
        // Ensure state exists
        if (!window.app || !window.app.state) {
            console.error("Critical: window.app.state is missing!");
            return;
        }

        const allJobs = window.app.state.jobs || [];
        const allQuos = window.app.state.quotations || [];
        const allInvs = window.app.state.invoices || [];

        console.log(`Data counts - Jobs: ${allJobs.length}, Estimates: ${allQuos.length}, Invoices: ${allInvs.length}`);

        // Filtering - check both 'email' and 'clientEmail' just in case
        const myJobs = allJobs.filter(j => (j.email || j.customerEmail || '').toLowerCase() === curEmail);
        const myQuotations = allQuos.filter(q => (q.email || q.customerEmail || '').toLowerCase() === curEmail);
        const myInvoices = allInvs.filter(i => (i.email || i.customerEmail || '').toLowerCase() === curEmail);
        
        console.log(`Filtered counts - MyJobs: ${myJobs.length}, MyQuos: ${myQuotations.length}, MyInvs: ${myInvoices.length}`);

        let html = `
            <div class="section-header" style="margin-bottom: 32px; animation: fade-in 0.5s ease;">
                <div>
                    <h1 style="font-size: 2.2rem; color: #fff; margin:0;">Hello, ${displayName}!</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Track your repairs and manage your IT support tickets.</p>
                </div>
                <div style="display: flex; gap: 12px; align-items: center; margin-top: 15px;">
                    <button class="btn-secondary" style="padding: 10px 18px; display: flex; align-items: center; gap: 8px;" onclick="window.client.showBookRepairModal()">
                        <span class="material-symbols-outlined">handyman</span> Book a Repair
                    </button>
                    <button class="btn-primary" style="padding: 10px 18px; display: flex; align-items: center; gap: 8px;" onclick="window.client.showLogCallModal()">
                        <span class="material-symbols-outlined">support_agent</span> Log Support Call
                    </button>
                </div>
            </div>
        `;

        // 1. Action Items (Urgent)
        const pendingQuos = myQuotations.filter(q => q.status === 'Pending' || q.status === 'Requested' || q.status === 'Sent');
        const unpaidInvs = myInvoices.filter(i => i.status === 'Unpaid' || i.status === 'Overdue');

        if(pendingQuos.length > 0 || unpaidInvs.length > 0) {
            html += `
            <div class="glass-card" style="margin-bottom: 32px; border: 1px solid rgba(108, 92, 231, 0.4); background: rgba(108, 92, 231, 0.05); animation: pulse-border 2.5s infinite;">
                <h4 style="margin-bottom: 15px; color: var(--primary); display: flex; align-items:center; gap: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem;">notification_important</span> 
                    Action Required
                </h4>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${pendingQuos.map(q => `
                        <div class="pending-item" style="display: flex; justify-content: space-between; align-items:center; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
                            <span style="font-size: 0.95rem;">Quotation <strong>${q.id}</strong> is ready for your review.</span>
                            <button class="btn-primary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="window.client.viewQuotation('${q.id}')">View & Approve</button>
                        </div>
                    `).join('')}
                    ${unpaidInvs.map(i => `
                        <div class="pending-item" style="display: flex; justify-content: space-between; align-items:center; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
                            <span style="font-size: 0.95rem;">Invoice <strong>${i.id}</strong> is outstanding.</span>
                            <button class="btn-primary" style="padding: 6px 14px; font-size: 0.85rem; background: var(--success);" onclick="window.client.viewInvoice('${i.id}')">Pay Now</button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // 2. My Repairs (Tracking)
        html += `
            <div style="margin-bottom: 40px; animation: fade-in 0.7s ease;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: #fff;">
                    <span class="material-symbols-outlined" style="color: var(--primary);">my_location</span>
                    Active Repair Tracking
                </h3>
                <div class="grid-3" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
                    ${myJobs.length > 0 ? myJobs.map(job => `
                        <div class="glass-card job-track-card" style="position: relative; border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 12px; background: rgba(255,255,255,0.02);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <span style="color: var(--primary); font-family: monospace; font-weight: bold; font-size:0.9rem;">${job.id}</span>
                                <span class="badge ${job.status.toLowerCase().replace(/ /g, '-')}">${job.status}</span>
                            </div>
                            <h4 style="margin: 0; font-size: 1.1rem; color: #fff;">${job.device}</h4>
                            <p style="font-size: 0.85rem; color: #888; margin: 6px 0 15px 0;">${job.issue || 'IT Repair'}</p>
                            
                            <div class="track-timeline" style="display: flex; gap: 5px; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-bottom: 10px;">
                                <div style="flex: 1; background: ${['Received', 'In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'var(--primary)' : 'transparent'}; border-radius: 2px;"></div>
                                <div style="flex: 1; background: ${['In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'var(--primary)' : 'transparent'}; border-radius: 2px;"></div>
                                <div style="flex: 1; background: ${['Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'var(--primary)' : 'transparent'}; border-radius: 2px;"></div>
                                <div style="flex: 1; background: ${['Repairing', 'Ready', 'Collected'].includes(job.status) ? 'var(--primary)' : 'transparent'}; border-radius: 2px;"></div>
                                <div style="flex: 1; background: ${['Ready', 'Collected'].includes(job.status) ? 'var(--primary)' : 'transparent'}; border-radius: 2px;"></div>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 0.5px; font-weight:600;">
                                <span>Logged</span>
                                <span>Ready</span>
                            </div>

                            ${['Collected', 'Delivered', 'Completed'].includes(job.status) ? `
                                <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                                    ${job.rating ? `
                                        <div style="color: #fdcb6e; display: flex; align-items: center; gap: 4px;">
                                            ${'★'.repeat(job.rating)}${'☆'.repeat(5-job.rating)}
                                            <span style="font-size: 0.8rem; color: #666; margin-left: 8px;">Rated</span>
                                        </div>
                                    ` : `
                                        <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 8px;" onclick="window.client.showRateJobModal('${job.id}')">Rate Our Service</button>
                                    `}
                                </div>
                            ` : `
                                <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                                    <button class="btn-icon" style="background: rgba(255,255,255,0.05); border: none; color: #fff; border-radius: 50%; padding: 8px;" onclick="window.app.executeDocumentAction('Print', 'Job Card', '${job.id}')">
                                        <span class="material-symbols-outlined" style="font-size: 1.1rem;">visibility</span>
                                    </button>
                                </div>
                            `}
                        </div>
                    `).join('') : '<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 60px 20px; background: rgba(255,255,255,0.01); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.05);"><span class="material-symbols-outlined" style="font-size: 48px; display: block; margin-bottom: 15px; opacity: 0.3;">handyman</span> No active repairs found for your account.</div>'}
                </div>
            </div>
        `;

        // 3. Document History (Estimates & Invoices)
        html += `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 32px; animation: fade-in 0.9s ease;">
                <!-- Quotations -->
                <div>
                    <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px; font-size: 1.1rem; color: #fff;">
                        <span class="material-symbols-outlined" style="color: var(--primary);">request_quote</span>
                        Quotations & Estimates
                    </h3>
                    <div class="glass-card" style="padding: 0; min-height: 200px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.05); border-radius:12px; overflow:hidden;">
                        <div class="table-container">
                            <table style="width:100%; border-collapse: collapse;">
                                <thead style="background: rgba(255,255,255,0.03);">
                                    <tr>
                                        <th style="padding: 12px; text-align: left; font-size:0.8rem; color: #888;">ID</th>
                                        <th style="padding: 12px; text-align: left; font-size:0.8rem; color: #888;">Date</th>
                                        <th style="padding: 12px; text-align: left; font-size:0.8rem; color: #888;">Status</th>
                                        <th style="padding: 12px; text-align: right; font-size:0.8rem; color: #888;">View</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${myQuotations.length > 0 ? myQuotations.map(q => `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                            <td style="padding: 12px; color: #fff;"><strong>${q.id}</strong></td>
                                            <td style="padding: 12px; color: #a0a0a0; font-size:0.9rem;">${q.date}</td>
                                            <td style="padding: 12px;"><span class="badge ${q.status.toLowerCase()}">${q.status}</span></td>
                                            <td style="padding: 12px; text-align: right;">
                                                <button class="btn-icon" style="background: transparent; border: none; color: var(--primary);" onclick="window.client.viewQuotation('${q.id}')"><span class="material-symbols-outlined">description</span></button>
                                            </td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #555; font-style: italic;">No quotes on file.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Invoices -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="display: flex; align-items: center; gap: 10px; font-size: 1.1rem; margin: 0; color: #fff;">
                            <span class="material-symbols-outlined" style="color: var(--success);">receipt</span>
                            Invoice History
                        </h3>
                        <button class="btn-secondary" style="font-size: 0.7rem; padding: 4px 10px; opacity: 0.8;" onclick="window.client.downloadStatement()">Download Statement</button>
                    </div>
                    <div class="glass-card" style="padding: 0; min-height: 200px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.05); border-radius:12px; overflow:hidden;">
                        <div class="table-container">
                            <table style="width:100%; border-collapse: collapse;">
                                <thead style="background: rgba(255,255,255,0.03);">
                                    <tr>
                                        <th style="padding: 12px; text-align: left; font-size:0.8rem; color: #888;">ID</th>
                                        <th style="padding: 12px; text-align: left; font-size:0.8rem; color: #888;">Date</th>
                                        <th style="padding: 12px; text-align: left; font-size:0.8rem; color: #888;">Amount</th>
                                        <th style="padding: 12px; text-align: right; font-size:0.8rem; color: #888;">Get</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${myInvoices.length > 0 ? myInvoices.map(i => `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                            <td style="padding: 12px; color: #fff;"><strong>${i.id}</strong></td>
                                            <td style="padding: 12px; color: #a0a0a0; font-size:0.9rem;">${i.date}</td>
                                            <td style="padding: 12px; font-weight:600; color: var(--success);">${i.amount}</td>
                                            <td style="padding: 12px; text-align: right;">
                                                <button class="btn-icon" style="background: transparent; border: none; color: #a0a0a0;" onclick="window.client.viewInvoice('${i.id}')"><span class="material-symbols-outlined">cloud_download</span></button>
                                            </td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #555; font-style: italic;">No invoices on file.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        console.log("Portal UI HTML injected successfully.");
        
        // Update header elements
        const hdrName = document.getElementById('client-name');
        const hdrEmail = document.getElementById('client-email');
        if (hdrName) hdrName.textContent = displayName;
        if (hdrEmail) hdrEmail.textContent = user.email;
        console.log("--- CLIENT.RENDER() COMPLETE ---");
    },

    // --- MODAL TRIGGERS ---

    showLogCallModal() {
        console.log("Opening Log Support Call Modal...");
        const contextUser = window.authSystem.currentUser || {};
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Log a Support Call</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">Please describe the IT problem you're facing. A technician will contact you shortly.</p>
                    <form onsubmit="window.client.submitCall(event)">
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; color: #ccc;">Describe the Issue</label>
                            <textarea id="cl-desc" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px;" placeholder="E.g. Computer won't start after power surge..." required rows="4"></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom: 25px;">
                            <label style="display: block; margin-bottom: 8px; color: #ccc;">Best Phone Number to Reach You</label>
                            <input type="text" id="cl-phone" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px;" value="${contextUser.phone || ''}" required>
                        </div>
                        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 12px;">
                            <button type="button" class="btn-secondary" onclick="window.app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="padding: 10px 24px;">Submit Support Request</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async submitCall(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const user = window.authSystem.currentUser;
        if (!user) return;

        if (btn) { btn.innerHTML = 'Sending...'; btn.disabled = true; }

        try {
            const ticketId = 'FLD-' + Math.floor(Math.random() * 9000 + 1000);
            const payload = {
                id: ticketId,
                customer: (user.firstName || '') + ' ' + (user.lastName || ''),
                email: user.email,
                phone: document.getElementById('cl-phone').value,
                status: 'Requested',
                description: document.getElementById('cl-desc').value,
                dateBooked: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            };

            await window.fbDb.collection('fieldJobs').doc(ticketId).set(payload);
            window.app.closeModal();
            alert(`Success! Ticket #${ticketId} has been logged. Our dispatch team has been notified.`);
            this.render();
        } catch(err) {
            console.error(err);
            alert("Could not log support call. Please try again.");
            if (btn) { btn.innerHTML = 'Submit Support Request'; btn.disabled = false; }
        }
    },

    showBookRepairModal() {
        console.log("Opening Book Repair Modal...");
        const modalHTML = `
            <div class="modal-content" style="max-width: 550px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Book a Repair</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <p style="color: #a0a0a0; margin-bottom: 20px;">Choose your delivery method:</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div class="choice-card active" style="padding: 15px; border-radius: 10px; border: 2px solid var(--primary); text-align: center; cursor: pointer; transition: all 0.2s;" onclick="this.parentNode.querySelector('.active').style.borderColor='rgba(255,255,255,0.1)'; this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); this.style.borderColor='var(--primary)'; window.repairType='Walk-in'">
                            <span class="material-symbols-outlined" style="font-size: 32px; color: var(--primary);">store</span>
                            <h4 style="margin: 8px 0 0 0; color: #fff;">Walk-in</h4>
                            <p style="font-size: 0.75rem; color: #777;">Drop off at our shop</p>
                        </div>
                        <div class="choice-card" style="padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); text-align: center; cursor: pointer; transition: all 0.2s;" onclick="this.parentNode.querySelector('.active').style.borderColor='rgba(255,255,255,0.1)'; this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); this.style.borderColor='var(--primary)'; window.repairType='Courier'">
                            <span class="material-symbols-outlined" style="font-size: 32px; color: #888;">local_shipping</span>
                            <h4 style="margin: 8px 0 0 0; color: #fff;">Courier</h4>
                            <p style="font-size: 0.75rem; color: #777;">We collect from you</p>
                        </div>
                    </div>
                    <form onsubmit="window.client.submitRepairBooking(event)">
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px; color: #ccc;">Device & Model</label>
                            <input type="text" id="rep-device" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px;" placeholder="e.g. MacBook Pro M1 / Samsung S23" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 25px;">
                            <label style="display: block; margin-bottom: 8px; color: #ccc;">Problem Description</label>
                            <textarea id="rep-issue" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px;" placeholder="e.g. Liquid damage / Screen lines..." required rows="3"></textarea>
                        </div>
                        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 12px;">
                            <button type="button" class="btn-secondary" onclick="window.app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="padding: 10px 24px;">Confirm Booking</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
        window.repairType = 'Walk-in';
    },

    async submitRepairBooking(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const user = window.authSystem.currentUser;
        if (!user) return;

        if (btn) { btn.innerHTML = 'Booking...'; btn.disabled = true; }

        try {
            const jobId = 'JOB-' + Math.floor(Math.random() * 9000 + 1000);
            const job = {
                id: jobId,
                device: document.getElementById('rep-device').value,
                issue: document.getElementById('rep-issue').value,
                type: window.repairType,
                status: 'Requested',
                customer: (user.firstName || '') + ' ' + (user.lastName || ''),
                email: user.email,
                phone: user.phone || 'N/A',
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            };

            await window.fbDb.collection('jobs').doc(jobId).set(job);
            
            // Optimistic update
            if (window.app.state.jobs) window.app.state.jobs.unshift(job);
            
            window.app.closeModal();
            alert(`Booking Received! Your ticket reference is #${jobId}.`);
            this.render();
        } catch(err) {
            console.error(err);
            alert("Error: Could not save booking. Check your connection.");
            if (btn) { btn.innerHTML = 'Confirm Booking'; btn.disabled = false; }
        }
    },

    viewQuotation(quoteId) {
        const quo = (window.app.state.quotations || []).find(q => q.id === quoteId);
        if(!quo) return;

        window.app.showModal(`
            <div class="modal-content" style="max-width: 600px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Quotation: ${quo.id}</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <div style="background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                            <div>
                                <div style="font-size: 0.8rem; color: #888; text-transform: uppercase;">Total Estimate</div>
                                <div style="font-size: 1.8rem; font-weight: bold; color: var(--primary);">${quo.amount}</div>
                            </div>
                            <span class="badge ${quo.status.toLowerCase()}" style="height: fit-content; padding: 8px 16px;">${quo.status}</span>
                        </div>
                        <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                            <h4 style="margin-bottom: 12px; font-size: 0.9rem; color: #fff;">Breakdown:</h4>
                            ${(quo.items || []).map(item => `
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 8px; color: #ccc;">
                                    <span>${item.desc} (x${item.qty})</span>
                                    <span style="color: #fff; font-weight:600;">R ${(item.unit * item.qty).toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 8px; color: #ccc;">Comment / Question</label>
                        <textarea id="quo-comment" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px;" placeholder="Type here..." rows="3">${quo.clientComment || ''}</textarea>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <button class="btn-secondary" style="justify-content: center; padding: 12px; border-radius: 8px;" onclick="window.client.updateQuotationStatus('${quo.id}', 'Discuss')">Send Query</button>
                        <button class="btn-primary" style="background: var(--success); border-color: var(--success); justify-content: center; padding: 12px; border-radius: 8px;" onclick="window.client.updateQuotationStatus('${quo.id}', 'Approved')">Approve Repair</button>
                    </div>
                </div>
            </div>
        `);
    },

    async updateQuotationStatus(quoteId, status) {
        const comment = document.getElementById('quo-comment').value;
        try {
            await window.fbDb.collection('quotations').doc(quoteId).update({ 
                status: status, 
                clientComment: comment,
                clientLastAction: new Date().toISOString()
            });
            
            window.app.closeModal();
            alert("Your response has been submitted successfully.");
            this.render();
        } catch(err) { 
            console.error(err);
            alert("Failed to update quotation. Please try again."); 
        }
    },

    viewInvoice(invId) {
        window.app.executeDocumentAction('Print', 'Invoice', invId);
    },

    downloadStatement() {
        const user = window.authSystem.currentUser;
        const myInvs = (window.app.state.invoices || []).filter(i => (i.email || i.customerEmail || '').toLowerCase() === user.email.toLowerCase());
        const data = {
            customer: (user.firstName || '') + ' ' + (user.lastName || ''),
            date: new Date().toLocaleDateString(),
            invoices: myInvs,
            total: myInvs.reduce((sum, i) => sum + (parseFloat(i.amount.replace(/[^0-9.]/g, '')) || 0), 0)
        };
        window.app.executeDocumentAction('Download', 'Statement', user.email, data);
    },

    showRateJobModal(jobId) {
        window.app.showModal(`
            <div class="modal-content" style="max-width: 450px; text-align: center; animation: slide-up 0.4s ease;">
                <div class="modal-header" style="justify-content: center; border-bottom: none;">
                    <h2 style="margin: 0;">Service Feedback</h2>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <p style="color: #a0a0a0; margin-bottom: 24px;">How happy are you with repair <b>${jobId}</b>?</p>
                    <form onsubmit="window.client.submitJobRating(event, '${jobId}')">
                        <div class="star-rating" style="margin-bottom: 24px; display: flex; justify-content: center; gap: 10px; font-size: 32px; color: #fdcb6e;">
                            <style>
                                .star-rating input { display: none; }
                                .star-rating label { cursor: pointer; transition: transform 0.2s; }
                                .star-rating label:hover { transform: scale(1.2); }
                                .star-rating input:checked ~ label { color: #555; }
                            </style>
                            <input type="radio" id="star5" name="rating" value="5" required checked><label for="star5">★</label>
                            <input type="radio" id="star4" name="rating" value="4"><label for="star4">★</label>
                            <input type="radio" id="star3" name="rating" value="3"><label for="star3">★</label>
                            <input type="radio" id="star2" name="rating" value="2"><label for="star2">★</label>
                            <input type="radio" id="star1" name="rating" value="1"><label for="star1">★</label>
                        </div>
                        <textarea id="rating-fb" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px; margin-bottom: 24px;" placeholder="Any comments?" rows="3"></textarea>
                        <button type="submit" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 8px;">Submit Rating</button>
                    </form>
                </div>
            </div>
        `);
    },

    async submitJobRating(e, jobId) {
        e.preventDefault();
        const rating = parseInt(new FormData(e.target).get('rating'));
        const feedback = document.getElementById('rating-fb').value;
        try {
            await window.fbDb.collection('jobs').doc(jobId).update({ 
                rating, 
                feedback,
                ratedAt: new Date().toISOString()
            });
            window.app.closeModal();
            alert("Thank you for your feedback! It helps us improve.");
            this.render();
        } catch(err) { alert("Error saving feedback."); }
    },

    // --- PROFILE MANAGEMENT ---

    showProfileModal() {
        console.log("Opening Profile Settings Modal...");
        const user = window.authSystem.currentUser || {};
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Account Settings</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <form onsubmit="window.client.updateProfile(event)">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; color: #888; font-size: 0.8rem;">First Name</label>
                                <input type="text" id="prof-fname" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px;" value="${user.firstName || ''}" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; color: #888; font-size: 0.8rem;">Last Name</label>
                                <input type="text" id="prof-lname" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px;" value="${user.lastName || ''}">
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; color: #888; font-size: 0.8rem;">Mobile Phone</label>
                            <input type="text" id="prof-phone" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px;" value="${user.phone || ''}">
                        </div>
                        <div class="form-group" style="margin-bottom: 25px;">
                            <label style="display: block; margin-bottom: 6px; color: #888; font-size: 0.8rem;">Email Address (Locked)</label>
                            <input type="text" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid transparent; color: #666; padding: 10px; cursor: not-allowed;" value="${user.email || ''}" disabled>
                        </div>

                        <div style="margin: 25px 0; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <button type="button" class="btn-secondary" style="width: 100%; justify-content: center; border-color: rgba(108, 92, 231, 0.4); color: var(--primary);" onclick="window.client.showChangePasswordModal()">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem; margin-right: 8px;">lock</span> Change Security Password
                            </button>
                        </div>

                        <div class="modal-footer" style="display: flex; gap: 12px; margin-top: 32px;">
                            <button type="button" class="btn-secondary" style="flex: 1; padding: 12px; border-radius: 8px;" onclick="window.app.closeModal()">Dismiss</button>
                            <button type="submit" class="btn-primary" style="flex: 2; padding: 12px; border-radius: 8px;">Save Profile Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async updateProfile(e) {
        e.preventDefault();
        const fname = document.getElementById('prof-fname').value;
        const lname = document.getElementById('prof-lname').value;
        const phone = document.getElementById('prof-phone').value;
        const user = window.authSystem.currentUser;

        try {
            await window.fbDb.collection('users').doc(user.uid).update({
                firstName: fname,
                lastName: lname,
                phone: phone
            });
            // Update session
            user.firstName = fname;
            user.lastName = lname;
            user.phone = phone;
            sessionStorage.setItem('it-guy-user', JSON.stringify(user));
            
            window.app.closeModal();
            alert("Settings saved successfully.");
            this.render();
        } catch(err) {
            console.error(err);
            alert("Failed to update profile settings.");
        }
    },

    showChangePasswordModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 400px; animation: slide-up 0.4s ease;">
                <div class="modal-header">
                    <h2>Change Password</h2>
                    <button class="btn-icon" onclick="window.client.showProfileModal()"><span class="material-symbols-outlined">arrow_back</span></button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <p style="color: #888; font-size: 0.85rem; margin-bottom: 20px;">Protect your account with a strong password.</p>
                    <form onsubmit="window.client.submitPasswordChange(event)">
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; color: #ccc;">New Password</label>
                            <input type="password" id="new-pw" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px;" required minlength="6">
                        </div>
                        <div class="form-group" style="margin-bottom: 24px;">
                            <label style="display: block; margin-bottom: 6px; color: #ccc;">Confirm Password</label>
                            <input type="password" id="new-pw-confirm" class="form-control" style="width: 100%; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px;" required minlength="6">
                        </div>
                        <button type="submit" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 8px;">Update Password</button>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async submitPasswordChange(e) {
        e.preventDefault();
        const pw = document.getElementById('new-pw').value;
        const confirm = document.getElementById('new-pw-confirm').value;

        if (pw !== confirm) {
            alert("Error: New passwords do not match.");
            return;
        }

        try {
            await window.localAuth.currentUser.updatePassword(pw);
            alert("Success! Your password has been changed.");
            window.client.showProfileModal();
        } catch(err) {
            console.error(err);
            alert("Error: " + (err.message || "Failed to update password. Try logging out and back in first."));
        }
    }
};

// --- INITIALIZATION ---
console.log("Setting up DOMContentLoaded listener for client.js...");
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded fired - initializing client portal...");
    window.client.init();
});

// Self-init check (in case script loads late)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    if (!window.client.initiated) {
        console.log("Ready state already complete - auto-booting client portal...");
        window.client.initiated = true;
        window.client.init();
    }
}
