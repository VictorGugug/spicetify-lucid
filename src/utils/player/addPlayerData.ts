import { cacheColorInBackground } from "@/features/setColors.ts";
import appStore from "@/store/appStore.ts";
import tempStore, { type PlayerData } from "@/store/tempStore.ts";
import { getCoverColor } from "@/utils/colors/getCoverColor.ts";
import waitForGlobal from "@/utils/dom/waitForGlobal.ts";

const scheduleIdle =
  typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 50);

let lastHandledUrl = "";
let isUpdatingQueue = false;

async function addPlayerData(playerData?: typeof Spicetify.Player.data) {
  const data =
    playerData ??
    (await waitForGlobal(() => {
      const d = Spicetify?.Player?.data;
      return d?.item ? d : undefined;
    }, { timeout: 5000, interval: 100 }).catch(() => Spicetify?.Player?.data));
  if (!data?.item) return;

  const getImageUrl = (item?: typeof data.item | null) => {
    const images = item?.images;
    return images?.[3]?.url || images?.[2]?.url || images?.[1]?.url || images?.[0]?.url || null;
  };

  const currentUrl = getImageUrl(data.item);
  if (!currentUrl) return;

  const isSameTrack = currentUrl === lastHandledUrl;
  lastHandledUrl = currentUrl;
  document.body.style.setProperty("--np-img-url", `url("${currentUrl}")`);

  const prevColors = isSameTrack ? tempStore.getState().player?.current?.colors : undefined;
  tempStore.getState().setPlayer({
    current: {
      url: currentUrl,
      colors: prevColors,
      data: data.item,
    },
  });

  if (!prevColors) {
    getCoverColor(currentUrl).then((colors) => {
      if (tempStore.getState().player?.current?.url === currentUrl) {
        tempStore.getState().setPlayer({
          current: {
            url: currentUrl,
            colors,
            data: data.item,
          },
        });
      }
    });
  }

  const { isDark, isTinted, mode } = appStore.getState().color;
  const stableCurrentUrl = currentUrl;

  scheduleIdle(async () => {
    if (tempStore.getState().player?.current?.url !== stableCurrentUrl) return;

    const showNextCard = appStore.getState().player?.nextSongCard?.show ?? true;
    let next: PlayerData[] = [];

    if (showNextCard && data.nextItems?.length) {
      const nextItem = data.nextItems[0];
      const nextUrl = getImageUrl(nextItem);
      if (nextUrl) {
        const colors = await getCoverColor(nextUrl);
        next = [{ url: nextUrl, colors, data: nextItem }];
      }
    }

    if (tempStore.getState().player?.current?.url === stableCurrentUrl) {
      tempStore.getState().setPlayer({ next });

      if (mode === "dynamic" && next.length > 0) {
        const hex = next[0]?.colors?.colorRaw?.hex;
        if (hex) {
          scheduleIdle(() => {
            if (tempStore.getState().player?.current?.url === stableCurrentUrl) {
              cacheColorInBackground(hex, isDark, isTinted);
            }
          });
        }
      }
    }
  });
}

waitForGlobal(() => Spicetify?.Player)
  .then((player) => {
    player?.addEventListener("songchange", (e: any) => addPlayerData(e?.data));
    player?.addEventListener("onplaypause", () => {
      if (!tempStore.getState().player?.current?.url) {
        addPlayerData();
      }
    });
  })
  .catch(() => {});

waitForGlobal(() => Spicetify?.Platform?.PlayerAPI?._queue?._events)
  .then((events) =>
    events?.addListener("queue_update", () => {
      if (isUpdatingQueue) return;
      isUpdatingQueue = true;
      setTimeout(() => {
        isUpdatingQueue = false;
        addPlayerData();
      }, 500);
    }),
  )
  .catch(() => {});

export default addPlayerData;
