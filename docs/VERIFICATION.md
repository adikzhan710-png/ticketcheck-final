# Local verification

Verified on 12 November 2026 in the Windows workspace using Node.js 24.15.0,
Hardhat 3.22.0 and Solidity 0.8.28 (Cancun EVM target).

| Check | Observed result |
| --- | --- |
| Solidity compilation | 1 contract compiled successfully |
| Contract tests | 17 passed, 0 failed |
| Demo | Deploy, issue, transfer, old-owner rejection, owner-authorized entry and duplicate-entry rejection passed |
| TypeScript | `tsc --noEmit` exited successfully |
| Manual adversarial review | Gate reappointment could revive permission; fixed with per-gate epoch and covered by a passing regression test |

Tests ran against Hardhat's in-process local EVM, not a public blockchain. No wallet
keys, real funds, real customers or personal data were used.

## Windows verification environment

Native asynchronous `fs.promises.realpath` returned EPERM for readable local files
in this execution environment. The verification process loaded a small compatibility
module that falls back to the normal synchronous `fs.realpathSync` only for that
Windows error. It still resolves and checks the real path. No dependency source or
contract code was patched to suppress failures. The compiler is pinned as an npm
dependency and configured by local path, avoiding a separate compiler-cache download.

Reproduce the compatibility run from the project directory:

```powershell
./scripts/check-windows.ps1
```

Normal environments can use the ordinary npm commands from README.

## Open findings

`npm audit` reported 9 development dependency findings: 8 high and 1 low,
including inherited reports through Zod and tmp. No forced major-version downgrade
or incompatible override was applied. This is not a clean security audit; dependency
review remains before any deployment beyond the local educational demonstration.

The report counts dependency entries, not nine independently demonstrated exploits
in TicketCheck. Identifier squatting, immutable organizer keys and physical gate
trust remain documented prototype limitations in SECURITY.md.

## Local interface update

Added a Russian browser interface and a Node HTTP server bound to 127.0.0.1:4317.
Every action calls the deployed contract in the in-process local Hardhat network.
The server controls all fictional role accounts; this is a demonstration console,
not user authentication or a wallet integration.

Verified the HTTP workflow with `node scripts/check-ui.mjs`: issue, transfer,
old-owner rejection, stale authorization clearing, owner-authorized admission,
duplicate-admission rejection, revocation, reset, cross-origin write rejection and
invalid JSON handling. TypeScript checking passed after adding the server.

Verified the visible browser buttons end to end: issued to Alice, transferred to
Bob, rejected Alice's entry permission, accepted Bob's permission, redeemed once,
then rejected a second redemption. State and error messages were visible in the UI.
The successful contract unit tests above cover the unchanged contract.

Code is published in the private repository:
https://github.com/adikzhan710-png/ticketcheck-final

No load test, external security audit or recorded video has been delivered.
