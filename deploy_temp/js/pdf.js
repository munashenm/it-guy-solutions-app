window.pdfGenerator = {
    async getCompanyDetails() {
        if(window.fbDb) {
            try {
                const doc = await window.fbDb.collection("settings").doc("companyProfile").get();
                if(doc.exists) return doc.data();
            } catch(e) {
                console.error("Failed to load company profile for PDF", e);
            }
        }
        return {
            name: "IT Guy Solutions",
            address: "102 President Street, Louis Trichardt, Limpopo, South Africa",
            phone: "087 550 1813",
            whatsapp: "065 866 3103",
            email: "support@techguy.pl",
            website: "www.techguy.pl",
            logoUrl: ""
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
                iframe.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; border:none; visibility:hidden;';
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
            min-height: 1123px;
            padding: 40px;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            position: absolute;
            left: -10000px;
            top: 0px;
            z-index: -9999;
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
                                <span style="display: block; margin-bottom: 4px;">${company.address}</span>
                                <strong>Tel:</strong> ${company.phone} | <strong>WA:</strong> ${company.whatsapp}<br>
                                <strong>Email:</strong> ${company.email} | <strong>Web:</strong> ${company.website}${isVatRegistered && sysSettings.taxNo ? `<br><strong>VAT No:</strong> ${sysSettings.taxNo}` : ''}
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
            
            if (docType === 'Report') {
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
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 40px; font-size: 14px; font-family: ${fontStack}; color: #000000; background-color: #ffffff; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
                            <thead>
                                <tr style="background-color: ${themeColor}; color: #ffffff;">
                                    <th style="padding: 18px 15px; text-align: left; font-weight: 600;">Item</th>
                                    <th style="padding: 18px 15px; text-align: left; width: 45%; font-weight: 600;">Description</th>
                                    <th style="padding: 18px 15px; text-align: right; font-weight: 600;">Price</th>
                                    <th style="padding: 18px 15px; text-align: center; font-weight: 600;">Qty</th>
                                    <th style="padding: 18px 15px; text-align: right; font-weight: 600;">Total</th>
                                </tr>
                            </thead>
                            <tbody style="background-color: #ffffff;">
                                ${dataObj.items && dataObj.items.length > 0 ? dataObj.items.map((item, idx) => {
                                    const unit = parseFloat(item.unit || item.unitPrice) || 0;
                                    const qty = parseInt(item.qty) || 0;
                                    const total = unit * qty;
                                    return `
                                        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfcff'}; border-bottom: 1px solid #f0f0f0;">
                                            <td style="padding: 15px 15px; color: #000000; font-size: 12px;">${item.type || 'Item'}</td>
                                            <td style="padding: 15px 15px;"><strong style="color: #000000;">${item.desc || item.name}</strong></td>
                                            <td style="padding: 15px 15px; text-align: right; color: #000000;">R ${unit.toFixed(2)}</td>
                                            <td style="padding: 15px 15px; text-align: center; color: #000000;">${qty}</td>
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

                let termsText = 'Uncollected items will incur storage fees after 48 hours.';
                if (docType === 'Invoice' && docSettings.termsInvoice) termsText = docSettings.termsInvoice.replace(/\n/g, '<br>');
                if (docType === 'Quotation' && docSettings.termsQuote) termsText = docSettings.termsQuote.replace(/\n/g, '<br>');
                if (docType === 'Job Card' && docSettings.termsJob) termsText = docSettings.termsJob.replace(/\n/g, '<br>');

                const footerHTML = `
                    ${bankHTML}
                    <div style="margin-top: 50px; border-top: 3px solid ${themeColor}; padding-top: 25px; font-family: ${fontStack}; color: #000000; background-color: #ffffff;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 50px;">
                            <div style="width: 45%; border-bottom: 1px solid #000; height: 80px; display: flex; align-items: flex-end; padding-bottom: 5px;">
                                ${dataObj.signatureBase64 ? `<img src="${dataObj.signatureBase64}" style="max-height: 70px;">` : '<span style="color:#000000;">Customer Signature</span>'}
                            </div>
                            <div style="width: 45%; border-bottom: 1px solid #000; height: 80px; display: flex; align-items: flex-end; padding-bottom: 5px;">
                                <span style="color:#000; font-weight:bold;">${dataObj.technician || 'Authorized Rep'}</span>
                            </div>
                        </div>
                        <div style="text-align: center; font-size: 10px; color: #000000; line-height: 1.6;">
                            <div style="margin-bottom: 8px; font-weight: 600;">Terms & Conditions:</div>
                            <div style="max-width: 80%; margin: 0 auto 10px;">${termsText}</div>
                            <div>System generated on ${new Date().toLocaleString()}</div>
                        </div>
                    </div>
                `;
                contentHTML = headerHTML + clientHTML + bodyHTML + footerHTML;
            }

            container.innerHTML = contentHTML;

            // Universal Safety Pass: Convert absolutely ALL grey text to black for flawless print visibility on white paper across ALL document types
            container.querySelectorAll('*').forEach(c => {
                const computed = window.getComputedStyle(c);
                const color = computed.color || c.style.color || '';
                // Check if color is a shade of grey (e.g. #a0a0a0, rgb(160, 160, 160), #747d8c, etc)
                if (color.includes('160, 160, 160') || color.includes('116, 125, 140') || color.includes('a0a0a0') || c.tagName === 'P' || c.tagName === 'SPAN') {
                    // Ignore explicitly colored badges/themes
                    if(!color.includes('var(--success)') && !color.includes('var(--danger)') && !color.includes('var(--primary)')) {
                        // Force black text
                        c.style.color = '#000000';
                    }
                }
            });

            // Wait for fonts and stabilizing re-paint
            if(document.fonts) await document.fonts.ready;
            await new Promise(r => setTimeout(r, 2000));

            const canvas = await window.html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                windowWidth: 794
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            
            // Calculate proportional height to prevent squashing or cropping
            const actualWidth = 794;
            const actualHeight = (canvas.height * actualWidth) / canvas.width;
            
            // Use a dynamic page height so long reports don't get cut across awful page breaks
            const pdfPageHeight = Math.max(1123, actualHeight);
            
            const pdf = new window.jspdf.jsPDF('p', 'px', [actualWidth, pdfPageHeight]);
            pdf.addImage(imgData, 'JPEG', 0, 0, actualWidth, actualHeight);
            
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
