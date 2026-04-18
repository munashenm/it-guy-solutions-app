window.tickets = {
    timer: {
        active: false,
        startTime: null,
        ticketId: null,
        interval: null
    },

    init() {
        this.container = document.getElementById('tickets-content');
        if(this.container) this.render();
    },

    render() {
        if (!this.container) {
            this.container = document.getElementById('tickets-content');
            if (!this.container) return;
        }

        const stats = this.getStats();
        
        let html = `
            <div class="section-header">
                <div>
                    <h1>Service Desk & Tickets</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage support requests, track billable time, and onsite consulting.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    ${window.authSystem?.currentUser?.role !== 'technician' ? `<button class="btn-primary" onclick="tickets.showNewTicketModal()"><span class="material-symbols-outlined">add_circle</span> New Ticket</button>` : ''}
                </div>
            </div>

            <!-- Stats Bar -->
            <div class="stats-grid" style="margin-bottom: 24px;">
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(108, 92, 231, 0.1); color: var(--primary);"><span class="material-symbols-outlined">confirmation_number</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.open}</div>
                        <div class="stat-label">Open Tickets</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(253, 203, 110, 0.1); color: var(--warning);"><span class="material-symbols-outlined">hourglass_top</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.pending}</div>
                        <div class="stat-label">Pending Response</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(0, 184, 148, 0.1); color: var(--success);"><span class="material-symbols-outlined">check_circle</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.closed}</div>
                        <div class="stat-label">Resolved (This Month)</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(255, 118, 117, 0.1); color: var(--danger);"><span class="material-symbols-outlined">schedule</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.billableHrs}h</div>
                        <div class="stat-label">Unbilled Labor</div>
                    </div>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">Active Tickets</h2>
                    <div class="search-bar" style="margin: 0; width: 300px; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                        <span class="material-symbols-outlined">search</span>
                        <input type="text" placeholder="Search by ID, Client or Subject..." id="ticket-search" oninput="tickets.filterTickets()">
                    </div>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Ticket ID</th>
                                <th>Priority</th>
                                <th>Client / Contact</th>
                                <th>Subject</th>
                                <th>Assigned To</th>
                                <th>Time Tracked</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="tickets-table-body">
                            ${this.renderTicketRows()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.updateTimerDisplayGlobally();
    },

    getStats() {
        const tks = window.app.state.tickets || [];
        const open = tks.filter(t => t.status === 'Open').length;
        const pending = tks.filter(t => t.status === 'Pending').length;
        const closed = tks.filter(t => t.status === 'Closed').length;
        
        let billableMs = 0;
        tks.forEach(t => {
            if(t.status !== 'Closed' && t.timeLogs) {
                t.timeLogs.forEach(log => {
                    if(!log.billed) billableMs += (log.duration || 0);
                });
            }
        });
        
        const billableHrs = (billableMs / (1000 * 60 * 60)).toFixed(1);

        return { open, pending, closed, billableHrs };
    },

    renderTicketRows(filter = '') {
        const tks = window.app.state.tickets || [];
        const currentUser = window.authSystem?.currentUser;
        const filtered = tks.filter(t => {
            const matchesSearch = `${t.id} ${t.customer} ${t.subject}`.toLowerCase().includes(filter.toLowerCase());
            
            if (currentUser && currentUser.role === 'technician') {
                const uName = currentUser.email.split('@')[0].toLowerCase();
                // Techs only see tickets specifically assigned to them
                return matchesSearch && t.assignedTo && t.assignedTo.toLowerCase().includes(uName);
            }
            return matchesSearch;
        });

        if(filtered.length === 0) {
            return `<tr><td colspan="7" style="text-align: center; color: #a0a0a0; padding: 40px;">No support tickets found.</td></tr>`;
        }

        return filtered.sort((a, b) => new Date(b.createdAt?.seconds * 1000 || 0) - new Date(a.createdAt?.seconds * 1000 || 0)).map(t => {
            const timeTracked = this.formatDuration(this.getTotalTime(t));
            const priorityClass = t.priority?.toLowerCase() || 'medium';
            
            return `
                <tr>
                    <td><strong>${t.id}</strong></td>
                    <td><span class="badge ${priorityClass}">${t.priority || 'Medium'}</span></td>
                    <td>
                        <div>${t.customer}</div>
                        <div style="font-size: 0.8rem; color: #a0a0a0;">${t.phone || t.email || ''}</div>
                    </td>
                    <td>${t.subject}</td>
                    <td><span style="font-size: 0.9rem; color: #a29bfe; font-weight: 600;">${t.assignedTo || 'Unassigned'}</span></td>
                    <td><span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle; color: var(--accent);">schedule</span> ${timeTracked}</td>
                    <td><span class="badge ${t.status?.toLowerCase() || 'open'}">${t.status || 'Open'}</span></td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-icon" title="View/Edit" onclick="tickets.viewTicket('${t.id}')"><span class="material-symbols-outlined">visibility</span></button>
                            <button class="btn-icon" title="${this.timer.active && this.timer.ticketId === t.id ? 'Stop Timer' : 'Start Timer'}" 
                                onclick="tickets.toggleTimer('${t.id}')" 
                                style="color: ${this.timer.active && this.timer.ticketId === t.id ? 'var(--danger)' : 'var(--success)'}">
                                <span class="material-symbols-outlined">${this.timer.active && this.timer.ticketId === t.id ? 'stop_circle' : 'play_circle'}</span>
                            </button>
                            ${t.status !== 'Closed' ? `<button class="btn-icon" title="Bill Now" onclick="tickets.showBillingModal('${t.id}')" style="color: var(--accent);"><span class="material-symbols-outlined">payments</span></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    getTotalTime(ticket) {
        if(!ticket.timeLogs) return 0;
        return ticket.timeLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
    },

    formatDuration(ms) {
        const totalSecs = Math.floor(ms / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    filterTickets() {
        const query = document.getElementById('ticket-search').value;
        const tbody = document.getElementById('tickets-table-body');
        if(tbody) tbody.innerHTML = this.renderTicketRows(query);
    },

    async showNewTicketModal() {
        const nextId = await window.app.getNextSequence("TCK");
        const modalHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>New Support Ticket</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="new-ticket-form" onsubmit="tickets.handleCreateTicket(event)">
                        <input type="hidden" id="tck-id" value="${nextId}">
                        <div class="form-group">
                            <label>Client Selection</label>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="tck-customer" list="crm-customers-list" class="form-control" placeholder="Select existing client or type name" required oninput="app.fillCustomerDetails(this.value, 'tck')">
                                <button type="button" class="btn-secondary" style="padding: 0 12px;" onclick="customers.showAddCustomerModal()"><span class="material-symbols-outlined">person_add</span></button>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Cell / WhatsApp</label>
                                <input type="tel" id="tck-phone" class="form-control" placeholder="082 123 4567" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0" required>
                            </div>
                            <div class="form-group">
                                <label>Priority</label>
                                <select id="tck-priority" class="form-control" style="appearance: auto;">
                                    <option value="Low">Low</option>
                                    <option value="Medium" selected>Medium</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">Urgent / Critical</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Subject / Issue Title</label>
                            <input type="text" id="tck-subject" class="form-control" placeholder="e.g. Email Sync Issues on Office 365" required>
                        </div>
                        <div class="form-group">
                            <label>Initial Description / Notes</label>
                            <textarea id="tck-desc" class="form-control" rows="4" placeholder="Briefly describe the support request..."></textarea>
                        </div>
                        
                        <div style="background: rgba(var(--accent-rgb), 0.1); padding: 12px; border-radius: 8px; margin: 16px 0; border: 1px solid var(--accent);">
                            <div style="display: flex; align-items: center; gap: 10px; color: var(--accent);">
                                <span class="material-symbols-outlined">notifications_active</span>
                                <span style="font-weight: 500;">Client will be notified via WhatsApp & Email upon creation.</span>
                            </div>
                        </div>

                        <div class="modal-footer" style="padding: 0; margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="flex: 2; justify-content: center;">Create Ticket</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleCreateTicket(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Creating...'; btn.disabled = true; }

        const id = document.getElementById('tck-id').value;
        const customer = document.getElementById('tck-customer').value;
        const phone = document.getElementById('tck-phone').value;
        const priority = document.getElementById('tck-priority').value;
        const subject = document.getElementById('tck-subject').value;
        const desc = document.getElementById('tck-desc').value;

        try {
            const payload = {
                id,
                customer,
                phone,
                priority,
                subject,
                description: desc,
                status: 'Open',
                timeLogs: [],
                comments: [
                    {
                        user: window.app.state.user?.name || 'System',
                        text: `Ticket created manually. ${desc ? 'Initial note: ' + desc : ''}`,
                        date: new Date().toISOString()
                    }
                ],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await window.fbDb.collection('tickets').doc(id).set(payload);
            
            // Send Automated Notifications (Simulated)
            this.sendNotifications(id, 'Created', customer, phone, subject);
            
            window.app.closeModal();
            alert(`Ticket ${id} created successfully! Notifications sent.`);
        } catch(err) {
            console.error(err);
            alert("Database Error: Could not save ticket.");
            if(btn) { btn.innerHTML = 'Create Ticket'; btn.disabled = false; }
        }
    },

    viewTicket(id) {
        const ticket = window.app.state.tickets.find(t => t.id === id);
        if(!ticket) return;

        const totalTime = this.formatDuration(this.getTotalTime(ticket));

        const modalHTML = `
            <div class="modal-content" style="max-width: 800px; width: 95%;">
                <div class="modal-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <h2>${ticket.id}: ${ticket.subject}</h2>
                        <span class="badge ${ticket.priority.toLowerCase()}">${ticket.priority}</span>
                        <span class="badge ${ticket.status.toLowerCase()}">${ticket.status}</span>
                    </div>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
                        <!-- Left: Main Activity -->
                        <div>
                            <div class="glass-card" style="padding: 16px; margin-bottom: 24px;">
                                <h3 style="margin-top: 0; font-size: 1rem;">Internal Discussion / Progress</h3>
                                <div id="tck-activity-feed" style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
                                    ${(ticket.comments || []).map(c => `
                                        <div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 8px;">
                                            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
                                                <strong style="color: var(--accent);">${c.user}</strong>
                                                <span style="color: #a0a0a0;">${new Date(c.date).toLocaleString()}</span>
                                            </div>
                                            <div style="color: #e0e0e0; line-height: 1.4;">${c.text}</div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <textarea id="tck-comment-input" class="form-control" rows="1" placeholder="Add a private note or update..." style="resize: none;"></textarea>
                                    <button class="btn-primary" onclick="tickets.addComment('${ticket.id}')"><span class="material-symbols-outlined">send</span></button>
                                </div>
                            </div>
                        </div>

                        <!-- Right: Sidebar Info -->
                        <div>
                            <div class="glass-card" style="padding: 16px; margin-bottom: 16px;">
                                <h3 style="margin-top: 0; font-size: 0.9rem; color: #a0a0a0;">CLIENT INFO</h3>
                                <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 4px;">${ticket.customer}</div>
                                <div style="color: #a0a0a0; font-size: 0.9rem; margin-bottom: 16px;">${ticket.phone}</div>
                                
                                <h3 style="font-size: 0.9rem; color: #a0a0a0;">TOTAL LABOR</h3>
                                <div style="font-size: 1.8rem; font-weight: bold; color: var(--accent);">${totalTime}</div>
                                <p style="font-size: 0.8rem; color: #a0a0a0;">Measured across ${ticket.timeLogs?.length || 0} sessions.</p>
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                                ${window.authSystem?.currentUser?.role === 'admin' ? `
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label style="font-size: 0.75rem;">Assign Technician</label>
                                    <select class="form-control" style="appearance: auto;" onchange="tickets.assignTech('${ticket.id}', this.value)">
                                        <option value="">Unassigned</option>
                                        <option value="Admin" ${ticket.assignedTo === 'Admin' ? 'selected' : ''}>Admin</option>
                                        <option value="John" ${ticket.assignedTo === 'John' ? 'selected' : ''}>John</option>
                                        <option value="Sarah" ${ticket.assignedTo === 'Sarah' ? 'selected' : ''}>Sarah</option>
                                    </select>
                                </div>
                                ` : ''}
                                <button class="btn-secondary" style="justify-content: center;" onclick="tickets.toggleStatus('${ticket.id}')">
                                    <span class="material-symbols-outlined">sync</span> Mark as ${ticket.status === 'Open' ? 'Pending' : 'Open'}
                                </button>
                                <button class="btn-secondary" style="justify-content: center; border-color: var(--success); color: var(--success);" onclick="tickets.closeTicket('${ticket.id}')">
                                    <span class="material-symbols-outlined">check_circle</span> Resolve Ticket
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async addComment(id) {
        const input = document.getElementById('tck-comment-input');
        const text = input.value.trim();
        if(!text) return;

        const ticket = window.app.state.tickets.find(t => t.id === id);
        const comments = [...(ticket.comments || [])];
        comments.push({
            user: window.app.state.user?.name || 'Staff User',
            text: text,
            date: new Date().toISOString()
        });

        try {
            await window.fbDb.collection('tickets').doc(id).update({ comments });
            input.value = '';
            // Local update for immediate feedback if needed, but onSnapshot will trigger re-render
            this.viewTicket(id);
        } catch(err) {
            alert("Failed to add comment.");
        }
    },

    toggleTimer(id) {
        if(this.timer.active && this.timer.ticketId === id) {
            this.stopTimer(id);
        } else if(this.timer.active) {
            alert("A timer is already running for another ticket! Stop it first.");
        } else {
            this.startTimer(id);
        }
    },

    startTimer(id) {
        this.timer.active = true;
        this.timer.ticketId = id;
        this.timer.startTime = Date.now();
        
        // Visual indicator in topbar if desired
        this.updateTimerDisplayGlobally();
        
        this.timer.interval = setInterval(() => {
            this.updateTimerDisplayGlobally();
        }, 1000);
        
        this.render(); // Refresh table buttons
    },

    async stopTimer(id) {
        const duration = Date.now() - this.timer.startTime;
        const endTime = new Date().toISOString();
        
        clearInterval(this.timer.interval);
        this.timer.active = false;
        this.timer.ticketId = null;
        this.timer.startTime = null;
        this.timer.interval = null;

        const ticket = window.app.state.tickets.find(t => t.id === id);
        const timeLogs = [...(ticket.timeLogs || [])];
        timeLogs.push({
            sessionStart: new Date(Date.now() - duration).toISOString(),
            sessionEnd: endTime,
            duration: duration,
            billed: false,
            user: window.app.state.user?.name || 'Staff'
        });

        try {
            await window.fbDb.collection('tickets').doc(id).update({ timeLogs });
            this.render();
            this.updateTimerDisplayGlobally(true);
        } catch(err) {
            alert("Error saving time log.");
        }
    },

    updateTimerDisplayGlobally(clear = false) {
        let timerEl = document.getElementById('global-timer-widget');
        
        if(!this.timer.active || clear) {
            if(timerEl) timerEl.remove();
            return;
        }

        if(!timerEl) {
            timerEl = document.createElement('div');
            timerEl.id = 'global-timer-widget';
            timerEl.className = 'glass-card';
            timerEl.style = "position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; display: flex; align-items: center; gap: 15px; border: 1px solid var(--accent); z-index: 999; box-shadow: 0 10px 30px rgba(0,0,0,0.5);";
            document.body.appendChild(timerEl);
            
            // Add pulse animation if not exists
            if(!document.getElementById('pulse-anim-style')) {
                const style = document.createElement('style');
                style.id = 'pulse-anim-style';
                style.textContent = `
                    @keyframes tck-pulse {
                        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 118, 117, 0.7); }
                        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(255, 118, 117, 0); }
                        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 118, 117, 0); }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        const elapsed = Date.now() - this.timer.startTime;
        timerEl.innerHTML = `
            <div style="width: 10px; height: 10px; border-radius: 50%; background: var(--danger); animation: tck-pulse 2s infinite;"></div>
            <div style="font-size: 0.8rem; line-height: 1.2;">
                <div style="color: #a0a0a0; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 1px;">Tracking Timer: ${this.timer.ticketId}</div>
                <div style="font-weight: bold; font-family: monospace; font-size: 1.1rem;">${this.formatDuration(elapsed)}</div>
            </div>
            <button class="btn-icon" style="color: var(--danger); background: rgba(255,118,117,0.1);" onclick="tickets.stopTimer('${this.timer.ticketId}')"><span class="material-symbols-outlined">stop_circle</span></button>
        `;
    },

    async closeTicket(id) {
        if(!confirm("Resolve this ticket and notify the client?")) return;
        
        try {
            await window.fbDb.collection('tickets').doc(id).update({ 
                status: 'Closed',
                closedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            const ticket = window.app.state.tickets.find(t => t.id === id);
            this.sendNotifications(id, 'Resolved', ticket.customer, ticket.phone, ticket.subject);
            
            window.app.closeModal();
            alert("Ticket marked as Resolved.");
        } catch(err) {
            alert("Failed to close ticket.");
        }
    },

    sendNotifications(id, action, client, phone, subject) {
        console.log(`[Notification Engine] Action: ${action} for Ticket ${id}`);
        const msg = action === 'Created' ? 
            `Hi ${client}, Support Ticket ${id} has been opened: "${subject}". A technician will review it shortly. - IT Guy Solutions` :
            `Hi ${client}, Support Ticket ${id} ("${subject}") has been resolved. We are closing this ticket. Thank you! - IT Guy Solutions`;
        
        // Simulated WhatsApp/Email
        alert(`AUTOMATED NOTIFICATIONS (Yes & Yes):\n\n1. WhatsApp Sent to ${phone}:\n"${msg}"\n\n2. Email Sent to Client: [Official Ticket Header] ${action} Notice.`);
    },

    async toggleStatus(id) {
        const ticket = window.app.state.tickets.find(t => t.id === id);
        const newStatus = ticket.status === 'Open' ? 'Pending' : 'Open';
        await window.fbDb.collection('tickets').doc(id).update({ status: newStatus });
        this.viewTicket(id);
    },

    async assignTech(id, tech) {
        try {
            await window.fbDb.collection('tickets').doc(id).update({ 
                assignedTo: tech,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // Update local state and trigger refresh
            const t = window.app.state.tickets.find(x => x.id === id);
            if(t) t.assignedTo = tech;
            this.render();
            alert(`Ticket assigned to ${tech || 'Unassigned'}`);
        } catch(e) {
            alert("Assignment failed.");
        }
    },

    showBillingModal(id) {
        const ticket = window.app.state.tickets.find(t => t.id === id);
        const unbilledLogs = (ticket.timeLogs || []).filter(l => !l.billed);
        const totalUnbilledMs = unbilledLogs.reduce((sum, l) => sum + l.duration, 0);
        const totalHours = (totalUnbilledMs / (1000 * 60 * 60)).toFixed(2);
        
        const defaultRate = 650; // R650 per hour

        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Convert Labor to Invoice</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="background: rgba(var(--accent-rgb), 0.05); padding: 20px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
                        <div style="color: #a0a0a0; font-size: 0.8rem; margin-bottom: 4px;">UNBILLED LABOR</div>
                        <div style="font-size: 2rem; font-weight: 800; color: var(--accent);">${totalHours} Hours</div>
                    </div>

                    <div class="form-group">
                        <label>Hourly Rate (ZAR)</label>
                        <input type="number" id="bill-rate" class="form-control" value="${defaultRate}" step="50">
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 16px; font-weight: bold; font-size: 1.1rem; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <span>Final Total:</span>
                        <span style="color: var(--success);" id="bill-total">R ${(totalHours * defaultRate).toFixed(2)}</span>
                    </div>

                    <div class="modal-footer" style="padding: 0; margin-top: 24px;">
                        <p style="font-size: 0.8rem; color: #a0a0a0; margin-bottom: 12px; text-align: center;">Note: This will add a line item to the Invoice Creator and mark these logs as 'Billed'.</p>
                        <button class="btn-primary" style="width: 100%; justify-content: center; height: 50px;" onclick="tickets.executeBilling('${id}', ${totalHours})">Generate Invoice Entry</button>
                    </div>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
        
        document.getElementById('bill-rate').addEventListener('input', (e) => {
            const rate = parseFloat(e.target.value) || 0;
            document.getElementById('bill-total').innerText = `R ${(totalHours * rate).toFixed(2)}`;
        });
    },

    async executeBilling(id, hours) {
        const rate = parseFloat(document.getElementById('bill-rate').value) || 0;
        const total = hours * rate;
        
        const ticket = window.app.state.tickets.find(t => t.id === id);
        
        // 1. Mark logs as billed in Firestore
        const timeLogs = ticket.timeLogs.map(l => {
            if(!l.billed) return { ...l, billed: true, billedAt: new Date().toISOString(), billAmount: (l.duration / (1000 * 60 * 60)) * rate };
            return l;
        });

        try {
            await window.fbDb.collection('tickets').doc(id).update({ timeLogs });
            
            // 2. Redirect to Invoices with data (Simulated transfer)
            alert(`Labor for ${ticket.id} (${hours} hrs) has been formatted for billing! Redirecting to Invoice module...`);
            
            window.location.hash = '#invoices';
            setTimeout(() => {
                if(window.invoice && typeof window.invoice.addExternalItem === 'function') {
                    window.invoice.addExternalItem(ticket.customer, `Support Labor: ${ticket.subject} (${id})`, hours, rate);
                }
            }, 500);

            window.app.closeModal();
        } catch(err) {
            alert("Billing transition failed.");
        }
    }
};
