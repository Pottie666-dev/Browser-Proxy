import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test(
  "kernel confinement has only loopback, rejects direct TCP/UDP/DNS and hides sibling profiles/API files",
  { timeout: 15000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "browser-proxy-kernel-")),
      dir = path.join(root, "profiles", "own"),
      sibling = path.join(root, "profiles", "other", "cookie-marker"),
      apiFile = path.join(root, "api-secret-marker");
    await mkdir(dir, { recursive: true });
    await mkdir(path.dirname(sibling), { recursive: true });
    await writeFile(sibling, "synthetic sibling marker");
    await writeFile(apiFile, "synthetic API marker");
    const script = `import socket,os,json,errno\nassert [name for _,name in socket.if_nameindex()]==['lo']\nresults={}\nfor name,kind,port in [('tcp',socket.SOCK_STREAM,80),('udp',socket.SOCK_DGRAM,443),('dns',socket.SOCK_DGRAM,53)]:\n s=socket.socket(socket.AF_INET,kind);s.settimeout(0.2)\n try:\n  if kind==socket.SOCK_STREAM:s.connect(('198.51.100.1',port))\n  else:s.sendto(b'fixture',('198.51.100.1',port))\n  raise AssertionError('direct network unexpectedly available')\n except OSError as e:\n  assert e.errno==errno.ENETUNREACH\n  results[name]='unreachable'\n finally:s.close()\nassert not os.path.exists(${JSON.stringify(sibling)})\nassert not os.path.exists(${JSON.stringify(apiFile)})\nassert 'ACCOUNT_ENCRYPTION_KEY' not in os.environ\nprint(json.dumps(results))`;
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../tools/chromium-namespace-wrapper.mjs", import.meta.url),
        ),
        "-c",
        script,
      ],
      {
        env: {
          PATH: process.env.PATH,
          PROFILE_STORAGE_ROOT: path.join(root, "profiles"),
          PROFILE_NAMESPACE_ROOT: dir,
          PROFILE_GATEWAY_SOCKET: path.join(dir, "egress.sock"),
          PROFILE_CHROMIUM_EXECUTABLE: "/usr/bin/python3",
        },
        stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
      },
    );
    let output = "",
      errors = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (errors += d));
    try {
      const [code] = await once(child, "exit");
      assert.equal(code, 0, errors);
      const result = JSON.parse(output.trim().split("\n").at(-1));
      assert.deepEqual(result, {
        tcp: "unreachable",
        udp: "unreachable",
        dns: "unreachable",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
