window.repair = {
    activeJobId: null,

    init() {
        this.container = document.getElementById('repair-content');
        if(this.container) this.render();
    },
    
    render() {
        if (!this.container) {
            this.container = document.getElementById('repair-content');
            if (!this.container) return;
        }
        let jobs = [...(window.app.state.jobs || [])];
        
        const currentUser = window.authSystem && window.authSystem.currentUser ? window.authSystem.currentUser : null;
        const isTech = currentUser && currentUser.role === 'technician';
        
        if(isTech) {
            const uName = (currentUser.email ? currentUser.email.split('@')[0] : '').toLowerCase();
            jobs = jobs.filter(j => j.technician && j.technician.toLowerCase().includes(uName));
        }
        
        jobs = jobs.sort((a,b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });
        
        let html = `
            <div class="pos-wrapper" style="display: grid; grid-template-columns: 320px 1fr; gap: 24px; height: calc(100vh - 100px);">
                
                <!-- Left: Repair Queue -->
                <div class="glass-card" style="display: flex; flex-direction: column; overflow: hidden; padding: 0;">
                    <div style="padding: 16px; border-bottom: 1px solid #e0e0e0; background: rgba(0,0,0,0.1);">
                        <h3 style="margin: 0; margin-bottom: 12px;">Job Queue</h3>
                        ${!isTech ? `<button class="btn-primary" onclick="app.showNewJobModal()" style="width: 100%; justify-content: center; padding: 10px; font-size: 0.95rem; border-radius: 6px;"><span class="material-symbols-outlined">add</span> New Walk-in Job</button>` : ''}
                    </div>
                    <div style="overflow-y: auto; flex: 1; padding: 12px;">
                        ${this.renderQueueList(jobs)}
                    </div>
                </div>

                <!-- Right: Active Console -->
                <div class="glass-card" style="display: flex; flex-direction: column; padding: 0;">
                    ${this.renderActiveConsole()}
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.scrollToBottom();
    },

    renderQueueList(jobs) {
        if(jobs.length === 0) return `<div style="text-align: center; color: #a0a0a0; padding: 20px;">No jobs in queue.</div>`;
        
        return jobs.map(job => {
            const isActive = job.id === this.activeJobId;
            let dotColor = "var(--text-secondary)";
            if(job.status === 'Booked') dotColor = "var(--primary)";
            if(job.status === 'In Diagnosis') dotColor = "var(--warning)";
            if(job.status === 'In Repair') dotColor = "var(--accent)";
            if(job.status === 'Ready For Collection' || job.status === 'Completed') dotColor = "var(--success)";

            return `
                <div style="padding: 12px; border: 1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}; background: ${isActive ? 'rgba(108, 92, 231, 0.1)' : 'rgba(255,255,255,0.02)'}; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: 0.2s;" onclick="repair.openJob('${job.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-weight: bold; font-size: 0.9rem;">${job.id}</span>
                        <div style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor};"></div>
                    </div>
                    <div style="font-size: 0.95rem; color: #ffffff;">${job.device}</div>
                    <div style="font-size: 0.8rem; color: #a0a0a0; margin-top: 4px;">${job.customer}</div>
                </div>
            `;
        }).join('');
    },

    openJob(id) {
        this.activeJobId = id;
        this.render();
    },

    renderActiveConsole() {
        if(!this.activeJobId) {
            return `
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #a0a0a0; opacity: 0.5;">
                    <span class="material-symbols-outlined" style="font-size: 4rem; margin-bottom: 16px;">handyman</span>
                    <h2>Select a Job Card</h2>
                    <p>Click a job from the queue to start troubleshooting.</p>
                </div>
            `;
        }

        const job = window.app.state.jobs.find(j => j.id === this.activeJobId);
        if(!job) return `<div style="padding: 24px;">Job not found.</div>`;

        return `
            <!-- Console Header -->
            <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0; background: rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2 style="margin: 0; color: #a29bfe; display: flex; align-items: center; gap: 8px;">
                        ${job.id} 
                        <span class="badge" style="background: rgba(253,203,110,0.2); color: #fdcb6e; border: 1px solid var(--warning); font-size: 0.75rem;">${job.status}</span>
                    </h2>
                    <div style="color: #a0a0a0; font-size: 0.9rem; margin-top: 4px;">${job.customer} | ${job.device}</div>
                </div>
                <div style="display: flex; gap: 12px; align-items: center;">
                    ${(window.authSystem?.currentUser?.role === 'admin' || window.authSystem?.currentUser?.role === 'frontdesk') ? `
                     <select id="repair-tech-dd" class="form-control" style="width: 150px; appearance: auto;" onchange="repair.changeTechnician()">
                         <option value="">Unassigned</option>
                         <option value="Admin User" ${job.technician==='Admin User'?'selected':''}>Admin</option>
                         <option value="Tech John" ${job.technician==='Tech John'?'selected':''}>John</option>
                         <option value="Tech Sarah" ${job.technician==='Tech Sarah'?'selected':''}>Sarah</option>
                     </select>
                     ` : ''}
                     <select id="repair-status-dd" class="form-control" style="width: 200px; appearance: auto;" onchange="repair.changeStatus()">
                         <option value="Booked" ${job.status==='Booked'?'selected':''}>Booked</option>
                         <option value="In Diagnosis" ${job.status==='In Diagnosis'?'selected':''}>In Diagnosis</option>
                         <option value="Waiting on Parts" ${job.status==='Waiting on Parts'?'selected':''}>Waiting on Parts</option>
                         <option value="In Repair" ${job.status==='In Repair'?'selected':''}>In Repair</option>
                         <option value="Ready For Collection" ${job.status==='Ready For Collection'?'selected':''}>Ready For Collection</option>
                         <option value="Completed" ${job.status==='Completed'?'selected':''}>Completed</option>
                     </select>
                </div>
            </div>

            <!-- Notes Timeline -->
            <div id="repair-timeline" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px;">
                <div style="text-align: center; color: #a0a0a0; font-size: 0.8rem; margin-bottom: 8px;">Job Created on ${job.date}</div>
                ${this.renderNotes(job.notes)}
                
                ${this.renderPartsUsed(job.items)}
            </div>

            <!-- Add Note / Part Bar -->
                <div style="display: flex; gap: 12px;">
                    <button class="btn-secondary" onclick="repair.showAddPartModal()" style="white-space: nowrap;"><span class="material-symbols-outlined">memory</span> Attach Part/Labour</button>
                    <div style="flex: 1; display: flex; background: rgba(255,255,255,0.05); border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
                         <input type="text" id="repair-note-input" placeholder="Type a troubleshooting note (visibile to client)..." style="flex: 1; background: transparent; border: none; color: #fff; padding: 12px; outline: none;" onkeypress="if(event.key === 'Enter') repair.addNote()">
                         <button style="background: var(--accent); border: none; color: #fff; padding: 0 16px; cursor: pointer; transition: 0.2s;" onclick="repair.addNote()">
                             <span class="material-symbols-outlined">send</span>
                         </button>
                    </div>
                </div>
                ${job.status !== 'Completed' ? `
                <button class="btn-primary" style="width: 100%; justify-content: center; background: var(--success); margin-top: 8px; height: 45px;" onclick="repair.showCompletionModal('${job.id}')">
                    <span class="material-symbols-outlined">verified_user</span> Mark Job as Fully Completed & Signed
                </button>
                ` : `
                <button class="btn-secondary" style="width: 100%; justify-content: center; height: 45px;" onclick="repair.viewReport('${job.id}')">
                    <span class="material-symbols-outlined">assignment</span> View Completion Evidence
                </button>
                `}
            </div>
        `;
    },

    renderNotes(notes) {
        if(!notes || notes.length === 0) return '';
        return notes.map(n => `
            <div style="align-self: flex-start; max-width: 85%;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-weight: bold; font-size: 0.8rem; color: #ffffff;">${n.user}</span>
                    <span style="font-size: 0.75rem; color: #a0a0a0;">${n.time}</span>
                </div>
                <div style="background: rgba(108, 92, 231, 0.15); border: 1px solid rgba(108, 92, 231, 0.3); padding: 12px 16px; border-radius: 12px; border-top-left-radius: 4px; color: #ffffff; line-height: 1.4;">
                    ${n.text}
                </div>
            </div>
        `).join('');
    },

    renderPartsUsed(items) {
        if(!items || items.length === 0) return '';
        let total = items.reduce((sum, item) => sum + (item.unit * item.qty), 0);
        
        const isTech = window.authSystem && window.authSystem.currentUser && window.authSystem.currentUser.role === 'technician';
        
        const rows = items.map(i => `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 8px 0; font-size: 0.9rem;">
                <span style="color: #a0a0a0;">${i.qty}x ${i.desc}</span>
                <span style="font-weight: bold;">${isTech ? '-' : 'R ' + (i.unit * i.qty).toFixed(2)}</span>
            </div>
        `).join('');

        return `
            <div style="align-self: flex-start; width: 100%; margin-top: 16px;">
                <div style="background: rgba(0,0,0,0.2); border: 1px solid #e0e0e0; padding: 16px; border-radius: 12px;">
                    <div style="font-weight: bold; margin-bottom: 12px; color: #ffffff; display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;">receipt</span> Parts & Labour Attached
                    </div>
                    ${rows}
                    ${!isTech ? `
                    <div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-weight: bold; color: #a29bfe;">
                        <span>Running Total:</span>
                        <span>R ${total.toFixed(2)}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    },

    scrollToBottom() {
        const t = document.getElementById('repair-timeline');
        if(t) t.scrollTop = t.scrollHeight;
    },

    async addNote() {
        const inEl = document.getElementById('repair-note-input');
        const txt = inEl.value.trim();
        if(!txt || !this.activeJobId) return;

        const job = window.app.state.jobs.find(j => j.id === this.activeJobId);
        if(!job) return;

        if(!job.notes) job.notes = [];
        
        let userLabel = "Shop Tech";
        if(window.authSystem && window.authSystem.currentUser) {
            userLabel = window.authSystem.currentUser.email ? window.authSystem.currentUser.email.split('@')[0] : 'Shop Tech';
        }

        job.notes.push({
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: txt,
            user: userLabel
        });

        try {
            await window.fbDb.collection('jobs').doc(this.activeJobId).update({
                notes: job.notes,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.app.logActivity('Job Note Added', `Added a note to ${this.activeJobId}: "${txt}"`);
            inEl.value = '';
        } catch(e) {
            console.error(e);
            alert("Database error: Could not save note.");
        }
    },

    async changeStatus() {
        const dd = document.getElementById('repair-status-dd');
        const newStatus = dd.value;
        if(!newStatus || !this.activeJobId) return;

        const job = window.app.state.jobs.find(j => j.id === this.activeJobId);
        if(job) {
            job.status = newStatus;
            
            // Auto note
            if(!job.notes) job.notes = [];
            job.notes.push({
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                text: `System: Status changed to '${newStatus}'`,
                user: 'System'
            });

            try {
                await window.fbDb.collection('jobs').doc(this.activeJobId).update({
                    status: newStatus,
                    notes: job.notes,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                window.app.logActivity('Job Status Change', `${job.id} status changed to "${newStatus}"`);
            } catch(e) {
                console.error(e);
                alert("Database error: Could not update status.");
            }
        }
    },

    async changeTechnician() {
        const dd = document.getElementById('repair-tech-dd');
        const newTech = dd.value;
        if(!this.activeJobId) return;

        const job = window.app.state.jobs.find(j => j.id === this.activeJobId);
        if(job) {
            job.technician = newTech;
            
            // Auto note
            if(!job.notes) job.notes = [];
            job.notes.push({
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                text: `System: Assigned technician changed to '${newTech || 'Unassigned'}'`,
                user: 'System'
            });

            try {
                await window.fbDb.collection('jobs').doc(this.activeJobId).update({
                    technician: newTech,
                    notes: job.notes,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                window.app.logActivity('Job Technician Assigned', `${job.id} assigned to ${newTech || 'Unassigned'}`);
            } catch(e) {
                console.error(e);
                alert("Database error: Could not update assigned technician.");
            }
        }
    },

    showAddPartModal() {
        if(!this.activeJobId) return;

        const inv = window.app.state.inventory || [];
        const invOpts = inv.filter(i => i.qty > 0).map((i, idx) => `<option value="${idx}">${i.name} (R ${i.sell})</option>`).join('');

        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Attach Part</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="repair.attachPartAction(event)">
                        <div class="form-group">
                            <label>Select from Inventory</label>
                            <select id="repair-attach-sel" class="form-control" style="appearance: auto;" required>
                                <option value="" disabled selected>-- Select a Part --</option>
                                ${invOpts}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Quantity</label>
                            <input type="number" id="repair-attach-qty" class="form-control" value="1" min="1" required>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Attach Part</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async attachPartAction(e) {
        e.preventDefault();
        const selIdx = document.getElementById('repair-attach-sel').value;
        const qty = parseInt(document.getElementById('repair-attach-qty').value);
        if(selIdx === "" || !qty || !this.activeJobId) return;

        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Processing...'; btn.disabled = true; }

        const job = window.app.state.jobs.find(j => j.id === this.activeJobId);
        const invItem = window.app.state.inventory[selIdx];

        if(!invItem || qty > invItem.qty) {
            alert(`Only ${invItem?.qty || 0} left in stock!`);
            if(btn) { btn.innerHTML = 'Attach Part'; btn.disabled = false; }
            return;
        }

        // Parse unit price
        const price = parseFloat(invItem.sell.replace(/[^0-9.-]+/g,"")) || 0;
        const currentUser = window.authSystem?.currentUser;
        const isTech = currentUser?.role === 'technician';
        const uEmail = currentUser?.email?.toLowerCase();

        // If tech, check if they have it in 'My Stock'
        let techStockItem = null;
        if (isTech) {
            techStockItem = (window.app.state.techStock || []).find(s => s.techEmail.toLowerCase() === uEmail && s.sku === invItem.sku);
            if (!techStockItem || techStockItem.qty < qty) {
                alert(`Insufficient Stock in 'My Stock'! You have ${techStockItem?.qty || 0} but tried to use ${qty}. Please request more from Admin.`);
                if(btn) { btn.innerHTML = 'Attach Part'; btn.disabled = false; }
                return;
            }
        }
        if(!job.items) job.items = [];
        job.items.push({
            type: 'Hardware',
            desc: invItem.name,
            unit: price,
            qty: qty
        });

        // Add auto note
        if(!job.notes) job.notes = [];
        job.notes.push({
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: `System: Attached ${qty}x ${invItem.name} to Job Card.`,
            user: 'System'
        });

        try {
            const batch = window.fbDb.batch();
            
            // Update Job
            const jobRef = window.fbDb.collection('jobs').doc(this.activeJobId);
            batch.update(jobRef, {
                items: job.items,
                notes: job.notes,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 2. Update Inventory (Main Warehouse)
            if(invItem.id) {
                const invRef = window.fbDb.collection('inventory').doc(invItem.id);
                batch.update(invRef, {
                    qty: firebase.firestore.FieldValue.increment(-qty)
                });
            }

            // 3. Update Tech Stock (Personal Stock)
            if (isTech && techStockItem) {
                const tsRef = window.fbDb.collection('techStock').doc(techStockItem.id);
                batch.update(tsRef, {
                    qty: firebase.firestore.FieldValue.increment(-qty)
                });
            }

            await batch.commit();
            window.app.logActivity('Part Attached', `Attached ${qty}x ${invItem.name} to ${this.activeJobId}`);
            window.app.closeModal();
            // Snapshot listener re-renders active views
        } catch(e) {
            console.error(e);
            alert("Database Error: Failed to attach part");
            if(btn) { btn.innerHTML = 'Attach Part'; btn.disabled = false; }
        }
    },

    showCompletionModal(jobId) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>Complete Workshop Job</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="repair.submitCompletion(event, '${jobId}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Proof of Repair (Photo 1)</label>
                                <input type="file" id="comp-photo-before" class="form-control" accept="image/*" capture="environment" required>
                            </div>
                            <div class="form-group">
                                <label>Proof of Repair (Photo 2)</label>
                                <input type="file" id="comp-photo-after" class="form-control" accept="image/*" capture="environment">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Repair Summary / Notes</label>
                            <textarea id="comp-report" class="form-control" rows="3" placeholder="Explain what was fixed..." required></textarea>
                        </div>
                        <div class="form-group">
                            <label>Customer Sign-off</label>
                            <p style="font-size: 0.8rem; color: #a0a0a0; margin-bottom: 8px;">
                                <i>I confirm receipt of my device and that the repair is satisfactory.</i>
                            </p>
                            <canvas id="signature-canvas" class="signature-pad" style="width: 100%; border: 1px dashed var(--border); border-radius: 8px; cursor: crosshair;"></canvas>
                            <button type="button" class="btn-secondary" style="margin-top: 8px;" onclick="app.clearSignature()">Clear Signature</button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="background: var(--success);"><span class="material-symbols-outlined" style="margin-right: 4px;">check_circle</span> Finalize & Archive</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
        setTimeout(() => app.initSignaturePad(), 100);
    },

    async submitCompletion(e, jobId) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = 'Archiving...'; btn.disabled = true; }

        try {
            const photo1 = document.getElementById('comp-photo-before').files[0];
            const photo2 = document.getElementById('comp-photo-after').files[0];
            const report = document.getElementById('comp-report').value;
            const sigCanvas = document.getElementById('signature-canvas');
            const signature = sigCanvas ? sigCanvas.toDataURL() : null;

            // Reuse field compression if available
            const compress = window.field?.compressImage || (async (f) => null);
            const [p1B64, p2B64] = await Promise.all([compress(photo1), compress(photo2)]);

            const completionData = {
                completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                photoBefore: p1B64,
                photoAfter: p2B64,
                report: report,
                signature: signature
            };

            await window.fbDb.collection('jobs').doc(jobId).update({
                status: 'Completed',
                completionData: completionData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            app.closeModal();
            alert("Workshop Job successfully finalized!");
        } catch(err) {
            console.error(err);
            alert("Error saving completion report.");
            if(btn) { btn.innerHTML = 'Finalize & Archive'; btn.disabled = false; }
        }
    },

    viewReport(jobId) {
        const job = window.app.state.jobs.find(j => j.id === jobId);
        if(!job || !job.completionData) return alert("No proof of completion found.");
        
        const cd = job.completionData;
        app.showModal(`
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Completion Proof: ${job.id}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                        ${cd.photoBefore ? `<img src="${cd.photoBefore}" style="width: 100%; border-radius: 8px;">` : ''}
                        ${cd.photoAfter ? `<img src="${cd.photoAfter}" style="width: 100%; border-radius: 8px;">` : ''}
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 8px 0; color: var(--accent);">Technician Summary</h4>
                        <p style="margin: 0;">${cd.report}</p>
                    </div>
                    <div style="background: white; padding: 12px; border-radius: 8px; text-align: center;">
                        <h4 style="margin: 0 0 8px 0; color: #333;">Client Sign-off</h4>
                        ${cd.signature ? `<img src="${cd.signature}" style="max-height: 80px;">` : 'No signature captured'}
                    </div>
                </div>
            </div>
        `);
    }
};

// Initialized by app.js
