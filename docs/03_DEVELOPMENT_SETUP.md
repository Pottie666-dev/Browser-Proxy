# Development Setup

## Recommended Workflow

Use Termux for SSH and commands, Raspberry Pi as devbox, code-server as optional editor only, tmux for long-running tasks, and GitHub as source of truth.

Termux has been the most practical mobile terminal because copy/paste and keyboard behavior work better than code-server terminal on a phone.

## Current Devbox

- Debian GNU/Linux 13 trixie
- Raspberry Pi ARM64 / aarch64
- OpenJDK 21
- Node 20.x
- pnpm 9.15.9
- Debian adb works over USB
- Google platform-tools do not work on ARM Pi

## Base Tools

```bash
sudo apt update
sudo apt install -y git curl unzip wget build-essential openjdk-17-jdk adb tmux
```

## Android SDK Environment

Add to `~/.bashrc`:

```bash
export ANDROID_HOME=$HOME/Android/sdk
export ANDROID_SDK_ROOT=$HOME/Android/sdk
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH
```

Reload:

```bash
source ~/.bashrc
```

## Android SDK Packages

```bash
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
sdkmanager "ndk;27.1.12297006" "cmake;3.22.1"
```

## NDK Install in tmux

```bash
tmux new -s android-sdk
rm -rf ~/Android/sdk/ndk/27.1.12297006 ~/Android/sdk/.temp
sdkmanager "ndk;27.1.12297006"
```

Detach: `Ctrl+B` then `D`.

Check success:

```bash
ls ~/Android/sdk/ndk/27.1.12297006/source.properties
```

## ADB on Raspberry Pi ARM64

Do not use Google platform-tools on Raspberry Pi ARM64. They are x86_64 and fail with `Exec format error`.

Use Debian ADB:

```bash
sudo apt install -y adb
rm -f ~/Android/sdk/platform-tools/adb
ln -s /usr/bin/adb ~/Android/sdk/platform-tools/adb
adb version
```

## Build Commands

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/browser-app typecheck
pnpm --filter @workspace/api-server typecheck
pnpm run mobile:android:native
```
