import type { ExtractedColor } from "@/utils/graphql/getters.ts";
import { getExtractedColors } from "@/utils/graphql/getters.ts";

const MAX_COVER_CACHE = 150;
const coverColorCache = new Map<string, ExtractedColor>();
const pendingRequests = new Map<string, Promise<ExtractedColor | undefined>>();

export async function getCoverColor(imageUrl: string): Promise<ExtractedColor | undefined> {
  if (!imageUrl) return undefined;

  if (coverColorCache.has(imageUrl)) {
    const cached = coverColorCache.get(imageUrl);
    coverColorCache.delete(imageUrl);
    if (cached) coverColorCache.set(imageUrl, cached);
    return cached;
  }

  if (pendingRequests.has(imageUrl)) {
    return pendingRequests.get(imageUrl);
  }

  const promise = extractColorInternal(imageUrl)
    .then((result) => {
      pendingRequests.delete(imageUrl);
      if (result) {
        if (coverColorCache.size >= MAX_COVER_CACHE) {
          const oldest = coverColorCache.keys().next().value;
          if (oldest) coverColorCache.delete(oldest);
        }
        coverColorCache.set(imageUrl, result);
      }
      return result;
    })
    .catch(() => {
      pendingRequests.delete(imageUrl);
      return undefined;
    });

  pendingRequests.set(imageUrl, promise);
  return promise;
}

let shared1x1CanvasCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getShared1x1Context(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (shared1x1CanvasCtx) return shared1x1CanvasCtx;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(1, 1);
    shared1x1CanvasCtx = canvas.getContext("2d", { willReadFrequently: true });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    shared1x1CanvasCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  return shared1x1CanvasCtx;
}

async function extractColorInternal(imageUrl: string): Promise<ExtractedColor | undefined> {
  try {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("GraphQL color extraction timeout")), 750);
    });

    const spotifyColors = await Promise.race([
      getExtractedColors([imageUrl]),
      timeoutPromise,
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    const extracted = spotifyColors?.data?.extractedColors?.[0];

    if (extracted && !extracted.colorRaw?.fallback) {
      return extracted;
    }
  } catch (error) {
    console.warn("Failed to fetch colors from Spotify API:", error);
  }

  try {
    const [colorData] = await Spicetify.extractColorPreset(imageUrl);

    if (colorData && !colorData.isFallback) {
      return {
        colorRaw: { hex: colorData.colorRaw.toCSS(Spicetify.Color.CSSFormat.HEX), fallback: false },
        colorDark: {
          hex: colorData.colorDark.toCSS(Spicetify.Color.CSSFormat.HEX),
          fallback: false,
        },
        colorLight: {
          hex: colorData.colorLight.toCSS(Spicetify.Color.CSSFormat.HEX),
          fallback: false,
        },
      };
    }
  } catch (error) {
    console.warn("Failed to extract color preset via Spicetify:", error);
  }

  try {
    return await extractCanvasColor(imageUrl);
  } catch (error) {
    console.error("Canvas color extraction failed:", error);
  }

  return undefined;
}

async function extractCanvasColor(imageUrl: string): Promise<ExtractedColor | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = imageUrl.startsWith("spotify:") ? null : "anonymous";

    img.onload = () => {
      try {
        const ctx = getShared1x1Context();
        if (!ctx) return resolve(undefined);

        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

        resolve({
          colorRaw: { hex: rgbToHex(r, g, b), fallback: true },
          colorDark: { hex: adjustBrightness(r, g, b, 0.6), fallback: true },
          colorLight: { hex: adjustBrightness(r, g, b, 1.4), fallback: true },
        });
      } catch {
        resolve(undefined);
      }
    };

    img.onerror = () => resolve(undefined);
    img.src = imageUrl;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function adjustBrightness(r: number, g: number, b: number, factor: number): string {
  const clamp = (val: number) => Math.min(255, Math.max(0, Math.round(val * factor)));
  return rgbToHex(clamp(r), clamp(g), clamp(b));
}
