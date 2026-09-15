type WaitForElementsOptions = {
  timeout?: number;
};

type PendingEntry = {
  selectorList: string[];
  isArray: boolean;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let sharedObserver: MutationObserver | null = null;
const pendingEntries = new Set<PendingEntry>();
let isScheduled = false;

function getResult(selectorList: string[], isArray: boolean): Element | Element[] | null {
  const elements = selectorList.map((sel) => document.querySelector(sel));
  if (elements.every(Boolean)) {
    return isArray ? (elements as Element[]) : (elements[0] as Element);
  }
  return null;
}

function flushPending() {
  isScheduled = false;
  for (const entry of Array.from(pendingEntries)) {
    const res = getResult(entry.selectorList, entry.isArray);
    if (res) {
      clearTimeout(entry.timer);
      pendingEntries.delete(entry);
      entry.resolve(res);
    }
  }

  if (pendingEntries.size === 0 && sharedObserver) {
    sharedObserver.disconnect();
    sharedObserver = null;
  }
}

function ensureSharedObserver() {
  if (sharedObserver) return;
  const targetNode = document.body || document.documentElement;
  if (!targetNode) return;

  sharedObserver = new MutationObserver(() => {
    if (isScheduled) return;
    isScheduled = true;
    queueMicrotask(flushPending);
  });

  sharedObserver.observe(targetNode, {
    childList: true,
    subtree: true,
  });
}

function waitForElements<T extends string | string[]>(
  selectors: T,
  { timeout = 3000 }: WaitForElementsOptions = {},
): Promise<T extends string ? Element : T extends string[] ? Element[] : never> {
  const isArray = Array.isArray(selectors);
  const selectorList = isArray ? (selectors as string[]) : ([selectors] as string[]);

  const immediate = getResult(selectorList, isArray);
  if (immediate) {
    return Promise.resolve(immediate as any);
  }

  return new Promise((resolve, reject) => {
    const entry: PendingEntry = {
      selectorList,
      isArray,
      resolve,
      reject,
      timer: null as any,
    };

    entry.timer = setTimeout(() => {
      pendingEntries.delete(entry);
      if (pendingEntries.size === 0 && sharedObserver) {
        sharedObserver.disconnect();
        sharedObserver = null;
      }
      reject(new Error(`Timeout: Could not find all elements: ${selectorList.join(", ")}`));
    }, timeout);

    pendingEntries.add(entry);
    ensureSharedObserver();
  });
}

export default waitForElements;
