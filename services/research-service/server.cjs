const express = require("express");

const {
  scrapeGuruFocus,
} = require("../../scripts/gurufocus-scraper.cjs");

const PORT = Number(process.env.PORT) || 3100;
const DEVELOPMENT_ORIGIN = "http://localhost:5173";

const app = express();
let scrapeInProgress = false;

app.use((request, response, next) => {
  const origin = request.headers.origin;

  if (origin === DEVELOPMENT_ORIGIN) {
    response.setHeader("Access-Control-Allow-Origin", DEVELOPMENT_ORIGIN);
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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

  try {
    const research = await scrapeGuruFocus(ticker, {
      headless: false,
    });

    response.json(research);
  } catch (error) {
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

app.listen(PORT, () => {
  console.log(`Research service listening on http://localhost:${PORT}`);
});
