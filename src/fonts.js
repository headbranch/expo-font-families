// Pure Node: reads font files and plans what to bundle. No Expo imports, so it's testable alone.
const fs = require("fs");
const path = require("path");

const EN_US = 0x0409;
const FONT_EXT = /\.(ttf|otf|ttc|woff2?)$/i;

// app.config is evaluated several times per command; print each warning once per process.
const warned = new Set();
function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/** Reads family, weight and italic from a TTF/OTF file's `name` and `OS/2` tables. */
function readFontMeta(file) {
  const b = fs.readFileSync(file);
  if (b.length < 12) throw new Error(`[expo-font-families] ${file}: not a TrueType/OpenType font`);
  const tag = b.toString("latin1", 0, 4);
  if (tag === "wOFF" || tag === "wOF2")
    throw new Error(`[expo-font-families] ${file}: WOFF/WOFF2 is a web format; use the .ttf/.otf version of this font`);
  if (tag === "ttcf")
    throw new Error(`[expo-font-families] ${file}: font collections (.ttc) aren't supported; use separate .ttf/.otf files`);
  // The real format comes from the file's signature, not its extension.
  let ext;
  if (tag === "OTTO") ext = ".otf";
  else if (tag === "true" || b.readUInt32BE(0) === 0x00010000) ext = ".ttf";
  else throw new Error(`[expo-font-families] ${file}: not a TrueType/OpenType font`);

  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tables = {};
  for (let i = 0, n = dv.getUint16(4); i < n; i++) {
    const r = 12 + i * 16;
    tables[b.toString("latin1", r, r + 4)] = dv.getUint32(r + 8);
  }
  if (tables.name == null) throw new Error(`[expo-font-families] ${file}: no 'name' table`);

  // All records for a nameID, best first: Windows English, Unicode, other Windows, Mac Roman.
  const names = (id) => {
    const t = tables.name;
    const count = dv.getUint16(t + 2);
    const strBase = t + dv.getUint16(t + 4);
    const out = [];
    for (let j = 0; j < count; j++) {
      const r = t + 6 + j * 12;
      if (dv.getUint16(r + 6) !== id) continue;
      const platform = dv.getUint16(r);
      const lang = dv.getUint16(r + 4);
      const len = dv.getUint16(r + 8);
      const off = strBase + dv.getUint16(r + 10);
      let rank;
      if (platform === 3) rank = lang === EN_US ? 0 : 2;
      else if (platform === 0) rank = 1;
      else if (platform === 1) rank = lang === 0 ? 3 : 4;
      else continue;
      let s = "";
      if (platform === 1) s = b.toString("latin1", off, off + len);
      else for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(dv.getUint16(off + k));
      out.push({ rank, s });
    }
    return out.sort((a, b) => a.rank - b.rank).map((n) => n.s);
  };

  // Typographic family (16) groups all weights; legacy family (1) may include the weight.
  const familyId = names(16).length ? 16 : 1;
  const families = [...new Set(names(familyId))];
  if (families.length === 0) throw new Error(`[expo-font-families] ${file}: font has no family name`);
  if (families.length > 1)
    warnOnce(
      `[expo-font-families] ${path.basename(file)} stores different family names (${families.join(", ")}); ` +
        `using "${families[0]}". iOS may use another one.`
    );

  const os2 = tables["OS/2"];
  return {
    family: families[0],
    weight: cssWeight(os2 != null ? dv.getUint16(os2 + 4) : 400, [...names(17), ...names(2), ...names(4)]),
    italic:
      os2 != null
        ? (dv.getUint16(os2 + 62) & 1) === 1 // fsSelection bit 0
        : /italic|oblique/i.test(names(2)[0] ?? ""),
    ext,
  };
}

// Weight words in style names, most specific first ("ExtraLight" before "Light").
const WEIGHT_NAMES = [
  [/\b(extra|ultra) ?light\b/, 200],
  [/\b(semi|demi) ?bold\b/, 600],
  [/\b(extra|ultra) ?bold\b/, 800],
  [/\b(thin|hairline)\b/, 100],
  [/\blight\b/, 300],
  [/\bmedium\b/, 500],
  [/\b(black|heavy)\b/, 900],
  [/\bbold\b/, 700],
];

/**
 * The CSS weight (100-900, as React Native's fontWeight uses) for a font's usWeightClass. Some fonts
 * store non-standard values, e.g. 250 for both Thin and ExtraLight to work around old Windows
 * rendering; those are read from the style names instead, or rounded if no name has a weight word.
 */
function cssWeight(usWeightClass, styleNames) {
  if (usWeightClass >= 100 && usWeightClass <= 900 && usWeightClass % 100 === 0) return usWeightClass;
  for (const name of styleNames) {
    // "ExtraLightItalic" -> "extra light italic"
    const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[-_]/g, " ");
    const hit = WEIGHT_NAMES.find(([re]) => re.test(words));
    if (hit) return hit[1];
  }
  return Math.min(900, Math.max(100, Math.round(usWeightClass / 100) * 100));
}

/** Expands files and folders (recursively, including package paths) into a sorted list of font files. */
function collectFontFiles(inputs, projectRoot) {
  const out = [];
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (FONT_EXT.test(entry.name)) out.push(full);
    }
  };
  for (const input of [].concat(inputs)) {
    const p = resolvePath(input, projectRoot);
    if (!p) throw new Error(`[expo-font-families] "${input}" does not exist`);
    if (fs.statSync(p).isDirectory()) walk(p);
    // e.g. a non-font file, or a package's main file found by require.resolve
    else if (!FONT_EXT.test(p))
      throw new Error(`[expo-font-families] "${input}" (${p}) isn't a font; list only font files and folders`);
    else out.push(p);
  }
  return [...new Set(out)].sort();
}

