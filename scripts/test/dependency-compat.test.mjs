import { dirname } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { realpathSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const expo = createRequire(
  `${realpathSync(`${root}/apps/mobile/node_modules/expo`)}/package.json`,
);
const cli = createRequire(expo.resolve("@expo/cli/package.json"));
const config = createRequire(cli.resolve("@expo/config-plugins/package.json"));
test("patched plist parser works with the fixed XML dependency", () => {
  const plist = config("@expo/plist").default;
  const fixture = {
    Name: "Fixture",
    Count: 2,
    Enabled: true,
    Fonts: ["Feather.ttf"],
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(plist.parse(plist.build(fixture)))),
    fixture,
  );
});
test("xcode tooling retains UUID generation after its security upgrade", () => {
  const project = new (config("xcode").project)(
    "/tmp/synthetic-unused.pbxproj",
  );
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});
test("Metro can still measure images using the fixed image-size API", () => {
  const expoMetro = createRequire(expo.resolve("@expo/metro/package.json"));
  const metro = createRequire(expoMetro.resolve("metro/package.json"));
  const module = metro("image-size");
  const measure = module.default ?? module.imageSize ?? module;
  const dimensions = measure(
    readFileSync(`${root}/apps/mobile/assets/images/icon.png`),
  );
  assert.equal(dimensions.type, "png");
  assert.equal(dimensions.width, 1024);
  assert.equal(dimensions.height, 1024);
});

test("Metro handles file-backed assets with the image-size v2 compatibility patch", async () => {
  const expoMetro = createRequire(expo.resolve("@expo/metro/package.json"));
  const metro = createRequire(expoMetro.resolve("metro/package.json"));
  const assets = metro(
    `${dirname(expoMetro.resolve("metro/package.json"))}/src/Assets.js`,
  );
  const data = await assets.getAssetData(
    `${root}/apps/mobile/assets/images/icon.png`,
    "assets/images/icon.png",
    [],
    "android",
    "/assets",
  );
  assert.equal(data.width, 1024);
  assert.equal(data.height, 1024);
});

test("native release Babel preset resolves from the pinned Expo package independent of working directory", () => {
  const mobile = createRequire(`${root}/apps/mobile/package.json`);
  const config = mobile("./babel.config.js")({ cache() {} });
  assert.equal(config.presets[0][0], expo.resolve("babel-preset-expo"));
  const babel = expo("@babel/core");
  const output = babel.transformSync("export const screen = <View />;", {
    filename: "fixture.jsx",
    babelrc: false,
    configFile: false,
    presets: config.presets,
  });
  assert.ok(output.code.includes("screen"));
});
