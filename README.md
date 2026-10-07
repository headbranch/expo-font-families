# expo-font-families

One font name, every weight, both platforms. Make your `expo-font` fonts behave like the system
font, with a typed style for every face.

_A community package that builds on `expo-font`. It isn't made by or affiliated with Expo._

## The problem

When you list font files in the `expo-font` plugin's `fonts` property, each platform treats them
differently. For example, with this config:

```json
[
	"expo-font",
	{
		"fonts": [
			"./assets/fonts/Inter_400Regular.ttf",
			"./assets/fonts/Inter_700Bold.ttf"
		]
	}
]
```

- **iOS** uses the font family name inside the file, so `fontFamily: "Inter", fontWeight: "700"`
  works there, but not on Android.

- **Android** uses the file name as the font family, so `fontWeight` and `fontStyle` don't work.
  You have to write something like `style={{ fontFamily: "Inter_700Bold" }}` for Android instead.

To use one name on both platforms, Expo recommends looking up each file's PostScript name in a
font tool and renaming the file to match. iOS accepts the PostScript name as the name of that exact
weight and style, and Android uses the file name, so after renaming, one name works on both.

For example, the PostScript name of `Inter_700Bold.ttf` is `Inter-Bold`, so you rename the file to
`Inter-Bold.ttf` and write:

```tsx
<Text style={{ fontFamily: "Inter-Bold" }} />
```

That works on both platforms, but each weight and style is still a separate name, and `fontWeight`
still does nothing.

PostScript names also aren't always what you'd guess: Inter Regular Italic's is `Inter-Italic`,
not `Inter-RegularItalic`. If you don't have a font tool like FontForge to look them up, or can't
rename the files (as with fonts from a package like Google Fonts), your only other option is to
define Android font families in the plugin config yourself, listing every file with its weight and
style by hand.

## The solution

**`expo-font-families`** does all that manual work for you. It reads the family, weight and style
from each file in the `expo-font` plugin's `fonts` property and turns them into font families.

You write:

```json
[
	"expo-font",
	{
		"fonts": ["@expo-google-fonts/inter"]
	}
]
```

**`expo-font-families`** reads the files and passes this to `expo-font`:

```jsonc
[
	"expo-font",
	{
		"ios": {
			"fonts": [
				".../Inter_400Regular.ttf",
				".../Inter_700Bold.ttf"
				// and so on...
			]
		},
		"android": {
			"fonts": [
				{
					"fontFamily": "Inter",
					"fontDefinitions": [
						{
							"path": ".../Inter_400Regular.ttf",
							"weight": 400,
							"style": "normal"
						},
						{
							"path": ".../Inter_700Bold.ttf",
							"weight": 700,
							"style": "normal"
						}
						// and so on...
					]
				}
			]
		}
	}
]
```

Now one name works on both platforms:

```tsx
<Text style={{ fontFamily: "Inter", fontWeight: "700" }} />
```

