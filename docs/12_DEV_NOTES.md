# Dev Notes

## Important Lesson

Do not rely on memory. If a setup issue or architecture decision matters, document it.

## Raspberry Pi Notes

Current devbox after reinstall:

- Debian 13 trixie
- aarch64
- Java 21
- Node 20
- pnpm 9.15.9
- Debian adb works
- Google platform-tools do not work on ARM Pi

## Android SDK Notes

Installed:

- build-tools;35.0.0
- cmake;3.22.1
- platform-tools
- platforms;android-35

Still needed during current work:

- ndk;27.1.12297006

## NDK Install

Run inside tmux:

```bash
tmux new -s android-sdk
rm -rf ~/Android/sdk/ndk/27.1.12297006 ~/Android/sdk/.temp
sdkmanager "ndk;27.1.12297006"
```

Do not press Ctrl+C.

Detach:

```text
Ctrl+B then D
```

Check:

```bash
ls ~/Android/sdk/ndk/27.1.12297006/source.properties
```

## ADB Fix

If wrong x86 adb was installed:

```bash
rm -f ~/Android/sdk/platform-tools/adb
ln -s /usr/bin/adb ~/Android/sdk/platform-tools/adb
adb version
```

## Wireless ADB

Wireless pairing failed on Debian ARM adb with:

```text
protocol fault (couldn't read status message): Success
```

Use USB first.

## TypeScript Restore Issue

After reinstall, generated package dist files may need building:

```bash
pnpm run typecheck:libs
```

## Native Build Error

If Gradle says:

```text
NDK at ... did not have a source.properties file
```

Cause: interrupted NDK install.

Fix:

```bash
rm -rf ~/Android/sdk/ndk/27.1.12297006
sdkmanager "ndk;27.1.12297006"
```
