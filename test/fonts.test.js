const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { readFontMeta, collectFontFiles, planFonts, expoFontProps, overlapWarnings, androidName, cssWeight } = require("../src/fonts");
const withFontFamilies = require("../src/withFontFamilies");
const { fontFamiliesPlugin } = withFontFamilies;
const { fontsModule, familyKey, faceKey } = require("../src/generate");

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name) => path.join(FIXTURES, name);

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "expo-font-families-"));
}

test("reads family, weight and italic from the font itself", () => {
  assert.deepEqual(
    pick(readFontMeta(fixture("PlayfairDisplay_700Bold_Italic.ttf"))),
    { family: "Playfair Display", weight: 700, italic: true, ext: ".ttf" }
  );
  assert.deepEqual(
    pick(readFontMeta(fixture("OpenSans_600SemiBold.ttf"))),
    { family: "Open Sans", weight: 600, italic: false, ext: ".ttf" }
  );
});

const pick = ({ family, weight, italic, ext }) => ({ family, weight, italic, ext });

test("collects font files from folders recursively and ignores other files", () => {
  const files = collectFontFiles([FIXTURES], "/").map((f) => path.basename(f));
  assert.deepEqual(files, [
    "OpenSans_600SemiBold.ttf",
    "PlayfairDisplay_400Regular.ttf",
    "PlayfairDisplay_700Bold_Italic.ttf",
  ]);
});

test("groups faces into families", () => {
  const plan = planFonts(collectFontFiles(FIXTURES, "/"));
  assert.deepEqual(
    plan.families.map((f) => [f.family, f.faces.map((x) => `${x.weight}/${x.style}`)]),
    [
      ["Open Sans", ["600/normal"]],
      ["Playfair Display", ["400/normal", "700/italic"]],
    ]
  );
});

test("builds expo-font options: files on iOS, one XML family per family on Android", () => {
  const plan = planFonts(collectFontFiles(FIXTURES, "/"));
  const props = expoFontProps(plan);
  assert.deepEqual(props.ios.fonts, plan.faces.map((f) => f.source));
  assert.deepEqual(props.android.fonts, [
    {
      fontFamily: "Open Sans",
      fontDefinitions: [{ path: fixture("OpenSans_600SemiBold.ttf"), weight: 600, style: "normal" }],
    },
    {
      fontFamily: "Playfair Display",
      fontDefinitions: [
        { path: fixture("PlayfairDisplay_400Regular.ttf"), weight: 400, style: "normal" },
        { path: fixture("PlayfairDisplay_700Bold_Italic.ttf"), weight: 700, style: "italic" },
      ],
    },
  ]);
});

test("replaces expo-font's shared fonts and keeps its platform-specific ones", () => {
  const plan = planFonts(collectFontFiles(fixture("OpenSans_600SemiBold.ttf"), "/"));
  const props = expoFontProps(plan, {
    fonts: ["./test/fixtures/OpenSans_600SemiBold.ttf"],
    ios: { fonts: ["./ios.ttf"] },
    android: { fonts: ["./android.ttf"] },
  });
  assert.equal(props.fonts, undefined);
  assert.deepEqual(props.ios.fonts, ["./ios.ttf", fixture("OpenSans_600SemiBold.ttf")]);
  assert.equal(props.android.fonts[0], "./android.ttf");
  assert.equal(props.android.fonts[1].fontFamily, "Open Sans");
});

test("folders don't matter, but file names must be unique on Android", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, "a"));
  fs.mkdirSync(path.join(dir, "b"));
  fs.copyFileSync(fixture("PlayfairDisplay_400Regular.ttf"), path.join(dir, "a", "Regular.ttf"));
  fs.copyFileSync(fixture("PlayfairDisplay_700Bold_Italic.ttf"), path.join(dir, "b", "BoldItalic.ttf"));
  assert.equal(planFonts(collectFontFiles(dir, "/")).faces.length, 2);

  fs.copyFileSync(fixture("OpenSans_600SemiBold.ttf"), path.join(dir, "b", "Regular.ttf"));
  assert.throws(() => planFonts(collectFontFiles(dir, "/")), /would both be "regular" on Android; rename one/);
});

