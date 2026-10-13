import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { realpathSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../../", import.meta.url));
const expo = createRequire(
  `${realpathSync(`${root}/apps/mobile/node_modules/expo`)}/package.json`,
);
const cli = createRequire(expo.resolve("@expo/cli/package.json"));
function dependency(name) {
  if (name === "node-forge") return cli(name);
  const parent = name === "braces" ? "micromatch" : "argparse";
  const installed = createRequire(
    realpathSync(
      `${root}/node_modules/.pnpm/node_modules/${parent}/package.json`,
    ),
  );
  return installed(name);
}
test("RSA verification rejects extra nested DigestAlgorithm fields while valid signatures verify", () => {
  const forge = dependency("node-forge");
  const key = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 65537 });
  const md = forge.md.sha256.create().update("Synthetic security fixture");
  assert.equal(
    key.publicKey.verify(md.digest().getBytes(), key.privateKey.sign(md)),
    true,
  );
  const a = forge.asn1;
  const algorithm = a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
    a.create(
      a.Class.UNIVERSAL,
      a.Type.OID,
      false,
      a.oidToDer(forge.oids.sha256).getBytes(),
    ),
    a.create(a.Class.UNIVERSAL, a.Type.NULL, false, ""),
    a.create(a.Class.UNIVERSAL, a.Type.NULL, false, ""),
  ]);
  const info = a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
    algorithm,
    a.create(
      a.Class.UNIVERSAL,
      a.Type.OCTETSTRING,
      false,
      md.digest().getBytes(),
    ),
  ]);
  const signature = key.privateKey.sign(a.toDer(info).getBytes(), "NONE");
  assert.throws(
    () => key.publicKey.verify(md.digest().getBytes(), signature),
    /DigestInfo/,
  );
});
test("brace parsing and external AST walkers reject deep/cyclic inputs without stack exhaustion", () => {
  const braces = dependency("braces");
  assert.deepEqual(braces.expand("file-{a,b}-{1..2}"), [
    "file-a-1",
    "file-a-2",
    "file-b-1",
    "file-b-2",
  ]);
  assert.throws(
    () => braces("{".repeat(5000) + "x" + "}".repeat(5000)),
    SyntaxError,
  );
  let tree = { type: "text", value: "x" };
  for (let i = 0; i < 5000; i++) tree = { type: "root", nodes: [tree] };
  for (const fn of [braces.compile, braces.stringify, braces.expand])
    assert.throws(() => fn(tree), SyntaxError);
  const cycle = { type: "root", nodes: [] };
  cycle.nodes.push(cycle);
  assert.throws(() => braces.stringify(cycle), SyntaxError);
});
test("numeric sprintf precision is bounded without changing valid formatting", () => {
  const { sprintf } = dependency("sprintf-js");
  assert.equal(sprintf("%.2f", 1.25), "1.25");
  for (const spec of ["f", "e", "g"]) {
    const result = sprintf(`%.999999999${spec}`, 1.25);
    assert.ok(result.length < 120);
  }
});
test("vendored BlurView files match recorded integrity and Expo retains the native blur dependency", () => {
  const dir = `${root}/apps/mobile/vendor/blurview`;
  const upstream = JSON.parse(readFileSync(`${dir}/UPSTREAM.json`));
  for (const [file, hash] of Object.entries(upstream.files))
    assert.equal(
      createHash("sha256")
        .update(readFileSync(`${dir}/${file}`))
        .digest("hex"),
      hash,
      file,
    );
  assert.match(
    readFileSync(
      `${root}/apps/mobile/node_modules/expo-blur/android/build.gradle`,
      "utf8",
    ),
    /project\(':browser-proxy-blurview'\)/,
  );
});
