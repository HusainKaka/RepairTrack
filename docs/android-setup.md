# Android setup and build

The Android project uses Kotlin 1.9.23, AGP 8.13.2, JDK 17, compile/target SDK 36, min SDK 26, Jetpack Compose/Material 3, Hilt, Retrofit/OkHttp, Room, DataStore, WorkManager, CameraX/ML Kit, Credential Manager, Firebase Messaging, and biometric APIs.

## Open the project

1. Install Android Studio and Android SDK Platform 36, build tools, platform tools, and an Android emulator with Google APIs.
2. Open the `android/` directory, not the monorepo root.
3. Select Android Studio's embedded JDK 17 for Gradle.
4. Let Gradle sync using the checked-in wrapper.

## Local properties

Create `android/local.properties`; it is ignored by Git:

```properties
sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk
repairtrack.apiUrl=http://10.0.2.2:4000/api/v1/
repairtrack.googleWebClientId=
repairtrack.firebaseApplicationId=
repairtrack.firebaseApiKey=
repairtrack.firebaseProjectId=
repairtrack.firebaseSenderId=
```

`10.0.2.2` reaches the development computer from the standard emulator. A physical device needs an HTTPS-reachable host or a development LAN address; Android's network policy permits cleartext only to emulator loopback aliases. Always use HTTPS outside local emulator development.

The Firebase values are Android client configuration identifiers, not service-account secrets. Backend service-account values belong only in backend environment secrets.

## Build and test

PowerShell:

```powershell
./gradlew.bat clean assembleDebug testDebugUnitTest lintDebug
```

macOS/Linux:

```bash
./gradlew clean assembleDebug testDebugUnitTest lintDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

Run the Compose instrumentation test with a booted target:

```bash
./gradlew connectedDebugAndroidTest
```

## Security and offline behavior

- `FLAG_SECURE` blocks screenshots/screen recording of the app window.
- Access token, refresh cookie, and user session JSON are encrypted using an AES-GCM key generated in Android Keystore.
- Passwords are never persisted.
- OkHttp logs only basic request metadata in debug and redacts authorization/cookies.
- Room caches repairs and inventory. Network failures can queue repair status/note mutations; WorkManager retries on connectivity.
- Payments, invoices, and other critical financial writes are not queued offline.
- Release builds enable R8 shrinking and obfuscation.

## Google, Firebase, camera, and notifications

Follow [Google Sign-In](google-sign-in.md) for OAuth clients/SHA fingerprints. The app uses Credential Manager and sends the returned ID token to the backend for audience/signature verification.

For Firebase, create an Android app for `com.repairtrack.android` (and optionally the `.debug` application ID). Copy its non-secret identifiers to `local.properties`, enable the Cloud Messaging API, and configure backend `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` from a narrowly controlled service account. The current Firebase Messaging flow registers and uploads the Firebase Installation ID (FID); the backend addresses that FID through the HTTP v1 API. On Android 13+, accept notification permission when prompted by the app flow/platform.

Camera permission is requested only on the QR scanner screen. The scanner accepts `https://host/track/<random-token>`, `repairtrack://track/<random-token>`, or a standalone random token; database IDs are rejected.

## Thermal printing

Bluetooth printing requires a paired ESC/POS device and, on Android 12+, `BLUETOOTH_CONNECT` permission. Select 58mm or 80mm in the receipt screen.

For Wi-Fi/LAN printers, select Wi-Fi/LAN and enter the printer IP/hostname plus raw TCP port (commonly `9100`). The phone and printer must share a reachable network. The app retrieves the current invoice/repair status from the API before rendering the receipt when online.

## Release signing

Create a release keystore outside the repository and never commit it. Configure signing using local Gradle properties or CI secrets, then build:

```bash
./gradlew bundleRelease
```

Upload the generated AAB to Play Console internal testing first. Store/upload-key backups securely, enable Play App Signing, complete Data Safety disclosures, privacy policy, content rating, screenshots, and production API/FCM configuration.
