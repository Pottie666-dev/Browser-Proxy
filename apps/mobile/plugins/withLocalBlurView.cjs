const { withSettingsGradle, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs"),
  path = require("node:path");
module.exports = (config) => {
  config = withSettingsGradle(config, (mod) => {
    const marker = "// Browser-Proxy pinned BlurView source dependency";
    if (!mod.modResults.contents.includes(marker))
      mod.modResults.contents += `\n${marker}\ninclude ':browser-proxy-blurview'\nproject(':browser-proxy-blurview').projectDir = new File(rootDir, '../vendor/blurview')\n`;
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const file = path.join(
        mod.modRequest.platformProjectRoot,
        "gradle/wrapper/gradle-wrapper.properties",
      );
      let data = fs.readFileSync(file, "utf8");
      if (!data.includes("gradle-8.14.3-bin.zip"))
        throw new Error(
          "Review the official checksum before changing Gradle version",
        );
      data = data.replace(/^distributionSha256Sum=.*\n?/gm, "");
      fs.writeFileSync(
        file,
        data.trimEnd() +
          "\ndistributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531\n",
      );
      return mod;
    },
  ]);
};
