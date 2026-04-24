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
        const curEmail = window.authSystem.currentUser.email.toLowerCase();
        
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
                    <h1>Welcome, ${curEmail.split('@')[0]}!</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage your repair orders and financials directly from your portal.</p>
                </div>
                <button class="btn-primary" style="padding: 14px 28px;" onclick="client.showLogCallModal()">
                    <span class="material-symbols-outlined">support_agent</span> Log a Support Call
                </button>
            </div>
        `;

        // 1. Quotations Section (Prioritized because it requires approval!)
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="margin-bottom: 16px; color: #a29bfe; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Pending Quotations</h3>
                <div class="glass-card" style="padding: 0;">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Quote #</th>
                                    <th>Date</th>
                                    <th>Description Snippet</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th style="text-align: right;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${myQuotations.length > 0 ? myQuotations.map(quo => `
                                    <tr>
                                        <td><strong>${quo.id}</strong></td>
                                        <td>${quo.date}</td>
                                        <td>${quo.items && quo.items.length > 0 ? quo.items[0].desc : 'Repair Services'}</td>
                                        <td style="font-weight: bold; color: #ffffff;">${quo.amount}</td>
                                        <td><span class="badge ${quo.status.toLowerCase()}">${quo.status}</span></td>
                                        <td style="text-align: right;">
                                            ${quo.status === 'Pending' 
                                                ? `<button class="btn-primary" style="background: var(--success); font-size: 0.85rem; padding: 6px 12px;" onclick="client.approveQuotation('${quo.id}')">Approve</button>` 
                                                : `<button class="btn-icon" title="Download PDF" onclick="app.executeDocumentAction('Print', 'Quotation', '${quo.id}')"><span class="material-symbols-outlined">download</span></button>`
                                            }
                                        </td>
                                    </tr>
                                `).join('') : `<tr><td colspan="6" style="text-align:center; padding: 24px; color: #a0a0a0;">No quotations currently need your review.</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // 2. Active Jobs Section
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="margin-bottom: 16px; color: #a29bfe; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">My Active Repairs</h3>
                <div class="glass-card" style="padding: 0;">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Ticket / Job #</th>
                                    <th>Date Logged</th>
                                    <th>Device Logged</th>
                                    <th>Current Status</th>
                                    <th style="text-align: right;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${myJobs.length > 0 ? myJobs.map(job => `
                                    <tr>
                                        <td><strong>${job.id}</strong></td>
                                        <td>${job.date}</td>
                                        <td>${job.device || 'N/A'}</td>
                                        <td><span class="badge ${job.status.toLowerCase().replace(/ /g, '-')}">${job.status}</span></td>
                                        <td style="text-align: right; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                                            ${['Completed', 'Ready For Collection', 'Collected', 'Delivered'].includes(job.status) ? 
                                                (job.rating ? `<span style="color: #ffca28; margin-top: 2px;" title="You rated this ${job.rating} stars">${'★'.repeat(job.rating)}</span>` : `<button class="btn-primary" style="font-size: 0.8rem; padding: 6px 10px; background: var(--success);" onclick="client.showRateJobModal('${job.id}')">Rate Service</button>`)
                                            : ''}
                                            <button class="btn-icon" title="Download Job Card" onclick="app.executeDocumentAction('Print', 'Job Card', '${job.id}')"><span class="material-symbols-outlined">download</span></button>
                                        </td>
                                    </tr>
                                `).join('') : `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #a0a0a0;">You currently have no active jobs in the workshop.</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // 3. Invoices Section
        html += `
            <div style="margin-bottom: 32px;">
                <h3 style="margin-bottom: 16px; color: #a29bfe; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">My Invoices</h3>
                <div class="glass-card" style="padding: 0;">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Date</th>
                                    <th>Amount Due</th>
                                    <th>Status</th>
                                    <th style="text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${myInvoices.length > 0 ? myInvoices.map(inv => `
                                    <tr>
                                        <td><strong>${inv.id}</strong></td>
                                        <td>${inv.date}</td>
                                        <td style="font-weight: bold;">${inv.amount}</td>
                                        <td><span class="badge ${inv.status.toLowerCase()}">${inv.status}</span></td>
                                        <td style="text-align: right;">
                                            ${inv.status === 'Unpaid' 
                                                ? `<button class="btn-primary" style="font-size: 0.85rem; padding: 6px 12px;">Pay Online</button>` 
                                                : `<button class="btn-icon" title="Download PDF" onclick="app.executeDocumentAction('Print', 'Invoice', '${inv.id}')"><span class="material-symbols-outlined">download</span></button>`
                                            }
                                        </td>
                                    </tr>
                                `).join('') : `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #a0a0a0;">No outstanding invoices.</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <div style="text-align: center; color: #a0a0a0; font-size: 0.9rem; margin-top: 48px;">
                <p>IT Guy Solutions Support Hotline: <strong>082 123 4567</strong></p>
                <button class="btn-secondary" style="border: none; background: transparent; text-decoration: underline; margin-top: 8px;" onclick="window.authSystem.logout()">Securely Sign Out</button>
            </div>
        `;

        this.container.innerHTML = html;
    },

    approveQuotation(quoteId) {
        if(confirm(`Are you sure you want to approve quotation ${quoteId}?\nThis will instruct our technicians to begin the repair process.`)) {
            const idx = app.state.quotations.findIndex(q => q.id === quoteId);
            if (idx > -1) {
                app.state.quotations[idx].status = 'Approved';
                alert(`Success! Quotation ${quoteId} has been approved.`);
                this.render(); // Refresh UI
            }
        }
    },

    showLogCallModal() {
        // We reuse the central modal system
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Log a Support Call</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">Please describe the issue you are experiencing and provide your on-site address if a technician visit is required.</p>
                    <form onsubmit="client.submitCall(event)">
                        <div class="form-group">
                            <label>Issue Description</label>
                            <textarea id="cl-desc" class="form-control" placeholder="E.g. The main office printer won't connect to the Wi-Fi..." required rows="4"></textarea>
                        </div>
                        <div class="form-group">
                            <label>On-site Address (Optional if dropping off)</label>
                            <input type="text" id="cl-addr" class="form-control" placeholder="123 Example Street">
                        </div>
                        <div class="modal-footer" style="margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Submit Ticket</button>
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
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Submitting...'; btn.disabled = true; }

        const desc = document.getElementById('cl-desc').value;
        const curEmail = window.authSystem.currentUser.email;

        try {
            const newId = await window.app.getNextSequence('FLD');
            const payload = {
                id: newId,
                customer: curEmail.split('@')[0],
                email: curEmail,
                address: document.getElementById('cl-addr').value || 'To be determined',
                status: 'Requested',
                description: desc,
                technician: 'Unassigned',
                items: [],
                dateBooked: new Date().toISOString().split('T')[0],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await window.fbDb.collection('fieldJobs').doc(newId).set(payload);
            app.closeModal();
            alert("Your support call has been logged successfully! A technician will contact you shortly.");
        } catch(err) {
            console.error(err);
            alert("Server Error: Check your connection and try again.");
            if(btn) { btn.innerHTML = 'Log Call-out'; btn.disabled = false; }
        }
    },

    showRateJobModal(jobId) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
                    <span class="material-symbols-outlined" style="font-size: 48px; color: #ffca28; margin-bottom: 8px;">star</span>
                </div>
                <div class="modal-body" style="padding-top: 0;">
                    <h2 style="margin-bottom: 8px;">Rate Job ${jobId}</h2>
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">How was your experience with our team?</p>
                    
                    <form onsubmit="client.submitJobRating(event, '${jobId}')">
                        <div class="star-rating" style="margin-bottom: 16px;">
                            <input type="radio" id="star5" name="rating" value="5" required>
                            <label for="star5" title="5 stars">★</label>
                            <input type="radio" id="star4" name="rating" value="4">
                            <label for="star4" title="4 stars">★</label>
                            <input type="radio" id="star3" name="rating" value="3">
                            <label for="star3" title="3 stars">★</label>
                            <input type="radio" id="star2" name="rating" value="2">
                            <label for="star2" title="2 stars">★</label>
                            <input type="radio" id="star1" name="rating" value="1">
                            <label for="star1" title="1 star">★</label>
                        </div>
                        
                        <div class="form-group" style="text-align: left;">
                            <label>Additional Feedback (Optional)</label>
                            <textarea id="rating-feedback" class="form-control" rows="3" placeholder="Tell us what you liked or how we can improve..."></textarea>
                        </div>
                        
                        <div class="modal-footer" style="justify-content: center; margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="background: var(--success);">Submit Rating</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async submitJobRating(e, jobId) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Submitting...'; btn.disabled = true; }

        const formData = new FormData(e.target);
        const rating = parseInt(formData.get('rating'));
        const feedback = document.getElementById('rating-feedback').value.trim();

        try {
            await window.fbDb.collection('jobs').doc(jobId).update({
                rating: rating,
                feedback: feedback,
                ratedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            app.closeModal();
            // Simulating toaster
            alert("Thank you! Your feedback has been securely submitted to IT Guy management.");
        } catch(err) {
            console.error(err);
            alert("Database Error: Could not save rating.");
            if(btn) { btn.innerHTML = 'Submit Rating'; btn.disabled = false; }
        }
    }
};
