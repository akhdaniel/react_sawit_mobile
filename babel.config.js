module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Bundel file migrasi .sql drizzle-kit ke dalam JS.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
