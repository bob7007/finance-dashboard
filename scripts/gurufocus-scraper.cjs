const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function scrapeGuruFocus(ticker, options = {}) {
  const normalizedTicker = String(ticker ?? "")
    .trim()
    .toUpperCase();

  if (!normalizedTicker || !/^[A-Z0-9.-]+$/.test(normalizedTicker)) {
    throw new Error(
      "Ticker must contain only letters, numbers, periods, or hyphens.",
    );
  }

  const browser = await chromium.launch({
    headless: options.headless === true,
  });

  try {

  const page = await browser.newPage({
    viewport: {
      width: 1600,
      height: 1200,
    },
  });

  const url =
    `https://www.gurufocus.com/stock/${normalizedTicker}/summary`;

  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  if (!response) {
    throw new Error(`Navigation failed for ${normalizedTicker}.`);
  }

  if (response.status() >= 400) {
    throw new Error(
      `GuruFocus returned HTTP ${response.status()} for ${normalizedTicker}.`,
    );
  }

/*
 * Wait only for the page content we actually need.
 */
await page.waitForSelector("#stock-header", {
  timeout: 10000,
});

await page.waitForSelector("text=Financial Strength", {
  timeout: 10000,
});

await page.waitForTimeout(1000);

/*
 * Extract the rendered data.
 *
 * We normalize GuruFocus's DOM/state into our own
 * predictable object instead of returning their HTML structure.
 */
  const research = await page.evaluate((ticker) => {
    function cleanText(value) {
      return (value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function toNumber(value) {
      if (value == null) {
        return null;
      }

      const cleaned = String(value)
        .replace(/[$,%]/g, "")
        .replace(/,/g, "")
        .trim();

      if (!cleaned) {
        return null;
      }

      const number = Number(cleaned);

      return Number.isFinite(number)
        ? number
        : null;
    }

    function getWidthPercent(element) {
      if (!element) {
        return null;
      }

      const width =
        element.style?.width || "";

      const match =
        width.match(/([\d.]+)%/);

      return match
        ? Number(match[1])
        : null;
    }

    /*
     * Splits a JavaScript argument list while respecting
     * strings, objects, arrays and nested parentheses.
     *
     * GuruFocus's embedded Nuxt state is minified and may look like:
     *
     * (function(a,b,c,...,bn,...){
     *   ...
     *   gf_score:bn
     *   ...
     * }(...,92,...))
     *
     * We need to determine which invocation argument corresponds
     * to the parameter used by gf_score.
     */
    function splitJavaScriptArguments(source) {
      const args = [];

      let current = "";
      let depth = 0;
      let quote = null;
      let escaped = false;

      for (let index = 0; index < source.length; index++) {
        const char = source[index];

        if (quote) {
          current += char;

          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === "\\") {
            escaped = true;
            continue;
          }

          if (char === quote) {
            quote = null;
          }

          continue;
        }

        if (
          char === "'" ||
          char === '"' ||
          char === "`"
        ) {
          quote = char;
          current += char;
          continue;
        }

        if (
          char === "(" ||
          char === "[" ||
          char === "{"
        ) {
          depth++;
          current += char;
          continue;
        }

        if (
          char === ")" ||
          char === "]" ||
          char === "}"
        ) {
          depth--;
          current += char;
          continue;
        }

        if (
          char === "," &&
          depth === 0
        ) {
          args.push(current.trim());
          current = "";
          continue;
        }

        current += char;
      }

      if (current.trim()) {
        args.push(current.trim());
      }

      return args;
    }

    /*
     * Extract GF Score from GuruFocus's embedded Nuxt state.
     *
     * The visible GF Score widget does not reliably render
     * in Playwright, but the score is still embedded in the
     * page's JavaScript state.
     */
    function extractGfScore() {
      const scripts = [
        ...document.querySelectorAll("script"),
      ];

      for (const script of scripts) {
        const source =
          script.textContent || "";

        if (!source.includes("gf_score")) {
          continue;
        }

        /*
         * Easy case:
         *
         * gf_score:92
         */
        const directMatch =
          source.match(
            /gf_score\s*:\s*(\d+(?:\.\d+)?)/i
          );

        if (directMatch) {
          const score =
            Number(directMatch[1]);

          if (Number.isFinite(score)) {
            return score;
          }
        }

        /*
         * Minified case:
         *
         * gf_score:bn
         */
        const aliasMatch =
          source.match(
            /gf_score\s*:\s*([A-Za-z_$][\w$]*)/
          );

        if (!aliasMatch) {
          continue;
        }

        const alias =
          aliasMatch[1];

        /*
         * Find the IIFE parameter list.
         *
         * GuruFocus's Nuxt payload normally uses:
         *
         * (function(a,b,c,...){ ... })(...)
         */
        const functionStartMatch =
          source.match(
            /\(function\s*\(([^)]*)\)\s*\{/
          );

        if (!functionStartMatch) {
          continue;
        }

        const params =
          functionStartMatch[1]
            .split(",")
            .map(value => value.trim());

        const aliasIndex =
          params.indexOf(alias);

        if (aliasIndex === -1) {
          continue;
        }

        /*
         * Find where the invocation arguments begin.
         *
         * We search from the end because the Nuxt payload is
         * one giant immediately-invoked function.
         */
        /*
         * Different minifiers may produce:
         *
         * }(...)
         * })(...)
         * }(...))
         *
         * so locate the argument list manually.
         */
        let invocationStart = -1;

        for (
          let index = source.length - 1;
          index >= 0;
          index--
        ) {
          if (source[index] !== "(") {
            continue;
          }

          /*
           * Look backward for a closing brace / parenthesis
           * indicating the end of the function expression.
           */
          const before =
            source
              .slice(
                Math.max(0, index - 5),
                index
              )
              .replace(/\s+/g, "");

          if (
            before.endsWith("})") ||
            before.endsWith("}")
          ) {
            invocationStart = index;
            break;
          }
        }

        /*
         * If the generic backward search did not work,
         * use the common Nuxt pattern.
         */
        if (invocationStart === -1) {
          const markerMatch =
            source.match(
              /\}\s*\(\s*([\s\S]*)\)\s*\)?\s*;?\s*$/
            );

          if (!markerMatch) {
            continue;
          }

          const args =
            splitJavaScriptArguments(
              markerMatch[1]
            );

          const rawValue =
            args[aliasIndex];

          if (rawValue == null) {
            continue;
          }

          const numericValue =
            Number(rawValue);

          if (Number.isFinite(numericValue)) {
            return numericValue;
          }

          continue;
        }

        /*
         * Extract everything inside the outer invocation.
         */
        let depth = 0;
        let quote = null;
        let escaped = false;
        let invocationEnd = -1;

        for (
          let index = invocationStart;
          index < source.length;
          index++
        ) {
          const char = source[index];

          if (quote) {
            if (escaped) {
              escaped = false;
              continue;
            }

            if (char === "\\") {
              escaped = true;
              continue;
            }

            if (char === quote) {
              quote = null;
            }

            continue;
          }

          if (
            char === "'" ||
            char === '"' ||
            char === "`"
          ) {
            quote = char;
            continue;
          }

          if (char === "(") {
            depth++;
            continue;
          }

          if (char === ")") {
            depth--;

            if (depth === 0) {
              invocationEnd = index;
              break;
            }
          }
        }

        if (invocationEnd === -1) {
          continue;
        }

        const argsSource =
          source.slice(
            invocationStart + 1,
            invocationEnd
          );

        const args =
          splitJavaScriptArguments(
            argsSource
          );

        const rawValue =
          args[aliasIndex];

        if (rawValue == null) {
          continue;
        }

        const numericValue =
          Number(rawValue);

        if (
          Number.isFinite(numericValue) &&
          numericValue >= 0 &&
          numericValue <= 100
        ) {
          return numericValue;
        }
      }

      return null;
    }

    /*
     * Read additional scalar values from the same embedded Nuxt state used by
     * the GF Score parser. This does not execute the payload or interact with
     * tooltip UI; it only resolves minified IIFE parameter aliases.
     */
    function extractEmbeddedStateValue(fieldName) {
      const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fieldPattern = new RegExp(
        `${escapedFieldName}\\s*:\\s*([^,}\\n]+)`,
        "gi"
      );

      function parseScalar(rawValue) {
        const raw = String(rawValue ?? "").trim();

        if (!raw || raw === "null" || raw === "undefined") {
          return null;
        }

        if (raw === "true") return true;
        if (raw === "false") return false;

        const numericValue = Number(raw);
        if (Number.isFinite(numericValue)) return numericValue;

        if (raw.startsWith('"') && raw.endsWith('"')) {
          try {
            return JSON.parse(raw);
          } catch {
            return raw.slice(1, -1);
          }
        }

        if (raw.startsWith("'") && raw.endsWith("'")) {
          return raw
            .slice(1, -1)
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");
        }

        return null;
      }

      for (const script of document.querySelectorAll("script")) {
        const source = script.textContent || "";
        const fieldMatches = source.matchAll(fieldPattern);

        for (const fieldMatch of fieldMatches) {

        const directValue = parseScalar(fieldMatch[1]);
        if (directValue !== null) return directValue;

        const alias = fieldMatch[1].trim();
        if (!/^[A-Za-z_$][\w$]*$/.test(alias)) continue;

        const functionStartMatch = source.match(
          /\(function\s*\(([^)]*)\)\s*\{/
        );
        if (!functionStartMatch) continue;

        const params = functionStartMatch[1]
          .split(",")
          .map((value) => value.trim());
        const aliasIndex = params.indexOf(alias);
        if (aliasIndex === -1) continue;

        let invocationStart = -1;
        for (let index = source.length - 1; index >= 0; index--) {
          if (source[index] !== "(") continue;
          const before = source
            .slice(Math.max(0, index - 5), index)
            .replace(/\s+/g, "");
          if (before.endsWith("})") || before.endsWith("}")) {
            invocationStart = index;
            break;
          }
        }
        if (invocationStart === -1) continue;

        let depth = 0;
        let quote = null;
        let escaped = false;
        let invocationEnd = -1;

        for (let index = invocationStart; index < source.length; index++) {
          const char = source[index];
          if (quote) {
            if (escaped) {
              escaped = false;
            } else if (char === "\\") {
              escaped = true;
            } else if (char === quote) {
              quote = null;
            }
            continue;
          }
          if (char === "'" || char === '"' || char === "`") {
            quote = char;
          } else if (char === "(") {
            depth++;
          } else if (char === ")") {
            depth--;
            if (depth === 0) {
              invocationEnd = index;
              break;
            }
          }
        }
        if (invocationEnd === -1) continue;

        const args = splitJavaScriptArguments(
          source.slice(invocationStart + 1, invocationEnd)
        );
        const resolvedValue = parseScalar(args[aliasIndex]);
        if (resolvedValue !== null) return resolvedValue;
        }
      }

      return null;
    }


    function findCard(title) {
      const headings = [
        ...document.querySelectorAll(
          "h1, h2, h3, h4, h5, h6"
        ),
      ];

      const heading =
        headings.find((element) =>
          cleanText(element.textContent)
            .toLowerCase()
            .includes(title.toLowerCase())
        );

      if (!heading) {
        return null;
      }

      return (
        heading.closest(".children-card") ||
        heading.parentElement?.parentElement ||
        heading.parentElement
      );
    }

    function extractSection(title) {
      const card =
        findCard(title);

      if (!card) {
        return {
          title,
          score: null,
          maxScore: 10,
          metrics: [],
        };
      }

      /*
       * GuruFocus uses a score followed by /10.
       */
      let score = null;

      const headerText =
        cleanText(card.textContent);

      const scoreMatch =
        headerText.match(
          /(\d+(?:\.\d+)?)\s*\/\s*10/
        );

      if (scoreMatch) {
        score =
          Number(scoreMatch[1]);
      }

      const rows = [
        ...card.querySelectorAll(
          "tbody tr"
        ),
      ];

      const metrics =
        rows
          .map((row) => {
            const cells = [
              ...row.querySelectorAll(
                ":scope > td"
              ),
            ];

            if (cells.length < 3) {
              return null;
            }

            /*
             * GuruFocus tables usually have:
             *
             * blank
             * name
             * current
             * industry
             * blank
             * history
             * blank
             */
            const label =
              cleanText(
                cells[1]?.textContent
              );

            const currentText =
              cleanText(
                cells[2]?.textContent
              );

            if (!label) {
              return null;
            }

            let value =
              toNumber(currentText);

            let maxValue = null;

            /*
             * Handle values such as:
             *
             * 5/9
             */
            const fractionMatch =
              currentText.match(
                /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/
              );

            if (fractionMatch) {
              value =
                Number(fractionMatch[1]);

              maxValue =
                Number(fractionMatch[2]);
            }

            /*
             * Normal comparison bars.
             */
            const progressBars = [
              ...row.querySelectorAll(
                ".indicator-progress-bar > div"
              ),
            ];

            const industryPercent =
              getWidthPercent(
                progressBars[0]
              );

            const historyPercent =
              getWidthPercent(
                progressBars[1]
              );

            /*
             * Some rows such as:
             *
             * WACC vs ROIC
             * Piotroski
             * Altman
             * Beneish
             *
             * use segmented bars instead.
             */
            const segments = [
              ...row.querySelectorAll(
                ".segment-bar .bar-step"
              ),
            ].map((segment) => ({
              label:
                cleanText(
                  segment.textContent
                ),

              widthPercent:
                getWidthPercent(segment),
            }));

            const indicator =
              row.querySelector(
                ".bar-indicator"
              );

            let indicatorPercent = null;

            if (indicator) {
              const left =
                indicator.style.left ||
                "";

              const match =
                left.match(
                  /([\d.]+)%/
                );

              if (match) {
                indicatorPercent =
                  Number(match[1]);
              }
            }

            return {
              key: label
                .toLowerCase()
                .replace(
                  /[^a-z0-9]+/g,
                  "_"
                )
                .replace(
                  /^_|_$/g,
                  ""
                ),

              label,

              value,

              maxValue,

              displayValue:
                currentText || null,

              industry: {
                percent:
                  industryPercent,
              },

              history: {
                percent:
                  historyPercent,
              },

              segments:
                segments.length
                  ? segments
                  : undefined,

              indicatorPercent,
            };
          })
          .filter(Boolean);

      return {
        title,
        score,
        maxScore: 10,
        metrics,
      };
    }

    /*
     * Stock header.
     */
    const stockHeader =
      document.querySelector(
        "#stock-header"
      );

    const stockHeaderText =
      cleanText(
        stockHeader?.textContent
      );

    const companyName =
      cleanText(
        stockHeader
          ?.querySelector("h1")
          ?.textContent
      ) || null;

    const logoUrl =
      stockHeader
        ?.querySelector(
          'img[alt*="logo"]'
        )
        ?.src || null;

    /*
     * Stock price and daily change.
     */
    const priceMatch =
      stockHeaderText.match(
        /\$\s*([\d,.]+)\s+[▲▼+-]?\s*([+-]?[\d,.]+)\s*\(([+-]?[\d.]+)%\)/
      );

    /*
     * Basic stock-header fields.
     */
    function matchNumber(label) {
      const regex =
        new RegExp(
          `${label}\\s*:?\\s*([\\d.,-]+)`,
          "i"
        );

      const match =
        stockHeaderText.match(regex);

      return match
        ? toNumber(match[1])
        : null;
    }

    function matchText(label) {
      const regex =
        new RegExp(
          `${label}\\s*:?\\s*([^\\s]+)`,
          "i"
        );

      const match =
        stockHeaderText.match(regex);

      return match
        ? match[1]
        : null;
    }

    /*
     * Extract GF Score from the embedded GuruFocus/Nuxt state.
     */
    const gfScore =
      extractGfScore();

    const gfScorePreviousValue =
      extractEmbeddedStateValue("gf_score_last_value");
    const gfScorePreviousPeriodValue =
      extractEmbeddedStateValue("gf_score_last_period");
    const valuationValue =
      extractEmbeddedStateValue("gf_valuation");
    const valuationPreviousValue =
      extractEmbeddedStateValue("gf_valuation_last_value");
    const valuationPreviousPeriodValue =
      extractEmbeddedStateValue("gf_valuation_last_period");
    const profitabilityComponentValue =
      extractEmbeddedStateValue("rank_profitability");
    const growthComponentValue =
      extractEmbeddedStateValue("rank_growth");
    const financialStrengthComponentValue =
      extractEmbeddedStateValue("rank_balancesheet");
    const momentumComponentValue =
      extractEmbeddedStateValue("rank_momentum");
    const gfValueComponentValue =
      extractEmbeddedStateValue("rank_gf_value");
    const valueTrapLabelValue =
      extractEmbeddedStateValue("value_trap_label") ??
      extractEmbeddedStateValue("gf_value_trap_label");
    const valueTrapActiveValue =
      extractEmbeddedStateValue("value_trap_active") ??
      extractEmbeddedStateValue("gf_value_trap_active");
    const valuationLabels = {
      2: "Possible Value Trap, Think Twice",
      3: "Significantly Undervalued",
      4: "Modestly Undervalued",
      5: "Fairly Valued",
      6: "Modestly Overvalued",
      7: "Significantly Overvalued",
    };
    const valuationLabel =
      typeof valuationValue === "string"
        ? valuationValue
        : typeof valuationValue === "number"
          ? valuationLabels[valuationValue] ?? null
          : null;
    const gfValuationCode =
      typeof valuationValue === "number" && Number.isFinite(valuationValue)
        ? valuationValue
        : null;
    const gfValuationPreviousCode =
      typeof valuationPreviousValue === "number" &&
      Number.isFinite(valuationPreviousValue)
        ? valuationPreviousValue
        : null;
    const gfValuationPreviousLabel =
      gfValuationPreviousCode === null
        ? null
        : valuationLabels[gfValuationPreviousCode] ?? null;
    const valueTrapLabel =
      typeof valueTrapLabelValue === "string"
        ? valueTrapLabelValue
        : valuationLabel && /value trap/i.test(valuationLabel)
          ? valuationLabel
          : null;
    const valueTrapActive =
      valueTrapActiveValue === true ||
      valueTrapActiveValue === 1 ||
      Boolean(valueTrapLabel);
    const normalizeScoreComponent = (value) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 10
        ? value
        : null;

    /*
     * GF Value is visible as normal page text,
     * so DOM extraction is sufficient here.
     */
    const bodyText =
      cleanText(
        document.body.innerText
      );

    const gfValueMatch =
      bodyText.match(
        /GF Value[^$]*\$\s*([\d,.]+)/i
      );

    /*
     * Exchange and ticker.
     */
    const exchangeMatch =
      stockHeaderText.match(
        /([A-Z]+):([A-Z0-9.-]+)/
      );

    return {
      ticker,

      companyName,

      exchange:
        exchangeMatch?.[1] ??
        null,

      logoUrl,

      snapshot: {
        price:
          priceMatch
            ? toNumber(
                priceMatch[1]
              )
            : null,

        priceChange:
          priceMatch
            ? toNumber(
                priceMatch[2]
              )
            : null,

        priceChangePercent:
          priceMatch
            ? toNumber(
                priceMatch[3]
              )
            : null,

        peRatio:
          matchNumber("P/E"),

        pbRatio:
          matchNumber("P/B"),

        marketCap:
          stockHeaderText.match(
            /Market Cap:\s*\$\s*([\d,.]+[KMBT]?)/i
          )?.[1] ?? null,

        enterpriseValue:
          stockHeaderText.match(
            /Enterprise V:\s*\$\s*([\d,.]+[KMBT]?)/i
          )?.[1] ?? null,

        volume:
          matchText("Volume"),

        averageVolume2m:
          matchText(
            "Avg Vol \\(2M\\)"
          ),
      },

      guruFocus: {
        gfScore,

        gfScoreMax: 100,

        gfScorePrevious:
          typeof gfScorePreviousValue === "number" &&
          Number.isFinite(gfScorePreviousValue)
            ? gfScorePreviousValue
            : null,

        gfScorePreviousPeriod:
          typeof gfScorePreviousPeriodValue === "string"
            ? gfScorePreviousPeriodValue
            : null,

        gfScoreComponents: {
          profitability: normalizeScoreComponent(profitabilityComponentValue),
          growth: normalizeScoreComponent(growthComponentValue),
          financialStrength: normalizeScoreComponent(
            financialStrengthComponentValue
          ),
          momentum: normalizeScoreComponent(momentumComponentValue),
          gfValue: normalizeScoreComponent(gfValueComponentValue),
        },

        gfValue:
          gfValueMatch
            ? toNumber(
                gfValueMatch[1]
              )
            : null,

        gfValuationCode,

        valuationLabel,

        gfValuationPreviousCode,

        gfValuationPreviousLabel,

        gfValuationPreviousPeriod:
          typeof valuationPreviousPeriodValue === "string"
            ? valuationPreviousPeriodValue
            : null,

        valueTrapWarning: {
          active: valueTrapActive,
          label: valueTrapLabel,
          reasons: [],
        },
      },

      sections: {
        financialStrength:
          extractSection(
            "Financial Strength"
          ),

        gfValueRank:
          extractSection(
            "GF Value Rank"
          ),

        momentum:
          extractSection(
            "Momentum Rank"
          ),

        profitability:
          extractSection(
            "Profitability Rank"
          ),
      },

      scrapedAt:
        new Date().toISOString(),
    };
  }, normalizedTicker);

  if (!research.companyName) {
    throw new Error(
      `GuruFocus did not return a valid stock header for ${normalizedTicker}.`,
    );
  }

  if (options.debugDir) {
    const debugDir = path.resolve(options.debugDir);
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(
      path.join(debugDir, `${normalizedTicker}-gurufocus.html`),
      await page.content(),
    );
    fs.writeFileSync(
      path.join(debugDir, `${normalizedTicker}-gurufocus.json`),
      JSON.stringify(research, null, 2),
    );
  }

  return research;
  } finally {
    await browser.close();
  }
}

module.exports = {
  scrapeGuruFocus,
};

if (require.main === module) {
  const ticker = process.argv[2];
  const headless = process.argv.slice(3).includes("--headless");

  scrapeGuruFocus(ticker, { headless })
    .then((research) => {
      console.log(JSON.stringify(research, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
