const { chromium } = require("playwright");
const { performance } = require("node:perf_hooks");

const MAX_SCRAPES_BEFORE_RESTART = 200;

let browser = null;
let browserHeadless = null;
let startupPromise = null;
let restartPromise = null;
let closePromise = null;
let pendingRestartReason = null;

const lifecycle = {
  browserStartedAt: null,
  scrapesSinceRestart: 0,
  totalBrowserStarts: 0,
  totalBrowserRestarts: 0,
  lastRestartAt: null,
  lastRestartReason: null,
};

async function startBrowser(headless, restartReason = null) {
  if (startupPromise) {
    return startupPromise;
  }

  startupPromise = (async () => {
    const startedAt = performance.now();
    const launchedBrowser = await chromium.launch({ headless });
    const timestamp = new Date().toISOString();

    browser = launchedBrowser;
    browserHeadless = headless;
    lifecycle.browserStartedAt = timestamp;
    lifecycle.scrapesSinceRestart = 0;
    lifecycle.totalBrowserStarts += 1;

    if (restartReason) {
      lifecycle.totalBrowserRestarts += 1;
      lifecycle.lastRestartAt = timestamp;
      lifecycle.lastRestartReason = restartReason;
    }

    pendingRestartReason = null;
    launchedBrowser.on("disconnected", () => {
      if (browser === launchedBrowser) {
        browser = null;
        browserHeadless = null;
        pendingRestartReason = "Chromium disconnected";
      }
    });

    console.error(
      `[research:browser] Chromium started in ${Math.round(performance.now() - startedAt)}ms`,
    );

    return launchedBrowser;
  })();

  try {
    return await startupPromise;
  } finally {
    startupPromise = null;
  }
}

async function closeBrowser() {
  if (closePromise) {
    return closePromise;
  }

  closePromise = (async () => {
    if (startupPromise) {
      await startupPromise.catch(() => undefined);
    }

    const browserToClose = browser;
    browser = null;
    browserHeadless = null;

    if (browserToClose?.isConnected()) {
      await browserToClose.close();
    }
  })();

  try {
    await closePromise;
  } finally {
    closePromise = null;
  }
}

async function restartBrowser(reason, options = {}) {
  if (restartPromise) {
    return restartPromise;
  }

  const headless = options.headless ?? browserHeadless ?? false;
  restartPromise = (async () => {
    await closeBrowser();
    return startBrowser(headless, reason || "Browser restart requested");
  })();

  try {
    return await restartPromise;
  } finally {
    restartPromise = null;
  }
}

async function getBrowser(options = {}) {
  const headless = options.headless === true;

  if (restartPromise) {
    await restartPromise;
  }
  if (closePromise) {
    await closePromise;
  }

  if (browser && !browser.isConnected()) {
    browser = null;
    browserHeadless = null;
    pendingRestartReason = "Chromium disconnected";
  }

  if (browser?.isConnected()) {
    if (browserHeadless !== headless) {
      return restartBrowser("Browser launch mode changed", { headless });
    }
    if (lifecycle.scrapesSinceRestart >= MAX_SCRAPES_BEFORE_RESTART) {
      return restartBrowser(
        `Reached ${MAX_SCRAPES_BEFORE_RESTART} scrapes`,
        { headless },
      );
    }
    return browser;
  }

  return startBrowser(headless, pendingRestartReason);
}

function recordScrapeAttemptStarted() {
  if (!browser?.isConnected()) {
    throw new Error("Cannot record a scrape without a connected browser.");
  }

  // Increment only after the request-specific BrowserContext was created.
  lifecycle.scrapesSinceRestart += 1;
}

function getBrowserStatus() {
  return {
    connected: Boolean(browser?.isConnected()),
    headless: browserHeadless,
    maxScrapesBeforeRestart: MAX_SCRAPES_BEFORE_RESTART,
    ...lifecycle,
  };
}

module.exports = {
  MAX_SCRAPES_BEFORE_RESTART,
  getBrowser,
  restartBrowser,
  closeBrowser,
  getBrowserStatus,
  recordScrapeAttemptStarted,
};
