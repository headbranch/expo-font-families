import type { ExpoConfig } from "expo/config";

/**
 * Returns `config` with the fonts in the expo-font plugin's `fonts` property bundled as native
 * font families, so plain styles work on both platforms:
 * `{ fontFamily: "Inter", fontWeight: "700", fontStyle: "italic" }`.
 * Use it in app.config.js/.ts. Alternatively, list "expo-font-families" as a config plugin, before
 * "expo-font" in `plugins`.
 */
export declare function withFontFamilies<T extends Partial<ExpoConfig>>(config: T): T;

export default withFontFamilies;
