// Turns the fonts in the expo-font plugin's `fonts` property into font families, and writes the
// matching `Fonts` styles to fonts.ts. Two ways in, same result:
// - withFontFamilies(config) in app.config.js/.ts, which runs before Expo applies any plugins.
// - The "expo-font-families" config plugin (app.plugin.js), which must come before "expo-font" in `plugins`.
// Either way, expo-font's plugin then does the native work.
const { collectFontFiles, planFonts, expoFontProps, overlapWarnings, warnOnce } = require("./fonts");
const { writeFontsModule } = require("./generate");

// The first expo-font whose plugin takes XML font families (weight + style) on Android: Expo SDK 53.
const MIN_EXPO_FONT = "13.3.0";

const isPlugin = (name) => (p) => p === name || (Array.isArray(p) && p[0] === name);

const olderThan = (version, min) => {
  const [a, b] = [version, min].map((v) => v.split(/[.-]/).slice(0, 3).map(Number));
  const i = a.findIndex((n, j) => n !== b[j]);
  return i !== -1 && a[i] < b[i];
};

function checkExpoFont(projectRoot) {
  let pkgJson;
  try {
    pkgJson = require.resolve("expo-font/package.json", { paths: [projectRoot] });
  } catch {
    throw new Error(`[expo-font-families] expo-font isn't installed. Run "npx expo install expo-font".`);
  }
  const { version } = require(pkgJson);
  if (olderThan(version, MIN_EXPO_FONT))
    throw new Error(`[expo-font-families] Needs expo-font ${MIN_EXPO_FONT} or newer (Expo SDK 53+); found ${version}`);
}

/**
 * The index of the expo-font plugin entry in `plugins` and the entry expo-font-families replaces it with, or
 * null when there's nothing to convert.
 */
function convertExpoFont(plugins, projectRoot) {
  const i = plugins.findIndex(isPlugin("expo-font"));
  const theirs = (i !== -1 && Array.isArray(plugins[i]) && plugins[i][1]) || {};
  if (!theirs.fonts?.length) {
    warnOnce(`[expo-font-families] The expo-font plugin has no "fonts" property; no fonts will be bundled`);
    return null;
  }
  const plan = planFonts(collectFontFiles(theirs.fonts, projectRoot));
  if (plan.faces.length === 0) {
    warnOnce(
      `[expo-font-families] No .ttf/.otf files found in the expo-font plugin's "fonts" property; ` +
        `no fonts will be bundled`
    );
    return null;
  }
  checkExpoFont(projectRoot);
  for (const w of overlapWarnings(plan, theirs, projectRoot)) warnOnce(w);
  writeFontsModule(plan, projectRoot);
  return { i, entry: ["expo-font", expoFontProps(plan, theirs)] };
}

const projectRootOf = (config) => config._internal?.projectRoot ?? process.cwd();

/**
 * Returns `config` with the fonts in the expo-font plugin's `fonts` property bundled as native
 * font families, so plain styles work on both platforms:
 *   { fontFamily: "Inter", fontWeight: "700", fontStyle: "italic" }
 * expo-font's `ios.fonts` and `android.fonts` are kept as they are.
 *
 * @param {object} config The Expo config, as passed to app.config.js.
 */
function withFontFamilies(config) {
  // A "expo-font-families" plugin entry (which `expo install` adds) would do the same work again; this
  // already covers it.
  const plugins = (config.plugins ?? []).filter((p) => !isPlugin("expo-font-families")(p));
  const converted = convertExpoFont(plugins, projectRootOf(config));
  if (converted) plugins[converted.i] = converted.entry;
  return { ...config, plugins };
}

/**
 * The "expo-font-families" config plugin: the same as withFontFamilies, for setups that only use app.json.
 * Expo applies plugins in order, and expo-font reads its `fonts` property as soon as it's applied,
 * so this must run first. It rewrites the expo-font entry further down the list in place, which
 * Expo picks up when it gets to that entry.
 */
function fontFamiliesPlugin(config, props) {
  if (props && Object.keys(props).length)
    throw new Error(
      `[expo-font-families] The expo-font-families plugin takes no options. List your fonts in the expo-font plugin's ` +
        `"fonts" property instead.`
    );
  const plugins = config.plugins ?? [];
  const i = plugins.findIndex(isPlugin("expo-font"));
  const listsFonts = i !== -1 && Array.isArray(plugins[i]) && plugins[i][1]?.fonts?.length;
  if (listsFonts && config._internal?.pluginHistory?.["expo-font"])
    throw new Error(
      `[expo-font-families] "expo-font-families" must come before "expo-font" in plugins. Plugins run in order, and ` +
        `expo-font-families needs to read your fonts before expo-font bundles them. Move "expo-font-families" above ` +
        `"expo-font":\n  "plugins": ["expo-font-families", ["expo-font", { "fonts": [...] }]]`
    );
  const converted = convertExpoFont(plugins, projectRootOf(config));
  if (converted) plugins[converted.i] = converted.entry;
  return config;
}

module.exports = withFontFamilies;
module.exports.withFontFamilies = withFontFamilies;
module.exports.default = withFontFamilies;
module.exports.fontFamiliesPlugin = fontFamiliesPlugin;
