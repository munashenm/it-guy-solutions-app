const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 1. Initialize Firebase Admin
// You MUST place your Firebase serviceAccountKey.json file in this directory!
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error("❌ CRITICAL ERROR: serviceAccountKey.json not found!");
    console.error("Please go to Firebase Console > Project Settings > Service Accounts > Generate New Private Key");
    console.error("Rename the downloaded file to 'serviceAccountKey.json' and place it in this `backend` folder.");
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log("🚀 IT Guy Courier Service Started!");
console.log("Listening for database changes...");

// Caching system settings so we don't query it 100 times a second
let sysSettings = null;

// Listen to System Settings locally so the mailer always has the latest SMTP credentials
db.collection('settings').doc('systemSettings').onSnapshot(doc => {
    if (doc.exists) {
        sysSettings = doc.data();
        console.log("⚙️ System Settings (SMTP/WhatsApp) loaded/updated from Cloud.");
    }
});

// Helper: Configure SMTP Transporter
function getTransporter() {
    if(!sysSettings || !sysSettings.smtpHost) return null;
    return nodemailer.createTransport({
        host: sysSettings.smtpHost,
        port: parseInt(sysSettings.smtpPort) || 465,
        secure: sysSettings.smtpPort == '465', 
        auth: {
            user: sysSettings.smtpUser,
            pass: sysSettings.smtpPass
        }
    });
}

// Helper: Replace Template Tags
function formatMessage(template, customerName, deviceName, jobId, totalAmount) {
    if(!template) return '';
    return template
        .replace(/\[CustomerName\]/g, customerName || 'Customer')
        .replace(/\[DeviceName\]/g, deviceName || 'Device')
        .replace(/\[JobID\]/g, jobId || '')
        .replace(/\[TotalAmount\]/g, totalAmount || 'R 0.00');
}

// Helper: Send Email
async function sendEmail(toEmail, subject, textContent) {
    const transporter = getTransporter();
    if(!transporter) {
        console.log("⚠️ Cannot send email: SMTP not configured.");
        return;
    }
    try {
        await transporter.sendMail({
            from: `"${sysSettings.emailName || 'IT Guy Solutions'}" <${sysSettings.smtpUser}>`,
            to: toEmail,
            subject: subject,
            text: textContent
        });
        console.log(`✅ Email sent successfully to ${toEmail}`);
    } catch(err) {
        console.error(`❌ Failed to send email to ${toEmail}:`, err.message);
    }
}

// Helper: Send WhatsApp
async function sendWhatsApp(toPhone, textContent) {
    if(!sysSettings || !sysSettings.waToken || !sysSettings.waPhoneId) {
        console.log("⚠️ Cannot send WhatsApp: Token/PhoneID not configured.");
        return;
    }
    
    // Clean phone number (e.g. 082 -> 2782)
    let cleanedPhone = toPhone.replace(/\D/g, '');
    if(cleanedPhone.startsWith('0')) {
        cleanedPhone = '27' + cleanedPhone.substring(1); 
    }

    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${sysSettings.waPhoneId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: cleanedPhone,
                type: 'text',
                text: { body: textContent }
            },
            {
                headers: {
                    "Authorization": `Bearer ${sysSettings.waToken}`,
                    "Content-Type": "application/json"
                }
            }
        );
        console.log(`✅ WhatsApp sent successfully to ${cleanedPhone}`);
    } catch(err) {
        console.error(`❌ Failed to send WhatsApp to ${cleanedPhone}:`, err.response ? err.response.data : err.message);
    }
}

// -------------------------------------------------------------
// LISTENER: REPAIR JOBS
// -------------------------------------------------------------
db.collection('jobs').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        if (!sysSettings) return; // Settings not loaded yet

        const job = change.doc.data();
        const jobId = job.id;
        const email = job.email;
        const phone = job.phone;

        // NEW JOB CREATED (In Diagnosis)
        if (change.type === 'added' && job.status !== 'Completed' && job.status !== 'Collected') {
            
            // Check if Booked Email is Enabled
            if(sysSettings.enBookedEmail && email) {
                const text = formatMessage(sysSettings.tplBookedEmail, job.customer, job.device, jobId, '');
                sendEmail(email, "Device Booked In - IT Guy Solutions", text);
            }
            // Check if Booked WhatsApp is Enabled
            if(sysSettings.enBookedWA && phone) {
                const text = formatMessage(sysSettings.tplBookedWA, job.customer, job.device, jobId, '');
                sendWhatsApp(phone, text);
            }
        }

        // JOB UPDATED (Status Changed)
        if (change.type === 'modified') {
            // Because Firestore onSnapshot fires on any change, we normally keep a 'previous' state in the DB 
            // e.g. mapping lastNotifiedStatus = 'Ready For Collection'.
            // For simplicity, we check if it is Ready For Collection and if we haven't already stamped it as notified.
            
            if (job.status === 'Ready For Collection' && !job.notifiedReady) {
                // Send Ready Notifications!
                if(sysSettings.enReadyEmail && email) {
                    const text = formatMessage(sysSettings.tplReadyEmail, job.customer, job.device, jobId, 'Please check your Invoice Portal');
                    sendEmail(email, "Your Repair is Ready! - IT Guy Solutions", text);
                }
                
                if(sysSettings.enReadyWA && phone) {
                    const text = formatMessage(sysSettings.tplReadyWA, job.customer, job.device, jobId, 'Please check your Invoice Portal');
                    sendWhatsApp(phone, text);
                }

                // Prevent infinite loop by tagging the document
                change.doc.ref.update({ notifiedReady: true });
            }
        }
    });
});

// -------------------------------------------------------------
// LISTENER: QUOTATIONS
// -------------------------------------------------------------
db.collection('quotations').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        if (!sysSettings) return;

        const quo = change.doc.data();
        
        // NEW QUOTATION GENERATED
        if (change.type === 'added' && !quo.notifiedCreated) {
            
            if(sysSettings.enQuoteEmail && quo.email) {
                const text = formatMessage(sysSettings.tplQuoteEmail, quo.customer, quo.referenceId || quo.id, quo.id, quo.amount);
                sendEmail(quo.email, `Quotation ${quo.id} - IT Guy Solutions`, text);
            }
            
            if(sysSettings.enQuoteWA && quo.phone) {
                const text = formatMessage(sysSettings.tplQuoteWA, quo.customer, quo.referenceId || quo.id, quo.id, quo.amount);
                sendWhatsApp(quo.phone, text);
            }

            change.doc.ref.update({ notifiedCreated: true });
        }
    });
});
