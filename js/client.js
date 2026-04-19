window.client = {
    init() {
        this.container = document.getElementById('client-content');
        this.render();
    },

    ensureMockDataForClient(email) {
        // Only run if we are in Mock mode
        const hasJob = app.state.jobs.some(j => (j.email || '').toLowerCase() === email.toLowerCase());
        if (!hasJob && !window.fbAuth) {
            app.state.jobs.push({
                id: 'JOB-9999',
                customer: email.split('@')[0],
                email: email,
                phone: '082 555 1234',
                device: 'Apple MacBook Air',
                status: 'In Diagnosis',
                date: new Date().toISOString().split('T')[0]
            });
            
            if(!app.state.quotations) app.state.quotations = [];
            app.state.quotations.push({
                id: 'QUO-9999',
                customer: email.split('@')[0],
                email: email,
                amount: 'R 2500.00',
                status: 'Pending',
                date: new Date().toISOString().split('T')[0],
                items: [
                    {type: 'Hardware', desc: 'Motherboard Component Level Repair', unit: 1500, qty: 1},
                    {type: 'Labour', desc: 'Diagnostics & Fitment', unit: 1000, qty: 1}
                ]
            });

            app.state.invoices.push({
                id: 'INV-9999',
                customer: email.split('@')[0],
                email: email,
                amount: 'R 450.00',
                status: 'Unpaid',
                date: new Date().toISOString().split('T')[0]
            });
        }
    },

    render() {
        if (!window.authSystem || !window.authSystem.currentUser) return;
        const user = window.authSystem.currentUser;
        const curEmail = user.email.toLowerCase();
        const displayName = user.firstName || curEmail.split('@')[0];
        
        const myJobs = (app.state.jobs || []).filter(j => (j.email || '').toLowerCase() === curEmail);
        const myQuotations = (app.state.quotations || []).filter(q => (q.email || '').toLowerCase() === curEmail);
        const myInvoices = (app.state.invoices || []).filter(i => (i.email || '').toLowerCase() === curEmail);
        
        let html = `
            <div class="section-header" style="margin-bottom: 32px;">
                <div>
                    <h1 style="font-size: 2.2rem;">Hello, ${displayName}!</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Welcome to your self-service command center.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-secondary" style="padding: 10px 18px;" onclick="window.client.showBookRepairModal()">
                        <span class="material-symbols-outlined">handyman</span> Book a Repair
                    </button>
                    <button class="btn-primary" style="padding: 10px 18px;" onclick="window.client.showLogCallModal()">
                        <span class="material-symbols-outlined">support_agent</span> Log Support Call
                    </button>
                </div>
            </div>
        `;

        // 1. Pending Actions Section
        const pendingQuos = myQuotations.filter(q => q.status === 'Pending');
        const unpaidInvs = myInvoices.filter(i => i.status === 'Unpaid');

        if(pendingQuos.length > 0 || unpaidInvs.length > 0) {
            html += `
            <div class="glass-card" style="margin-bottom: 32px; border: 1px solid rgba(108, 92, 231, 0.3); background: rgba(108, 92, 231, 0.05); animation: pulse-border 2s infinite;">
                <h4 style="margin-bottom: 12px; color: var(--primary); display: flex; align-items:center; gap: 8px;">
                    <span class="material-symbols-outlined">priority_high</span> 
                    Action Required
                </h4>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${pendingQuos.map(q => `
                        <div class="pending-item" style="display: flex; justify-content: space-between; align-items:center;">
                            <span>Quotation <strong>${q.id}</strong> requires your review.</span>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; background: var(--primary);" onclick="window.client.viewQuotation('${q.id}')">Review & Action</button>
                        </div>
                    `).join('')}
                    ${unpaidInvs.map(i => `
                        <div class="pending-item" style="display: flex; justify-content: space-between; align-items:center;">
                            <span>Invoice <strong>${i.id}</strong> is outstanding.</span>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; background: var(--success);" onclick="window.client.viewInvoice('${i.id}')">View Invoice</button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // 2. Active Repair Tracking
        html += `
            <div style="margin-bottom: 40px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <span class="material-symbols-outlined" style="color: var(--primary);">query_stats</span>
                    Active Repair Status
                </h3>
                <div class="grid-3" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">
                    ${myJobs.length > 0 ? myJobs.map(job => `
                        <div class="glass-card job-track-card" style="position: relative;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                <span class="job-id" style="color: var(--primary); font-weight: 700;">${job.id}</span>
                                <span class="badge ${job.status.toLowerCase().replace(/ /g, '-')}">${job.status}</span>
                            </div>
                            <h4 style="margin: 0;">${job.device}</h4>
                            <p style="font-size: 0.85rem; color: #888; margin: 8px 0;">${job.issue || 'IT Repair'}</p>
                            
                            <div class="track-timeline" style="margin: 20px 0;">
                                <div class="track-step ${['Received', 'In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #555; font-weight: 500;">
                                <span>Booked</span>
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
                                        <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 6px;" onclick="window.client.showRateJobModal('${job.id}')">Rate Service</button>
                                    `}
                                </div>
                            ` : `
                                <button class="btn-icon" style="position: absolute; bottom: 12px; right: 12px;" onclick="app.executeDocumentAction('Print', 'Job Card', '${job.id}')">
                                    <span class="material-symbols-outlined" style="font-size: 1.1rem;">download</span>
                                </button>
                            `}
                        </div>
                    `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">You currently have no active repairs.</p>'}
                </div>
            </div>
        `;

        // 3. Historical Data Tabs/Sections
        html += `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 40px;">
                <!-- Quotations History -->
                <div>
                    <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <span class="material-symbols-outlined" style="color: var(--primary);">description</span>
                        My Estimates
                    </h3>
                    <div class="glass-card" style="padding: 0; overflow: hidden;">
                        <div class="table-container">
                            <table style="font-size: 0.9rem;">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th style="text-align: right;">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${myQuotations.length > 0 ? myQuotations.map(q => `
                                        <tr>
                                            <td><strong>${q.id}</strong></td>
                                            <td>${q.date}</td>
                                            <td><span class="badge ${q.status.toLowerCase()}">${q.status}</span></td>
                                            <td style="text-align: right;">
                                                <button class="btn-icon" onclick="window.client.viewQuotation('${q.id}')"><span class="material-symbols-outlined">visibility</span></button>
                                            </td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #555;">No records found.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Invoices History -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3 style="display: flex; align-items: center; gap: 10px; margin: 0;">
                            <span class="material-symbols-outlined" style="color: var(--success);">receipt_long</span>
                            My Invoices
                        </h3>
                        <button class="btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="window.client.downloadStatement()">Download Statement</button>
                    </div>
                    <div class="glass-card" style="padding: 0; overflow: hidden;">
                        <div class="table-container">
                            <table style="font-size: 0.9rem;">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th style="text-align: right;">Download</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${myInvoices.length > 0 ? myInvoices.map(i => `
                                        <tr>
                                            <td><strong>${i.id}</strong></td>
                                            <td>${i.date}</td>
                                            <td style="font-weight:700;">${i.amount}</td>
                                            <td style="text-align: right;">
                                                <button class="btn-icon" onclick="window.client.viewInvoice('${i.id}')"><span class="material-symbols-outlined">download</span></button>
                                            </td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #555;">No records found.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        // Re-populate static header text
        document.getElementById('client-name').textContent = user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.email.split('@')[0];
        document.getElementById('client-email').textContent = user.email;
    },

    // --- MODALS ---

    showLogCallModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Log a Support Call</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">Need immediate assist? Describe the issue and a technician will contact you.</p>
                    <form onsubmit="window.client.submitCall(event)">
                        <div class="form-group">
                            <label>Issue Description</label>
                            <textarea id="cl-desc" class="form-control" placeholder="E.g. The Wi-Fi is down in the back office..." required rows="4"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Best Contact Number</label>
                            <input type="text" id="cl-phone" class="form-control" value="${window.authSystem.currentUser.phone || ''}" required>
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="min-width: 150px;">Log Ticket</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async submitCall(e) {
        e.preventDefault();
        const btn = e.target.querySelector('.btn-primary');
        const desc = document.getElementById('cl-desc').value;
        const user = window.authSystem.currentUser;

        if(btn) { btn.innerHTML = 'Logging...'; btn.disabled = true; }

        try {
            const newId = 'FLD-' + Math.floor(Math.random()*9000 + 1000);
            const payload = {
                id: newId,
                customer: user.firstName + ' ' + (user.lastName || ''),
                email: user.email,
                phone: document.getElementById('cl-phone').value,
                status: 'Requested',
                description: desc,
                technician: 'Unassigned',
                dateBooked: new Date().toISOString().split('T')[0]
            };

            await window.fbDb.collection('fieldJobs').doc(newId).set(payload);
            app.closeModal();
            alert(`Call Logged! Reference: ${newId}. We will be in touch shortly.`);
        } catch(err) {
            alert("Database Error. Please try again.");
            if(btn) { btn.innerHTML = 'Log Ticket'; btn.disabled = false; }
        }
    },

    showBookRepairModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 550px;">
                <div class="modal-header">
                    <h2>Book a Repair</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 20px;">Choose how we will receive your device.</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div class="choice-card active" onclick="this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); window.repairType='Walk-in'">
                            <span class="material-symbols-outlined">store</span>
                            <h4>Walk-in</h4>
                            <p style="font-size: 0.8rem; color: #888;">Bring it to our shop</p>
                        </div>
                        <div class="choice-card" onclick="this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); window.repairType='Courier'">
                            <span class="material-symbols-outlined">local_shipping</span>
                            <h4>Courier</h4>
                            <p style="font-size: 0.8rem; color: #888;">We collect from you</p>
                        </div>
                    </div>
                    <form onsubmit="window.client.submitRepairBooking(event)">
                        <div class="form-group">
                            <label>Device & Model</label>
                            <input type="text" id="rep-device" class="form-control" placeholder="e.g. iPhone 13 / Dell XPS 15" required>
                        </div>
                        <div class="form-group">
                            <label>Problem Description</label>
                            <textarea id="rep-issue" class="form-control" placeholder="What's wrong with the device?" required rows="3"></textarea>
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Confirm Repair Booking</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
        window.repairType = 'Walk-in';
    },

    async submitRepairBooking(e) {
        e.preventDefault();
        const user = window.authSystem.currentUser;
        const jobId = 'JOB-' + Math.floor(Math.random()*9000 + 1000);
        const job = {
            id: jobId,
            device: document.getElementById('rep-device').value,
            issue: document.getElementById('rep-issue').value,
            type: window.repairType,
            status: 'Requested',
            customer: user.firstName + ' ' + (user.lastName || ''),
            email: user.email,
            date: new Date().toISOString().split('T')[0]
        };
        try {
            await window.fbDb.collection('jobs').doc(jobId).set(job);
            app.state.jobs.unshift(job);
            app.closeModal();
            alert(`Success! Repair ticket ${jobId} created.`);
            this.render();
        } catch(err) { alert("Error booking repair."); }
    },

    viewQuotation(quoteId) {
        const quo = app.state.quotations.find(q => q.id === quoteId);
        if(!quo) return;

        app.showModal(`
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Quotation Details: ${quo.id}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                            <div>
                                <div style="font-size: 0.8rem; color: #888;">Estimated Amount</div>
                                <div style="font-size: 1.4rem; font-weight: 700;">${quo.amount}</div>
                            </div>
                            <span class="badge ${quo.status.toLowerCase()}">${quo.status}</span>
                        </div>
                        <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                            <h4 style="margin-bottom: 10px; font-size: 0.9rem; color: var(--primary);">Items</h4>
                            ${(quo.items || []).map(item => `<div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;"><span>${item.desc} (x${item.qty})</span><span>R ${(item.unit * item.qty).toFixed(2)}</span></div>`).join('')}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Your Feedback / Comment</label>
                        <textarea id="quo-comment" class="form-control" placeholder="Add a comment for the technician..." rows="3">${quo.clientComment || ''}</textarea>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px;">
                        <button class="btn-secondary" onclick="window.client.updateQuotationStatus('${quo.id}', 'Discuss')">Ask Question</button>
                        <button class="btn-primary" style="background: var(--success);" onclick="window.client.updateQuotationStatus('${quo.id}', 'Approved')">Approve Repair</button>
                    </div>
                </div>
            </div>
        `);
    },

    async updateQuotationStatus(quoteId, status) {
        const comment = document.getElementById('quo-comment').value;
        try {
            await window.fbDb.collection('quotations').doc(quoteId).update({ status, clientComment: comment });
            const idx = app.state.quotations.findIndex(q => q.id === quoteId);
            if (idx > -1) { app.state.quotations[idx].status = status; app.state.quotations[idx].clientComment = comment; }
            app.closeModal();
            alert("Response saved successfully.");
            this.render();
        } catch(err) { alert("Error updating quotation."); }
    },

    viewInvoice(invId) {
        app.executeDocumentAction('Print', 'Invoice', invId);
    },

    downloadStatement() {
        const user = window.authSystem.currentUser;
        const myInvoices = (app.state.invoices || []).filter(i => (i.email || '').toLowerCase() === user.email.toLowerCase());
        const data = {
            customer: user.firstName + ' ' + (user.lastName || ''),
            date: new Date().toLocaleDateString(),
            invoices: myInvoices,
            total: myInvoices.reduce((sum, i) => sum + (parseFloat(i.amount.replace(/[^0-9.]/g, '')) || 0), 0)
        };
        app.executeDocumentAction('Download', 'Statement', user.email, data);
    },

    showRateJobModal(jobId) {
        app.showModal(`
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <div class="modal-header" style="justify-content: center; border-bottom: none;">
                    <h2 style="margin: 0;">Rate Service</h2>
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
                        <textarea id="rating-fb" class="form-control" placeholder="Comments..." rows="3"></textarea>
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
            await window.fbDb.collection('jobs').doc(jobId).update({ rating, feedback });
            const idx = app.state.jobs.findIndex(j => j.id === jobId);
            if(idx > -1) app.state.jobs[idx].rating = rating;
            app.closeModal();
            alert("Thank you!");
            this.render();
        } catch(err) { alert("Error."); }
    },

    // --- PROFILE & ACCOUNT ---

    showProfileModal() {
        const user = window.authSystem.currentUser;
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Account Settings</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
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
                            <label>Phone Number</label>
                            <input type="text" id="prof-phone" class="form-control" value="${user.phone || ''}">
                        </div>
                        <div class="form-group">
                            <label>Email Address (Cannot be changed)</label>
                            <input type="text" class="form-control" value="${user.email}" disabled style="opacity: 0.6;">
                        </div>

                        <div style="margin: 24px 0; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <button type="button" class="btn-secondary" style="width: 100%; border-color: rgba(255,255,255,0.1);" onclick="window.client.showChangePasswordModal()">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem;">lock</span> Change Account Password
                            </button>
                        </div>

                        <div class="modal-footer" style="margin-top: 32px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="padding: 10px 24px;">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async updateProfile(e) {
        e.preventDefault();
        const fname = document.getElementById('prof-fname').value;
        const lname = document.getElementById('prof-lname').value;
        const phone = document.getElementById('prof-phone').value;
        
        try {
            await window.fbDb.collection('users').doc(window.authSystem.currentUser.uid).update({
                firstName: fname,
                lastName: lname,
                phone: phone
            });
            // Update local user object
            window.authSystem.currentUser.firstName = fname;
            window.authSystem.currentUser.lastName = lname;
            window.authSystem.currentUser.phone = phone;
            
            app.closeModal();
            alert("Profile updated successfully!");
            this.render();
        } catch(err) {
            alert("Error updating profile.");
        }
    },

    showChangePasswordModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Change Password</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="window.client.submitPasswordChange(event)">
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" id="new-pw" class="form-control" required minlength="6">
                        </div>
                        <div class="form-group">
                            <label>Confirm New Password</label>
                            <input type="password" id="new-pw-confirm" class="form-control" required minlength="6">
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="window.client.showProfileModal()">Back</button>
                            <button type="submit" class="btn-primary">Update Password</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async submitPasswordChange(e) {
        e.preventDefault();
        const pw = document.getElementById('new-pw').value;
        const confirm = document.getElementById('new-pw-confirm').value;

        if (pw !== confirm) {
            alert("Passwords do not match.");
            return;
        }

        try {
            // In our local-db.js implementation, we can use the password proxy
            await window.fbAuth.currentUser.updatePassword(pw);
            alert("Success! Your password has been updated. Please use it for your next login.");
            window.client.showProfileModal();
        } catch(err) {
            console.error(err);
            alert("Security Error: " + (err.message || "Could not update password. Try logging out and back in first."));
        }
    }
};
