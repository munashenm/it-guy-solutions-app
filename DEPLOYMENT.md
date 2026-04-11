# IT Guy Solutions - Production Deployment Guide
Target: **app.itguysa.co.za**

This document provides step-by-step instructions to finalize the deployment to your live server using the new MySQL-backed system.

## 1. Prepare the Deployment Package
We have created an automation script `deploy-itguy.ps1` that prepares a clean `itguy-deploy.zip` file. This ZIP includes the frontend, the updated backend, and the production `.env` file (pre-configured with your MySQL credentials).

**To generate the ZIP:**
1. Open PowerShell in the project directory.
2. Run: `.\deploy-itguy.ps1`

## 2. Database Setup (MySQL)
Your production server must have a MySQL database named `itguy_prod` (or similar).

**Manual Setup Steps:**
1. Log in to your hosting control panel (e.g., cPanel/phpMyAdmin).
2. Create a new database: `itguy_prod`.
3. Create a new user: `itguy_admin` with password `a5ed594eb62a4b4a`.
4. Grant the user **ALL PRIVILEGES** to the database.
5. In phpMyAdmin, select the database and **Import** the following script from the ZIP's `backend/` folder:
   - `mysql-setup.sql`

## 3. Uploading Files
1. Use your FTP client (like FileZilla) to connect to `app.itguysa.co.za`.
2. Extract the `itguy-deploy.zip` locally.
3. Upload all extracted files to your public directory (usually `public_html`).

## 4. Starting the Backend
Your server needs **Node.js (v18+)** installed.

**If using a terminal (SSH):**
1. Navigate to the `backend/` folder on the server.
2. Run: `npm install --production` (to install dependencies).
3. Start the server using PM2 (recommended for production):
   - `pm2 start server.js --name "it-guy-api"`
   
**If using Passenger (cPanel):**
1. In the "Setup Node.js App" section of cPanel, set the application startup file to `backend/server.js`.
2. Ensure the "Application URL" matches your domain.
3. Click "Run JS Install".

## 5. Security & Verification
- **.htaccess**: This file is already configured to block direct access to your `.env` and `.sql` files.
- **Verification**: Once live, visit `https://app.itguysa.co.za/api/login` (it should return "Method Not Allowed" or an error if not POSTed, confirming the API is reachable).

---
**Need help?** If you encounter any "Internal Server Error" or database connection failures, check the server logs or run `node backend/test-db.js` on the server via terminal.
