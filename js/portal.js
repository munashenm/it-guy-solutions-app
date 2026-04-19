/**
 * it-guy-solutions-app/js/portal.js
 * 
 * Manages the Customer Self-Service Portal logic.
 */

console.log("--- PORTAL.JS BOOTING (v3.0) ---");

window.clientPortal = {
    initiated: false,
    
    init() {
        console.log("Portal: init() called");
        this.render();
        this.initiated = true;
    },

    render() {
        console.log("Portal: render() started");
        const container = document.getElementById('client-content');
        if (!container) {
            console.warn("Portal: 'client-content' not found, will retry...");
            setTimeout(() => this.render(), 100);
            return;
        }

        const user = window.authSystem ? window.authSystem.currentUser : null;
        if (!user) {
            console.warn("Portal: No user found, showing loader...");
            container.innerHTML = `<div style="padding:60px; text-align:center; color:#555;"><span class="material-symbols-outlined rotating">sync</span><p>Waiting for authentication...</p></div>`;
            return;
        }

        const curEmail = (user.email || '').toLowerCase();
        const displayName = user.firstName || curEmail.split('@')[0] || "Customer";
        
        // Ensure state exists
        if (!window.app || !window.app.state) {
            console.error("Portal: window.app.state is missing");
            return;
        }

        const allJobs = window.app.state.jobs || [];
        const allQuos = window.app.state.quotations || [];
        const allInvs = window.app.state.invoices || [];

        const myJobs = allJobs.filter(j => (j.email || j.customerEmail || '').toLowerCase() === curEmail);
        const myQuotations = allQuos.filter(q => (q.email || q.customerEmail || '').toLowerCase() === curEmail);
        const myInvoices = allInvs.filter(i => (i.email || i.customerEmail || '').toLowerCase() === curEmail);
        
        console.log(`Portal Data: ${myJobs.length} jobs, ${myQuotations.length} quotes, ${myInvoices.length} invs`);

        let html = `
            <div style="animation: fade-in 0.5s ease;">
                <div class="section-header" style="margin-bottom: 32px;">
                    <h1 style="font-size: 2.2rem; color: #fff; margin:0;">Hello, ${displayName}!</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Track your repairs and manage your IT support tickets.</p>
                    <div style="display: flex; gap: 12px; margin-top: 20px;">
                        <button class="btn-secondary" onclick="window.clientPortal.showBookRepairModal()">Book a Repair</button>
                        <button class="btn-primary" onclick="window.clientPortal.showLogCallModal()">Log Support Call</button>
                    </div>
                </div>
        `;

        // Action Items
        const pendingQuos = myQuotations.filter(q => ['Pending', 'Requested', 'Sent'].includes(q.status));
        const unpaidInvs = myInvoices.filter(i => ['Unpaid', 'Overdue'].includes(i.status));

        if(pendingQuos.length > 0 || unpaidInvs.length > 0) {
            html += `<div class="glass-card" style="margin-bottom: 32px; border: 1px solid rgba(108,92,231,0.3); background: rgba(108,92,231,0.05); padding:20px; border-radius:12px;">
                <h4 style="color:var(--primary); margin-bottom:15px;">Action Required</h4>
                ${pendingQuos.map(q => `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><span>Quotation ${q.id}</span><button class="btn-primary" onclick="window.clientPortal.viewQuotation('${q.id}')">Review</button></div>`).join('')}
                ${unpaidInvs.map(i => `<div style="display:flex; justify-content:space-between; align-items:center;"><span>Unpaid Invoice ${i.id}</span><button class="btn-primary" style="background:var(--success);" onclick="window.clientPortal.viewInvoice('${i.id}')">Pay Now</button></div>`).join('')}
            </div>`;
        }

        // Repairs
        html += `<h3 style="color:#fff; margin-bottom:20px;">Your Repairs</h3>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:20px; margin-bottom:40px;">
                ${myJobs.length > 0 ? myJobs.map(job => `
                    <div class="glass-card" style="padding:20px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="display:flex; justify-content:space-between;"><b>${job.id}</b> <span class="badge ${job.status.toLowerCase().replace(/ /g,'-')}">${job.status}</span></div>
                        <div style="margin-top:10px; color:#fff; font-weight:600;">${job.device}</div>
                        <div style="font-size:0.8rem; color:#888;">${job.issue}</div>
                    </div>
                `).join('') : '<p style="color:#555;">No active repairs.</p>'}
            </div>`;

        // History Tables
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
                <div><h3 style="color:#fff;">Quotes</h3>${myQuotations.length > 0 ? `<table style="width:100%; color:#ccc;">${myQuotations.map(q => `<tr><td>${q.id}</td><td>${q.status}</td></tr>`).join('')}</table>` : '<p>None</p>'}</div>
                <div><h3 style="color:#fff;">Invoices</h3>${myInvoices.length > 0 ? `<table style="width:100%; color:#ccc;">${myInvoices.map(i => `<tr><td>${i.id}</td><td>${i.amount}</td></tr>`).join('')}</table>` : '<p>None</p>'}</div>
            </div></div>`;

        container.innerHTML = html;
        console.log("Portal: Render completed.");

        // Header Update
        const hdrName = document.getElementById('client-name');
        if (hdrName) hdrName.textContent = displayName;
        const hdrEmail = document.getElementById('client-email');
        if (hdrEmail) hdrEmail.textContent = user.email;
    },

    showBookRepairModal() { /* ... implementation ... */ alert("Feature coming in 1 min..."); },
    showLogCallModal() { /* ... implementation ... */ alert("Feature coming in 1 min..."); },
    showProfileModal() { /* ... implementation ... */ alert("Feature coming in 1 min..."); },
    viewQuotation(id) { /* ... */ },
    viewInvoice(id) { /* ... */ }
};

// Global alias for compatibility
window.client = window.clientPortal;

// Auto-run
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log("Portal: document ready, booting...");
    window.clientPortal.init();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("Portal: DOMContentLoaded, booting...");
        window.clientPortal.init();
    });
}
