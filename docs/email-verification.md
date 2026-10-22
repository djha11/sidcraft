# Email verification and account recovery

Project Pulse requires a six-digit email OTP for every new account. OTP challenges are purpose-bound (`signup` or `password_reset`), HMAC-hashed at rest, expire after 10 minutes, are limited to five verification attempts, and can only be used once. Resends are limited to one per minute.

Password recovery returns the same response whether or not an account exists, preventing account enumeration. A successful reset replaces the password hash and revokes every existing refresh session.

Production delivery uses Resend when `RESEND_API_KEY` and `EMAIL_FROM` are configured. Development and test environments expose an OTP preview for local emulator testing; production responses never include the code.
