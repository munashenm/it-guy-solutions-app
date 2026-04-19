/**
 * it-guy-solutions-app/js/client.js
 * 
 * Manages the Customer Self-Service Portal logic.
 */

console.log("--- CLIENT.JS LOADED ---");

window.client = {
    init() {
        console.log("--- CLIENT.INIT() CALLED ---");
        this.container = document.getElementById('client-content');
        if (!this.container) {
            console.error("Critical Error: 'client-content' container not found in DOM.");
            return;
        }
        this.render();
    },

    render() {
        if (!window.authSystem || !window.authSystem.currentUser) {
            console.warn("Render skipped: No authenticated user found.");
            return;
        }
        const user = window.authSystem.currentUser;
        const curEmail = (user.email || '').toLowerCase();
        const displayName = user.firstName || curEmail.split('@')[0] || "Customer";
        
        // Use window.app.state as the source of truth (populated by client.html sync)
        const allJobs = window.app.state.jobs || [];
        const allQuos = window.app.state.quotations || [];
        const allInvs = window.app.state.invoices || [];

        const myJobs = allJobs.filter(j => (j.email || '').toLowerCase() === curEmail);
        const myQuotations = allQuos.filter(q => (q.email || '').toLowerCase() === curEmail);
        const myInvoices = allInvs.filter(i => (i.email || '').toLowerCase() === curEmail);
        
        let html = `
            <div class="section-header" style="margin-bottom: 32px;">
                <div>
                    <h1 style="font-size: 2.2rem; color: #fff;">Hello, ${displayName}!</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Track your repairs and manage your IT support tickets.</p>
                </div>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <button class="btn-secondary" style="padding: 10px 18px;" onclick="window.client.showBookRepairModal()">
                        <span class="material-symbols-outlined">handyman</span> Book a Repair
                    </button>
                    <button class="btn-primary" style="padding: 10px 18px;" onclick="window.client.showLogCallModal()">
                        <span class="material-symbols-outlined">support_agent</span> Log Support Call
                    </button>
                </div>
            </div>
        `;

        // 1. Action Items (Urgent)
        const pendingQuos = myQuotations.filter(q => q.status === 'Pending' || q.status === 'Requested');
        const unpaidInvs = myInvoices.filter(i => i.status === 'Unpaid');

        if(pendingQuos.length > 0 || unpaidInvs.length > 0) {
            html += `
            <div class="glass-card" style="margin-bottom: 32px; border: 1px solid rgba(108, 92, 231, 0.4); background: rgba(108, 92, 231, 0.05); animation: pulse-border 2.5s infinite;">
                <h4 style="margin-bottom: 15px; color: var(--primary); display: flex; align-items:center; gap: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem;">notification_important</span> 
                    Important Notifications
                </h4>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${pendingQuos.map(q => `
                        <div class="pending-item" style="display: flex; justify-content: space-between; align-items:center; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
                            <span style="font-size: 0.95rem;">Quotation <strong>${q.id}</strong> is ready for your review.</span>
                            <button class="btn-primary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="window.client.viewQuotation('${q.id}')">View Details</button>
                        </div>
                    `).join('')}
                    ${unpaidInvs.map(i => `
                        <div class="pending-item" style="display: flex; justify-content: space-between; align-items:center; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
                            <span style="font-size: 0.95rem;">Invoice <strong>${i.id}</strong> is outstanding.</span>
                            <button class="btn-primary" style="padding: 6px 14px; font-size: 0.85rem; background: var(--success);" onclick="window.client.viewInvoice('${i.id}')">Download & Pay</button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // 2. My Repairs (Tracking)
        html += `
            <div style="margin-bottom: 40px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <span class="material-symbols-outlined" style="color: var(--primary);">my_location</span>
                    Active Repair Tracking
                </h3>
                <div class="grid-3" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
                    ${myJobs.length > 0 ? myJobs.map(job => `
                        <div class="glass-card job-track-card" style="position: relative; border-color: rgba(255,255,255,0.08);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <span style="color: var(--primary); font-family: monospace; font-weight: bold;">${job.id}</span>
                                <span class="badge ${job.status.toLowerCase().replace(/ /g, '-')}">${job.status}</span>
                            </div>
                            <h4 style="margin: 0; font-size: 1.1rem;">${job.device}</h4>
                            <p style="font-size: 0.85rem; color: #888; margin: 6px 0 15px 0;">${job.issue || 'IT Repair'}</p>
                            
                            <div class="track-timeline" style="margin-bottom: 10px;">
                                <div class="track-step ${['Received', 'In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 0.5px;">
                                <span>Logged</span>
                                <span>Ready</span>
                            </div>

                            ${['Collected', 'Delivered', 'Completed'].includes(job.status) ? `
                                <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                                    ${job.rating ? `
                                        <div style="color: #fdcb6e; display: flex; align-items: center; gap: 4px;">
                                            ${'★'.repeat(job.rating)}${'☆'.repeat(5-job.rating)}
                                            <span style="font-size: 0.8rem; color: #666; margin-left: 8px;">Service Rated</span>
                                        </div>
                                    ` : `
                                        <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 8px;" onclick="window.client.showRateJobModal('${job.id}')">Rate Our Service</button>
                                    `}
                                </div>
                            ` : `
                                <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                                    <button class="btn-icon" title="View Details" onclick="window.app.executeDocumentAction('Print', 'Job Card', '${job.id}')">
                                        <span class="material-symbols-outlined" style="font-size: 1.2rem;">visibility</span>
                                    </button>
                                </div>
                            `}
                        </div>
                    `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #555; padding: 40px; background: rgba(255,255,255,0.01); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.05);">It looks like you don\\'t have any active repairs yet.</p>'}
                </div>
            </div>
        `;

        // 3. Document History (Estimates & Invoices)
        html += `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 32px;">
                <!-- Quotations -->
                <div>
                    <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px; font-size: 1.1rem;">
                        <span class="material-symbols-outlined" style="color: var(--primary);">request_quote</span>
                        Quotations & Estimates
                    </h3>
                    <div class="glass-card" style="padding: 0; min-height: 200px;">
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th style="text-align: right;">View</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${myQuotations.length > 0 ? myQuotations.map(q => `
                                        <tr>
                                            <td><strong>${q.id}</strong></td>
                                            <td>${q.date}</td>
                                            <td><span class="badge ${q.status.toLowerCase()}">${q.status}</span></td>
                                            <td style="text-align: right;">
                                                <button class="btn-icon" onclick="window.client.viewQuotation('${q.id}')"><span class="material-symbols-outlined">description</span></button>
                                            </td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 30px; color: #555;">No quotations on file.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Invoices -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="display: flex; align-items: center; gap: 10px; font-size: 1.1rem; margin: 0;">
                            <span class="material-symbols-outlined" style="color: var(--success);">receipt</span>
                            Invoice History
                        </h3>
                        <button class="btn-secondary" style="font-size: 0.7rem; padding: 4px 10px;" onclick="window.client.downloadStatement()">Download Statement</button>
                    </div>
                    <div class="glass-card" style="padding: 0; min-height: 200px;">
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th style="text-align: right;">Get</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${myInvoices.length > 0 ? myInvoices.map(i => `
                                        <tr>
                                            <td><strong>${i.id}</strong></td>
                                            <td>${i.date}</td>
                                            <td style="font-weight:600;">${i.amount}</td>
                                            <td style="text-align: right;">
                                                <button class="btn-icon" onclick="window.client.viewInvoice('${i.id}')"><span class="material-symbols-outlined">cloud_download</span></button>
                                            </td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 30px; color: #555;">No invoices on file.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        
        // Update header elements if they exist
        const hdrName = document.getElementById('client-name');
        const hdrEmail = document.getElementById('client-email');
        if (hdrName) hdrName.textContent = user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.email.split('@')[0];
        if (hdrEmail) hdrEmail.textContent = user.email;
    },

    // --- MODAL TRIGGERS ---

    showLogCallModal() {
        console.log("Opening Log Support Call Modal...");
        const contextUser = window.authSystem.currentUser || {};
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Log a Support Call</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">Please describe the IT problem you're facing. A technician will contact you to assist.</p>
                    <form onsubmit="window.client.submitCall(event)">
                        <div class="form-group">
                            <label>Describe the Issue</label>
                            <textarea id="cl-desc" class="form-control" placeholder="E.g. Cannot connect to the shared printer..." required rows="4"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Preferred Phone Number</label>
                            <input type="text" id="cl-phone" class="form-control" value="${contextUser.phone || ''}" required>
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="window.app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="padding: 10px 24px;">Submit Request</button>
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

        if (btn) { btn.innerHTML = '<span class="material-symbols-outlined rotating">sync</span> Sending...'; btn.disabled = true; }

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
            alert(`Succes! Support ticket ${ticketId} has been logged. Our team has been notified.`);
        } catch(err) {
            console.error("Support call failure:", err);
            alert("Error: Could not log support call. Please check your internet.");
            if (btn) { btn.innerHTML = 'Submit Request'; btn.disabled = false; }
        }
    },

    showBookRepairModal() {
        console.log("Opening Book Repair Modal...");
        const modalHTML = `
            <div class="modal-content" style="max-width: 550px;">
                <div class="modal-header">
                    <h2>Book a Repair</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 20px;">Choose your preferred service method:</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div class="choice-card active" onclick="this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); window.repairType='Walk-in'">
                            <span class="material-symbols-outlined">store</span>
                            <h4 style="margin: 0;">Walk-in</h4>
                            <p style="font-size: 0.75rem; color: #777;">I'll bring it to the shop</p>
                        </div>
                        <div class="choice-card" onclick="this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); window.repairType='Courier'">
                            <span class="material-symbols-outlined">local_shipping</span>
                            <h4 style="margin: 0;">Courier</h4>
                            <p style="font-size: 0.75rem; color: #777;">Please collect from me</p>
                        </div>
                    </div>
                    <form onsubmit="window.client.submitRepairBooking(event)">
                        <div class="form-group">
                            <label>Device Type & Model</label>
                            <input type="text" id="rep-device" class="form-control" placeholder="e.g. iPhone 14 / HP Envy Laptop" required>
                        </div>
                        <div class="form-group">
                            <label>What is the issue?</label>
                            <textarea id="rep-issue" class="form-control" placeholder="e.g. Cracked screen / Overheating..." required rows="3"></textarea>
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
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

        if (btn) { btn.innerHTML = 'Processing...'; btn.disabled = true; }

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
            alert(`Booking Confirmed! Your job reference is ${jobId}.`);
            this.render();
        } catch(err) {
            console.error("Repair booking failure:", err);
            alert("Error: Could not save booking.");
            if (btn) { btn.innerHTML = 'Confirm Booking'; btn.disabled = false; }
        }
    },

    viewQuotation(quoteId) {
        const quo = (window.app.state.quotations || []).find(q => q.id === quoteId);
        if(!quo) return;

        window.app.showModal(`
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Quotation Details: ${quo.id}</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                            <div>
                                <div style="font-size: 0.8rem; color: #888;">Total Amount</div>
                                <div style="font-size: 1.5rem; font-weight: bold; color: #fff;">${quo.amount}</div>
                            </div>
                            <span class="badge ${quo.status.toLowerCase()}">${quo.status}</span>
                        </div>
                        <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                            <h4 style="margin-bottom: 12px; font-size: 0.9rem; color: var(--primary);">Items Included:</h4>
                            ${(quo.items || []).map(item => `
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 6px;">
                                    <span>${item.desc} (x${item.qty})</span>
                                    <span style="color: #fff;">R ${(item.unit * item.qty).toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Do you have any comments or questions?</label>
                        <textarea id="quo-comment" class="form-control" placeholder="Type your message here..." rows="3">${quo.clientComment || ''}</textarea>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px;">
                        <button class="btn-secondary" style="justify-content: center; padding: 12px;" onclick="window.client.updateQuotationStatus('${quo.id}', 'Discuss')">Ask a Question</button>
                        <button class="btn-primary" style="background: var(--success); justify-content: center; padding: 12px;" onclick="window.client.updateQuotationStatus('${quo.id}', 'Approved')">Approve & Start Repair</button>
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
            
            const idx = (window.app.state.quotations || []).findIndex(q => q.id === quoteId);
            if (idx > -1) { 
                window.app.state.quotations[idx].status = status; 
                window.app.state.quotations[idx].clientComment = comment; 
            }
            
            window.app.closeModal();
            alert("Your response has been sent to our team.");
            this.render();
        } catch(err) { 
            console.error(err);
            alert("Error: Could not update quotation."); 
        }
    },

    viewInvoice(invId) {
        window.app.executeDocumentAction('Print', 'Invoice', invId);
    },

    downloadStatement() {
        const user = window.authSystem.currentUser;
        const myInvs = (window.app.state.invoices || []).filter(i => (i.email || '').toLowerCase() === user.email.toLowerCase());
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
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <div class="modal-header" style="justify-content: center; border-bottom: none;">
                    <h2 style="margin: 0;">We Value Your Feedback</h2>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 24px;">How was your experience with repair <b>${jobId}</b>?</p>
                    <form onsubmit="window.client.submitJobRating(event, '${jobId}')">
                        <div class="star-rating" style="margin-bottom: 24px;">
                            <input type="radio" id="star5" name="rating" value="5" required><label for="star5">★</label>
                            <input type="radio" id="star4" name="rating" value="4"><label for="star4">★</label>
                            <input type="radio" id="star3" name="rating" value="3"><label for="star3">★</label>
                            <input type="radio" id="star2" name="rating" value="2"><label for="star2">★</label>
                            <input type="radio" id="star1" name="rating" value="1"><label for="star1">★</label>
                        </div>
                        <textarea id="rating-fb" class="form-control" placeholder="How can we improve?" rows="3"></textarea>
                        <div class="modal-footer" style="justify-content: center; margin-top: 24px;">
                            <button type="submit" class="btn-primary" style="background: var(--success); width: 100%;">Submit Feedback</button>
                        </div>
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
            const idx = (window.app.state.jobs || []).findIndex(j => j.id === jobId);
            if(idx > -1) window.app.state.jobs[idx].rating = rating;
            window.app.closeModal();
            alert("Thank you for your rating!");
            this.render();
        } catch(err) { alert("Error saving feedback."); }
    },

    // --- PROFILE MANAGEMENT ---

    showProfileModal() {
        console.log("Opening Profile Settings Modal...");
        const user = window.authSystem.currentUser || {};
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Account Settings</h2>
                    <button class="btn-icon" onclick="window.app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="window.client.updateProfile(event)">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" id="prof-fname" class="form-control" value="${user.firstName || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" id="prof-lname" class="form-control" value="${user.lastName || ''}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Mobile Number</label>
                            <input type="text" id="prof-phone" class="form-control" value="${user.phone || ''}">
                        </div>
                        <div class="form-group">
                            <label>Email (Contact IT Guy Support to change)</label>
                            <input type="text" class="form-control" value="${user.email || ''}" disabled style="opacity: 0.5; background: rgba(0,0,0,0.1);">
                        </div>

                        <div style="margin: 25px 0; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <button type="button" class="btn-secondary" style="width: 100%; justify-content: center; border-color: rgba(108, 92, 231, 0.3);" onclick="window.client.showChangePasswordModal()">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem;">security</span> Change My Password
                            </button>
                        </div>

                        <div class="modal-footer" style="margin-top: 32px;">
                            <button type="button" class="btn-secondary" onclick="window.app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="padding: 10px 24px;">Update Profile</button>
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
            // Update local state
            user.firstName = fname;
            user.lastName = lname;
            user.phone = phone;
            
            window.app.closeModal();
            alert("Profile successfully updated!");
            this.render();
        } catch(err) {
            console.error(err);
            alert("Error: Could not save profile changes.");
        }
    },

    showChangePasswordModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Change Password</h2>
                    <button class="btn-icon" onclick="window.client.showProfileModal()"><span class="material-symbols-outlined">arrow_back</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #888; font-size: 0.85rem; margin-bottom: 20px;">Enter a new password for your account.</p>
                    <form onsubmit="window.client.submitPasswordChange(event)">
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" id="new-pw" class="form-control" required minlength="6">
                        </div>
                        <div class="form-group">
                            <label>Confirm Password</label>
                            <input type="password" id="new-pw-confirm" class="form-control" required minlength="6">
                        </div>
                        <div class="modal-footer" style="margin-top: 32px;">
                            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Change Password</button>
                        </div>
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
            alert("Error: Passwords do not match.");
            return;
        }

        try {
            await window.fbAuth.currentUser.updatePassword(pw);
            alert("Success! Password has been changed.");
            window.client.showProfileModal();
        } catch(err) {
            console.error(err);
            alert("Error: " + (err.message || "Failed to update password. Try logging out and back in first."));
        }
    }
};

// Auto-initialize if loaded after app
if (document.readyState === 'complete') {
    window.client.init();
} else {
    window.addEventListener('load', () => window.client.init());
}
