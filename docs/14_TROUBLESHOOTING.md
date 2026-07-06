# Troubleshooting

## NDK Missing source.properties

Error:

```text
NDK at /home/johan/Android/sdk/ndk/27.1.12297006 did not have a source.properties file
```

Cause: NDK install was interrupted.

Fix:

```bash
rm -rf ~/Android/sdk/ndk/27.1.12297006 ~/Android/sdk/.temp
sdkmanager "ndk;27.1.12297006"
ls ~/Android/sdk/ndk/27.1.12297006/source.properties
```

Use tmux so SSH disconnect does not kill the install.

## Google ADB Exec Format Error

Error:

```text
cannot execute binary file: Exec format error
```

Cause: downloaded Google x86_64 platform-tools on Raspberry Pi ARM64.

Fix:

```bash
rm -f ~/Android/sdk/platform-tools/adb
ln -s /usr/bin/adb ~/Android/sdk/platform-tools/adb
adb version
```

## Wireless ADB Protocol Fault

Error:

```text
protocol fault (couldn't read status message): Success
```

Cause: Debian ARM adb seems unreliable with wireless pairing on this setup.

Fix: use USB debugging first.

## No Android Device Found

Fix:

- enable Developer Options
- enable USB Debugging
- plug phone into Pi
- accept debugging prompt
- run `adb devices`

## TypeScript TS6305 Generated Dist Error

Fix:

```bash
pnpm run typecheck:libs
```

## tmux Scroll Frustration

Use tmux only for long-running tasks.

Detach:

```text
Ctrl+B then D
```

Attach:

```bash
tmux attach -t android-sdk
```

Capture recent output without attaching:

```bash
tmux capture-pane -t android-sdk -p | tail -60
```