test("rejects file names expo-font or Android can't use", () => {
  const one = (name) => {
    const dir = tmpDir();
    fs.copyFileSync(fixture("OpenSans_600SemiBold.ttf"), path.join(dir, name));
    return () => planFonts(collectFontFiles(dir, "/"));
  };
  assert.throws(one("OpenSans.TTF"), /rename it to end in \.ttf/);
  assert.throws(one("1.ttf"), /start with a letter/);
  // A file named like expo-font's XML for a family.
  assert.throws(one("xml_open_sans.ttf"), /family "Open Sans" would both be "xml_open_sans"/);
});

test("rejects two files with the same family, weight and style", () => {
  const dir = tmpDir();
  fs.copyFileSync(fixture("OpenSans_600SemiBold.ttf"), path.join(dir, "one.ttf"));
  fs.copyFileSync(fixture("OpenSans_600SemiBold.ttf"), path.join(dir, "two.ttf"));
  assert.throws(() => planFonts(collectFontFiles(dir, "/")), /are both Open Sans 600 normal/);
});

test("rejects web fonts, collections and non-fonts with a clear message", () => {
  const dir = tmpDir();
  const write = (name, head) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, Buffer.concat([Buffer.from(head, "latin1"), Buffer.alloc(32)]));
    return p;
  };
  assert.throws(() => readFontMeta(write("a.woff", "wOFF")), /WOFF/);
  assert.throws(() => readFontMeta(write("a.woff2", "wOF2")), /WOFF/);
  assert.throws(() => readFontMeta(write("a.ttc", "ttcf")), /collections/);
  assert.throws(() => readFontMeta(write("a.ttf", "hello")), /not a TrueType\/OpenType font/);
});

test("errors on missing paths", () => {
  assert.throws(() => collectFontFiles("./does-not-exist", tmpDir()), /does not exist/);
});

test("androidName matches expo-font's resource name rules", () => {
  assert.equal(androidName("Playfair Display"), "playfair_display");
  assert.equal(androidName("PlayfairDisplay"), "playfair_display");
  assert.equal(androidName("Source Sans 3"), "source_sans_3");
  assert.equal(androidName("IBM Plex Sans"), "ibm_plex_sans");
  assert.equal(androidName("/fonts/OpenSans-SemiBold.ttf"), "open_sans_semi_bold");
});

