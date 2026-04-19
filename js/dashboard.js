window.dashboard = {
    init() {
        this.container = document.getElementById('dashboard-content');
        this.render();
    },
    
    render() {
        if (!this.container) {
            this.container = document.getElementById('dashboard-content');
            if (!this.container) return;
        }

        const jobs = app.state.jobs || [];
        const invoices = app.state.invoices || [];
        const fieldJobs = app.state.fieldJobs || [];
        
        const openJobsCount = jobs.filter(j => j.status !== 'Collected').length;
        const unpaidInvoicesCount = invoices.filter(i => i.status === 'Unpaid').length;
        const techsOnSite = fieldJobs.filter(j => j.status?.toLowerCase() === 'on-site').length;
        
        // Calculate Revenue This Week
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0,0,0,0);
        
        const weeklyRevenue = invoices
            .filter(i => i.status === 'Paid' && new Date(i.createdAt) >= startOfWeek)
            .reduce((sum, i) => sum + (parseFloat(i.total || i.amount) || 0), 0);
            
        // Urgent Jobs (Started > 48h ago)
        const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
        const urgentJobs = jobs.filter(j => 
            j.status === 'Started' && 
            new Date(j.createdAt).getTime() < fortyEightHoursAgo
        ).length;
        
        const html = `
            <div class="section-header">
                <h1>Overview</h1>
                <p>Welcome back, admin. Here's what's happening today.</p>
            </div>
            
            <div class="dashboard-grid">
                <div class="glass-card stat-card">
                    <div class="stat-icon primary">
                        <span class="material-symbols-outlined">work</span>
                    </div>
                    <div class="stat-content">
                        <h3>Open Jobs</h3>
                        <div class="value">${openJobsCount}</div>
                    </div>
                </div>
                
                <div class="glass-card stat-card" onclick="app.switchTab('invoices-view')" style="cursor: pointer;">
                    <div class="stat-icon warning">
                        <span class="material-symbols-outlined">payments</span>
                    </div>
                    <div class="stat-content">
                        <h3>Revenue This Week</h3>
                        <div class="value">R ${weeklyRevenue.toLocaleString()}</div>
                    </div>
                </div>
                
                <div class="glass-card stat-card" onclick="app.switchTab('field-view')" style="cursor: pointer;">
                    <div class="stat-icon success">
                        <span class="material-symbols-outlined">directions_car</span>
                    </div>
                    <div class="stat-content">
                        <h3>Technicians on site</h3>
                        <div class="value">${techsOnSite}</div>
                    </div>
                </div>

                <div class="glass-card stat-card ${urgentJobs > 0 ? 'urgent-pulse' : ''}" onclick="app.switchTab('repair-view')" style="cursor: pointer;">
                    <div class="stat-icon danger">
                        <span class="material-symbols-outlined">priority_high</span>
                    </div>
                    <div class="stat-content">
                        <h3>Urgent Repairs</h3>
                        <div class="value">${urgentJobs}</div>
                    </div>
                </div>
            </div>
            
            <div class="glass-card">
                <div class="header-flex">
                    <h2>Recent Walk-ins</h2>
                    <button class="btn-secondary" onclick="app.switchTab('repair-view')">View All</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Job ID</th>
                                <th>Customer</th>
                                <th>Device</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${jobs.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5).map(job => `
                                <tr>
                                    <td><strong>${job.id}</strong></td>
                                    <td>${job.customer}</td>
                                    <td>${job.device}</td>
                                    <td><span class="badge ${job.status.toLowerCase().replace(/ /g, '-')}">${job.status}</span></td>
                                    <td>
                                        <button class="btn-icon" onclick="repair.openJob('${job.id}'); app.switchTab('repair-view');"><span class="material-symbols-outlined">arrow_forward</span></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="glass-card" style="margin-top: 24px;">
                <div class="header-flex" style="border-bottom: 1px solid #e0e0e0; padding-bottom: 12px; margin-bottom: 16px;">
                    <h2 style="display: flex; align-items: center; gap: 8px;"><span class="material-symbols-outlined" style="color: #ffca28;">star</span> Recent Customer Feedback</h2>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
                    ${[...jobs, ...(app.state.fieldJobs || [])].filter(j => j.rating).sort((a,b) => b.id.localeCompare(a.id)).slice(0,6).map(j => `
                        <div style="background: rgba(0,0,0,0.2); border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <strong>${j.customer}</strong>
                                <span style="color: #ffca28;">${'★'.repeat(j.rating)}${'☆'.repeat(5-j.rating)}</span>
                            </div>
                            <div style="font-size: 0.9rem; color: #a0a0a0; margin-bottom: 12px;">Job Ref: ${j.id}</div>
                            <p style="font-size: 0.95rem; font-style: italic;">"${j.feedback || 'No written comment provided.'}"</p>
                        </div>
                    `).join('') || '<div style="color: #a0a0a0;">No customer feedback received yet.</div>'}
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
    }
};
