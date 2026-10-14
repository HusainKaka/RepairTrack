# Sign-in migration

Google sign-in is retired. The web login uses email and password; its Google widget, configuration notice, external script and API endpoint have been removed.

Existing accounts and their records are retained. A customer who previously used Google without a password can select **Forgot password** using the existing account email, receive an expiring reset link and set a password. This requires the existing SMTP delivery configuration.

Existing Google identity columns remain in the database for historical compatibility; they no longer permit sign-in. Google authentication libraries still support the separately configured Firebase push integration, not account sign-in.