test("warns when expo-font's platform-specific fonts bundle a family again", () => {
  const plan = planFonts(collectFontFiles(FIXTURES, "/"));
  const root = path.join(__dirname, "..");

  // Same family as a file in ios.fonts.
  const viaFile = overlapWarnings(plan, { ios: { fonts: ["./test/fixtures/OpenSans_600SemiBold.ttf"] } }, root);
  assert.equal(viaFile.length, 1);
  assert.match(viaFile[0], /"Open Sans" is in the expo-font plugin's "fonts" property and also in its "ios.fonts" or "android.fonts"/);
  assert.match(viaFile[0], /OpenSans_600SemiBold\.ttf/);

  // Same family name as an Android XML family; a folder in ios.fonts covers both families.
  const viaXml = overlapWarnings(
    plan,
    {
      ios: { fonts: ["./test/fixtures"] },
      android: { fonts: [{ fontFamily: "Playfair Display", fontDefinitions: [{ path: "./x.ttf", weight: 400 }] }] },
    },
    root
  );
  assert.deepEqual(viaXml.map((w) => w.match(/"([^"]+)"/)[1]).sort(), ["Open Sans", "Playfair Display"]);

  // The shared list itself, no options, or missing paths: no warnings.
  assert.deepEqual(overlapWarnings(plan, { fonts: ["./test/fixtures"] }, root), []);
  assert.deepEqual(overlapWarnings(plan, undefined, root), []);
  assert.deepEqual(overlapWarnings(plan, { ios: { fonts: ["./missing.ttf"] } }, root), []);
});

test("CLI lists families and the fontFamily name to use", () => {
  const bin = path.join(__dirname, "..", "bin", "expo-font-families.js");
  const out = execFileSync(process.execPath, [bin, FIXTURES], { encoding: "utf8" });
  assert.match(out, /fontFamily: "Playfair Display"/);
  assert.match(out, /fontFamily: "Open Sans"/);

  const json = JSON.parse(execFileSync(process.execPath, [bin, FIXTURES, "--json"], { encoding: "utf8" }));
  assert.deepEqual(
    json.map((f) => [f.fontFamily, f.faces.map((x) => `${x.fontWeight}/${x.fontStyle}`)]),
    [
      ["Open Sans", ["600/normal"]],
      ["Playfair Display", ["400/normal", "700/italic"]],
    ]
  );

  const bad = spawnSync(process.execPath, [bin, "./does-not-exist"], { encoding: "utf8", cwd: os.tmpdir() });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /does not exist/);
});

/** A project folder with the given fonts and a stub expo-font at `version`. */
function project(version = "57.0.0") {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, "assets", "fonts"), { recursive: true });
  for (const f of ["OpenSans_600SemiBold.ttf", "PlayfairDisplay_400Regular.ttf"])
    fs.copyFileSync(fixture(f), path.join(root, "assets", "fonts", f));
  if (version) {
    fs.mkdirSync(path.join(root, "node_modules", "expo-font"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "expo-font", "package.json"), JSON.stringify({ version }));
  }
  return root;
}
const configIn = (root, plugins) => ({ name: "app", plugins, _internal: { projectRoot: root } });

const fontsEntry = ["expo-font", { fonts: ["./assets/fonts"] }];

test("withFontFamilies leaves the config alone without an expo-font fonts list", () => {
  const root = project();
  for (const plugins of [["expo-router"], ["expo-font"], [["expo-font", { ios: { fonts: ["./x.ttf"] } }]]]) {
    const config = configIn(root, plugins);
    assert.deepEqual(withFontFamilies(config), config);
  }
  assert.deepEqual(withFontFamilies(configIn(root, undefined)).plugins, []);
  assert.ok(!fs.existsSync(path.join(root, "fonts.js")), "no fonts, no Fonts module");
});

test("withFontFamilies reads expo-font's fonts and rewrites its entry in place", () => {
  const root = project();
  fs.mkdirSync(path.join(root, "other"));
  fs.copyFileSync(fixture("PlayfairDisplay_700Bold_Italic.ttf"), path.join(root, "other", "BoldItalic.ttf"));
  const out = withFontFamilies(configIn(root, [["expo-font", { fonts: ["./other"], ios: { fonts: ["./x.ttf"] } }], "expo-router"]));
  assert.equal(out.plugins.length, 2);
  assert.equal(out.plugins[1], "expo-router");
  const [name, props] = out.plugins[0];
  assert.equal(name, "expo-font");
  assert.equal(props.fonts, undefined);
  assert.deepEqual(props.ios.fonts, ["./x.ttf", path.join(root, "other", "BoldItalic.ttf")]);
  assert.deepEqual(props.android.fonts.map((f) => f.fontFamily), ["Playfair Display"]);
});

test("withFontFamilies doesn't change its input", () => {
  const config = configIn(project(), [fontsEntry]);
  const before = JSON.stringify(config);
  withFontFamilies(config);
  assert.equal(JSON.stringify(config), before);
});

