window.field = {
    init() {
        this.container = document.getElementById('field-content');
        if(this.container) this.render();
    },
    
    render() {
        if (!this.container) {
            this.container = document.getElementById('field-content');
            if (!this.container) return;
        }
        let jobs = window.app.state.fieldJobs || [];
        
        const currentUser = window.authSystem && window.authSystem.currentUser ? window.authSystem.currentUser : null;
        const isTech = currentUser && currentUser.role === 'technician';
        
        if(isTech) {
            const uName = (currentUser.email ? currentUser.email.split('@')[0] : '').toLowerCase();
            jobs = jobs.filter(j => j.technician && j.technician.toLowerCase().includes(uName));
        }
        
        let html = `
            <div class="section-header">
                <div>
                    <h1>Field Services</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage your on-site call-outs and dispatch routing.</p>
                </div>
                ${!isTech ? `<button class="btn-primary" onclick="app.showScheduleCalloutModal()"><span class="material-symbols-outlined">add</span> Schedule Call-out</button>` : ''}
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; margin-top: 16px;">
        `;

        if(jobs.length === 0) {
            html += `<div style="grid-column: 1/-1; text-align: center; color: #a0a0a0; padding: 40px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">You currently have no field call-outs scheduled for today.</div>`;
        }

        html += jobs.map(job => this.renderFieldCard(job)).join('');

        html += `</div>`;
        this.container.innerHTML = html;
    },

    renderFieldCard(job) {
        let statusBadge = 'pending'; // Scheduled
        if(job.status.toLowerCase() === 'on-site') statusBadge = 'active';
        if(job.status.toLowerCase() === 'completed') statusBadge = 'success';

        return `
            <div class="glass-card" style="padding: 20px; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <div style="color: #a0a0a0; font-size: 0.8rem; margin-bottom: 4px;">${job.id}</div>
                        <h3 style="margin: 0; color: #ffffff;">${job.customer}</h3>
                    </div>
                    <span class="badge ${statusBadge}">${job.status}</span>
                </div>
                
                <div style="display: flex; gap: 8px; align-items: flex-start; color: #a0a0a0; font-size: 0.9rem; margin-bottom: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 1.1rem; color: #a29bfe;">location_on</span>
                    <span style="line-height: 1.4;">${job.address || 'Address missing'}</span>
                </div>

                <div style="border-top: 1px solid #e0e0e0; margin: 16px 0;"></div>

                <!-- Parts List -->
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.8rem; color: #a0a0a0; font-weight: bold;">PARTS / HARDWARE</span>
                        <button class="btn-icon" style="color: var(--accent);" onclick="field.showAddPartModal('${job.id}')"><span class="material-symbols-outlined" style="font-size: 1.2rem;">add_circle</span></button>
                    </div>
                    <div style="font-size: 0.85rem; color: #fff;">
                        ${(job.items || []).length === 0 ? '<div style="color: #666; font-style: italic;">No parts recorded.</div>' : 
                          job.items.map(i => `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>${i.qty}x ${i.desc}</span> <span style="color: #a0a0a0;">R ${(i.unit * i.qty).toFixed(2)}</span></div>`).join('')}
                    </div>
                </div>

                <div style="border-top: 1px solid #e0e0e0; margin: 16px 0;"></div>

                <div style="display: flex; gap: 12px; margin-bottom: 24px;">
                    <button class="btn-secondary" style="flex: 1; justify-content: center;" onclick="field.navTo('${job.address}')">
                        <span class="material-symbols-outlined">directions_car</span> Navigate
                    </button>
                    ${job.phone ? `
                    <button class="btn-secondary" style="flex: 1; justify-content: center;" onclick="window.location.href='tel:${job.phone}'">
                        <span class="material-symbols-outlined">call</span> Call Client
                    </button>` : ''}
                </div>

                <div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-secondary" style="flex: 1; justify-content: center; background: rgba(37, 211, 102, 0.1); color: #25D366; border-color: #25D366;" onclick="field.sendETA('${job.id}')">
                            <span class="material-symbols-outlined" style="font-size: 1.1rem; margin-right: 4px;">chat</span> Send ETA
                        </button>
                        ${job.status === 'On-site' ? `
                            <button class="btn-primary" style="flex: 1; justify-content: center; background: var(--warning);" onclick="field.checkOut('${job.id}')">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem; margin-right: 4px;">logout</span> Check-out
                            </button>
                        ` : job.status !== 'Completed' ? `
                            <button class="btn-primary" style="flex: 1; justify-content: center; background: var(--accent);" onclick="field.checkIn('${job.id}')">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem; margin-right: 4px;">login</span> Check-in (GPS)
                            </button>
                        ` : ''}
                    </div>
                    
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <button class="btn-secondary" style="flex: 1; justify-content: center;" onclick="field.addNote('${job.id}')">Update Log</button>
                        ${job.status.toLowerCase() !== 'completed' ? `
                            <button class="btn-primary" style="flex: 1; justify-content: center; background: var(--success);" onclick="field.changeStatus('${job.id}')">Complete Job</button>
                        ` : `
                            <button class="btn-primary" style="flex: 1; justify-content: center; background: var(--success);" onclick="field.viewReport('${job.id}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; margin-right: 4px;">assignment</span> Report</button>
                        `}
                    </div>
                </div>
            </div>
        `;
    },

    navTo(address) {
        if(!address || address === 'undefined') {
            alert("No address provided for this client.");
            return;
        }
        // Redirect to google maps with pin
        const url = 'https://maps.google.com/?q=' + encodeURIComponent(address);
        window.open(url, '_blank');
    },

    changeStatus(id) {
        const job = window.app.state.fieldJobs.find(j => j.id === id);
        if(!job) return;

        let nextStatuses = ['Scheduled', 'On-Site', 'Completed'];
        const currentIdx = nextStatuses.indexOf(job.status);
        const nextTarget = nextStatuses[(currentIdx + 1) % nextStatuses.length];
        
        if (nextTarget === 'Completed') {
            this.showCompletionModal(id);
            return;
        }
        
        if(confirm(`Mark job ${job.id} as '${nextTarget}'?`)) {
            job.status = nextTarget;
            window.fbDb.collection('fieldJobs').doc(id).update({
                status: nextTarget,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    },

    addNote(id) {
        const txt = prompt("Enter a brief update for this call-out:");
        if(txt) {
             const job = window.app.state.fieldJobs.find(j => j.id === id);
             if(job) {
                 if(!job.notes) job.notes = [];
                 
                 let userLabel = "Tech";
                 if(window.authSystem && window.authSystem.currentUser) {
                     userLabel = window.authSystem.currentUser.email ? window.authSystem.currentUser.email.split('@')[0] : 'Tech';
                 }

                 job.notes.push({
                     time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                     text: txt,
                     user: userLabel
                 });
                 this.render();
             }
        }
    },

    showCompletionModal(jobId) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>Complete Field Service</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="field.submitCompletion(event, '${jobId}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Before Job Photo</label>
                                <input type="file" id="comp-photo-before" class="form-control" accept="image/*" capture="environment" required>
                            </div>
                            <div class="form-group">
                                <label>After Job Photo</label>
                                <input type="file" id="comp-photo-after" class="form-control" accept="image/*" capture="environment" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Service Report</label>
                            <textarea id="comp-report" class="form-control" rows="3" placeholder="Detail the work carried out..." required></textarea>
                        </div>
                        <div class="form-group">
                            <label>Suggestions / Follow-ups</label>
                            <textarea id="comp-suggestions" class="form-control" rows="2" placeholder="Recommendations for the client..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>Client Sign-off</label>
                            <p style="font-size: 0.8rem; color: #a0a0a0; margin-bottom: 8px;">
                                <i>I confirm that the work described above has been completed to my satisfaction.</i>
                            </p>
                            <canvas id="signature-canvas" class="signature-pad" style="width: 100%; border: 1px dashed var(--border); border-radius: 8px; cursor: crosshair;"></canvas>
                            <button type="button" class="btn-secondary" style="margin-top: 8px;" onclick="app.clearSignature()">Clear Signature</button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="background: var(--success);"><span class="material-symbols-outlined" style="margin-right: 4px;">check_circle</span> Finalize & Complete</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
        setTimeout(() => app.initSignaturePad(), 100);
    },

    async compressImage(file) {
        return new Promise((resolve) => {
            if(!file) return resolve(null);
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    } else {
                        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
            };
        });
    },

    async submitCompletion(e, jobId) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = 'Processing...'; btn.disabled = true; }

        try {
            const beforeFile = document.getElementById('comp-photo-before').files[0];
            const afterFile = document.getElementById('comp-photo-after').files[0];
            const report = document.getElementById('comp-report').value;
            const suggestions = document.getElementById('comp-suggestions').value;
            const sigCanvas = document.getElementById('signature-canvas');
            const signature = sigCanvas ? sigCanvas.toDataURL() : null;

            const [beforeB64, afterB64] = await Promise.all([
                this.compressImage(beforeFile),
                this.compressImage(afterFile)
            ]);

            const completionData = {
                completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                photoBefore: beforeB64,
                photoAfter: afterB64,
                report: report,
                suggestions: suggestions,
                signature: signature
            };

            const job = window.app.state.fieldJobs.find(j => j.id === jobId);
            if(job) {
                if(!job.notes) job.notes = [];
                job.notes.push({
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    text: 'System: Job marked as Completed with client sign-off.',
                    user: 'System'
                });
            }

            await window.fbDb.collection('fieldJobs').doc(jobId).update({
                status: 'Completed',
                completionData: completionData,
                notes: job ? job.notes : [],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            app.closeModal();
            alert("Job successfully completed and signed off!");
        } catch(err) {
            console.error(err);
            alert("Error saving completion report. Please try again.");
            if(btn) { btn.innerHTML = 'Finalize & Complete'; btn.disabled = false; }
        }
    },
    
    viewReport(jobId) {
        const job = window.app.state.fieldJobs.find(j => j.id === jobId);
        if(!job || !job.completionData) {
            alert("No completion report found for this job.");
            return;
        }
        
        const cd = job.completionData;
        const modalHTML = `
            <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>Completion Report: ${job.id}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div>
                            <h3 style="color: #a0a0a0; font-size: 0.9rem; margin-bottom: 8px;">Before Work</h3>
                            ${cd.photoBefore ? `<img src="${cd.photoBefore}" style="width: 100%; border-radius: 8px; border: 1px solid var(--border);">` : '<p>No image</p>'}
                        </div>
                        <div>
                            <h3 style="color: #a0a0a0; font-size: 0.9rem; margin-bottom: 8px;">After Work</h3>
                            ${cd.photoAfter ? `<img src="${cd.photoAfter}" style="width: 100%; border-radius: 8px; border: 1px solid var(--border);">` : '<p>No image</p>'}
                        </div>
                    </div>
                    <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 16px;">
                        <h3 style="color: var(--accent); margin-bottom: 8px;">Service Report</h3>
                        <p style="white-space: pre-wrap; line-height: 1.5;">${cd.report}</p>
                    </div>
                    ${cd.suggestions ? `
                    <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 16px;">
                        <h3 style="color: var(--warning); margin-bottom: 8px;">Recommendations / Follow-up</h3>
                        <p style="white-space: pre-wrap; line-height: 1.5;">${cd.suggestions}</p>
                    </div>` : ''}
                    <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
                        <h3 style="color: #a0a0a0; margin-bottom: 8px;">Client Sign-off</h3>
                        ${cd.signature ? `<img src="${cd.signature}" style="max-height: 100px; background: white; border-radius: 4px; padding: 4px;">` : '<p>No signature captured</p>'}
                    </div>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    showAddPartModal(jobId) {
        const currentUser = window.authSystem?.currentUser;
        const isTech = currentUser?.role === 'technician';
        const uEmail = currentUser?.email?.toLowerCase();
        
        let stockToPickFrom = [];
        if (isTech) {
            stockToPickFrom = (window.app.state.techStock || []).filter(s => s.techEmail.toLowerCase() === uEmail);
        } else {
            stockToPickFrom = window.app.state.inventory || [];
        }

        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Record Part Usage</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="field.handleAttachPart(event, '${jobId}')">
                        <div class="form-group">
                            <label>Product / Part Used</label>
                            <select id="part-id" class="form-control" style="appearance: auto;" required>
                                <option value="" disabled selected>-- Select from ${isTech ? 'My Stock' : 'Inventory'} --</option>
                                ${stockToPickFrom.map(i => `<option value="${isTech ? i.sku : i.id}">${i.name} (Qty: ${i.qty})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Quantity Used</label>
                            <input type="number" id="part-qty" class="form-control" value="1" min="1" required>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Deduct & Attach</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleAttachPart(e, jobId) {
        e.preventDefault();
        const partId = document.getElementById('part-id').value;
        const qty = parseInt(document.getElementById('part-qty').value);
        const currentUser = window.authSystem?.currentUser;
        const isTech = currentUser?.role === 'technician';
        const uEmail = currentUser?.email?.toLowerCase();

        const job = window.app.state.fieldJobs.find(j => j.id === jobId);
        if(!job) return;

        let invItem = null;
        let tsItem = null;

        if (isTech) {
            tsItem = (window.app.state.techStock || []).find(s => s.techEmail.toLowerCase() === uEmail && s.sku === partId);
            invItem = window.app.state.inventory.find(i => i.sku === partId);
        } else {
            invItem = window.app.state.inventory.find(i => i.id === partId);
        }

        if(!invItem || (isTech && (!tsItem || tsItem.qty < qty))) {
            alert("Insufficient Stock!");
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.innerHTML = "Processing...";
        btn.disabled = true;

        try {
            const batch = window.fbDb.batch();
            const price = parseFloat(invItem.sell.replace(/[^0-9.-]+/g,"")) || 0;

            if(!job.items) job.items = [];
            job.items.push({
                desc: invItem.name,
                unit: price,
                qty: qty
            });

            // 1. Update Job
            const jobRef = window.fbDb.collection('fieldJobs').doc(jobId);
            batch.update(jobRef, { items: job.items });

            // 2. Update Global Inventory
            const invRef = window.fbDb.collection('inventory').doc(invItem.id);
            batch.update(invRef, { qty: firebase.firestore.FieldValue.increment(-qty) });

            // 3. Update Tech Stock
            if (isTech && tsItem) {
                const tsRef = window.fbDb.collection('techStock').doc(tsItem.id);
                batch.update(tsRef, { qty: firebase.firestore.FieldValue.increment(-qty) });
            }

            await batch.commit();
            window.app.closeModal();
            alert("Part successfully deducted from stock and attached to job.");
        } catch(err) {
            console.error(err);
            alert("Failed to record part usage.");
            btn.innerHTML = "Deduct & Attach";
            btn.disabled = false;
        }
    },

    sendETA(jobId) {
        const job = window.app.state.fieldJobs.find(j => j.id === jobId);
        if(!job || !job.phone) return alert("No phone number for client.");
        
        const techName = window.authSystem?.currentUser?.email?.split('@')[0] || "Your Technician";
        const message = `Hi ${job.customer}, this is ${techName} from IT Guy Solutions. I'm on my way to your premises for the scheduled support/repair. See you shortly!`;
        
        const url = `https://wa.me/${job.phone.replace(/\s+/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },

    async checkIn(jobId) {
        if(!navigator.geolocation) return alert("GPS not supported on this device.");

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            
            try {
                const note = {
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    text: `SYSTEM: Technician checked-in via GPS. Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                    user: 'System'
                };

                await window.fbDb.collection('fieldJobs').doc(jobId).update({
                    status: 'On-site',
                    checkInTime: new Date().toISOString(),
                    checkInCoords: { lat, lng },
                    notes: firebase.firestore.FieldValue.arrayUnion(note),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert("Checked in! Location and time recorded.");
            } catch(e) {
                alert("Check-in failed.");
            }
        }, (err) => {
            alert("Location access denied. Please enable GPS.");
        });
    },

    async checkOut(jobId) {
        try {
            const note = {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                text: `SYSTEM: Technician checked-out. Support session ended.`,
                user: 'System'
            };

            await window.fbDb.collection('fieldJobs').doc(jobId).update({
                checkOutTime: new Date().toISOString(),
                notes: firebase.firestore.FieldValue.arrayUnion(note),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Trigger completion modal immediately
            this.showCompletionModal(jobId);
        } catch(e) {
            alert("Check-out failed.");
        }
    }
};

// Initialized by app.js
