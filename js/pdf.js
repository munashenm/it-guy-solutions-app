window.pdfGenerator = {
    async getCompanyDetails() {
        const fallback = {
            name: "IT Guy Solutions",
            address: "",
            phone: "",
            whatsapp: "",
            email: "",
            website: "",
            logoUrl: ""
        };
        let data = null;
        if(window.fbDb) {
            try {
                const doc = await window.fbDb.collection("settings").doc("companyProfile").get();
                if(doc.exists) data = doc.data() || {};
            } catch(e) {
                console.error("Failed to load company profile for PDF", e);
            }
        }
        data = data || {};
        return {
            name: data.name || data.companyName || fallback.name,
            address: data.address || data.physicalAddress || fallback.address,
            phone: data.phone || data.contactNumber || fallback.phone,
            whatsapp: data.whatsapp || data.whatsApp || fallback.whatsapp,
            email: data.email || fallback.email,
            website: data.website || fallback.website,
            logoUrl: data.logoUrl || data.brandLogo || fallback.logoUrl
        };
    },

    async getDocumentSettings() {
        if(window.fbDb) {
            try {
                const doc = await window.fbDb.collection("settings").doc("documentSettings").get();
                if(doc.exists) return doc.data();
            } catch(e) {
                console.error("Failed to load document settings for PDF", e);
            }
        }
        return { pdfTemplate: 'modern' };
    },

    async getSystemSettings() {
        if(window.fbDb) {
            try {
                const doc = await window.fbDb.collection("settings").doc("systemSettings").get();
                if(doc.exists) return doc.data();
            } catch(e) {
                console.error("Failed to load system settings for PDF", e);
            }
        }
        return { vatRegistered: false, vatRate: 15, taxNo: "" };
    },

    async imgToBase64(url) {
        if(!url || url.trim() === '') return null;
        if(url.startsWith('data:image')) return url; // Already Base64
        try {
            // Use our local backend proxy to avoid CORS issues
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
            
            return new Promise((resolve, reject) => {
                const img = new Image();
                // When using a local proxy, we don't need crossOrigin if the proxy is the same origin
                img.onload = function() {
                    console.log("PDF: Proxy Image Loaded successfully");
                    const canvas = document.createElement('canvas');
                    canvas.width = this.naturalWidth;
                    canvas.height = this.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(this, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = (err) => {
                    console.error("PDF: Proxy Image load failed", url, err);
                    resolve(null);
                };
                img.src = proxyUrl;
            });
        } catch(e) {
            console.error("PDF: imgToBase64 exception", e);
            return null;
        }
    },

    async download(docType, docId, dataObj) {
        try {
            const { pdf, filename } = await this.generateInternal(docType, docId, dataObj);
            pdf.save(filename);
            console.log("PDF: Download triggered for", filename);
        } catch (e) {
            console.error("PDF Download Error:", e);
            alert("Failed to download PDF: " + e.message);
        }
    },

    async print(docType, docId, dataObj) {
        try {
            const { pdf } = await this.generateInternal(docType, docId, dataObj);
            const blob = pdf.output('blob');
            const url = URL.createObjectURL(blob);
            
            // Use hidden iframe for "Popup" style printing
            let iframe = document.getElementById('pdf-print-iframe');
            if(!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'pdf-print-iframe';
                iframe.style.cssText = 'position:fixed; top:0; left:0; width:1000px; height:1400px; border:none; visibility:hidden; z-index:-9999;';
                document.body.appendChild(iframe);
            }
            
            iframe.src = url;
            iframe.onload = () => {
                setTimeout(() => {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                    // Revoke URL after a delay to ensure print dialog is handled
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                }, 500);
            };
        } catch (e) {
            console.error("PDF Print Error:", e);
            alert("Failed to open print dialog: " + e.message);
        }
    },

    async generate(docType, docId, dataObj) {
        // Legacy support
        return this.download(docType, docId, dataObj);
    },

    async generateInternal(docType, docId, dataObj) {
        dataObj = dataObj || {};
        console.log("PDF: Starting internal generation for", docId);
        // 1. Setup the "Visible Rendering Overlay" to force the browser to paint properly
        const overlay = document.createElement('div');
        overlay.id = 'pdf-generation-overlay';
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0,0,0,0.85) !important;
            z-index: 999999 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            padding-top: 40px !important;
            overflow-y: auto !important;
        `;

        const loader = document.createElement('div');
        loader.innerHTML = `
            <div style="text-align: center; color: white; margin-bottom: 20px; font-family: 'Outfit', sans-serif;">
                <h2 style="margin: 0; font-size: 24px;">Preparing ${docType}...</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.8; font-size: 14px;">Generating high-fidelity document. Please wait.</p>
            </div>
            <div class="spinner" style="margin: 0 auto 30px auto; width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #6c5ce7; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <style id="pdf-gen-styles">
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                #pdf-render-page * { 
                    -webkit-print-color-adjust: exact; 
                    print-color-adjust: exact; 
                    transition: none;
                    animation: none;
                    text-rendering: optimizeLegibility;
                }
            </style>
        `;
        overlay.appendChild(loader);
        document.body.appendChild(overlay);

        // 2. Create the white page container 
        const container = document.createElement('div');
        container.id = 'pdf-render-page';
        container.style.cssText = `
            background-color: #ffffff;
            color: #000000;
            width: 794px;
            min-height: 0;
            height: auto;
            padding: 28px;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            position: absolute;
            left: -10000px;
            top: 0px;
            z-index: -9999;
            overflow: visible;
            max-width: 794px !important;
        `;
        document.body.appendChild(container);

        try {
            const company = await this.getCompanyDetails();
            const docSettings = await this.getDocumentSettings();
            const sysSettings = await this.getSystemSettings();
            const template = docSettings.pdfTemplate || 'modern';
            const isVatRegistered = sysSettings.vatRegistered === true;

            let themeColor = '#6c5ce7'; 
            let accentColor = '#f9f9ff';
            let fontStack = "'Outfit', sans-serif";

            if(template === 'classic') {
                themeColor = '#2d3436'; 
                accentColor = '#f1f2f6';
                fontStack = "'Georgia', serif";
            } else if(template === 'minimal') {
                themeColor = '#000000';
                accentColor = '#ffffff';
                fontStack = "Arial, sans-serif";
            }

            let visualDocId = docId;
            if(docType === 'Invoice' && docSettings.invPrefix) visualDocId = docSettings.invPrefix + docId;
            if(docType === 'Quotation' && docSettings.quoPrefix) visualDocId = docSettings.quoPrefix + docId;

            const companyLogoBase64 = company.logoUrl ? await this.imgToBase64(company.logoUrl) : null;

            // Header section (common for all types except pure reports)
            const headerHTML = `
                <table style="width: 100%; border-bottom: 4px solid ${themeColor}; border-collapse: collapse; margin-bottom: 35px; background-color: #ffffff; font-family: ${fontStack}; color: #000000;">
                    <tr>
                        <td style="vertical-align: top; padding-bottom: 25px; background-color: #ffffff;">
                            ${companyLogoBase64
                                ? `<img src="${companyLogoBase64}" style="max-width: 220px; max-height: 100px; margin-bottom: 15px;">` 
                                : `<h2 style="color: ${themeColor}; font-size: 32px; margin: 0 0 10px 0; font-weight: 800;">${company.name}</h2>`
                            }
                            <div style="font-size: 13px; color: #000000; line-height: 1.6;">
                                ${company.address ? `<span style="display: block; margin-bottom: 4px;">${company.address}</span>` : ''}
                                ${[['Tel', company.phone], ['WA', company.whatsapp]].filter((pair) => pair[1]).map((pair) => `<strong>${pair[0]}:</strong> ${pair[1]}`).join(' | ')}
                                ${(company.phone || company.whatsapp) ? '<br>' : ''}
                                ${[['Email', company.email], ['Web', company.website]].filter((pair) => pair[1]).map((pair) => `<strong>${pair[0]}:</strong> ${pair[1]}`).join(' | ')}
                                ${isVatRegistered && sysSettings.taxNo ? `<br><strong>VAT No:</strong> ${sysSettings.taxNo}` : ''}
                            </div>
                        </td>
                        <td style="vertical-align: top; text-align: right; padding-bottom: 25px; background-color: #ffffff;">
                            <h1 style="color: ${themeColor}; font-size: 42px; margin: 0; text-transform: uppercase; font-weight: 900; line-height: 1;">${docType}</h1>
                            <div style="font-size: 15px; color: #000000; margin-top: 15px; line-height: 1.6;">
                                <div style="margin-bottom: 5px;"><strong>Ref #:</strong> <span style="font-size: 18px; color: ${themeColor};">${visualDocId}</span></div>
                                <div style="margin-bottom: 5px;"><strong>Date:</strong> ${dataObj.date || new Date().toLocaleDateString()}</div>
                                ${dataObj.dateBooked ? `<div style="margin-bottom: 5px;"><strong>Booked: </strong> ${dataObj.dateBooked}</div>` : ''}
                            </div>
                        </td>
                    </tr>
                </table>
            `;

            let contentHTML = '';
            
            if (docType === 'Job Report') {
                const report = (dataObj && dataObj.kind && dataObj.workPerformed !== undefined && window.ItguyFixes)
                    ? dataObj
                    : (window.ItguyFixes ? window.ItguyFixes.buildJobReport(dataObj, dataObj && dataObj.device ? 'Workshop' : 'Field') : { id: docId });
                contentHTML = headerHTML + (window.ItguyFixes ? window.ItguyFixes.renderJobReportHtml(report) : '<p style="color:#111">Job report unavailable.</p>');
            } else if (docType === 'Report') {
                // Special handling for reports: Use cloned visual content
                const reportContent = document.getElementById('report-view-content');
                if(reportContent) {
                    const clone = reportContent.cloneNode(true);
                    // Ensure white background on cards for printing
                    clone.querySelectorAll('.glass-card').forEach(c => {
                        c.style.background = '#f9f9ff';
                        c.style.color = '#000';
                        c.style.borderColor = '#eee';
                    });
                    contentHTML = `
                        <div style="font-family: ${fontStack};">
                            <h2 style="color: ${themeColor}; margin-bottom: 20px;">Execution Summary Report</h2>
                            ${clone.innerHTML}
                        </div>
                    `;
                } else {
                    contentHTML = `<div style="padding: 40px; text-align: center;">Error: No report content visible to generate PDF.</div>`;
                }
            } else {
                const clientHTML = `
                    <div style="background-color: ${accentColor}; padding: 25px; border-radius: 12px; margin-bottom: 40px; border-left: 6px solid ${themeColor}; font-family: ${fontStack}; color: #000000; border-top: 1px solid #eee; border-right: 1px solid #eee; border-bottom: 1px solid #eee;">
                        <h3 style="font-size: 11px; margin-top: 0; margin-bottom: 12px; color: ${themeColor}; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Client Details</h3>
                        <div style="display: flex; justify-content: space-between;">
                            <div style="font-size: 15px; color: #000000; line-height: 1.7;">
                                <strong style="font-size: 20px; color: #000000; display: block; margin-bottom: 5px;">${dataObj.customer || dataObj.client || 'Valued Customer'}</strong>
                                ${dataObj.address ? `<span style="display: block; color: #000000;">${dataObj.address}</span>` : ''}
                                ${dataObj.email ? `<span style="display: block; color: #000000;">${dataObj.email}</span>` : ''}
                                ${dataObj.phone ? `<span style="display: block; color: #000000;">${dataObj.phone}</span>` : ''}
                                ${(dataObj.vat || dataObj.vatNumber) ? `<span style="display: block; color: #000000;"><strong>VAT No:</strong> ${dataObj.vat || dataObj.vatNumber}</span>` : ''}
                                ${dataObj.regNo ? `<span style="display: block; color: #000000;"><strong>Reg #:</strong> ${dataObj.regNo}</span>` : ''}
                            </div>
                            ${dataObj.device ? `
                            <div style="font-size: 13px; color: #000000; text-align: right; background-color: #ffffff; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; width: 220px;">
                                <strong style="color: ${themeColor}; display: block; margin-bottom: 5px; font-size: 11px; text-transform: uppercase;">Hardware Details:</strong>
                                <span style="color: #000000; font-weight: 600;">${dataObj.device}</span>
                            </div>` : ''}
                        </div>
                    </div>
                `;

                let bodyHTML = '';
                if (docType === 'Invoice' || docType === 'Quotation' || docType === 'Cash Receipt') {
                    bodyHTML = `
                        <table style="width: 100% !important; border-collapse: separate; border-spacing: 0; margin-bottom: 40px; font-size: 14px; font-family: ${fontStack}; color: #000000; background-color: #ffffff; border: 1px solid #eee; border-radius: 10px; table-layout: fixed;">
                            <thead>
                                <tr class="pdf-on-accent" style="background-color: ${themeColor}; color: #ffffff;">
                                    <th class="pdf-on-accent" style="padding: 12px 10px; text-align: left; font-weight: 600; width: 110px; color:#ffffff;">Item</th>
                                    <th style="padding: 18px 15px; text-align: left; width: auto; font-weight: 600; word-wrap: break-word;">Description</th>
                                    <th style="padding: 18px 15px; text-align: right; font-weight: 600;">Price</th>
                                    <th style="padding: 18px 15px; text-align: center; font-weight: 600;">Qty</th>
                                    <th style="padding: 18px 15px; text-align: right; font-weight: 600;">Total</th>
                                </tr>
                            </thead>
                            <tbody style="background-color: #ffffff;">
                                ${dataObj.items && dataObj.items.length > 0 ? dataObj.items.map((item, idx) => {
                                    const unit = window.ItguyFixes ? window.ItguyFixes.moneyNumber(item.unit != null ? item.unit : item.unitPrice) : (parseFloat(item.unit || item.unitPrice) || 0);
                                    const qty = parseFloat(item.qty != null ? item.qty : item.quantity);
                                    const safeQty = isFinite(qty) ? qty : 0;
                                    const total = window.ItguyFixes ? window.ItguyFixes.lineTotal(unit, safeQty) : unit * safeQty;
                                    const descCell = window.ItguyFixes
                                        ? window.ItguyFixes.renderDescriptionCell(item.desc || item.description || item.name || '')
                                        : `<td class="pdf-desc" style="padding:15px;color:#111111;background:#ffffff;white-space:pre-wrap;">${item.desc || item.name || ''}</td>`;
                                    return `
                                        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfcff'}; border-bottom: 1px solid #f0f0f0;">
                                            <td style="padding: 12px 10px; border-bottom: 1px solid #eee; font-weight: 600; color: ${themeColor}; width: 110px; white-space: normal; word-wrap: break-word;">${item.type || 'Item'}</td>
                                            ${descCell}
                                            <td style="padding: 15px 15px; text-align: right; color: #000000;">R ${unit.toFixed(2)}</td>
                                            <td style="padding: 15px 15px; text-align: center; color: #000000;">${safeQty}</td>
                                            <td style="padding: 15px 15px; text-align: right; font-weight: 700; color: #000000;">R ${total.toFixed(2)}</td>
                                        </tr>
                                    `;
                                }).join('') : '<tr><td colspan="5" style="padding:20px; text-align:center;">No items added.</td></tr>'}
                            </tbody>
                        </table>
                        <div style="display: flex; justify-content: flex-end; margin-bottom: 45px; font-family: ${fontStack};">
                            <div style="width: 320px; text-align: right; background-color: ${accentColor}; padding: 25px; border-radius: 12px; color: #000000; border: 1px solid #eee;">
                                ${isVatRegistered ? `
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #000000;">
                                        <span>Subtotal:</span>
                                        <strong>${dataObj.subtotal || 'R ' + (parseFloat(dataObj.amount) / (1 + (sysSettings.vatRate/100))).toFixed(2)}</strong>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #000000;">
                                        <span>VAT (${sysSettings.vatRate}%):</span>
                                        <strong>${dataObj.vatAmount || 'Calculated at checkout'}</strong>
                                    </div>
                                    <div style="border-top: 1px solid #ddd; margin-bottom: 12px; padding-top: 12px;"></div>
                                ` : ''}
                                <div style="margin-bottom: 10px; font-size: 14px; color: #000000;">Total Amount Due</div>
                                <h2 style="font-size: 32px; color: #000000; margin: 0; font-weight: 900;">${dataObj.amount || ('R ' + (dataObj.total || 0).toFixed(2))}</h2>
                            </div>
                        </div>
                    `;
                } else if (docType === 'Job Card') {
                    bodyHTML = `
                        <div style="margin-bottom: 40px; border: 1px solid #e0e0e0; border-radius: 12px; padding: 25px; font-family: ${fontStack}; background-color: #ffffff; color: #000000;">
                            <h3 style="font-size: 14px; border-bottom: 3px solid ${themeColor}; padding-bottom: 12px; margin-top: 0; color: ${themeColor}; text-transform: uppercase;">Repair Scope / Fault Notes</h3>
                            <div style="font-size: 15px; color: #000000; line-height: 1.8; white-space: pre-wrap; margin-top: 20px;">${dataObj.description || dataObj.faultDescription || 'General diagnostic request.'}</div>
                            
                            <div style="margin-top: 30px; background-color: ${accentColor}; padding: 20px; border-radius: 10px;">
                                ${dataObj.accessories ? `<div style="font-size: 13px; color: #000000; margin-bottom: 10px;"><strong>Accessories:</strong> ${dataObj.accessories}</div>` : ''}
                                ${dataObj.devicePasscode ? `<div style="font-size: 13px; color: #000000;"><strong>Device PIN:</strong> <span style="font-family:monospace; background:#eee; padding:2px 4px;">${dataObj.devicePasscode}</span></div>` : ''}
                            </div>
                        </div>
                    `;
                } else if (docType === 'Statement') {
                    bodyHTML = `
                        <div style="margin-bottom: 30px; font-family: ${fontStack};">
                            <h3 style="font-size: 16px; border-bottom: 2px solid ${themeColor}; padding-bottom: 8px; color: ${themeColor};">Account Statement</h3>
                            <p style="font-size: 13px; color: #000;">Total Outstanding Balance: <strong style="font-size: 18px;">R ${dataObj.totalOutstanding.toFixed(2)}</strong></p>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 35px; font-size: 12px; color: #000; font-family: ${fontStack};">
                            <thead>
                                <tr style="background-color: ${accentColor}; border-bottom: 2px solid ${themeColor};">
                                    <th style="padding: 10px; text-align: left;">Reference</th>
                                    <th style="padding: 10px; text-align: left;">Date</th>
                                    <th style="padding: 10px; text-align: left;">Status</th>
                                    <th style="padding: 10px; text-align: right;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${dataObj.invoices.map(i => `
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="padding: 10px;">${i.id}</td>
                                        <td style="padding: 10px;">${i.date}</td>
                                        <td style="padding: 10px;"><span style="color: ${i.status === 'Paid' ? 'green' : 'red'};">${i.status}</span></td>
                                        <td style="padding: 10px; text-align: right;">${i.amount}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }

                let bankHTML = '';
                if ((docType === 'Invoice' || docType === 'Quotation') && docSettings.bankAcc) {
                    bankHTML = `
                        <div style="margin-top: 20px; border: 2px dashed ${themeColor}; padding: 20px; font-size: 12px; border-radius: 12px; background-color: #ffffff; font-family: ${fontStack};">
                            <strong style="color: ${themeColor}; text-transform: uppercase; display: block; margin-bottom: 8px;">Banking Information:</strong>
                            <div style="display: flex; justify-content: space-between;">
                                <div><strong>Bank:</strong> ${docSettings.bankName || 'N/A'}</div>
                                <div><strong>Holder:</strong> ${docSettings.bankHolder || 'N/A'}</div>
                                <div><strong>Account:</strong> ${docSettings.bankAcc || 'N/A'}</div>
                                <div><strong>Branch:</strong> ${docSettings.bankBranch || 'N/A'}</div>
                            </div>
                        </div>
                    `;
                }

                const chosenTerms = (window.ItguyFixes && window.ItguyFixes.documentTerms)
                    ? window.ItguyFixes.documentTerms(docType, docSettings)
                    : { text: '' };
                const termsText = (window.ItguyFixes && window.ItguyFixes.escapeHtml)
                    ? window.ItguyFixes.escapeHtml(chosenTerms.text).replace(/\n/g, '<br>')
                    : String(chosenTerms.text || '').replace(/\n/g, '<br>');
                const commercialDoc = docType === 'Invoice' || docType === 'Quotation';
                const signatureHTML = commercialDoc ? '' : `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
                            <div style="width: 45%; border-bottom: 1px solid #000; height: 70px; display: flex; align-items: flex-end; padding-bottom: 5px;">
                                ${dataObj.signatureBase64 ? `<img src="${dataObj.signatureBase64}" style="max-height: 60px;">` : '<span style="color:#000000;">Customer Signature</span>'}
                            </div>
                            <div style="width: 45%; border-bottom: 1px solid #000; height: 70px; display: flex; align-items: flex-end; padding-bottom: 5px;">
                                <span style="color:#000; font-weight:bold;">${dataObj.technician || 'Authorized Rep'}</span>
                            </div>
                        </div>`;

                const footerHTML = `
                    ${bankHTML}
                    <div style="margin-top: ${commercialDoc ? '18px' : '28px'}; border-top: 2px solid ${themeColor}; padding-top: 12px; font-family: ${fontStack}; color: #000000; background-color: #ffffff;">
                        ${signatureHTML}
                        <div class="pdf-terms" style="font-size: 9.5px; color: #111111; line-height: 1.35; column-count: 2; column-gap: 18px; text-align: left;">
                            <div style="font-weight: 700; margin-bottom: 4px; column-span: all;">Terms &amp; Conditions</div>
                            <div>${termsText}</div>
                        </div>
                        <div style="text-align: center; font-size: 9px; color: #333333; margin-top: 8px;">System generated on ${new Date().toLocaleString()}</div>
                    </div>
                `;
                contentHTML = headerHTML + clientHTML + bodyHTML + footerHTML;
            }

            container.innerHTML = contentHTML;

            // Dark theme paints table cells white. Force body copy to black before capture.
            container.querySelectorAll('td, p, li, .pdf-desc').forEach(c => {
                if (c.closest('thead')) return;
                c.style.color = '#111111';
                c.style.backgroundColor = c.style.backgroundColor || '#ffffff';
            });

            // Wait for fonts and stabilizing re-paint
            if(document.fonts) await document.fonts.ready;
            await new Promise(r => setTimeout(r, 300));

            const cssWidth = Math.max(container.scrollWidth, container.offsetWidth);
            const cssHeight = Math.max(container.scrollHeight, container.offsetHeight);
            const canvas = await window.html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                windowWidth: 1200,
                width: cssWidth,
                height: cssHeight,
                logging: false,
                onclone: (clonedDoc) => {
                    const clonedContainer = clonedDoc.getElementById('pdf-render-page');
                    if (clonedContainer) {
                        clonedContainer.style.left = '0';
                        clonedContainer.style.position = 'relative';
                    }
                }
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);

            // Real A4 pages. Short documents keep their height; long ones continue on the next page.
            const pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            if (window.ItguyFixes) {
                window.ItguyFixes.applyA4Plan(pdf, imgData, cssWidth, cssHeight, 'JPEG');
            } else {
                pdf.addImage(imgData, 'JPEG', 12, 12, 186, 186 * (canvas.height / canvas.width));
            }
            
            const filename = `${docType.replace(' ', '_')}_${docId}.pdf`;
            
            // Clean up
            if(container.parentNode) container.parentNode.removeChild(container);
            if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
            
            return { pdf, filename };

        } catch (e) {
            if(container.parentNode) container.parentNode.removeChild(container);
            if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
            throw e;
        }
    }
};