// A package name, optionally followed by a path inside it: "@scope/name/sub/path" or "name/sub".
const PACKAGE_PATH = /^((?:@[^/]+\/)?[^/@.][^/]*)(?:\/(.+))?$/;

/**
 * Resolves a path from the project root, then as a package, or a file or folder inside one, found
 * in node_modules (like expo-font, which also accepts package file paths), then via require.resolve.
 */
function resolvePath(input, projectRoot) {
  const local = path.resolve(projectRoot, input);
  if (fs.existsSync(local)) return local;
  const m = PACKAGE_PATH.exec(input.replace(/\\/g, "/"));
  if (m)
    for (let dir = projectRoot; ; dir = path.dirname(dir)) {
      const p = path.join(dir, "node_modules", m[1], m[2] ?? "");
      if (fs.existsSync(p)) return p;
      if (path.dirname(dir) === dir) break;
    }
  try {
    return require.resolve(input, { paths: [projectRoot] });
  } catch {
    return null;
  }
}

// expo-font's rule for Android resource names (lowercase a-z, 0-9, underscore), applied to a file's
// base name or a family name. Its family XMLs get an "xml_" prefix.
const androidName = (s) =>
  path
    .parse(s)
    .name.replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_");
const XML_PREFIX = "xml_";

/**
 * Reads every file and groups the faces into families.
 * Throws on duplicate faces, and on file or family names that expo-font can't bundle on Android
 * (where file and family names share one resource namespace).
 */
function planFonts(files) {
  const faces = [];
  const byFace = new Map();
  const resources = new Map();
  const claim = (name, owner) => {
    if (resources.has(name))
      throw new Error(`[expo-font-families] ${resources.get(name)} and ${owner} would both be "${name}" on Android; rename one`);
    resources.set(name, owner);
  };

  for (const file of files) {
    const m = readFontMeta(file);
    const ext = path.extname(file);
    if (ext !== ".ttf" && ext !== ".otf")
      throw new Error(`[expo-font-families] ${file}: rename it to end in ${m.ext}; expo-font only picks up lowercase .ttf/.otf files`);
    const style = m.italic ? "italic" : "normal";
    const id = `${m.family}|${m.weight}|${style}`;
    if (byFace.has(id))
      throw new Error(
        `[expo-font-families] ${file} and ${byFace.get(id)} are both ${m.family} ${m.weight} ${style}; remove one`
      );
    byFace.set(id, file);

    const name = androidName(file);
    if (!/^[a-z]/.test(name))
      throw new Error(`[expo-font-families] ${file}: Android needs font file names that start with a letter; rename it`);
    claim(name, file);
    faces.push({ source: file, family: m.family, weight: m.weight, style });
  }

  const families = [...new Set(faces.map((f) => f.family))].sort().map((family) => {
    claim(XML_PREFIX + androidName(family), `family "${family}"`);
    return {
      family,
      faces: faces
        .filter((f) => f.family === family)
        .sort((a, b) => a.weight - b.weight || (a.style === "italic") - (b.style === "italic")),
    };
  });
  return { faces, families };
}

/**
 * expo-font plugin options with the planned faces (read from `theirs.fonts`) listed as files on iOS
 * and as one XML font family per family on Android. The platform-specific lists are kept.
 */
function expoFontProps(plan, theirs = {}) {
  const { fonts, ...rest } = theirs;
  return {
    ...rest,
    ios: { ...theirs.ios, fonts: [...(theirs.ios?.fonts ?? []), ...plan.faces.map((f) => f.source)] },
    android: {
      ...theirs.android,
      fonts: [
        ...(theirs.android?.fonts ?? []),
        ...plan.families.map((family) => ({
          fontFamily: family.family,
          fontDefinitions: family.faces.map((f) => ({ path: f.source, weight: f.weight, style: f.style })),
        })),
      ],
    },
  };
}

/**
 * Family names that expo-font's platform-specific lists (`ios.fonts`, `android.fonts`) bundle,
 * mapped to the files involved (as display paths).
 * Files that can't be read are skipped; this only feeds a warning.
 */
function platformFamilies(props, projectRoot) {
  const found = new Map();
  const add = (family, file) => found.set(family, [...(found.get(family) ?? []), file]);
  const addFiles = (p) => {
    let files;
    try {
      files = collectFontFiles(p, projectRoot);
    } catch {
      return;
    }
    for (const file of files) {
      try {
        add(readFontMeta(file).family, path.relative(projectRoot, file) || file);
      } catch {}
    }
  };

  for (const p of props.ios?.fonts ?? []) addFiles(p);
  for (const f of props.android?.fonts ?? []) {
    if (typeof f === "string") addFiles(f);
    // XML families register under the name given here, whatever the files say.
    else if (f?.fontFamily) for (const d of f.fontDefinitions ?? []) add(f.fontFamily, d.path);
  }
  return found;
}

/** Warning lines for families in `fonts` that expo-font's platform-specific lists also bundle. */
function overlapWarnings(plan, expoFontOptions, projectRoot) {
  const theirs = platformFamilies(expoFontOptions ?? {}, projectRoot);
  return plan.families
    .filter((f) => theirs.has(f.family))
    .map(
      (f) =>
        `[expo-font-families] "${f.family}" is in the expo-font plugin's "fonts" property and also in its ` +
        `"ios.fonts" or "android.fonts" ` +
        `(${[...new Set(theirs.get(f.family))].join(", ")}). Remove one so it's only bundled once.`
    );
}

module.exports = {
  readFontMeta,
  collectFontFiles,
  planFonts,
  expoFontProps,
  overlapWarnings,
  warnOnce,
  androidName,
  cssWeight,
};
