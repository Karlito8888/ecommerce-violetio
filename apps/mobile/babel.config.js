module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // Required: packages/shared uses import.meta which Hermes doesn't support natively
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
