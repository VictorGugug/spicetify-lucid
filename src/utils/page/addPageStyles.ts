import tempStore from "@/store/tempStore.ts";
import { hexToRGB } from "@/utils/colors/convert.ts";
import { getCoverColor } from "@/utils/colors/getCoverColor.ts";
import waitForGlobal from "@/utils/dom/waitForGlobal.ts";
import getArtworkByPageUrl from "@/utils/page/getArtworkByPageUrl.ts";
import { updateCardBgAlpha } from "@/utils/updateCardBgAlpha.ts";

let cardIntervalId: ReturnType<typeof setInterval> | null = null;
let latestPathname = "";

export const addPageStyles = async (url = Spicetify?.Platform?.History?.location) => {
  if (!url?.pathname) return;
  const currentPath = url.pathname;
  latestPathname = currentPath;

  if (cardIntervalId) {
    clearInterval(cardIntervalId);
    cardIntervalId = null;
  }

  document.body.toggleAttribute("is-at-root", currentPath === "/");

  const style = document.body.style;

  if (currentPath === "/search" || currentPath === "/home") {
    const cardSelector = `.iaaQKMqcyZQBT9bn, .Vn9yz8P5MjIvDT8c0U6w, .HR4FaJd7xDymgB64NpRG, .laOEpXn67bgflATz, div[data-uri="spotify:episode:*"]`;
    updateCardBgAlpha(cardSelector);
    let runs = 0;
    cardIntervalId = setInterval(() => {
      updateCardBgAlpha(cardSelector);
      runs++;
      if (runs >= 3) {
        if (cardIntervalId) {
          clearInterval(cardIntervalId);
          cardIntervalId = null;
        }
      }
    }, 400);
  }
  document.body.classList.toggle("at-disco", currentPath.includes("/discography"));

  const { imageUrl, desktopImageUrl } = await getArtworkByPageUrl(currentPath);
  if (latestPathname !== currentPath) return;

  tempStore.getState().setPageImg({ cover: imageUrl, desktop: desktopImageUrl });

  if (imageUrl) style.setProperty("--page-img-url", `url("${imageUrl}")`);
  else style.removeProperty("--page-img-url");

  if (desktopImageUrl) style.setProperty("--page-desktop-img-url", `url("${desktopImageUrl}")`);
  else style.removeProperty("--page-desktop-img-url");

  const finalPageImgUrl = desktopImageUrl ?? imageUrl;

  if (finalPageImgUrl) {
    const extractedColors = await getCoverColor(finalPageImgUrl);
    if (latestPathname !== currentPath) return;

    const colorHex = extractedColors?.colorDark?.hex;

    if (colorHex) {
      style.setProperty("--page-accent-color", colorHex);
      style.setProperty("--page-accent-color-rgb", hexToRGB(colorHex));
    } else {
      style.removeProperty("--page-accent-color");
      style.removeProperty("--page-accent-color-rgb");
    }
  } else {
    style.removeProperty("--page-accent-color");
    style.removeProperty("--page-accent-color-rgb");
  }
};

waitForGlobal(() => Spicetify?.Platform?.History)
  .then((history) => {
    history?.listen(async (url: { pathname: string } | null) => {
      await addPageStyles(url);
    });
  })
  .catch(() => {});

export default addPageStyles;
