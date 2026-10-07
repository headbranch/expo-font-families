#!/usr/bin/env node
// Lists the font families expo-font-families bundles, with the fontFamily name to use.
//   npx expo-font-families [paths...] [--json]
const path = require("path");
const { collectFontFiles, planFonts } = require("../src/fonts");

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npx expo-font-families [paths...] [--json]

Lists the font families your app bundles and the fontFamily name to use for each.
With no paths, reads them from your Expo config (after withFontFamilies or the expo-font-families plugin).
With paths, reads those font files and folders instead.`);
  process.exit(0);
}
const json = args.includes("--json");
const inputs = args.filter((a) => !a.startsWith("--"));
const root = process.cwd();

/** Families as { family, faces: [{ weight, style, source }] }. */
function fromFiles() {
  return planFonts(collectFontFiles(inputs, root)).families;
}

/** The XML font families in the project's final expo-font options, after withFontFamilies ran. */
function fromConfig() {
  let getConfig;
  try {
    ({ getConfig } = require(require.resolve("expo/config", { paths: [root] })));
  } catch {
    throw new Error("Couldn't load Expo here. Run this in your app's folder, or pass font paths.");
  }
  const { exp } = getConfig(root, { skipSDKVersionRequirement: true });
  const entry = (exp.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "expo-font");
  return (entry?.[1]?.android?.fonts ?? [])
    .filter((f) => f && typeof f === "object")
    .map((f) => ({
      family: f.fontFamily,
      faces: f.fontDefinitions.map((d) => ({
        weight: d.weight,
        style: d.style ?? "normal",
        source: path.resolve(root, d.path),
      })),
    }));
}

let families;
try {
  families = inputs.length ? fromFiles() : fromConfig();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

if (json) {
  const out = families.map((f) => ({
    fontFamily: f.family,
    faces: f.faces.map((x) => ({ fontWeight: String(x.weight), fontStyle: x.style, file: path.relative(root, x.source) })),
  }));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (families.length === 0) {
  console.log(
    inputs.length
      ? "No .ttf/.otf files found."
      : "No font families found. Is your config wrapped with withFontFamilies in app.config.js/.ts, " +
          'or is "expo-font-families" before "expo-font" in plugins?'
  );
  process.exit(0);
}

for (const family of families) {
  console.log(`\nfontFamily: "${family.family}"`);
  for (const f of family.faces)
    console.log(`  ${String(f.weight).padEnd(4)} ${f.style.padEnd(7)} ${path.relative(root, f.source)}`);
}
const sample = families[0];
const face = sample.faces[sample.faces.length - 1];
console.log(
  `\nExample:\n  { fontFamily: "${sample.family}", fontWeight: "${face.weight}"` +
    (face.style === "italic" ? `, fontStyle: "italic"` : "") +
    " }\n"
);
