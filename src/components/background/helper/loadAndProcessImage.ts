import type { CSSFilter } from "@/types/appStore.ts";
import serializeFilters from "@/utils/dom/serializeFilters.ts";
import { CanvasTexture, type Texture } from "three";

const MAX_TEXTURE_CACHE = 8;
const textureCache = new Map<string, Texture>();

export function isTextureInCache(texture: Texture): boolean {
  for (const cached of textureCache.values()) {
    if (cached === texture) return true;
  }
  return false;
}

async function loadAndProcessImage(
  url: string | null,
  filter: CSSFilter,
): Promise<Texture | null> {
  try {
    if (!url) {
      console.warn("No image URL provided");
      return null;
    }

    const filterKey = `${filter.blur ?? 0}_${filter.saturation ?? 100}_${filter.contrast ?? 100}_${filter.brightness ?? 100}`;
    const cacheKey = `${url}_${filterKey}`;

    const cached = textureCache.get(cacheKey);
    if (cached) {
      textureCache.delete(cacheKey);
      textureCache.set(cacheKey, cached);
      return cached;
    }

    const image = new Image();
    image.src = url;
    image.crossOrigin = url.startsWith("spotify:") ? null : "anonymous";
    await image.decode();

    const rawSize = Math.min(image.width, image.height);
    const originalSize = Math.min(rawSize, 384);
    const blurVal = Math.min(filter.blur ?? 40, 60);
    const blurExtent = Math.ceil(3 * blurVal);
    const padding = blurExtent * 1.5;
    const expandedSize = originalSize + padding;

    const circleCanvas = new OffscreenCanvas(originalSize, originalSize);
    const ctx = circleCanvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get 2D context for circleCanvas");
      return null;
    }

    ctx.beginPath();
    ctx.arc(originalSize / 2, originalSize / 2, originalSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      image,
      (image.width - rawSize) / 2,
      (image.height - rawSize) / 2,
      rawSize,
      rawSize,
      0,
      0,
      originalSize,
      originalSize,
    );

    const blurredCanvas = new OffscreenCanvas(expandedSize, expandedSize);
    const blurredCtx = blurredCanvas.getContext("2d");
    if (!blurredCtx) {
      console.error("Failed to get 2D context for blurredCanvas");
      return null;
    }

    blurredCtx.filter = serializeFilters(filter, { skipOpacity: true });
    blurredCtx.drawImage(circleCanvas, padding / 2, padding / 2);

    const texture = new CanvasTexture(blurredCanvas);
    texture.needsUpdate = true;

    if (textureCache.size >= MAX_TEXTURE_CACHE) {
      const oldestKey = textureCache.keys().next().value;
      if (oldestKey) {
        const oldTex = textureCache.get(oldestKey);
        oldTex?.dispose();
        textureCache.delete(oldestKey);
      }
    }
    textureCache.set(cacheKey, texture);

    return texture;
  } catch (err) {
    console.error("Failed to load/process image:", err);
    return null;
  }
}

export default loadAndProcessImage;
