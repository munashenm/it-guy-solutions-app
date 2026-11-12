# IT Guy Staff (Android)

The Android app is a Capacitor wrapper around the live staff portal. It does not ship a second copy of the business logic. The WebView opens `https://app.itguysa.co.za`, so fixes to the website show up in the app without a store release. Native behaviour (camera, push registration, back button, external links, PDF share, and the offline screen) is injected by the app and also included in the website so it keeps working after the next web deploy.

| | |
| --- | --- |
| App name | IT Guy Staff |
| Package id | `za.co.itguysa.staff` |
| Project | `mobile/` |
| Colours | Background `#0f111a`, accent `#6c5ce7` (from `manifest.json`) |
| Icon | `img/icon.png` |

Nothing in this change is deployed. Production on cPanel stays as it is until you choose to ship the web and API changes.

## Prerequisites

- Node.js 22 (Node 18 or newer is enough for the API)
- JDK 21
- Android SDK 36, with build-tools 36
- A debug build does **not** need a Firebase project

```bash
export ANDROID_HOME="$HOME/android-sdk"   # wherever the SDK lives
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

## Debug APK

```bash
cd mobile
npm ci
npm run android:debug
```

`android:debug` copies `js/native-shell.js` and `lib/staff-shell.js` into `mobile/www`, runs `npx cap sync android`, then `./gradlew assembleDebug`.

The APK is:

`mobile/android/app/build/outputs/apk/debug/app-debug.apk`

It is signed with the Android debug keystore. That is enough for sideloading onto a phone. It is not the artifact you upload to Play.

GitHub Actions workflow `.github/workflows/android-debug.yml` runs `npm test` and builds this same debug APK on pull requests. The APK is uploaded as the `it-guy-staff-debug` artifact. The workflow does not need `google-services.json`.

## Release AAB for Google Play

1. Create an upload key and keep it outside git:

   ```bash
   keytool -genkeypair -v \
     -keystore itguy-staff-upload.keystore \
     -alias itguy-staff \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Copy `mobile/android/keystore.properties.example` to `mobile/android/keystore.properties`. Set `storeFile` to a path relative to the `android/` directory, or an absolute path. Set the two passwords and the alias. `keystore.properties`, `*.keystore`, and `*.jks` are gitignored.

3. Build the bundle:

   ```bash
   cd mobile
   npm ci
   npm run cap:sync
   cd android
   ./gradlew bundleRelease
   ```

   Output: `mobile/android/app/build/outputs/bundle/release/app-release.aab`

4. In Play Console, create the app with package name `za.co.itguysa.staff` and turn on **Play App Signing**. Upload the AAB. Google holds the app signing key. You keep the upload key from step 1. Losing the upload key means you cannot ship updates until Play support resets it, so store a copy somewhere safe.

5. The first upload will also need a privacy policy URL, content rating, and a data-safety form. Push notifications and photos are the pieces to declare: the app sends a device token to your API, and staff photos are saved on the job records you already store.

Bump `versionCode` (integer) and `versionName` in `mobile/android/app/build.gradle` for every Play upload.

## Firebase (required before real push works)

There is no Firebase project in this repo. Push stays off, and job saves still succeed, until both of the following exist.

### Android app config

