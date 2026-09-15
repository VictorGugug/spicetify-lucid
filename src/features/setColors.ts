import appStore from "@/store/appStore.ts";
import tempStore from "@/store/tempStore.ts";
import getMaterialColors, { type SchemeVariant } from "@/utils/colors/getMaterialColors.ts";
import getOrCreateStyle from "@/utils/dom/getOrCreateStyle.ts";

const DEFAULT_ACCENT_COLOR = "#1ed760";
const MAX_CACHE_SIZE = 50;

let lastCacheKey = "";
const colorCache: Map<string, string> = new Map();

export default function setColors() {
  const { mode, isDark, isTinted, accentColor, schemeVariant } = appStore.getState().color;

  const themeValue = isDark ? "dark" : "light";
  if (document.documentElement.getAttribute("theme") !== themeValue) {
    document.documentElement.setAttribute("theme", themeValue);
  }
  if (document.body.getAttribute("theme") !== themeValue) {
    document.body.setAttribute("theme", themeValue);
  }

  let color = DEFAULT_ACCENT_COLOR;
  if (mode === "custom") {
    color = accentColor ?? DEFAULT_ACCENT_COLOR;
  } else if (mode === "dynamic") {
    color = tempStore.getState().player?.current?.colors?.colorRaw?.hex ?? DEFAULT_ACCENT_COLOR;
  }

  const cacheKey = `${color}-${themeValue}-${isTinted ? "tint" : "no-tint"}-${schemeVariant}`;

  if (cacheKey === lastCacheKey) {
    return;
  }

  const css = getCachedColorCSS(color, isDark, isTinted, schemeVariant);
  lastCacheKey = cacheKey;

  const style = getOrCreateStyle("lucid-colors");
  if (style.textContent !== css) {
    style.textContent = css;
  }
}

function getCachedColorCSS(
  color: string,
  isDark: boolean,
  isTinted: boolean,
  schemeVariant: SchemeVariant,
): string {
  const cacheKey = `${color}-${isDark ? "dark" : "light"}-${isTinted ? "tint" : "no-tint"}-${schemeVariant}`;

  if (colorCache.has(cacheKey)) {
    const cached = colorCache.get(cacheKey) as string;
    colorCache.delete(cacheKey);
    colorCache.set(cacheKey, cached);
    return cached;
  }

  const css = getMaterialColors(color, isDark, isTinted, schemeVariant);

  if (colorCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = colorCache.keys().next().value;
    if (oldestKey) {
      colorCache.delete(oldestKey);
    }
  }

  colorCache.set(cacheKey, css);
  return css;
}

appStore.subscribe((state) => state.color, setColors);
tempStore.subscribe((state) => {
  if (appStore.getState().color.mode !== "dynamic") return null;
  return state.player?.current?.colors?.colorRaw?.hex;
}, setColors);

export function cacheColorInBackground(
  color: string,
  isDark = false,
  isTinted = false,
  schemeVariant: SchemeVariant = "tonalSpot",
) {
  getCachedColorCSS(color, isDark, isTinted, schemeVariant);
}
