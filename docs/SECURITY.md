# Security and trust boundaries

This is a controlled local demonstration, not an audited deployment.

| Threat | Implemented control | Remaining limitation |
| --- | --- | --- |
| Unauthorized issue or revocation | Event organizer checks | The organizer key is trusted and cannot be rotated in this version |
| Unauthorized ticket transfer | Current owner check | Lost owner keys have no recovery process |
| Old owner attempts admission | Owner change and authorization clearing | Whoever controls the current wallet controls the ticket |
| Repeated admission | Atomic Active to Used state change | Network outages require an operational policy; offline entry is not implemented |
| Gate redeems without owner permission | Owner grants one specific gate a short-lived permission | The gate can redeem during that period without proving physical attendance |
| Gate permission misuse | Event-scoped gate role checked at redemption | A compromised organizer can appoint a malicious gate |
| Stale authorization | Expiry and explicit cancellation, clearing on transfer/revocation | Pending cancellations take effect only once included in a block |
| Personal data leakage | No names, phone numbers or other personal fields | Wallet addresses and relationships are visible; use fictional local accounts only |

Any account can create an event in this local prototype. Global event and ticket identifiers
can therefore be occupied first by another account. Real multi-tenant operation would require
organizer onboarding and namespaced or generated identifiers. Do not claim public-network
readiness or protection against identifier squatting.

Organizers are trusted to describe real events and can revoke an active ticket even after
transfer. Blockchain cannot establish whether an event exists or took place. The prototype
does not process payments or refunds and makes no external contract calls. Reentrancy on
payment release is therefore not a relevant implemented payment risk in this version.

Entry permission is a temporary capability, not a QR screenshot authenticity guarantee.
A malicious authorized gate can act before a pending cancellation transaction confirms.
UI design must show confirmed state and the remaining authorization period.

Production considerations would include key rotation or multisignature governance, organizer
onboarding, identity/privacy design, physical gate procedures, incident recovery and an
independent audit. Their costs must be estimated in the financial plan, not described as
already paid or implemented.
