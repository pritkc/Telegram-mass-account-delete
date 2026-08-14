const path = require("path");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: "./src/main.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "app.js",
    clean: true,
    // Relative asset URLs so GitHub Pages subpath hosting works.
    publicPath: "auto",
  },
  target: "web",
  resolve: {
    extensions: [".js"],
    fallback: {
      fs: false,
      path: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      os: false,
      assert: false,
      constants: false,
      buffer: require.resolve("buffer/"),
      process: require.resolve("process/browser.js"),
      util: require.resolve("util/"),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser.js",
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "index.html" },
        { from: "styles.css" },
        { from: "manifest.webmanifest" },
        { from: "icon.svg" },
      ],
    }),
  ],
  performance: {
    hints: false,
  },
  // Do not emit source maps with session/auth code paths.
  devtool: false,
};
