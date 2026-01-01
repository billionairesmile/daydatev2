module.exports = function (api) {
  api.cache(true);

  const plugins = [];

  // Remove console.log in production builds only
  if (process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production') {
    plugins.push('transform-remove-console');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