test("withFontFamilies resolves packages and paths inside them", () => {
  const root = project();
  const pkg = path.join(root, "node_modules", "@my", "fonts");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@my/fonts" }));
  fs.copyFileSync(fixture("OpenSans_600SemiBold.ttf"), path.join(pkg, "OpenSans.ttf"));
  const out = withFontFamilies(configIn(root, [["expo-font", { fonts: ["@my/fonts/OpenSans.ttf"] }]]));
  assert.deepEqual(out.plugins[0][1].android.fonts.map((f) => f.fontFamily), ["Open Sans"]);

  // A whole package, or a folder in it, is searched like any folder; other files are ignored.
  fs.mkdirSync(path.join(pkg, "700Bold_Italic"));
  fs.writeFileSync(path.join(pkg, "700Bold_Italic", "index.js"), "");
  fs.copyFileSync(fixture("PlayfairDisplay_700Bold_Italic.ttf"), path.join(pkg, "700Bold_Italic", "Bold.ttf"));
  const whole = withFontFamilies(configIn(root, [["expo-font", { fonts: ["@my/fonts"] }]]));
  assert.deepEqual(whole.plugins[0][1].android.fonts.map((f) => f.fontFamily), ["Open Sans", "Playfair Display"]);
  const folder = withFontFamilies(configIn(root, [["expo-font", { fonts: ["@my/fonts/700Bold_Italic"] }]]));
  assert.deepEqual(folder.plugins[0][1].android.fonts.map((f) => f.fontFamily), ["Playfair Display"]);

  assert.throws(() => withFontFamilies(configIn(root, [["expo-font", { fonts: ["@my/missing"] }]])), /does not exist/);
});

test("withFontFamilies drops a expo-font-families plugin entry, since it already does that work", () => {
  const out = withFontFamilies(configIn(project(), [fontsEntry, "expo-font-families", ["expo-font-families", {}]]));
  assert.equal(out.plugins.length, 1);
  assert.equal(out.plugins[0][0], "expo-font");
  assert.ok(out.plugins[0][1].android.fonts.length);
});

test("the expo-font-families plugin rewrites the expo-font entry after it in place", () => {
  const root = project();
  const plugins = ["expo-font-families", fontsEntry, "expo-router"];
  const config = configIn(root, plugins);
  const out = fontFamiliesPlugin(config);
  // Same array: Expo is iterating it, and reaches the rewritten entry next.
  assert.equal(out.plugins, plugins);
  assert.equal(plugins.length, 3);
  assert.equal(plugins[1][0], "expo-font");
  assert.equal(plugins[1][1].fonts, undefined);
  assert.deepEqual(plugins[1][1].android.fonts.map((f) => f.fontFamily), ["Open Sans", "Playfair Display"]);
  assert.ok(fs.existsSync(path.join(root, "fonts.js")));
});

test("the expo-font-families plugin explains when it's after expo-font or given options", () => {
  const root = project();
  // expo-font already ran with its own fonts: too late to convert them.
  const late = configIn(root, [fontsEntry, "expo-font-families"]);
  late._internal.pluginHistory = { "expo-font": { name: "expo-font" } };
  assert.throws(() => fontFamiliesPlugin(late), /must come before "expo-font"/);

  // A bare expo-font entry has no fonts, so its order doesn't matter (there's nothing to convert).
  const bare = configIn(root, ["expo-font", "expo-font-families"]);
  bare._internal.pluginHistory = { "expo-font": { name: "expo-font" } };
  assert.doesNotThrow(() => fontFamiliesPlugin(bare));

  assert.throws(() => fontFamiliesPlugin(configIn(root, [fontsEntry]), { fonts: ["./x"] }), /takes no options/);
  assert.doesNotThrow(() => fontFamiliesPlugin(configIn(root, ["expo-font-families", fontsEntry]), {}));
});