It also generates a typed style for every face, so your editor autocompletes the fonts you ship
and TypeScript catches typos and missing weights (see [Use the font](#5-use-the-font)):

```tsx
<Text style={Fonts.Inter.bold} />
```

## Quick start

### 1. Install

```bash
npx expo install expo-font-families expo-font
```

This adds `"expo-font-families"` to the end of `plugins`. If you'll use expo-font-families as a
[plugin](#or-use-it-as-a-plugin), move it above `"expo-font"`. If you'll use the
[wrapper](#use-it-as-a-config-wrapper), you can leave it as is.

### 2. List your fonts in expo-font

Put your `.ttf`/`.otf` files in a folder in your project. You can use any folder, but we recommend
`./assets/fonts`. Subfolders are fine. File names must be unique, start with a letter and end in a
lowercase `.ttf` or `.otf`.

Then add the folder to the `expo-font` plugin's `fonts` property in `app.json`:

```json
{
	"expo": {
		"plugins": [["expo-font", { "fonts": ["./assets/fonts"] }]]
	}
}
```

Each entry can be a folder, which is searched recursively, or a single font file. Paths are
relative to the project root.

#### Google Fonts

Installed font packages work too, such as the
[`@expo-google-fonts`](https://github.com/expo/google-fonts) packages. Install the family and list
the package:

```bash
npx expo install @expo-google-fonts/inter
```

```json
["expo-font", { "fonts": ["@expo-google-fonts/inter"] }]
```

That gives you `fontFamily: "Inter"` with every weight from 100 to 900, each with an italic.

Note: every listed file ends up in your app, and a whole family can be large. For example, all
18 Inter files add about 6 MB. To ship only the weights you use, list a weight's folder or file
instead:

```json
[
	"expo-font",
	{
		"fonts": [
			"@expo-google-fonts/inter/400Regular",
			"@expo-google-fonts/inter/700Bold",
			"@expo-google-fonts/inter/700Bold_Italic"
		]
	}
]
```

### 3. Add expo-font-families to your config

#### Use it as a config wrapper

If you don't have one yet, create `app.config.js` next to `app.json`. Then wrap the config with
`withFontFamilies`:

```js
// app.config.js
const { withFontFamilies } = require("expo-font-families");

module.exports = ({ config }) => withFontFamilies(config);
```

Or in TypeScript:

```ts
// app.config.ts
import type { ConfigContext, ExpoConfig } from "expo/config";
import { withFontFamilies } from "expo-font-families";

export default ({ config }: ConfigContext): ExpoConfig =>
	withFontFamilies(config as ExpoConfig);
```

`config` holds everything from `app.json`, so the rest of your settings can stay there. If you
change the config in this file too, wrap the **final** result.

#### Or use it as a plugin

If you'd rather keep everything in `app.json`, list `"expo-font-families"` as a plugin instead of
creating `app.config.js`. **It must come before `"expo-font"`:**

```json
{
	"expo": {
		"plugins": [
			"expo-font-families",
			["expo-font", { "fonts": ["./assets/fonts"] }]
		]
	}
}
```

Plugins run in order, and expo-font-families needs to read your fonts before `expo-font` bundles
them. If `"expo-font-families"` comes after `"expo-font"`, the build stops and tells you to move it.

`npx expo install expo-font-families` adds `"expo-font-families"` to the **end** of `plugins`, which
is the wrong order, so move it above `"expo-font"` yourself. The plugin takes no options.

### 4. Rebuild the app

Fonts are compiled into the native app, so make a new native build the way you normally do, for
example with `npx expo run:ios`, `npx expo run:android` or EAS Build. **Every font change needs a
rebuild.** Expo Go isn't supported.

### 5. Use the font

expo-font-families writes `fonts.ts` to your project root, with a ready-made style for every face
you bundle. This works the same with the wrapper and the plugin:

```tsx
import { Fonts } from "./fonts";

<Text style={Fonts.Inter.boldItalic}>Hello</Text>
<Text style={[Fonts.Inter.bold, { fontSize: 24 }]}>Title</Text>

const styles = StyleSheet.create({
	title: { ...Fonts.Inter.black, fontSize: 32 },
});
```

Your editor autocompletes the families and faces you actually ship, and TypeScript rejects the
rest. A typo like `Fonts.Intr`, or a weight you didn't bundle like `Fonts.Inter.thin` when you only
ship regular and bold, is a compile error instead of a silent fallback to the system font.

A family like `Fonts.Inter` isn't a style on its own, so always pick one of its faces, like
`Fonts.Inter.regular`.

#### Plain styles

You can also write the styles yourself, with the family name and the usual `fontWeight` and
`fontStyle`:

```tsx
<Text style={{ fontFamily: "Inter", fontWeight: "700", fontStyle: "italic" }}>
	Hello
</Text>
```

Use the family name stored inside the font file, not the file name. You can find it as the
`fontFamily` in the `Fonts` styles. For props that take just a family name, `fonts.ts` also exports
a `FontFamily` type with every bundled family.

Whether you use `Fonts` or plain styles, the right file is chosen natively, so nested `<Text>` and
third-party components work too.

#### About fonts.ts

- **It stays in sync on its own.** The file is regenerated whenever Expo reads your config, such
  as on `expo start` and every build, and only rewritten when your fonts change. Commit it, so
  type checks pass without running Expo first.
- **Don't move or edit it.** It would be regenerated at the project root. To import it from
  somewhere else, re-export it there: `export { Fonts } from "../fonts";`.
- **JavaScript projects** without a `tsconfig.json` get `fonts.js` instead, with the same `Fonts`
  object.

## Using with expo-font

expo-font-families only changes the `expo-font` plugin's `fonts` property. Everything else in
`expo-font` works as before:

- **Runtime loading** with `useFonts` or `loadAsync` is unaffected, for example for downloaded
  fonts.
- **The `expo-font` plugin's `ios.fonts` and `android.fonts` properties** are passed through
  untouched. Use them for fonts that should be on one platform only. If a family is in both
  `fonts` and one of these lists, expo-font-families warns you, so keep each family in one place.

### Moving an existing project to expo-font-families

1. Keep the `expo-font` plugin's `fonts` property as it is and wrap your config with
   `withFontFamilies` (or add the [plugin](#or-use-it-as-a-plugin)).
2. Run [`npx expo-font-families`](#inspecting-your-fonts) to see which family and weight each file
   became.
3. Replace file-based names like `fontFamily: "Inter_700Bold"` with the family name plus a
   weight: `fontFamily: "Inter", fontWeight: "700"`. Android only knows the family names now.
4. Rebuild with `npx expo prebuild --clean`, so files from the old setup are removed.

## Inspecting your fonts

`npx expo-font-families` lists what will be bundled, and which file became which face:

```bash
npx expo-font-families
```

```
fontFamily: "Inter"
  400  normal  assets/fonts/Inter_400Regular.ttf
  700  normal  assets/fonts/Inter_700Bold.ttf
  700  italic  assets/fonts/Inter_700Bold_Italic.ttf
```

It reads your app config, so it shows exactly what your next build will include. Use it when a
face looks wrong, or when moving an existing project to expo-font-families.

To preview fonts that aren't in your config yet, pass their files or folders:
`npx expo-font-families ./downloads/SomeFont`. Add `--json` for machine-readable output.

## Troubleshooting

### My font change doesn't show up

Fonts are compiled into the native app, so rebuild it. A JS reload isn't enough.

### The build fails after I removed or renamed a font

`expo-font` adds fonts to the native projects but never removes old ones, so the iOS project can
still point at a file that no longer exists. Regenerate the native projects:

```bash
npx expo prebuild --clean
```

### The text shows the system font

- If you write plain styles, check that `fontFamily` exactly matches a family in `fonts.ts`. File
  names don't work. Using the `Fonts` styles avoids this.
- If `fonts.ts` isn't generated, check that `app.config.js`/`.ts` returns
  `withFontFamilies(config)`, or, if you use the plugin, that `"expo-font-families"` is in
  `plugins`.
- If the build prints `[expo-font-families] The expo-font plugin has no "fonts" property`, add your
  fonts to it (see [step 2](#2-list-your-fonts-in-expo-font)).
- If the build prints `[expo-font-families] No .ttf/.otf files found`, the paths in the `expo-font`
  plugin's `fonts` property exist but contain no fonts. Check that they point at the right folders.

### The weight looks slightly off

If you ask for a weight you didn't bundle, each platform falls back to the nearest one. The `Fonts`
styles only offer weights you have, and [`npx expo-font-families`](#inspecting-your-fonts) shows
which file each weight came from. Variable fonts are registered at their default weight only, so use
static files, one per weight.

### A warning says fonts.ts "wasn't generated by expo-font-families"

You already have your own `fonts.ts` (or `fonts.js`) in the project root, and expo-font-families
never overwrites a file it didn't create. Rename or remove yours, and the `Fonts` styles are written
on the next `expo start` or build.

### A warning says a font "stores different family names"

That font file contains more than one family name. expo-font-families uses the first one, but iOS
might pick another. If the font looks wrong on iOS, use a different build of the font.

### The build stops with a `[expo-font-families]` error

| Error                                                        | Fix                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two files are the same family, weight and style              | Remove one of them.                                                                                                                                                                                    |
| Two files or families "would both be `<name>` on Android"    | Android flattens names to lowercase letters, digits and `_`. So `Bold.ttf` in two folders clash, and so do the families "Open Sans" and "OpenSans". Rename one file, or keep only one of the families. |
| Two families "would both be `Fonts.<name>`"                  | Their names only differ in spaces or punctuation. Keep only one of the families.                                                                                                                       |
| Android needs font file names that start with a letter       | Rename the file, for example `1.ttf` to `font1.ttf`.                                                                                                                                                   |
| Rename it to end in `.ttf`/`.otf`                            | `expo-font` skips uppercase extensions like `.TTF`. Rename the file.                                                                                                                                   |
| WOFF/WOFF2 is a web format                                   | Use the `.ttf`/`.otf` version of the font.                                                                                                                                                             |
| Font collections (`.ttc`) aren't supported                   | Use separate `.ttf`/`.otf` files.                                                                                                                                                                      |
| Not a TrueType/OpenType font                                 | Remove the file from your fonts folder.                                                                                                                                                                |
| Font has no family name, or no 'name' table                  | The file is damaged or incomplete. Use another copy of the font.                                                                                                                                       |
| A path does not exist                                        | Fix the path in the `expo-font` plugin's `fonts` property.                                                                                                                                             |
| A path "isn't a font"                                        | List only font files and folders in `fonts`.                                                                                                                                                           |
| `expo-font` isn't installed                                  | Run `npx expo install expo-font`.                                                                                                                                                                      |
| Needs `expo-font` 13.3.0 or newer                            | Upgrade to Expo SDK 53 or newer.                                                                                                                                                                       |
| "expo-font-families" must come before "expo-font" in plugins | Move `"expo-font-families"` above `"expo-font"` (see [Or use it as a plugin](#or-use-it-as-a-plugin)).                                                                                                 |
| The expo-font-families plugin takes no options               | Remove the options from `"expo-font-families"`, and list your fonts in the `expo-font` plugin's `fonts` property.                                                                                      |

## Requirements

- Expo SDK 53+ (`expo-font` 13.3.0+)
- Node 18+

expo-font-families bundles your font files unchanged, so check each font's license before you ship
it.

## License

MIT
