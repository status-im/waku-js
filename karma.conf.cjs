const playwright = require("playwright");
const webpack = require("webpack");

process.env.CHROME_BIN = playwright.chromium.executablePath();
process.env.FIREFOX_BIN = playwright.firefox.executablePath();

module.exports = function (config) {
  const configuration = {
    frameworks: ["webpack", "mocha"],
    files: ["src/**/!(node).spec.ts"],
    preprocessors: {
      "src/**/!(node).spec.ts": ["webpack"]
    },
    envPreprocessor: ["CI"],
    reporters: ["progress"],
    browsers: process.env.CI
      ? ["ChromeHeadlessCI", "FirefoxHeadless"]
      : ["ChromeHeadless", "FirefoxHeadless"],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: "ChromeHeadless",
        flags: [
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-software-rasterizer",
          "--disable-extensions"
        ]
      }
    },
    singleRun: true,
    client: {
      mocha: {
        timeout: 6000 // Default is 2s
      }
    },
    webpack: {
      mode: "development",
      module: {
        rules: [{ test: /\.([cm]?ts|tsx)$/, loader: "ts-loader" }]
      },
      plugins: [
        new webpack.DefinePlugin({
          "process.env.CI": process.env.CI || false,
          "process.env.DISPLAY": "Browser"
        }),
        new webpack.ProvidePlugin({
          process: "process/browser.js"
        })
      ],
      resolve: {
        extensions: [".ts", ".tsx", ".js"],
        extensionAlias: {
          ".js": [".js", ".ts"],
          ".cjs": [".cjs", ".cts"],
          ".mjs": [".mjs", ".mts"]
        }
      },
      stats: { warnings: false },
      devtool: "inline-source-map"
    }
  };

  config.set(configuration);
};
