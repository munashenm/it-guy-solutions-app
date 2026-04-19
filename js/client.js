window.client = {
    init() {
        this.container = document.getElementById('client-content');
        this.render();
    },

    ensureMockDataForClient(email) {
        // Only run if we are in Mock mode and data hasn't been injected yet for this email
        // This makes testing easy for the user
        const hasJob = app.state.jobs.some(j => j.email === email);
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
        
        // Populate specific mock data for this user to make the demo feel alive
        if (!window.fbAuth) {
            this.ensureMockDataForClient(curEmail);
        }

        // Filter all records for just this client
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
        if(myQuotations.some(q => q.status === 'Pending') || myInvoices.some(i => i.status === 'Unpaid')) {
            html += `
            <div class="glass-card" style="margin-bottom: 32px; border: 1px solid rgba(108, 92, 231, 0.3); background: rgba(108, 92, 231, 0.05);">
                <h4 style="margin-bottom: 12px; color: var(--primary);">⚠️ Action Required</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                    ${myQuotations.filter(q => q.status === 'Pending').map(q => `
                        <div class="pending-item">
                            <span>Quote <strong>${q.id}</strong> requires your approval</span>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="client.approveQuotation('${q.id}')">View & Action</button>
                        </div>
                    `).join('')}
                    ${myInvoices.filter(i => i.status === 'Unpaid').map(i => `
                        <div class="pending-item">
                            <span>Invoice <strong>${i.id}</strong> is ready for payment</span>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; background: var(--success);">Pay Now</button>
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
                <div class="grid-3">
                    ${myJobs.length > 0 ? myJobs.map(job => `
                        <div class="glass-card job-track-card">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                                <span class="job-id">${job.id}</span>
                                <span class="badge ${job.status.toLowerCase().replace(' ', '-')}">${job.status}</span>
                            </div>
                            <h4 style="margin-bottom: 5px;">${job.device}</h4>
                            <p style="font-size: 0.85rem; color: #888;">${job.issue || 'General Maintenance'}</p>
                            <div class="track-timeline">
                                <div class="track-step ${['Received', 'In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['In Diagnosis', 'Waiting for Parts', 'Repairing', 'Ready'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Waiting for Parts', 'Repairing', 'Ready'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Repairing', 'Ready'].includes(job.status) ? 'active' : ''}"></div>
                                <div class="track-step ${['Ready', 'Completed'].includes(job.status) ? 'active' : ''}"></div>
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
                                        <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 6px;" onclick="client.showRateJobModal('${job.id}')">Rate Service</button>
                                    `}
                                </div>
                            ` : ''}
                        </div>
                    `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">You currently have no active repairs. Book a repair to get started!</p>'}
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

        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined rotating">hourglass_empty</span> Loging...'; btn.disabled = true; }

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
            alert(`Support call logged! Reference: ${newId}. A technician will call you shortly.`);
        } catch(err) {
            console.error(err);
            alert("Error logging call. Please try again.");
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
                            <input type="text" id="rep-device" class="form-control" placeholder="e.g. iPhone 13 Pro / HP Laptop" required>
                        </div>
                        <div class="form-group">
                            <label>What is wrong with it?</label>
                            <textarea id="rep-issue" class="form-control" placeholder="Describe the fault..." required rows="3"></textarea>
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="padding: 10px 24px;">Confirm Booking</button>
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
        const btn = e.target.querySelector('.btn-primary');
        const user = window.authSystem.currentUser;
        
        const device = document.getElementById('rep-device').value;
        const issue = document.getElementById('rep-issue').value;
        const type = window.repairType;

        if(btn) { btn.innerHTML = 'Processing...'; btn.disabled = true; }

        try {
            const jobId = 'JOB-' + Math.floor(Math.random()*9000 + 1000);
            const job = {
                id: jobId,
                device,
                issue,
                type,
                status: 'Requested',
                customer: user.firstName + ' ' + (user.lastName || ''),
                email: user.email,
                phone: user.phone || 'N/A',
                date: new Date().toISOString().split('T')[0]
            };

            await window.fbDb.collection('jobs').doc(jobId).set(job);
            app.state.jobs.unshift(job);
            app.closeModal();
            alert(`Repair Booked! Reference: ${jobId}. ${type === 'Courier' ? 'Our team will call you for collection details.' : 'Please bring your device to our store at your earliest convenience.'}`);
            this.render();
        } catch(err) {
            console.error(err);
            alert("Error booking repair.");
            if(btn) { btn.innerHTML = 'Confirm Booking'; btn.disabled = false; }
        }
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
                            <textarea id="rating-fb" class="form-control" placeholder="Any additional comments? (Optional)"></textarea>
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
            await window.fbDb.collection('jobs').doc(jobId).update({
                rating: rating,
                feedback: feedback
            });
            // Update local state
            const idx = app.state.jobs.findIndex(j => j.id === jobId);
            if(idx > -1) app.state.jobs[idx].rating = rating;
            
            app.closeModal();
            alert("Thank you for your feedback! It helps us improve.");
            this.render();
        } catch(err) {
            alert("Could not save rating. Please try again.");
        }
    },

    approveQuotation(quoteId) {
        if(confirm(`Approve quotation ${quoteId}?\nThis tells our team to proceed with the repair immediately.`)) {
            const idx = app.state.quotations.findIndex(q => q.id === quoteId);
            if (idx > -1) {
                app.state.quotations[idx].status = 'Approved';
                alert(`Quotation ${quoteId} Approved! Techinicans have been notified.`);
                this.render();
            }
        }
    },

    viewInvoice(invId) {
        app.executeDocumentAction('Print', 'Invoice', invId);
    }
};
