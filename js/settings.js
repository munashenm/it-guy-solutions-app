window.companySettings = {
    init() {
        this.container = document.getElementById('company-content');
        if(window.authSystem && window.authSystem.currentUser && window.authSystem.currentUser.role === 'admin') {
            this.render();
        }
    },

    async render() {
        if (!window.authSystem.currentUser || window.authSystem.currentUser.role !== 'admin') {
            if(this.container) this.container.innerHTML = `<div style="padding: 32px; text-align: center; color: #ff7675;">Access Denied</div>`;
            return;
        }

        let html = `
            <div class="section-header">
                <div>
                    <h1>Settings</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage company profile, document footers, and system configurations.</p>
                </div>
            </div>
            
            <div id="settings-error-msg" class="hidden" style="background: rgba(var(--danger-rgb), 0.1); border: 1px solid var(--danger); color: #ff7675; padding: 12px; border-radius: 6px; margin-bottom: 24px;"></div>
            <div id="settings-success-msg" class="hidden" style="background: rgba(0, 184, 148, 0.1); border: 1px solid #00b894; color: #00b894; padding: 12px; border-radius: 6px; margin-bottom: 24px;"></div>
            
            <div class="glass-card" style="padding: 24px;">
                <div class="settings-tabs">
                    <button class="settings-tab active" onclick="companySettings.switchTab('profile', event)">Company Profile</button>
                    <button class="settings-tab" onclick="companySettings.switchTab('documents', event)">Document Settings</button>
                    <button class="settings-tab" onclick="companySettings.switchTab('email', event)">Email Settings</button>
                    <button class="settings-tab" onclick="companySettings.switchTab('whatsapp', event)">WhatsApp Settings</button>
                    <button class="settings-tab" onclick="companySettings.switchTab('other', event)">Other Settings</button>
                    <button class="settings-tab" style="color: #6c5ce7; font-weight: bold;" onclick="companySettings.switchTab('users', event)">Users & Roles</button>
                </div>

                <div id="unified-settings-form">
                    
                    <!-- COMPANY PROFILE SECTION -->
                    <div id="settings-profile" class="settings-section active">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Company Name</label>
                                <input type="text" id="cs-name" class="form-control" placeholder="e.g. IT Guy Solutions" required>
                            </div>
                            <div class="form-group">
                                <label>Physical Address</label>
                                <input type="text" id="cs-address" class="form-control" placeholder="102 President Street..." required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Contact Number</label>
                                <input type="tel" id="cs-phone" class="form-control" placeholder="087 550 1813" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0">
                            </div>
                            <div class="form-group">
                                <label>WhatsApp Number</label>
                                <input type="tel" id="cs-whatsapp" class="form-control" placeholder="065 866 3103" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" id="cs-email" class="form-control" placeholder="support@techguy.pl">
                            </div>
                            <div class="form-group">
                                <label>Website</label>
                                <input type="text" id="cs-website" class="form-control" placeholder="www.techguy.pl">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Company Logo (Transparent PNG recommended)</label>
                                <div style="display: flex; gap: 16px; align-items: center;">
                                    <div id="cs-logo-preview" style="width: 80px; height: 80px; border: 2px dashed var(--border); border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: rgba(0,0,0,0.2);">
                                        <span class="material-symbols-outlined" style="color: #444;">image</span>
                                    </div>
                                    <div style="flex: 1;">
                                        <input type="file" id="cs-logo-file" class="form-control" accept="image/*" onchange="companySettings.handleLogoUpload(this)">
                                        <input type="hidden" id="cs-logo">
                                        <p style="font-size: 0.75rem; color: #a0a0a0; margin-top: 4px;">Upload your company logo. This will appear on Invoices, Quotes, and Job Cards.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- DOCUMENT SETTINGS SECTION -->
                    <div id="settings-documents" class="settings-section">
                        <h4 style="margin-top: 0; margin-bottom: 16px; color: #a29bfe;">PDF Document Prefixes</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Invoice Prefix</label>
                                <input type="text" id="cs-inv-prefix" class="form-control" placeholder="INV-">
                            </div>
                            <div class="form-group">
                                <label>Quotation Prefix</label>
                                <input type="text" id="cs-quo-prefix" class="form-control" placeholder="QUO-">
                            </div>
                        </div>
                        
                        <h4 style="margin-top: 24px; margin-bottom: 16px; color: #a29bfe;">Bank Account Details (Prints on Invoices)</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Bank Name</label>
                                <input type="text" id="cs-bank-name" class="form-control" placeholder="e.g. FNB">
                            </div>
                            <div class="form-group">
                                <label>Account Holder Name</label>
                                <input type="text" id="cs-bank-holder" class="form-control" placeholder="e.g. IT Guy Solutions">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Account Number</label>
                                <input type="text" id="cs-bank-acc" class="form-control" placeholder="e.g. 62000000000">
                            </div>
                            <div class="form-group">
                                <label>Branch Code</label>
                                <input type="text" id="cs-bank-branch" class="form-control" placeholder="e.g. 250655">
                            </div>
                        </div>

                        <h4 style="margin-top: 24px; margin-bottom: 16px; color: #a29bfe;">PDF Document Template</h4>
                        <div class="form-group">
                            <label>Choose Layout Style</label>
                            <select id="cs-pdf-template" class="form-control" style="appearance: auto;">
                                <option value="modern" style="background: #1a1d2d; color: #fff;">Modern (Purple Accents / Default)</option>
                                <option value="classic" style="background: #1a1d2d; color: #fff;">Classic (Professional Blue)</option>
                                <option value="minimal" style="background: #1a1d2d; color: #fff;">Minimalist (High Contrast B&W)</option>
                            </select>
                        </div>

                        <h4 style="margin-top: 24px; margin-bottom: 16px; color: #a29bfe;">Document Terms & Conditions</h4>
                        <div class="form-group">
                            <label>Invoice Terms (Prints at bottom of Invoices)</label>
                            <textarea id="cs-terms-invoice" class="form-control" rows="3" placeholder="Payment strictly due on receipt. Electronic goods non-refundable..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>Quotation Validity (Prints at bottom of Quotes)</label>
                            <input type="text" id="cs-terms-quote" class="form-control" placeholder="Quotation valid for 7 days from generation.">
                        </div>
                        <div class="form-group">
                            <label>Job Card Disclaimer (Prints at bottom of Job Cards)</label>
                            <textarea id="cs-terms-job" class="form-control" rows="3" placeholder="We are not liable for data loss during repair/format. Please ensure you backup your data..."></textarea>
                        </div>
                    </div>

                    <!-- EMAIL SETTINGS SECTION -->
                    <div id="settings-email" class="settings-section">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                            <div>
                                <h3 style="margin: 0; color: #ffffff;">Email Configurations</h3>
                                <p style="color: #a0a0a0; margin-top: 4px; font-size: 0.9rem;">Setup your SMTP server to send automated emails to clients.</p>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>SMTP Host</label>
                                <input type="text" id="cs-smtp-host" class="form-control" placeholder="mail.techguy.pl">
                            </div>
                            <div class="form-group">
                                <label>SMTP Port</label>
                                <input type="number" id="cs-smtp-port" class="form-control" placeholder="465">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>SMTP Username (Email)</label>
                                <input type="email" id="cs-smtp-user" class="form-control" placeholder="billing@techguy.pl">
                            </div>
                            <div class="form-group">
                                <label>SMTP Password</label>
                                <input type="password" id="cs-smtp-pass" class="form-control" placeholder="••••••••">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Sender Display Name</label>
                                <input type="text" id="cs-email-name" class="form-control" placeholder="IT Guy Solutions">
                            </div>
                            <div class="form-group">
                                <label>Reply-To Email Address</label>
                                <input type="email" id="cs-email-reply" class="form-control" placeholder="support@techguy.pl">
                            </div>
                        </div>

                        <h4 style="margin: 32px 0 16px 0; color: #a29bfe; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Automated Email Templates</h4>
                        <p style="color: #a0a0a0; font-size: 0.85rem; margin-bottom: 16px;">Available tags: <strong>[CustomerName]</strong>, <strong>[DeviceName]</strong>, <strong>[JobID]</strong>, <strong>[TotalAmount]</strong>.</p>

                        <!-- Trigger 1: Booked -->
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label style="margin: 0; font-weight: bold;">Trigger: Device Checked In</label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #a0a0a0; font-size: 0.9rem;"><input type="checkbox" id="cs-booked-email-en" checked style="accent-color: #a29bfe;"> Enable Email</label>
                            </div>
                            <textarea id="cs-booked-email" class="form-control" rows="2" placeholder="Hi [CustomerName], your [DeviceName] has been checked into our workshop. Ref: [JobID]."></textarea>
                        </div>

                        <!-- Trigger 2: Quote -->
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label style="margin: 0; font-weight: bold;">Trigger: Quotation Generated</label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #a0a0a0; font-size: 0.9rem;"><input type="checkbox" id="cs-quote-email-en" checked style="accent-color: #a29bfe;"> Enable Email</label>
                            </div>
                            <textarea id="cs-quote-email" class="form-control" rows="2" placeholder="Hi [CustomerName], we have generated a quotation to repair your [DeviceName]. Please see attached."></textarea>
                        </div>

                        <!-- Trigger 3: Collection -->
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label style="margin: 0; font-weight: bold;">Trigger: Ready for Collection</label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #a0a0a0; font-size: 0.9rem;"><input type="checkbox" id="cs-ready-email-en" checked style="accent-color: #a29bfe;"> Enable Email</label>
                            </div>
                            <textarea id="cs-ready-email" class="form-control" rows="2" placeholder="Great news [CustomerName]! Your [DeviceName] is ready for collection. Total due: [TotalAmount]. Thank you!"></textarea>
                        </div>
                    </div>

                    <!-- WHATSAPP SETTINGS SECTION -->
                    <div id="settings-whatsapp" class="settings-section">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                            <div>
                                <h3 style="margin: 0; color: #25D366;">WhatsApp API Configurations</h3>
                                <p style="color: #a0a0a0; margin-top: 4px; font-size: 0.9rem;">Setup your WhatsApp Cloud API or gateway tokens to send automated WhatsApp messages.</p>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>WhatsApp API Token / Bearer Key</label>
                                <input type="password" id="cs-wa-token" class="form-control" placeholder="EAAIxxxxxxxxxxxxxxxxx...">
                            </div>
                            <div class="form-group">
                                <label>Phone Number ID (Sender ID)</label>
                                <input type="text" id="cs-wa-phone-id" class="form-control" placeholder="104xxxxxxxxxx">
                            </div>
                        </div>

                        <h4 style="margin: 32px 0 16px 0; color: #25D366; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Automated WhatsApp Templates</h4>
                        <p style="color: #a0a0a0; font-size: 0.85rem; margin-bottom: 16px;">Available tags: <strong>[CustomerName]</strong>, <strong>[DeviceName]</strong>, <strong>[JobID]</strong>, <strong>[TotalAmount]</strong>.</p>

                        <!-- Trigger 1: Booked -->
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label style="margin: 0; font-weight: bold;">Trigger: Device Checked In</label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #a0a0a0; font-size: 0.9rem;"><input type="checkbox" id="cs-booked-wa-en" style="accent-color: #a29bfe;"> Enable WhatsApp</label>
                            </div>
                            <textarea id="cs-booked-wa" class="form-control" rows="2" placeholder="Hi [CustomerName], your [DeviceName] has been checked in. Ref: [JobID]."></textarea>
                        </div>

                        <!-- Trigger 2: Quote -->
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label style="margin: 0; font-weight: bold;">Trigger: Quotation Generated</label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #a0a0a0; font-size: 0.9rem;"><input type="checkbox" id="cs-quote-wa-en" checked style="accent-color: #a29bfe;"> Enable WhatsApp</label>
                            </div>
                            <textarea id="cs-quote-wa" class="form-control" rows="2" placeholder="Hi [CustomerName], your quote for [DeviceName] is ready. Please check your email."></textarea>
                        </div>

                        <!-- Trigger 3: Collection -->
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label style="margin: 0; font-weight: bold;">Trigger: Ready for Collection</label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #a0a0a0; font-size: 0.9rem;"><input type="checkbox" id="cs-ready-wa-en" checked style="accent-color: #a29bfe;"> Enable WhatsApp</label>
                            </div>
                            <textarea id="cs-ready-wa" class="form-control" rows="2" placeholder="Hi [CustomerName], your [DeviceName] is repaired! Due: [TotalAmount]. Thank you."></textarea>
                        </div>
                    </div>

                    <!-- OTHER SETTINGS SECTION -->
                    <div id="settings-other" class="settings-section">
                        <p style="color: #a0a0a0; margin-top: 0;">General System Settings</p>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Tax/VAT Registration No.</label>
                                <input type="text" id="cs-tax-no" class="form-control" placeholder="e.g. 412... (Leave blank if N/A)">
                            </div>
                            <div class="form-group">
                                <label>Default Currency Symbol</label>
                                <input type="text" id="cs-currency" class="form-control" placeholder="R" value="R">
                            </div>
                        </div>
                        <div class="form-group" style="display: flex; align-items: center; gap: 12px; margin-top: 16px;">
                            <input type="checkbox" id="cs-enable-pos" checked style="width: 20px; height: 20px; accent-color: #a29bfe;">
                            <label for="cs-enable-pos" style="margin: 0; color: #ffffff; cursor: pointer;">Enable "Point of Sale" Module</label>
                        </div>

                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <h4 style="margin-top: 0; color: #a29bfe;">Tax & VAT Settings</h4>
                        <div class="form-row">
                            <div class="form-group" style="display: flex; align-items: center; gap: 12px; margin-bottom: 0;">
                                <input type="checkbox" id="cs-vat-registered" style="width: 20px; height: 20px; accent-color: #a29bfe;">
                                <label for="cs-vat-registered" style="margin: 0; color: #ffffff; cursor: pointer;">Company is VAT Registered</label>
                            </div>
                            <div class="form-group">
                                <label>VAT Rate (%)</label>
                                <input type="number" id="cs-vat-rate" class="form-control" placeholder="15" value="15" min="0" max="100" step="0.1">
                            </div>
                        </div>

                        <div style="margin-top: 32px; padding: 20px; background: rgba(var(--accent-rgb), 0.1); border: 1px dashed var(--accent); border-radius: 8px; display: flex; flex-direction: column; gap: 16px;">
                            <div>
                                <h4 style="margin-top: 0; color: #a29bfe;">Data Management (Backup & Restore)</h4>
                                <p style="font-size: 0.9rem; color: #a0a0a0; margin-bottom: 0;">Since you are running on a local database, we recommend downloading regular backups. You can also restore from a previous backup file.</p>
                            </div>
                            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                                <button type="button" class="btn-primary" onclick="companySettings.downloadBackup()" style="background: var(--accent); display: flex; align-items: center; gap: 8px;">
                                    <span class="material-symbols-outlined">download</span> Download Backup (.sqlite)
                                </button>
                                
                                <input type="file" id="restore-db-file" accept=".sqlite" style="display: none;" onchange="companySettings.restoreDatabase(event)">
                                <button type="button" class="btn-secondary" onclick="document.getElementById('restore-db-file').click()" style="display: flex; align-items: center; gap: 8px; border-color: #a29bfe; color: #a29bfe;">
                                    <span class="material-symbols-outlined">upload_file</span> Restore from File
                                </button>
                            </div>
                            <div id="restore-progress" class="hidden" style="font-size: 0.85rem; color: #fdcb6e; padding: 8px; background: rgba(253, 203, 110, 0.1); border-radius: 4px;">
                                <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle;">sync</span> Restoring database... please do not close the browser.
                            </div>
                        </div>
                    </div>

                    <div style="text-align: right; margin-top: 32px; border-top: 1px solid #e0e0e0; padding-top: 16px;">
                        <button type="button" class="btn-primary" id="btn-save-settings" onclick="companySettings.saveAllSettings(event)">Save Configured Settings</button>
                    </div>
                </div>

                <!-- USERS AND ROLES SECTION (Outside main form to prevent conflicts) -->
                <div id="settings-users" class="settings-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <h3 style="margin: 0; color: #a29bfe;">Staff & User Directory</h3>
                            <p style="color: #a0a0a0; margin-top: 4px; font-size: 0.9rem;">Manage system access, edit roles, and pre-register customers.</p>
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button type="button" class="btn-secondary" onclick="companySettings.showCreateCustomerModal()"><span class="material-symbols-outlined">person_add</span> Register Client</button>
                            <button type="button" class="btn-primary" onclick="companySettings.showCreateStaffModal()"><span class="material-symbols-outlined">badge</span> Create Staff</button>
                        </div>
                    </div>
                    
                    <div class="glass-card" style="margin-bottom: 24px; padding: 16px; background: rgba(0,0,0,0.1);">
                        <div class="search-bar" style="max-width: 100%;">
                            <span class="material-symbols-outlined">search</span>
                            <input type="text" placeholder="Search users by name, email, or ID..." onkeyup="companySettings.handleSearch(event)" id="settings-user-search">
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                        <!-- Staff List -->
                        <div style="border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(0,0,0,0.2);">
                                <strong style="color: #ffffff;">System Users (Staff)</strong>
                                <button type="button" class="btn-icon" onclick="companySettings.fetchUsers()" title="Refresh"><span class="material-symbols-outlined" style="font-size: 1.1rem;">refresh</span></button>
                            </div>
                            <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                                <table id="settings-staff-table">
                                    <thead><tr><th>Email</th><th>Role</th><th style="text-align: right;">Action</th></tr></thead>
                                    <tbody><tr><td colspan="3" style="text-align: center; color: #a0a0a0;">Loading...</td></tr></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Customer List -->
                        <div style="border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                            <div style="padding: 12px 16px; background: rgba(0,0,0,0.2);">
                                <strong style="color: #00b894;">Registered Clients</strong>
                            </div>
                            <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                                <table id="settings-customer-table">
                                    <thead><tr><th>Email / Phone</th><th>Status</th></tr></thead>
                                    <tbody><tr><td colspan="2" style="text-align: center; color: #a0a0a0;">Loading...</td></tr></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;

        this.container.innerHTML = html;
        this.loadSettings();
    },

    switchTab(tabId, event) {
        document.querySelectorAll('.settings-tab').forEach(btn => btn.classList.remove('active'));
        if(event && event.currentTarget) event.currentTarget.classList.add('active');
        
        document.querySelectorAll('.settings-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById('settings-' + tabId).classList.add('active');

        // Refresh users list if switching to Users tab
        if(tabId === 'users') {
            this.fetchUsers();
        }
    },

    showMessage(msg, isSuccess) {
        const errEl = document.getElementById('settings-error-msg');
        const sucEl = document.getElementById('settings-success-msg');
        if(!errEl || !sucEl) return;
        errEl.classList.add('hidden');
        sucEl.classList.add('hidden');

        if(isSuccess) {
            sucEl.innerText = msg;
            sucEl.classList.remove('hidden');
            setTimeout(() => sucEl.classList.add('hidden'), 5000);
        } else {
            errEl.innerText = msg;
            errEl.classList.remove('hidden');
        }
    },

    async loadSettings() {
        if(!window.fbDb) return;
        try {
            const profileDoc = await window.fbDb.collection("settings").doc("companyProfile").get();
            if(profileDoc.exists) {
                const data = profileDoc.data();
                document.getElementById('cs-name').value = data.name || '';
                document.getElementById('cs-address').value = data.address || '';
                document.getElementById('cs-phone').value = data.phone || '';
                document.getElementById('cs-whatsapp').value = data.whatsapp || '';
                document.getElementById('cs-email').value = data.email || '';
                document.getElementById('cs-website').value = data.website || '';
                const logoVal = data.logoUrl || '';
                document.getElementById('cs-logo').value = logoVal;
                const preview = document.getElementById('cs-logo-preview');
                if(preview && logoVal) {
                    preview.innerHTML = `<img src="${logoVal}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
                }
            }

            const docsDoc = await window.fbDb.collection("settings").doc("documentSettings").get();
            if(docsDoc.exists) {
                const data = docsDoc.data();
                document.getElementById('cs-inv-prefix').value = data.invPrefix || '';
                document.getElementById('cs-quo-prefix').value = data.quoPrefix || '';
                document.getElementById('cs-bank-name').value = data.bankName || '';
                document.getElementById('cs-bank-holder').value = data.bankHolder || '';
                document.getElementById('cs-bank-acc').value = data.bankAcc || '';
                document.getElementById('cs-bank-branch').value = data.bankBranch || '';
                document.getElementById('cs-terms-invoice').value = data.termsInvoice || '';
                document.getElementById('cs-terms-quote').value = data.termsQuote || '';
                document.getElementById('cs-terms-job').value = data.termsJob || '';
                document.getElementById('cs-pdf-template').value = data.pdfTemplate || 'modern';
            }

            const otherDoc = await window.fbDb.collection("settings").doc("systemSettings").get();
            if(otherDoc.exists) {
                const data = otherDoc.data();
                document.getElementById('cs-email-reply').value = data.emailReply || '';
                document.getElementById('cs-email-name').value = data.emailName || '';
                document.getElementById('cs-smtp-host').value = data.smtpHost || '';
                document.getElementById('cs-smtp-port').value = data.smtpPort || '';
                document.getElementById('cs-smtp-user').value = data.smtpUser || '';
                document.getElementById('cs-smtp-pass').value = data.smtpPass || '';

                document.getElementById('cs-wa-token').value = data.waToken || '';
                document.getElementById('cs-wa-phone-id').value = data.waPhoneId || '';

                document.getElementById('cs-tax-no').value = data.taxNo || '';
                document.getElementById('cs-currency').value = data.currency || 'R';
                document.getElementById('cs-enable-pos').checked = data.enablePOS !== false;
                document.getElementById('cs-vat-registered').checked = data.vatRegistered === true;
                document.getElementById('cs-vat-rate').value = data.vatRate || '15';

                document.getElementById('cs-booked-email').value = data.tplBookedEmail || '';
                document.getElementById('cs-booked-wa').value = data.tplBookedWA || '';
                document.getElementById('cs-quote-email').value = data.tplQuoteEmail || '';
                document.getElementById('cs-quote-wa').value = data.tplQuoteWA || '';
                document.getElementById('cs-ready-email').value = data.tplReadyEmail || '';
                document.getElementById('cs-ready-wa').value = data.tplReadyWA || '';

                if(data.enBookedEmail !== undefined) document.getElementById('cs-booked-email-en').checked = data.enBookedEmail;
                if(data.enBookedWA !== undefined) document.getElementById('cs-booked-wa-en').checked = data.enBookedWA;
                if(data.enQuoteEmail !== undefined) document.getElementById('cs-quote-email-en').checked = data.enQuoteEmail;
                if(data.enQuoteWA !== undefined) document.getElementById('cs-quote-wa-en').checked = data.enQuoteWA;
                if(data.enReadyEmail !== undefined) document.getElementById('cs-ready-email-en').checked = data.enReadyEmail;
                if(data.enReadyWA !== undefined) document.getElementById('cs-ready-wa-en').checked = data.enReadyWA;
            }
        } catch(e) {
            console.error("Error loading settings", e);
        }
    },
    
    handleLogoUpload(input) {
        const file = input.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const b64 = e.target.result;
            document.getElementById('cs-logo').value = b64;
            const preview = document.getElementById('cs-logo-preview');
            if(preview) {
                preview.innerHTML = `<img src="${b64}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
            }
        };
        reader.readAsDataURL(file);
    },

    async saveAllSettings(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-save-settings');
        btn.disabled = true;
        btn.innerText = "Saving...";

        const updatedAt = new Date().toISOString();

        const profileData = {
            name: document.getElementById('cs-name').value,
            address: document.getElementById('cs-address').value,
            phone: document.getElementById('cs-phone').value,
            whatsapp: document.getElementById('cs-whatsapp').value,
            email: document.getElementById('cs-email').value,
            website: document.getElementById('cs-website').value,
            logoUrl: document.getElementById('cs-logo').value,
            updatedAt
        };

        const phoneRegex = /^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if(profileData.email && !emailRegex.test(profileData.email)) {
            this.showMessage("Invalid Email Address format.", false);
            btn.disabled = false; btn.innerText = "Save Configured Settings";
            return;
        }

        if((profileData.phone && !phoneRegex.test(profileData.phone)) || (profileData.whatsapp && !phoneRegex.test(profileData.whatsapp))) {
            this.showMessage("Phone/WhatsApp must be a 10-digit South African number starting with 0.", false);
            btn.disabled = false; btn.innerText = "Save Configured Settings";
            return;
        }

        const docData = {
            invPrefix: document.getElementById('cs-inv-prefix').value,
            quoPrefix: document.getElementById('cs-quo-prefix').value,
            bankName: document.getElementById('cs-bank-name').value,
            bankHolder: document.getElementById('cs-bank-holder').value,
            bankAcc: document.getElementById('cs-bank-acc').value,
            bankBranch: document.getElementById('cs-bank-branch').value,
            termsInvoice: document.getElementById('cs-terms-invoice').value,
            termsQuote: document.getElementById('cs-terms-quote').value,
            termsJob: document.getElementById('cs-terms-job').value,
            pdfTemplate: document.getElementById('cs-pdf-template').value,
            updatedAt
        };

        const sysData = {
            emailName: document.getElementById('cs-email-name').value,
            emailReply: document.getElementById('cs-email-reply').value,
            smtpHost: document.getElementById('cs-smtp-host').value,
            smtpPort: document.getElementById('cs-smtp-port').value,
            smtpUser: document.getElementById('cs-smtp-user').value,
            smtpPass: document.getElementById('cs-smtp-pass').value,

            waToken: document.getElementById('cs-wa-token').value,
            waPhoneId: document.getElementById('cs-wa-phone-id').value,

            taxNo: document.getElementById('cs-tax-no').value,
            currency: document.getElementById('cs-currency').value || 'R',
            enablePOS: document.getElementById('cs-enable-pos').checked,
            vatRegistered: document.getElementById('cs-vat-registered').checked,
            vatRate: document.getElementById('cs-vat-rate').value || '15',

            tplBookedEmail: document.getElementById('cs-booked-email').value,
            tplBookedWA: document.getElementById('cs-booked-wa').value,
            tplQuoteEmail: document.getElementById('cs-quote-email').value,
            tplQuoteWA: document.getElementById('cs-quote-wa').value,
            tplReadyEmail: document.getElementById('cs-ready-email').value,
            tplReadyWA: document.getElementById('cs-ready-wa').value,
            
            enBookedEmail: document.getElementById('cs-booked-email-en').checked,
            enBookedWA: document.getElementById('cs-booked-wa-en').checked,
            enQuoteEmail: document.getElementById('cs-quote-email-en').checked,
            enQuoteWA: document.getElementById('cs-quote-wa-en').checked,
            enReadyEmail: document.getElementById('cs-ready-email-en').checked,
            enReadyWA: document.getElementById('cs-ready-wa-en').checked,

            updatedAt
        };

        try {
            const batch = window.fbDb.batch();
            batch.set(window.fbDb.collection("settings").doc("companyProfile"), profileData);
            batch.set(window.fbDb.collection("settings").doc("documentSettings"), docData);
            batch.set(window.fbDb.collection("settings").doc("systemSettings"), sysData);
            await batch.commit();

            this.showMessage("All settings saved successfully!", true);
        } catch(e) {
            console.error(e);
            const detail = (e && e.message) ? e.message : String(e);
            this.showMessage(`Error saving settings: ${detail}`, false);
        }

        btn.disabled = false;
        btn.innerText = "Save Configured Settings";
    },

    async restoreDatabase(event) {
        const file = event.target.files[0];
        if(!file) return;

        if(!confirm("WARNING: This will completely OVERWRITE your current database with the uploaded file. Any unsaved changes will be lost. Proceed?")) {
            event.target.value = "";
            return;
        }

        const progress = document.getElementById('restore-progress');
        progress.classList.remove('hidden');

        const formData = new FormData();
        formData.append('database', file);

        try {
            const response = await fetch(`${window.API_BASE || '/api'}/restore`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + sessionStorage.getItem('it-guy-token')
                },
                body: formData
            });

            const result = await response.json();
            if(result.success) {
                alert("Database successfully restored! The page will now reload.");
                window.location.reload();
            } else {
                throw new Error(result.error || "Unknown restore error");
            }
        } catch(e) {
            console.error("Restore failed:", e);
            alert("Critical Error: Failed to restore database. " + e.message);
        } finally {
            progress.classList.add('hidden');
        }
    },

    async downloadBackup() {
        try {
            const btn = document.querySelector('button[onclick="companySettings.downloadBackup()"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined">sync</span> Downloading...';
            btn.disabled = true;

            const response = await fetch(`${window.API_BASE || '/api'}/backup`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + sessionStorage.getItem('it-guy-token')
                }
            });

            if (!response.ok) throw new Error("Failed to download backup");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `it-guy-backup-${new Date().toISOString().split('T')[0]}.sqlite`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            
            btn.innerHTML = originalText;
            btn.disabled = false;
        } catch (e) {
            console.error(e);
            alert("Error downloading backup: " + e.message);
        }
    },

    // ==========================================
    secondaryApp: null,
    allStaff: [],
    allCustomers: [],

    initSecondaryApp() {
        if (!this.secondaryApp && typeof firebaseConfig !== 'undefined') {
            this.secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
        }
    },

    async fetchUsers() {
        if(!window.fbDb) return;
        try {
            const usersSnap = await window.fbDb.collection("users").orderBy("createdAt", "desc").get();
            this.allStaff = [];
            this.allCustomers = [];

            usersSnap.forEach(doc => {
                const data = doc.data();
                if (['admin', 'technician', 'frontdesk'].includes(data.role)) this.allStaff.push(data);
                else this.allCustomers.push(data);
            });

            this.renderStaffTable(this.allStaff);
            this.renderCustomerTable(this.allCustomers);
        } catch(e) {
            console.error("Error fetching users:", e);
        }
    },

    renderStaffTable(staffList) {
        const tbody = document.querySelector('#settings-staff-table tbody');
        if(!tbody) return;
        
        if(staffList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #a0a0a0;">No staff found.</td></tr>`;
            return;
        }

        tbody.innerHTML = staffList.map(s => {
            let displayName = s.firstName || s.lastName ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : s.username || s.email;
            let subDisplay = s.employeeId ? `EMP ID: ${s.employeeId} | ${s.email}` : s.email;
            return `
            <tr>
                <td>
                    <strong>${displayName}</strong><br>
                    <span style="font-size: 0.8rem; color: #a0a0a0;">${subDisplay}</span>
                </td>
                <td><span class="badge ${s.role === 'admin' ? 'completed' : 'active'}">${s.role}</span></td>
                <td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                    <button type="button" class="btn-icon" title="Edit Profile" onclick="companySettings.showEditUserModal('${s.uid}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #a29bfe;">edit</span></button>
                    <button type="button" class="btn-icon" title="Reset Password" onclick="companySettings.showAdminPasswordResetModal('${s.uid}', '${s.email}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #fdcb6e;">lock_reset</span></button>
                    <button type="button" class="btn-icon" title="Delete User" onclick="companySettings.deleteUser('${s.uid}', '${s.email}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #ff7675;">delete</span></button>
                </td>
            </tr>
            `;
        }).join('');
    },

    renderCustomerTable(customerList) {
        const tbody = document.querySelector('#settings-customer-table tbody');
        if(!tbody) return;
        if(customerList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #a0a0a0; padding: 20px;">No customers found.</td></tr>`;
            return;
        }

        tbody.innerHTML = customerList.map(c => `
            <tr>
                <td>
                    <strong>${c.firstName ? `${c.firstName} ${c.lastName || ''}` : (c.phone || c.email || 'Unknown')}</strong><br>
                    <small style="color:#a0a0a0">${c.email || ''}</small>
                </td>
                <td><span class="badge active">client</span></td>
                <td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                    <button type="button" class="btn-icon" title="Edit" onclick="companySettings.showEditUserModal('${c.uid}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #a29bfe;">edit</span></button>
                    <button type="button" class="btn-icon" title="Delete" onclick="companySettings.deleteUser('${c.uid}', '${c.phone || c.email}')"><span class="material-symbols-outlined" style="font-size: 1.1rem; color: #ff7675;">delete</span></button>
                </td>
            </tr>
        `).join('');
    },

    async sendResetEmail(email) {
        if(!email) return;
        if(confirm(`Send a password reset email to ${email}?`)) {
            try {
                await window.fbAuth.sendPasswordResetEmail(email);
                this.showMessage(`Password reset email sent successfully to ${email}.`, true);
            } catch (e) {
                console.error(e);
                this.showMessage(`Error sending reset: ${e.message}`, false);
            }
        }
    },

    showEditRoleModal(uid, currentRole, email) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div class="modal-header" style="justify-content: center;">
                    <span class="material-symbols-outlined" style="font-size: 40px; color: #a29bfe; margin-bottom: 8px;">manage_accounts</span>
                </div>
                <div class="modal-body">
                    <h2>Edit User Role</h2>
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">Updating access level for<br><strong>${email}</strong></p>
                    
                    <form onsubmit="companySettings.handleUpdateRole(event, '${uid}')">
                        <div class="form-group" style="text-align: left;">
                            <label>System Role</label>
                            <select id="edit-user-role" class="form-control" style="appearance: auto;" required>
                                <option value="technician" ${currentRole === 'technician' ? 'selected' : ''}>Technician (Jobs & Inventory Only)</option>
                                <option value="frontdesk" ${currentRole === 'frontdesk' ? 'selected' : ''}>Frontdesk (Invoices & Quotes)</option>
                                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin (Full Access & Settings)</option>
                                <option value="client" ${currentRole === 'client' ? 'selected' : ''}>Client (Demote to Portal Only)</option>
                            </select>
                        </div>
                        <div class="modal-footer" style="justify-content: center; margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Update Role</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleUpdateRole(e, uid) {
        e.preventDefault();
        const newRole = document.getElementById('edit-user-role').value;
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerText = "Applying...";

        try {
            await window.fbDb.collection("users").doc(uid).update({ role: newRole });
            app.closeModal();
            this.showMessage(`User role dynamically updated to ${newRole}.`, true);
            this.fetchUsers();
        } catch(err) {
            console.error(err);
            alert("Error updating user: " + err.message);
            btn.disabled = false; btn.innerText = "Update Role";
        }
    },

    showCreateStaffModal() {
        const autoEmpId = 'EMP-' + Math.floor(1000 + Math.random() * 9000);
        
        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Create Staff Member</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #fdcb6e; font-size: 0.85rem; background: rgba(253, 203, 110, 0.1); padding: 8px; border-radius: 4px; margin-bottom: 16px;">
                        Staff will be created with a temporary password. They can use the reset link later.
                    </p>
                    <form onsubmit="companySettings.handleCreateStaff(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" id="new-staff-fn" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" id="new-staff-ln" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Username <span style="font-size: 0.7rem; color: #a0a0a0;">(For login)</span></label>
                                <input type="text" id="new-staff-un" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Employee ID</label>
                                <input type="text" id="new-staff-ei" class="form-control" value="${autoEmpId}" readonly style="background: rgba(0,0,0,0.1); cursor: not-allowed; color: var(--text-secondary);">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="new-staff-email" class="form-control" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Temporary Password</label>
                                <input type="text" id="new-staff-pwd" class="form-control" value="Welcome123!" required>
                            </div>
                            <div class="form-group">
                                <label>Initial Role</label>
                                <select id="new-staff-role" class="form-control" required style="appearance: auto;">
                                    <option value="technician">Technician</option>
                                    <option value="frontdesk">Frontdesk</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" id="btn-create-staff">Create Staff</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleCreateStaff(e) {
        e.preventDefault();
        const email = document.getElementById('new-staff-email').value;
        const pwd = document.getElementById('new-staff-pwd').value;
        const role = document.getElementById('new-staff-role').value;
        const firstName = document.getElementById('new-staff-fn').value;
        const lastName = document.getElementById('new-staff-ln').value;
        const username = document.getElementById('new-staff-un').value;
        const employeeId = document.getElementById('new-staff-ei').value;
        
        const btn = document.getElementById('btn-create-staff');
        
        btn.disabled = true; btn.innerText = "Creating...";

        try {
            if (typeof window.localAuth !== 'undefined') {
                // We are using the local-db adapter. Use the dedicated backend endpoint.
                await window.safeFetch(`${window.API_BASE || '/api'}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password: pwd, role, firstName, lastName, username, employeeId })
                });
            } else {
                // Real Firebase flow
                if(!this.secondaryApp) this.initSecondaryApp();
                const secAuth = this.secondaryApp.auth();
                const userCredential = await secAuth.createUserWithEmailAndPassword(email, pwd);
                const newUid = userCredential.user.uid;

                await window.fbDb.collection("users").doc(newUid).set({
                    uid: newUid,
                    email: email,
                    role: role,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                await secAuth.signOut();
            }

            app.closeModal();
            this.showMessage(`Staff member ${email} created!`, true);
            this.fetchUsers();
        } catch (error) {
            alert(`Error creating staff: ${error.message}`);
            btn.disabled = false; btn.innerText = "Create Staff";
        }
    },

    showCreateCustomerModal() {
        // Simple manual creation
        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Manual Customer Entry</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="companySettings.handleCreateCustomer(event)">
                        <div class="form-group">
                            <label>Name / Company</label><input type="text" id="new-cust-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Phone Number</label><input type="tel" id="new-cust-phone" class="form-control" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0" required>
                        </div>
                        <div class="form-group">
                            <label>Email Address</label><input type="email" id="new-cust-email" class="form-control">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Save Profile</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleCreateCustomer(e) {
        e.preventDefault();
        const name = document.getElementById('new-cust-name').value;
        const phone = document.getElementById('new-cust-phone').value;
        const email = document.getElementById('new-cust-email').value;

        try {
            await window.fbDb.collection("users").add({
                firstName: name,
                phone: phone,
                email: email,
                role: 'client',
                isManualEntry: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            app.closeModal();
            this.showMessage(`Customer ${name} profile saved.`, true);
            this.fetchUsers();
        } catch(error) {
            console.error(error);
            alert(`Error: ${error.message}`);
        }
    },

    showEditUserModal(uid) {
        const user = [...this.allStaff, ...this.allCustomers].find(u => u.uid === uid);
        if(!user) return;

        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Edit User Profile</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="companySettings.handleUpdateUser(event, '${uid}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" id="edit-user-fn" class="form-control" value="${user.firstName || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" id="edit-user-ln" class="form-control" value="${user.lastName || ''}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="edit-user-un" class="form-control" value="${user.username || ''}">
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="edit-user-email" class="form-control" value="${user.email || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" id="edit-user-phone" class="form-control" value="${user.phone || ''}" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Role</label>
                                <select id="edit-user-role" class="form-control" required style="appearance: auto;">
                                    <option value="technician" ${user.role === 'technician' ? 'selected' : ''}>Technician</option>
                                    <option value="frontdesk" ${user.role === 'frontdesk' ? 'selected' : ''}>Frontdesk</option>
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    <option value="client" ${user.role === 'client' ? 'selected' : ''}>Client</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Employee ID</label>
                                <input type="text" id="edit-user-ei" class="form-control" value="${user.employeeId || ''}">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" id="btn-update-user">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleUpdateUser(e, uid) {
        e.preventDefault();
        const btn = document.getElementById('btn-update-user');
        btn.disabled = true; btn.innerText = "Saving...";

        const payload = {
            firstName: document.getElementById('edit-user-fn').value,
            lastName: document.getElementById('edit-user-ln').value,
            username: document.getElementById('edit-user-un').value,
            email: document.getElementById('edit-user-email').value,
            phone: document.getElementById('edit-user-phone').value,
            role: document.getElementById('edit-user-role').value,
            employeeId: document.getElementById('edit-user-ei').value
        };

        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/users/${uid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            app.closeModal();
            this.showMessage("User profile updated successfully.", true);
            this.fetchUsers();
        } catch(err) {
            alert("Error: " + err.message);
            btn.disabled = false; btn.innerText = "Save Changes";
        }
    },

    showAdminPasswordResetModal(uid, email) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Force Password Reset</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 16px;">Set a new password for <strong>${email}</strong>.</p>
                    <form onsubmit="companySettings.handleAdminResetPassword(event, '${uid}')">
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="text" id="admin-reset-pwd" class="form-control" required placeholder="Enter new password">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" id="btn-admin-reset-pwd">Update Password</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        app.showModal(modalHTML);
    },

    async handleAdminResetPassword(e, uid) {
        e.preventDefault();
        const pwd = document.getElementById('admin-reset-pwd').value;
        const btn = document.getElementById('btn-admin-reset-pwd');
        btn.disabled = true;

        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/users/admin-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, newPassword: pwd })
            });

            app.closeModal();
            this.showMessage("Password updated successfully.", true);
        } catch(err) {
            alert("Error: " + err.message);
            btn.disabled = false;
        }
    },

    async deleteUser(uid, label) {
        if(uid === window.authSystem.currentUser.uid) {
            alert("Error: You cannot delete your own account.");
            return;
        }

        if(!confirm(`Are you absolutely sure you want to delete ${label}?\n\nThis action cannot be undone and will remove all access immediately.`)) {
            return;
        }

        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/users/${uid}`, {
                method: 'DELETE'
            });

            this.showMessage(`User ${label} deleted successfully.`, true);
            this.fetchUsers();
        } catch(err) {
            this.showMessage(`Error deleting user: ${err.message}`, false);
        }
    },

    showMessage(msg, isSuccess) {
        const errEl = document.getElementById('settings-error-msg');
        const sucEl = document.getElementById('settings-success-msg');
        if(!errEl || !sucEl) return;
        errEl.classList.add('hidden');
        sucEl.classList.add('hidden');

        if(isSuccess) {
            sucEl.innerText = msg;
            sucEl.classList.remove('hidden');
            setTimeout(() => sucEl.classList.add('hidden'), 5000);
        } else {
            errEl.innerText = msg;
            errEl.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
};