1. In the [Firebase console](https://console.firebase.google.com), create a project (for example `it-guy-staff`).
2. Add an Android app with package name `za.co.itguysa.staff`. The debug SHA-1 is optional for Cloud Messaging. Add it later if you use other Firebase products.
3. Download `google-services.json` and place it at:

   `mobile/android/app/google-services.json`

   That path is gitignored. `google-services.json.example` shows the shape only. Do not commit the real file.
4. Rebuild the APK or AAB. Gradle applies the Google Services plugin only when that file exists. Without it, the debug APK still builds and the app does not try to talk to Firebase until registration runs.
5. In Firebase, open **Cloud Messaging** and confirm the **Firebase Cloud Messaging API (V1)** is enabled. The legacy server key is not used.

### Server credentials

1. In Firebase, go to **Project settings → Service accounts → Generate new private key**. This downloads a JSON file for a service account.
2. Put that file on the cPanel server, outside the web root, or paste it into the hosting environment. Do not commit it and do not put it in `mobile/`.
3. Set **one** of these environment variables for the Node app and restart Passenger:

   | Variable | Value |
   | --- | --- |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | The whole JSON object as a single line. Easiest when the panel only has text fields. |
   | `FIREBASE_SERVICE_ACCOUNT_PATH` | Absolute path to the JSON file on the server. |
   | `GOOGLE_APPLICATION_CREDENTIALS` | Same as the path option. Standard Google variable, also accepted. |

   The JSON must include `project_id`, `client_email`, and `private_key`. If none of the variables is set, or the JSON cannot be parsed, the sender logs an error and does nothing.

4. Deploy the API from this branch before expecting tokens to be stored. The new routes are not on production until you deploy them:

   - `POST /api/devices/push-token` with `{ "token", "platform": "android" }`
   - `GET /api/devices/push-tokens` (the signed-in user's tokens only)
   - `DELETE /api/devices/push-token`

   All three require `Authorization: Bearer <token>`. Tokens live in `device_tokens`, created on startup for both MySQL and SQLite the same way the other tables are.

The app asks for notification permission and registers with FCM only after a staff member is signed in, then posts the token to that endpoint. On sign-out it deletes that token. Assignment and status notifications are sent with the FCM HTTP v1 API (no `firebase-admin` dependency). A technician is notified when they are assigned to a workshop job or a field call / call-out, and when someone else changes that job's status. The person who made the change is not notified about their own edit. Invalid tokens reported by FCM are deleted.

## What the wrapper does

- **Camera.** Image file inputs (job completion photos, the workshop Photo button, expense receipts, the logo picker) open the native camera or gallery prompt inside the app. The chosen picture is placed on the existing `<input type="file">`, so the current upload code still reads `input.files`. Other file inputs, such as the SQLite restore picker, keep the WebView file chooser. `CAMERA` is in the manifest. Gallery access on Android 13+ uses the system picker.
- **Back button.** Closes an open sidebar, then a modal, then returns to the dashboard, then leaves the app.
- **Links.** `tel:`, `mailto:`, `sms:`, and WhatsApp (`wa.me`) leave the WebView and open the matching app. PDF links do the same.
- **PDFs.** Invoice, quotation, and job-report downloads and the print action open the Android share sheet (save, print, WhatsApp, mail). Ordinary `http(s)` downloads go to the Downloads folder through DownloadManager.
- **Offline.** If the live site cannot be loaded and there is no cached page, the bundled `offline.html` screen is shown, in the same colours as the PWA, with a retry button. After the updated `sw.js` is deployed, the WebView can open the cached app shell with no connection. Recent collection reads are kept per signed-in user in localStorage (photos and passwords are not stored in that cache). Writes to jobs and other collection records are queued on the device and sent when the connection returns. If a write cannot be queued, the app says it was **not** saved. A queued write is not silent: a banner stays on screen until it sends.

`/mobile` is not served by the Express static host.

## What was verified

- `npm test` passes, including the new device-token tests (401 without a session, 400 for a bad token, store and upsert per user, a second user cannot see the token, assignment and status events are recorded and skipped when Firebase is unset, delete removes the token) and the unit tests for the sender staying disabled when credentials are missing or unreadable.
- `./gradlew assembleDebug` succeeds **without** `google-services.json`.
- `aapt dump badging` on that APK reports package `za.co.itguysa.staff`, label `IT Guy Staff`, `minSdk 24`, `targetSdk 36`, and the camera, notification, and storage permissions above. The packaged Capacitor config points at `https://app.itguysa.co.za` with `errorPath` `offline.html`. No `google-services.json` is inside the APK.

## What is untested

- Installing or running the APK on a physical phone or emulator.
- A real FCM delivery, because there is no Firebase project and no service account.
- Whether Android's WebView on the phones you use actually serves the updated service worker for the first offline launch. The bundled offline screen does not depend on that.
- Play Console upload, release signing, and a signed AAB build (no upload keystore is in this environment).
- The live site at `https://app.itguysa.co.za` until you deploy. The APK injects the shell script into that site, but token storage and push delivery need the new API, and the improved service-worker shell needs the new `sw.js`.

## Risks

- This debug APK loads production. Do not treat a sideload as a sandbox. Job edits, photos, and assignments hit the live database once you are signed in.
- Until the API in this branch is deployed, push registration fails quietly and no tokens are stored. Job saves are unchanged.
- Until `sw.js` and `js/native-shell.js` are deployed, a phone that is offline on first launch sees the bundled offline screen rather than cached portal screens. After one online visit following that deploy, the shell can load from cache.
- Large completion photos can exceed localStorage. The queue then refuses the write and tells the staff member it was not saved.
- Notifications go to the assigned technician's registered devices, not to every office user.
- The debug APK must not be uploaded to Play. Use the release AAB and Play App Signing.
- Keep `google-services.json` and the service-account JSON out of git and out of the web root.
