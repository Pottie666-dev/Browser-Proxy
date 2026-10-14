import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { homedir } from "node:os";
const dir = process.argv[2];
if (!dir) throw Error("Artifact directory required");
const names = [
  "BrowserProxy-controller-hardware.apk",
  "BrowserProxy-companion-hardware.apk",
];
const expectedAar =
  "a4da05bc571946aa1034c0d7be46593719105fb9e81d58aded9183c85a1f04fc";
const cache = path.join(
  process.env.GRADLE_USER_HOME ?? path.join(homedir(), ".gradle"),
  "caches/modules-2/files-2.1/com.facebook.react/react-android/0.81.5",
);
let verified = false;
for (const entry of readdirSync(cache)) {
  const files = readdirSync(path.join(cache, entry));
  if (files.includes("react-android-0.81.5-release.aar")) {
    const hash = createHash("sha256")
      .update(
        readFileSync(
          path.join(cache, entry, "react-android-0.81.5-release.aar"),
        ),
      )
      .digest("hex");
    if (hash !== expectedAar)
      throw Error("Official React Native AAR checksum mismatch");
    verified = true;
  }
}
if (!verified)
  throw Error(
    "React Native release AAR was not found for provenance verification",
  );
const hashes = Object.fromEntries(
  names.map((name) => [
    name,
    createHash("sha256")
      .update(readFileSync(path.join(dir, name)))
      .digest("hex"),
  ]),
);
writeFileSync(
  path.join(dir, "SHA256SUMS"),
  Object.entries(hashes)
    .map(([name, hash]) => `${hash}  ${name}`)
    .join("\n") + "\n",
);
writeFileSync(
  path.join(dir, "PROVENANCE.json"),
  JSON.stringify(
    {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      node: process.version,
      reactNative: "0.81.5",
      reactAndroidReleaseSha256: expectedAar,
      expo: "54.0.35",
      gradle: "8.14.3",
      gradleSha256:
        "bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531",
      blurViewCommit: "afc19dc45718b739d818af324a4cd0f85dafd653",
      architecture: "arm64-v8a",
      controller:
        "release variant with embedded Hermes, DEVELOPMENT test signing",
      companion: "debug variant, DEVELOPMENT test signing",
      hashes,
    },
    null,
    2,
  ) + "\n",
);
