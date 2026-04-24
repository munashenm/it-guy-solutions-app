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

        // --- NEW METRICS ---
        // 1. Monthly Profit (Paid Invoices - Expenses)
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const monthlyRevenue = invoices
            .filter(i => i.status === 'Paid' && new Date(i.createdAt || i.date) >= startOfMonth)
            .reduce((sum, i) => sum + (parseFloat(i.total || i.amount) || 0), 0);
        
        const monthlyExpenses = (app.state.expenses || [])
            .filter(e => new Date(e.date) >= startOfMonth)
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        
        const monthlyProfit = monthlyRevenue - monthlyExpenses;

        // 2. Stock Health
        const lowStockItems = (app.state.inventory || []).filter(i => (i.qty || 0) < 5);
        
        // 3. Tech Performance (Completion Rate)
        const techStats = {};
        const allJobs = [...jobs, ...fieldJobs];
        allJobs.forEach(j => {
            const tech = j.technician || 'Unassigned';
            if(!techStats[tech]) techStats[tech] = { total: 0, completed: 0 };
            techStats[tech].total++;
            if(['Completed', 'Collected', 'Ready For Collection'].includes(j.status)) techStats[tech].completed++;
        });

        const html = `
            <div class="section-header">
                <div>
                    <h1>Business Insights</h1>
                    <p>Financial health and operational performance for ${new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date())}</p>
                </div>
            </div>
            
            <div class="dashboard-grid">
                <div class="glass-card stat-card" style="border-left: 4px solid var(--primary);">
                    <div class="stat-icon primary">
                        <span class="material-symbols-outlined">payments</span>
                    </div>
                    <div class="stat-content">
                        <h3>Operating Profit</h3>
                        <div class="value" style="color: ${monthlyProfit >= 0 ? '#00b894' : 'var(--danger)'}">R ${monthlyProfit.toLocaleString()}</div>
                        <p style="font-size: 0.75rem; color: #a0a0a0; margin-top: 4px;">Rev: R ${monthlyRevenue.toLocaleString()} | Exp: R ${monthlyExpenses.toLocaleString()}</p>
                    </div>
                </div>
                
                <div class="glass-card stat-card" onclick="app.switchTab('inventory-view')" style="cursor: pointer; border-left: 4px solid ${lowStockItems.length > 0 ? 'var(--warning)' : 'var(--success)'}">
                    <div class="stat-icon ${lowStockItems.length > 0 ? 'warning' : 'success'}">
                        <span class="material-symbols-outlined">inventory_2</span>
                    </div>
                    <div class="stat-content">
                        <h3>Stock Health</h3>
                        <div class="value">${lowStockItems.length} <span style="font-size: 1rem; font-weight: normal;">Low Items</span></div>
                        <p style="font-size: 0.75rem; color: #a0a0a0; margin-top: 4px;">Items below 5 units threshold</p>
                    </div>
                </div>
                
                <div class="glass-card stat-card" onclick="app.switchTab('field-view')" style="cursor: pointer;">
                    <div class="stat-icon success">
                        <span class="material-symbols-outlined">directions_car</span>
                    </div>
                    <div class="stat-content">
                        <h3>Technicians on site</h3>
                        <div class="value">${techsOnSite}</div>
                        <p style="font-size: 0.75rem; color: #a0a0a0; margin-top: 4px;">Active field calls right now</p>
                    </div>
                </div>

                <div class="glass-card stat-card ${urgentJobs > 0 ? 'urgent-pulse' : ''}" onclick="app.switchTab('repair-view')" style="cursor: pointer;">
                    <div class="stat-icon danger">
                        <span class="material-symbols-outlined">priority_high</span>
                    </div>
                    <div class="stat-content">
                        <h3>Urgent SLA</h3>
                        <div class="value">${urgentJobs}</div>
                        <p style="font-size: 0.75rem; color: #a0a0a0; margin-top: 4px;">Repairs exceeding 48h idle</p>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-top: 24px;">
                <!-- Main Activity -->
                <div class="glass-card" style="padding: 0;">
                    <div class="header-flex" style="padding: 24px 24px 12px;">
                        <h2>Recent Activity</h2>
                        <button class="btn-secondary" onclick="app.switchTab('repair-view')">View All repairs</button>
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
                                ${jobs.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5).map(job => `
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

                <!-- Tech Leaderboard -->
                <div class="glass-card">
                    <h2 style="margin-bottom: 20px;">Team Performance</h2>
                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        ${Object.entries(techStats).sort((a,b) => (b[1].completed/b[1].total) - (a[1].completed/a[1].total)).map(([name, stats]) => {
                            const rate = Math.round((stats.completed / (stats.total || 1)) * 100);
                            return `
                                <div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
                                        <span>${name}</span>
                                        <span style="font-weight: bold;">${rate}%</span>
                                    </div>
                                    <div style="height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                                        <div style="height: 100%; width: ${rate}%; background: ${rate > 70 ? 'var(--success)' : rate > 40 ? 'var(--warning)' : 'var(--danger)'}; border-radius: 4px;"></div>
                                    </div>
                                    <div style="font-size: 0.7rem; color: #666; margin-top: 4px;">${stats.completed} of ${stats.total} jobs finalized</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>

            <div class="glass-card" style="margin-top: 24px;">
                <div class="header-flex" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; margin-bottom: 16px;">
                    <h2 style="display: flex; align-items: center; gap: 8px;"><span class="material-symbols-outlined" style="color: #ffca28;">star</span> Recent Customer Feedback</h2>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
                    ${[...jobs, ...(app.state.fieldJobs || [])].filter(j => j.rating).sort((a,b) => b.id.localeCompare(a.id)).slice(0,6).map(j => `
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 12px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <strong style="color: #fff;">${j.customer}</strong>
                                <span style="color: #ffca28;">${'★'.repeat(j.rating)}${'☆'.repeat(5-j.rating)}</span>
                            </div>
                            <div style="font-size: 0.75rem; color: #666; margin-bottom: 12px;">Job Ref: ${j.id}</div>
                            <p style="font-size: 0.9rem; font-style: italic; color: #a0a0a0; line-height: 1.5;">"${j.feedback || 'No written comment provided.'}"</p>
                        </div>
                    `).join('') || '<div style="color: #a0a0a0;">No customer feedback received yet.</div>'}
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
    }
};
