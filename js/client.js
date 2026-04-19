window.client = {
    init() {
        this.container = document.getElementById('client-content');
        this.render();
    },

    ensureMockDataForClient(email) {
        // Only run if we are in Mock mode and data hasn't been injected yet for this email
        const hasJob = app.state.jobs.some(j => (j.email || '').toLowerCase() === email.toLowerCase());
        if (!hasJob) {
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
            <div class="section-header">
                <div>
                    <h1 style="font-size: 2.5rem;">Welcome, ${displayName}!</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Track your repairs, approve quotes, and manage your support calls.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-secondary" style="padding: 12px 20px;" onclick="client.showBookRepairModal()">
                        <span class="material-symbols-outlined">handyman</span> Book a Repair
                    </button>
                    <button class="btn-primary" style="padding: 12px 20px;" onclick="client.showLogCallModal()">
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
            <div class="glass-card" style="margin-bottom: 32px; border: 1px solid rgba(108, 92, 231, 0.3); background: rgba(108, 92, 231, 0.05);">
                <h4 style="margin-bottom: 12px; color: var(--primary);">⚠️ Action Required</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                    ${pendingQuos.map(q => `
                        <div class="pending-item">
                            <span>Quote <strong>${q.id}</strong> requires your approval</span>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="client.viewQuotation('${q.id}')">View & Comment</button>
                        </div>
                    `).join('')}
                    ${unpaidInvs.map(i => `
                        <div class="pending-item">
                            <span>Invoice <strong>${i.id}</strong> is ready for payment</span>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; background: var(--success);" onclick="client.viewInvoice('${i.id}')">Pay Now</button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // 2. Active Repairs (Tracking)
        html += `
            <div style="margin-bottom: 40px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <span class="material-symbols-outlined" style="color: var(--primary);">query_stats</span>
                    Active Repair Status
                </h3>
                <div class="grid-3" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">
                    ${myJobs.length > 0 ? myJobs.map(job => `
                        <div class="glass-card job-track-card">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                                <span class="job-id">${job.id}</span>
                                <span class="badge ${job.status.toLowerCase().replace(/ /g, '-')}">${job.status}</span>
                            </div>
                            <h4 style="margin-bottom: 5px;">${job.device}</h4>
                            <p style="font-size: 0.85rem; color: #888;">${job.issue || 'General Maintenance'}</p>
                            <div class="track-timeline">
                                <div class="track-step ${['Received', 'In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Waiting for Parts', 'Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Repairing', 'Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Ready', 'Collected'].includes(job.status) ? 'active' : ''}"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #666; margin-top: 10px;">
                                <span>Received</span>
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
                                        <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 6px;" onclick="client.showRateJobModal('${job.id}')">Rate Service</button>
                                    `}
                                </div>
                            ` : ''}
                        </div>
                    `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">No active repairs found.</p>'}
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    showLogCallModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Log a Support Call</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">Need immediate assistance? Provide details and a technician will reach out.</p>
                    <form onsubmit="client.submitCall(event)">
                        <div class="form-group">
                            <label>Description of Issue</label>
                            <textarea id="cl-desc" class="form-control" placeholder="E.g. Computer won't start after update..." required rows="4"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Your Contact Number</label>
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

        if(btn) { btn.innerHTML = 'Submitting...'; btn.disabled = true; }

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
            alert(`Support call logged! Reference: ${newId}.`);
        } catch(err) {
            alert("Error logging call.");
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
                    <form onsubmit="client.submitRepairBooking(event)">
                        <div class="form-group">
                            <label>Device Type & Model</label>
                            <input type="text" id="rep-device" class="form-control" required placeholder="e.g. MacBook Pro">
                        </div>
                        <div class="form-group">
                            <label>Description of Issue</label>
                            <textarea id="rep-issue" class="form-control" required rows="3"></textarea>
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Confirm Booking</button>
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
            alert(`Repair Booked! Reference: ${jobId}`);
            this.render();
        } catch(err) { alert("Error booking repair."); }
    },

    viewQuotation(quoteId) {
        const quo = app.state.quotations.find(q => q.id === quoteId);
        if(!quo) return;

        const modalHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Quotation Details: ${quo.id}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                            <div>
                                <div style="font-size: 0.8rem; color: #888;">Date</div>
                                <div>${quo.date}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 0.8rem; color: #888;">Expected Total</div>
                                <div style="font-size: 1.4rem; font-weight: 700; color: #ffffff;">${quo.amount}</div>
                            </div>
                        </div>

                        <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                            <h4 style="margin-bottom: 10px; font-size: 0.9rem; color: var(--primary);">Itemized Breakdown</h4>
                            ${(quo.items || []).map(item => `
                                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px;">
                                    <span>${item.desc} (x${item.qty})</span>
                                    <span>R ${(item.unit * item.qty).toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Your Comments / Questions</label>
                        <textarea id="quo-comment" class="form-control" placeholder="Any specific requests or questions about this repair?" rows="3">${quo.clientComment || ''}</textarea>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 30px;">
                        <button class="btn-secondary" onclick="client.updateQuotationStatus('${quo.id}', 'Discuss', true)">
                            <span class="material-symbols-outlined">chat_bubble</span> Contact Me
                        </button>
                        <button class="btn-primary" style="background: var(--success);" onclick="client.updateQuotationStatus('${quo.id}', 'Approved', false)">
                            <span class="material-symbols-outlined">check_circle</span> Approve Repair
                        </button>
                    </div>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async updateQuotationStatus(quoteId, status, needsContact) {
        const comment = document.getElementById('quo-comment').value;
        try {
            await window.fbDb.collection('quotations').doc(quoteId).update({
                status: status,
                clientComment: comment
            });
            const idx = app.state.quotations.findIndex(q => q.id === quoteId);
            if (idx > -1) {
                app.state.quotations[idx].status = status;
                app.state.quotations[idx].clientComment = comment;
            }
            app.closeModal();
            alert(needsContact ? "Request sent! Technician will contact you." : "Quotation approved!");
            this.render();
        } catch(err) {
            alert("Error updating quotation.");
        }
    },

    viewInvoice(invId) {
        app.executeDocumentAction('Print', 'Invoice', invId);
    },

    showRateJobModal(jobId) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <div class="modal-header" style="justify-content: center; border-bottom: none;">
                    <h2 style="margin: 0;">Service Feedback</h2>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 24px;">How happy are you with repair <b>${jobId}</b>?</p>
                    <form onsubmit="client.submitJobRating(event, '${jobId}')">
                        <div class="star-rating" style="margin-bottom: 24px;">
                            <input type="radio" id="star5" name="rating" value="5" required>
                            <label for="star5">★</label>
                            <input type="radio" id="star4" name="rating" value="4">
                            <label for="star4">★</label>
                            <input type="radio" id="star3" name="rating" value="3">
                            <label for="star3">★</label>
                            <input type="radio" id="star2" name="rating" value="2">
                            <label for="star2">★</label>
                            <input type="radio" id="star1" name="rating" value="1">
                            <label for="star1">★</label>
                        </div>
                        <div class="form-group" style="text-align: left;">
                            <textarea id="rating-fb" class="form-control" placeholder="Any comments?"></textarea>
                        </div>
                        <div class="modal-footer" style="justify-content: center; margin-top: 24px;">
                            <button type="submit" class="btn-primary" style="background: var(--success); width: 100%;">Submit Rating</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async submitJobRating(e, jobId) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const rating = parseInt(formData.get('rating'));
        const feedback = document.getElementById('rating-fb').value;
        try {
            await window.fbDb.collection('jobs').doc(jobId).update({ rating, feedback });
            const idx = app.state.jobs.findIndex(j => j.id === jobId);
            if(idx > -1) app.state.jobs[idx].rating = rating;
            app.closeModal();
            alert("Thank you for your feedback!");
            this.render();
        } catch(err) { alert("Error saving rating."); }
    }
};
