const express = require("express");
const { performance } = require("node:perf_hooks");

const {
  scrapeGuruFocus,
} = require("../../scripts/gurufocus-scraper.cjs");
const {
  getBrowser,
  restartBrowser,
  closeBrowser,
  getBrowserStatus,
  recordScrapeAttemptStarted,
} = require("./browser-manager.cjs");

const PORT = Number(process.env.PORT) || 3100;
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://terminal.7007solutions.com",
]);

const app = express();
let scrapeInProgress = false;

app.use((request, response, next) => {
  const origin = request.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Vary", "Origin");
  }

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "research-service",
  });
});

app.get("/status", (_request, response) => {
  response.json({
    ok: true,
    service: "research-service",
    scrapeInProgress,
    browser: getBrowserStatus(),
  });
});

app.post("/browser/restart", async (_request, response) => {
  // This control endpoint must be authenticated before NAS/public deployment.
  if (scrapeInProgress) {
    response.status(409).json({
      success: false,
      error: "Browser restart unavailable",
      message: "Cannot restart Chromium while a research scrape is active.",
    });
    return;
  }

  try {
    await restartBrowser("manual", { headless: false });
    response.json({
      success: true,
      browser: getBrowserStatus(),
    });
  } catch (error) {
    console.error("Manual Chromium restart failed:", error);
    response.status(500).json({
      success: false,
      error: "Browser restart failed",
      message: "Chromium could not be restarted.",
    });
  }
});

app.get("/research/:ticker", async (request, response) => {
  const ticker = String(request.params.ticker ?? "")
    .trim()
    .toUpperCase();

  if (!ticker || !/^[A-Z0-9.-]+$/.test(ticker)) {
    response.status(400).json({
      error: "Invalid ticker",
      ticker,
      message: "Ticker must contain only letters, numbers, periods, or hyphens.",
    });
    return;
  }

  if (scrapeInProgress) {
    response.status(429).json({
      error: "Research scrape already in progress",
      ticker,
      message: "Only one GuruFocus scrape can run at a time.",
    });
    return;
  }

  scrapeInProgress = true;
  const requestStartedAt = performance.now();

  try {
    const browser = await getBrowser({ headless: false });
    const research = await scrapeGuruFocus(ticker, {
      browser,
      headless: false,
      onContextCreated: recordScrapeAttemptStarted,
    });

    console.log(
      `[research] ${ticker} completed in ${Math.round(performance.now() - requestStartedAt)}ms`,
    );
    response.json(research);
  } catch (error) {
    console.error(
      `[research] ${ticker} failed in ${Math.round(performance.now() - requestStartedAt)}ms`,
    );
    console.error(`Research scrape failed for ${ticker}:`, error);
    response.status(502).json({
      error: "Research scrape failed",
      ticker,
      message: error instanceof Error ? error.message : "Unknown scraper error.",
    });
  } finally {
    scrapeInProgress = false;
  }
});

app.use((error, _request, response, _next) => {
  console.error("Unexpected research service error:", error);
  response.status(500).json({
    error: "Internal server error",
  });
});

const server = app.listen(PORT, () => {
  console.log(`Research service listening on http://localhost:${PORT}`);
});

let shuttingDown = false;
function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[research] ${signal} received; shutting down cleanly`);

  server.close(async () => {
    try {
      await closeBrowser();
    } catch (error) {
      console.error("Failed to close Chromium during shutdown:", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => handleShutdown("SIGINT"));
process.once("SIGTERM", () => handleShutdown("SIGTERM"));
