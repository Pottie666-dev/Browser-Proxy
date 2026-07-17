#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-$PWD}"
PACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -d "$TARGET/.git" ] || { echo "ERROR: $TARGET is not a Git repo"; exit 1; }
mkdir -p "$TARGET/docs" "$TARGET/scripts"
cp -f "$PACK_DIR/docs/"*.md "$TARGET/docs/"
cp -f "$PACK_DIR/scripts/"*.sh "$TARGET/scripts/"
python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
readme=root/'README.md'
if readme.exists():
 s=readme.read_text()
 block='''\n## Cloud Browser Expansion\n\n- `docs/16_CLOUD_BROWSER.md`\n- `docs/17_CLOUD_BROWSER_ARCHITECTURE.md`\n- `docs/18_CLOUD_BROWSER_API.md`\n- `docs/19_CLOUD_BROWSER_MOBILE.md`\n- `docs/20_CLOUD_BROWSER_DEPLOYMENT.md`\n- `docs/21_CLOUD_BROWSER_SECURITY.md`\n- `docs/22_CLOUD_BROWSER_TASKS.md`\n- `docs/23_CODESPACES_WORKFLOW.md`\n- `docs/24_FIRST_USABLE_RELEASE.md`\n'''
 if '## Cloud Browser Expansion' not in s:
  readme.write_text(s.rstrip()+block)
road=root/'docs/01_ROADMAP.md'
if road.exists():
 s=road.read_text()
 block='''\n\n## Future Expansion - Cloud Browser\n\n- [ ] One-tap cloud session creation\n- [ ] Secure streaming\n- [ ] Persistent profiles\n- [ ] Clipboard and file transfer\n- [ ] Reconnect, pause, resume, cleanup\n- [ ] Per-session proxy/VPN\n- [ ] Playwright and AI automation\n'''
 if '## Future Expansion - Cloud Browser' not in s:
  road.write_text(s.rstrip()+block)
PY
chmod +x "$TARGET/scripts/"*.sh
git -C "$TARGET" status --short
