# ASSET HUB Security Specification

## 1. Data Invariants
1. **Single Configured Administrator**: Only `sameeransari89368165@gmail.com` with `email_verified == true` may create, update, or delete categories, assets, asset sources, premium grants, or payment settings, and approve/reject UTR payment requests.
2. **Metadata & Original File Separation**: `/asset_sources/{assetId}` stores internal `storageKey` and `sha256` checksums and is strictly unreadable by any non-admin user.
3. **Published Visibility Gate**: Public queries on `/assets` are forced by rule-side `resource.data.published == true` evaluation; unpublished drafts are strictly restricted to the administrator.
4. **Parent Integrity**: Every `/assets/{assetId}` write must reference an existing `/categories/{categoryId}` document.
5. **PII Isolation**: `/premium_grants/{grantId}` and `/payment_requests/{requestId}` isolate emails and UTR records strictly to the administrator or the owning verified user.
6. **Temporal & State Integrity**: `createdAt` and `updatedAt` are strictly validated against `request.time`; new `/payment_requests` must initialize with `status == 'pending'` and `adminNote == ''` and cannot be self-approved by users.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Category Create**: Anonymous client attempts `setDoc(/categories/hack, ...)` -> DENIED.
2. **Non-Admin Verified User Asset Create**: Authenticated user `attacker@example.com` (`email_verified: true`) attempts `setDoc(/assets/a1, ...)` -> DENIED.
3. **Unverified Admin Email Spoof**: User with `email: sameeransari89368165@gmail.com` and `email_verified: false` attempts write -> DENIED.
4. **Shadow Field Injection on Asset Create**: Admin sends extra `isFeaturedHack: true` field not in `hasOnly(...)` -> DENIED.
5. **ID Poisoning**: Admin attempts `setDoc(/assets/../../etc/passwd, ...)` or 200-char invalid ID -> DENIED by `isValidId()`.
6. **Orphaned Category Reference**: Admin creates asset with `categoryId: "nonexistent-cat"` -> DENIED by `exists()`.
7. **Author UID Spoofing**: Admin creates asset or payment request with `authorUid` / `userUid` != `request.auth.uid` -> DENIED.
8. **Timestamp Forgery**: Client creates document with `createdAt` != `request.time` -> DENIED.
9. **Immutable Field Mutation**: Update modifies `createdAt`, `userUid`, `userEmail`, or `utrNumber` -> DENIED.
10. **Self-Approved Payment Request**: Signed-in user submits `/payment_requests/req1` with `status: 'approved'` -> DENIED.
11. **User Tampering Payment Settings**: Non-admin authenticated user attempts to overwrite `/app_settings/payment` with their own UPI ID -> DENIED.
12. **PII Grant & Payment Request Harvesting**: Non-admin user attempts `getDocs(collection(db, 'payment_requests'))` without filtering by `userUid == request.auth.uid` -> DENIED.
