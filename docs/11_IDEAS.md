# Ideas

## Browser

- downloads
- desktop/mobile mode
- SSL details
- ad blocker
- tracker blocker
- cookie viewer
- clear site data
- profile clone
- import/export cookies
- saved passwords
- autofill
- reader mode
- file upload helper

## Identity

- identity health score
- browser leak dashboard
- CreepJS shortcut
- BrowserLeaks shortcut
- Pixelscan shortcut
- IP/timezone mismatch warning
- font consistency score
- battery behavior score
- browser history age score
- cookie age score
- device clone
- device picker
- region presets

## Proxy

- per-account proxy
- residential proxy
- mobile proxy
- proxy health checks
- IP reputation
- sticky sessions
- automatic rotation
- failover
- timezone matching
- region matching

## Automation

- form autofill
- email/password copy buttons
- OTP helper
- clipboard helper
- auto upload stored images
- auto-detect login forms
- auto-detect registration forms
- account notes
- task list per account
- bulk open accounts
- account warm-up workflow

## Dev Experience

- `scripts/doctor.sh`
- `scripts/dev.sh`
- one-command build
- one-command Android SDK check
- one-command release
- one-command clean
- tmux workspace
- code-server workspace
- GitHub release script

## Account Inbox and App Ecosystem

Future expansion idea:

Each Browser-Proxy account should eventually be able to link its own email inbox and app ecosystem.

### Per-account inbox

- Link Gmail/Outlook/Yahoo/custom IMAP inbox per account
- Show inbox inside the account profile
- Read OTP emails
- Copy OTP codes quickly
- Autofill verification codes into browser
- Store email login metadata securely
- Support account-specific email history

### Per-account apps

Each account could have associated apps/services, for example:

- WhatsApp
- Binance
- Telegram
- Gmail
- Outlook
- Facebook
- TikTok
- Banking/crypto apps
- Casino apps
- KYC portals

### Possible implementation paths

- Store app metadata per account first
- Add deep links to open external apps
- Add web versions where possible
- Later investigate Android work profiles / cloned app containers
- Long-term: each Browser-Proxy account behaves like a full virtual phone profile, not only a browser profile

### Notes

Native Android app isolation is much harder than browser isolation. Browser-Proxy can start by linking accounts to inboxes and app shortcuts, then later explore true per-account app containers.