test("withFontFamilies explains when expo-font is missing or old", () => {
  assert.throws(() => withFontFamilies(configIn(project(null), [fontsEntry])), /expo-font isn't installed/);
  assert.throws(() => withFontFamilies(configIn(project("13.2.2"), [fontsEntry])), /Needs expo-font 13\.3\.0 or newer/);
  assert.doesNotThrow(() => withFontFamilies(configIn(project("13.3.0"), [fontsEntry])));
});

test("uses standard weights as stored, and fixes non-standard ones from the style name", () => {
  assert.equal(cssWeight(700, ["Regular"]), 700);
  // Inter stores 250 for both Thin and ExtraLight.
  assert.equal(cssWeight(250, ["Thin"]), 100);
  assert.equal(cssWeight(250, ["ExtraLight Italic"]), 200);
  assert.equal(cssWeight(275, ["Ultra-Light"]), 200);
  assert.equal(cssWeight(350, ["SemiBold"]), 600);
  assert.equal(cssWeight(250, ["ThinItalic"]), 100);
  // A legacy style name without the weight; the full name has it.
  assert.equal(cssWeight(250, ["Italic", "Inter Thin Italic"]), 100);
  // No weight word ("Something" contains "thin"): round to the nearest standard weight.
  assert.equal(cssWeight(350, ["Something"]), 400);
  assert.equal(cssWeight(1, []), 100);
});

test("names families and faces for the Fonts object", () => {
  assert.equal(familyKey("Inter"), "Inter");
  assert.equal(familyKey("Playfair Display"), "PlayfairDisplay");
  assert.equal(familyKey("Source Sans 3"), "SourceSans3");
  assert.equal(familyKey("IBM Plex Sans"), "IBMPlexSans");
  assert.equal(familyKey("3D Font"), "_3DFont");
  assert.equal(faceKey({ weight: 400, style: "normal" }), "regular");
  assert.equal(faceKey({ weight: 400, style: "italic" }), "italic");
  assert.equal(faceKey({ weight: 700, style: "italic" }), "boldItalic");
  assert.equal(faceKey({ weight: 200, style: "normal" }), "extraLight");
});

test("generates one style object per bundled face", () => {
  const plan = planFonts(collectFontFiles(FIXTURES, "/"));
  const ts = fontsModule(plan, { typescript: true });
  assert.match(ts, /^\/\/ Generated by expo-font-families\./);
  assert.match(ts, /  OpenSans: \{\n    semiBold: \{ fontFamily: "Open Sans", fontWeight: "600" \},\n  \},/);
  // Each family says which face to use: regular when there is one, otherwise the first.
  assert.match(ts, /\/\*\* Open Sans\. Use a face, e\.g\. `Fonts\.OpenSans\.semiBold`\. \*\/\n  OpenSans: \{/);
  assert.match(ts, /\/\*\* Playfair Display\. Use a face, e\.g\. `Fonts\.PlayfairDisplay\.regular`\. \*\//);
  assert.match(ts, /    boldItalic: \{ fontFamily: "Playfair Display", fontWeight: "700", fontStyle: "italic" \},/);
  assert.match(ts, /\} as const;/);
  assert.match(ts, /export type FontFamily = "Open Sans" \| "Playfair Display";/);

  const js = fontsModule(plan, { typescript: false });
  assert.doesNotMatch(js, /as const|export type/);
});

test("withFontFamilies writes fonts.ts, only when it changes, and never over someone else's file", () => {
  const root = project();
  fs.writeFileSync(path.join(root, "tsconfig.json"), "{}");
  const file = path.join(root, "fonts.ts");

  withFontFamilies(configIn(root, [fontsEntry]));
  const first = fs.readFileSync(file, "utf8");
  assert.match(first, /export const Fonts = \{/);

  // Unchanged fonts: the file isn't rewritten.
  const mtime = fs.statSync(file).mtimeMs;
  fs.utimesSync(file, new Date(0), new Date(0));
  withFontFamilies(configIn(root, [fontsEntry]));
  assert.equal(fs.statSync(file).mtimeMs, 0);
  assert.notEqual(mtime, 0);

  // A file the user wrote is left alone.
  fs.writeFileSync(file, "export const mine = 1;\n");
  withFontFamilies(configIn(root, [fontsEntry]));
  assert.equal(fs.readFileSync(file, "utf8"), "export const mine = 1;\n");

  // Without a tsconfig.json it writes plain JavaScript.
  const jsRoot = project();
  withFontFamilies(configIn(jsRoot, [fontsEntry]));
  assert.ok(fs.existsSync(path.join(jsRoot, "fonts.js")));
  assert.ok(!fs.existsSync(path.join(jsRoot, "fonts.ts")));
});
