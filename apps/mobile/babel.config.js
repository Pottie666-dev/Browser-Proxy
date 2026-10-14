const expoRequire = require("node:module").createRequire(
  require.resolve("expo/package.json"),
);

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        expoRequire.resolve("babel-preset-expo"),
        { unstable_transformImportMeta: true },
      ],
    ],
  };
};
