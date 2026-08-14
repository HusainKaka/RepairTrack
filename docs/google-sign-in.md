# Google Sign-In configuration

RepairTrack uses Google Identity Services in the browser and Android Credential Manager on Android. Both clients send a Google ID token to `POST /api/v1/auth/google`; the backend verifies signature, issuer, expiry, and audience using `GOOGLE_WEB_CLIENT_ID`. No Google client secret belongs in either client application.

## Google Cloud Console

1. Create or select one Google Cloud project.
2. Open Google Auth Platform and configure Branding, Audience, and Data Access.
3. Provide application name, support email, authorized domains, developer contact, privacy policy, and terms URLs.
4. During development choose External/Test and add test users. Complete verification before public production use where required.
5. Create a Web application OAuth client.
6. Add JavaScript origins such as `http://localhost:5173` and the exact production web origin. RepairTrack uses ID tokens, so configure only the redirect URIs required by any hosted Google flow you add; do not invent wildcard URIs.
7. Put this Web client ID in:
   - backend `GOOGLE_WEB_CLIENT_ID`
   - web `VITE_GOOGLE_CLIENT_ID`
   - Android `repairtrack.googleWebClientId`

## Android client and fingerprints

Create Android OAuth clients for every signed application identity:

- Release package: `com.repairtrack.android`
- Debug package: `com.repairtrack.android.debug` (because the debug build has an application ID suffix)

Obtain debug fingerprints from `android/`:

```bash
./gradlew signingReport
```

Or with `keytool`:

```bash
keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android
```

Register both SHA-1 and SHA-256. For release, register fingerprints from the release/upload certificate and, when using Play App Signing, the Play app-signing certificate shown in Play Console. A package/fingerprint mismatch causes Credential Manager to return no eligible credential or Google to reject the request.

## Backend verification

The backend uses Google's verification library with the configured Web client ID as the accepted audience. It never accepts a client-provided email without verifying the ID token. Existing users are matched by verified email; new Google customers must supply a valid business context and are isolated to that tenant.

## Checklist

- Same Web client ID in backend, web, and Android server-client configuration
- Exact browser origins, including scheme/port
- Debug/release package names and SHA-1/SHA-256 registered
- Consent screen test users added before publication
- No OAuth client secret in `VITE_*`, `local.properties`, APK, or Git
- Production domain verified and privacy/terms pages reachable

For current Android implementation details, use the official [Credential Manager Sign in with Google guide](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation).
