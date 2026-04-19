/**
 * Public Job Tracking Portal Logic
 */
window.trackPortal = {
    init() {
        const form = document.getElementById('track-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleTrackSubmit(e));
        }

        // Auto-fill from URL param if present (?id=JOB-123)
        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get('id');
        if (urlId) {
            const input = document.getElementById('track-id');
            if (input) {
                input.value = urlId;
                this.performLookup(urlId);
            }
        }
    },

    async handleTrackSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('track-id').value.trim().toUpperCase();
        if(!id) return;
        this.performLookup(id);
    },

    async performLookup(jobId) {
        const resEl = document.getElementById('track-job-result');
        const btn = document.querySelector('#track-form button');
        
        btn.innerHTML = '<span class="material-symbols-outlined rotating">sync</span> Searching...';
        btn.disabled = true;
        resEl.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div class="loader-dots"><span></span><span></span><span></span></div>
            </div>
        `;

        try {
            let foundJob = null;
            let jobType = '';

            // 1. Check workshop jobs
            const wDoc = await window.fbDb.collection('jobs').doc(jobId).get();
            if(wDoc.exists) {
                foundJob = wDoc.data();
                jobType = 'Workshop Repair';
            } else {
                // 2. Check field jobs
                const fDoc = await window.fbDb.collection('fieldJobs').doc(jobId).get();
                if(fDoc.exists) {
                    foundJob = fDoc.data();
                    jobType = 'Field Service';
                }
            }

            if(foundJob) {
                this.renderResult(foundJob, jobType);
            } else {
                resEl.innerHTML = `
                    <div class="status-update" style="background: rgba(255, 118, 117, 0.1); color: #ff7675; padding: 20px; border-radius: 8px; border: 1px solid rgba(255, 118, 117, 0.2); text-align: center; margin-top: 20px;">
                        <span class="material-symbols-outlined" style="font-size: 2.5rem; margin-bottom: 8px;">sentiment_very_dissatisfied</span><br>
                        <strong>Reference Not Found</strong><br>
                        <p style="font-size: 0.9rem; margin-top: 8px; opacity: 0.8;">We couldn't find a job matching <strong>${jobId}</strong>. Please check your reference number or contact support.</p>
                    </div>
                `;
            }
        } catch (err) {
            console.error("Lookup Error:", err);
            resEl.innerHTML = `<div style="color: #ff7675; text-align: center; margin-top: 20px;">An error occurred. Please check your internet connection.</div>`;
        }

        btn.innerHTML = '<span class="material-symbols-outlined">analytics</span> Check Status';
        btn.disabled = false;
    },

    renderResult(job, type) {
        const resEl = document.getElementById('track-job-result');
        
        let statusClass = 'pending';
        let statusIcon = 'schedule';
        const status = (job.status || 'Scheduled').toLowerCase();

        if (status.includes('completed') || status.includes('ready') || status.includes('collected')) {
            statusClass = 'success';
            statusIcon = 'check_circle';
        } else if (status.includes('repair') || status.includes('site') || status.includes('progress')) {
            statusClass = 'active';
            statusIcon = 'build';
        } else if (status.includes('canceled') || status.includes('rejected')) {
            statusClass = 'danger';
            statusIcon = 'cancel';
        }

        resEl.innerHTML = `
            <div class="status-update glass-card" style="margin-top: 20px; padding: 20px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                    <div>
                        <div style="color: var(--primary); font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">${type}</div>
                        <h3 style="margin: 0; font-size: 1.4rem;">${job.id}</h3>
                    </div>
                    <span class="badge ${statusClass}" style="padding: 6px 12px; font-size: 0.9rem; display: flex; align-items: center; gap: 4px;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">${statusIcon}</span>
                        ${job.status}
                    </span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 16px;">
                    <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px;">
                        <div style="color: #a0a0a0; font-size: 0.75rem; text-transform: uppercase;">Item / Description</div>
                        <div style="font-weight: 500;">${job.device || job.description || 'N/A'}</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px;">
                        <div style="color: #a0a0a0; font-size: 0.75rem; text-transform: uppercase;">Technician</div>
                        <div style="font-weight: 500;">${job.technician || 'Awaiting Assignment'}</div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #666; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
                    <span>Last Update: ${job.updatedAt ? new Date(job.updatedAt.seconds * 1000).toLocaleDateString() : (job.date || 'N/A')}</span>
                    <button class="btn-icon" onclick="window.print()" title="Print Summary"><span class="material-symbols-outlined">print</span></button>
                </div>
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.trackPortal.init();
});
