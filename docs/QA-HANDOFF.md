# QA and deployment handoff

Branch: `cursor/staff-invoice-field-fixes-5b5f`
Pull request: https://github.com/munashenm/it-guy-solutions-app/pull/5
Final local close-out: 12 Nov 2026, 21:59 Europe/Warsaw

This is the saved local handoff. It is not a claim that the live site was tested. Nothing was merged, deployed, or written to production.

A copy of this file is also at `/opt/cursor/artifacts/QA-HANDOFF.md`.

## Seven fixes

1. Field technician assign/reassign on an existing call-out: accepted. Office staff can change it, it persists, technicians get 403.
2. Create Invoice does not close on a backdrop click. Escape, Cancel, and X ask before discarding unsaved details. Other modals still close from the backdrop.
3. Invoices started from a workshop job, field call, or quotation copy the stored customer and contact fields and keep the source job id.
4. PDFs are A4 (210 × 297 mm, content width 186 mm). A short invoice is 1 page. Ordinary rows continue onto the next page instead of being squeezed.
5. Descriptions are dark (`#111`) on white, including line breaks.
6. Job reports can be printed, downloaded, and emailed only after review. No SMTP means a clear failure, not a mailto link.
7. An admin can create a technician. Duplicates are rejected. The new person shows up for assignment. Synthetic accounts only.

## Final test results

`npm test` on 12 Nov 2026, 21:59 Europe/Warsaw: **16 passed, 0 failed.**

That includes a new round trip: download a real SQLite backup, add a record, restore the backup, log in again as admin, confirm the saved expense is back and the later expense is gone. A bad file is still rejected.

`node test/mysql-standalone.js`: **blocked on this machine.** The local MariaDB socket `/tmp/maria-qa.sock` is gone and the `mysql` client is not installed. The earlier run on 7 Nov 2026 did pass against MariaDB on `127.0.0.1:3307`, database `itguy_qa`: legacy users table migrated, technician created, assignment and invoice source fields persisted. That run was not repeated here.

Browser, throwaway SQLite at `http://127.0.0.1:3460`:

- Purchase order: created PO-1003 for Cable Co, the dialog said it was not emailed, Receive Stock increased Patch lead quantity by 1.
- Expense: logged “QA fuel”, R 40.00, and it appeared on the expenses screen.
- Analytics: the reports screen showed the synthetic R 100.00 invoice and R 40.00 expense.
- Phone width 390×844: after scrolling the content area, Complete Job sits above the bottom bar (button bottom 630, bar top 774). The 600px stylesheet had been resetting the content padding to 16px and covering the last buttons.

Invoice pagination, measured from the generator (not from a stretched screenshot):

- 28 ordinary one-line rows: CSS box 794 × 1782 px, placed at 186 × 417 mm, **2 A4 pages**.
- The earlier 4-page file used the app’s 20px/24px table padding on every print cell, which made each row about twice as tall. Print cells are now 6px 8px. Text is not clipped and the invoice was not forced onto one page.
- Short multiline invoice and the field job report remain 1 page each (from the previous measurement on this branch).

## Still blocked or not done

- Live cPanel and the production MySQL database.
- Repeating the MariaDB migration test in this environment (server data is gone).
- A real mailbox. The success test was a local SMTP capture only.
- WhatsApp delivery and the operating-system print dialog.
- A finger on a physical phone. Mobile was a 390px browser viewport.

## Deploy and rollback

Do this only after approval. Do not replace `.env`.

1. Back up the current app files and take a MySQL dump.
2. Copy this branch onto the Node app root.
3. Restart Passenger. Missing user columns are added on startup. No manual SQL import.
4. Hard-refresh. Asset links use `?v=4.9`. Check `/api/status`, then a synthetic technician assign, an invoice PDF, and a job report.
5. Do not email a real customer until Settings → Email has a working SMTP host.
6. Rollback: put the previous files back and restart. Leave the new columns and extra JSON fields; the older app ignores them.
7. The in-app Restore button is for SQLite only. Production MySQL must be restored from the host backup.
