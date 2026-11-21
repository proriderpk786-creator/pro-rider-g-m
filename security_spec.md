# PRO RIDER AI — Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership & Email Verification**: Every user document and subcollection requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Zero Self-Assigned Privilege Escalation**: `/users/{userId}` restricts `role` strictly to `passenger` or `partner`. `/admins/{adminUid}` denies all client writes.
3. **PII Isolation (Split Collection Strategy)**: `email`, `phone`, and `whatsapp` are isolated under `/users/{userId}/private/info`, strictly readable/writable only by `userId == request.auth.uid` or verified `isAdmin()`.
4. **Master Gate Relational Integrity**: Subcollections (`/savedPlaces`, `/aiThreads`, `/bookings`) require parent `/users/{userId}` to exist on create, and `/messages` requires parent `/users/{userId}/aiThreads/{threadId}` to exist on create.
5. **Immutable Audit Fields & Server Timestamps**: `uid` and `createdAt` cannot be modified post-create; `createdAt` and `updatedAt` must equal `request.time`.
6. **Bounded Resource Sizes**: Every string, ID (`^[a-zA-Z0-9_\-]+$`, `<= 128`), and array (`sources`/`places` `<= 10`) enforces upper bounds.
7. **Terminal Booking State Lock**: Once a synced booking reaches `completed` or `cancelled`, non-admin clients cannot mutate its status or fare.
8. **Secure List Queries**: Every `allow list` validates `resource.data.uid == request.auth.uid` (or `isAdmin()`) with zero `get()` lookups inside `list` rules.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return `PERMISSION_DENIED`)
1. **Cross-Tenant Read**: User B reads User A's `/users/{userA}/private/info`.
2. **Blanket User Scrape**: Signed-in User B calls `getDocs(collection(db, 'users'))` without ownership match.
3. **Privilege Escalation on Create**: Attacker creates `/users/{uid}` with `role: 'admin'`.
4. **Ghost / Shadow Field Injection**: Attacker creates `/users/{uid}` with extra `isVerifiedAdmin: true`.
5. **Admin Registry Tampering**: Attacker creates `/admins/{uid}` directly from client SDK.
6. **Email Verification Spoof**: User with `email: 'ProRider.pk786@gmail.com'` but `email_verified: false` reads `/users/{otherUid}/private/info`.
7. **ID Poisoning**: Attacker writes to `/users/{uid}/savedPlaces/invalid..slash$key` or 200-char ID.
8. **Timestamp Forgery**: Attacker creates `/users/{uid}/aiThreads/{tid}` with backdated client `createdAt`.
9. **Owner UID Spoof on Create**: Attacker creates `/users/{uid}/savedPlaces/{pid}` with `uid: 'victim-uid'`.
10. **Immutable Field Mutation**: Attacker updates `/users/{uid}/aiThreads/{tid}` changing `createdAt` or `uid`.
11. **Terminal Booking Tampering**: Attacker updates `/users/{uid}/bookings/{bid}` from `completed` back to `searching` or changes `farePkr`.
12. **Array / Payload Exhaustion**: Attacker writes `/users/{uid}/aiThreads/{tid}/messages/{mid}` with 15 `sources` items or a 20,000-char `text`.
