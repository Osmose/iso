/* eslint-env node */
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const WebpackBar = require('webpackbar');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  resolve: {
    alias: {
      iso: path.resolve(__dirname, 'src/'),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'static', to: '.' }],
    }),
    new WebpackBar(),
  ],
};
