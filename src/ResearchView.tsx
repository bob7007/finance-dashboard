import { useEffect, useMemo, useState } from "react";

const RESEARCH_SERVICE_BASE_URL =
  import.meta.env.VITE_RESEARCH_SERVICE_URL ?? "http://localhost:3100";

interface SymbolSuggestion {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
}

interface SymbolSearchResponse {
  results: SymbolSuggestion[];
}

interface ResearchMetricSegment {
  label: string;
  widthPercent: number | null;
}

interface ResearchMetric {
  key: string;
  label: string;
  value: number | null;
  maxValue: number | null;
  displayValue: string | null;
  industry: { percent: number | null };
  history: { percent: number | null };
  segments?: ResearchMetricSegment[];
  indicatorPercent: number | null;
}

interface ResearchSection {
  title: string;
  score: number | null;
  maxScore: number;
  metrics: ResearchMetric[];
}

interface ResearchResponse {
  ticker: string;
  companyName: string;
  exchange: string | null;
  logoUrl: string | null;
  snapshot: {
    price: number | null;
    priceChange: number | null;
    priceChangePercent: number | null;
    peRatio: number | null;
    pbRatio: number | null;
    marketCap: string | null;
    enterpriseValue: string | null;
    volume: string | null;
    averageVolume2m: string | null;
  };
  guruFocus: {
    gfScore: number | null;
    gfScoreMax: number;
    gfValue: number | null;
  };
  sections: {
    financialStrength: ResearchSection;
    gfValueRank: ResearchSection;
    momentum: ResearchSection;
    profitability: ResearchSection;
  };
  scrapedAt: string;
}

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function ComparisonBar({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="research-null-value">—</span>;

  const position = Math.min(100, Math.max(0, percent));
  return (
    <div className="research-comparison" title={`${percent.toFixed(1)}%`}>
      <span style={{ width: `${position}%` }} />
      <i style={{ left: `${position}%` }} />
    </div>
  );
}

function SegmentedMetric({ metric }: { metric: ResearchMetric }) {
  return (
    <div className="research-segmented-metric">
      <div className="research-segmented-heading">
        <span>{metric.label}</span>
        <strong>
          {metric.displayValue ?? formatNumber(metric.value)}
        </strong>
      </div>
      <div className="research-segment-track">
        {metric.segments?.map((segment, index) => (
          <span
            key={`${metric.key}-${segment.label}-${index}`}
            style={
              segment.widthPercent === null
                ? { flex: 1 }
                : { width: `${segment.widthPercent}%` }
            }
          >
            {segment.label}
          </span>
        ))}
        {metric.indicatorPercent !== null && (
          <i
            className="research-segment-indicator"
            style={{
              left: `${Math.min(100, Math.max(0, metric.indicatorPercent))}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

function ResearchSectionCard({ section }: { section: ResearchSection }) {
  const normalMetrics = section.metrics.filter(
    (metric) => !metric.segments?.length,
  );
  const segmentedMetrics = section.metrics.filter(
    (metric) => Boolean(metric.segments?.length),
  );

  return (
    <section className="research-section-card">
      <header>
        <h2>{section.title}</h2>
        <strong>
          {section.score === null ? "—" : formatNumber(section.score)} /{" "}
          {section.maxScore}
        </strong>
      </header>

      {normalMetrics.length > 0 && (
        <div className="research-metric-table-wrap">
          <table className="research-metric-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current</th>
                <th>Vs Industry</th>
                <th>Vs History</th>
              </tr>
            </thead>
            <tbody>
              {normalMetrics.map((metric) => (
                <tr key={metric.key}>
                  <td>{metric.label}</td>
                  <td>{metric.displayValue ?? formatNumber(metric.value)}</td>
                  <td><ComparisonBar percent={metric.industry.percent} /></td>
                  <td><ComparisonBar percent={metric.history.percent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {segmentedMetrics.map((metric) => (
        <SegmentedMetric key={metric.key} metric={metric} />
      ))}

      {section.metrics.length === 0 && (
        <p className="research-empty-section">No metrics returned.</p>
      )}
    </section>
  );
}

function ResearchView() {
  const [tickerInput, setTickerInput] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [selectedTicker, setSelectedTicker] =
    useState<SymbolSuggestion | null>(null);
  const [symbolLookupLoading, setSymbolLookupLoading] = useState(false);
  const [symbolLookupError, setSymbolLookupError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [research, setResearch] = useState<ResearchResponse | null>(null);

  useEffect(() => {
    const query = tickerInput.trim();

    if (selectedTicker || query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSymbolLookupLoading(true);
      setSymbolLookupError("");

      try {
        const response = await fetch(
          `/api/research/symbol-search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("Symbol lookup failed");
        const data = (await response.json()) as SymbolSearchResponse;
        const seen = new Set<string>();
        const normalizedQuery = query.toUpperCase();
        const results = data.results
          .filter((result) => {
            const key = result.symbol.trim().toUpperCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((left, right) => {
            const leftExact = left.symbol.toUpperCase() === normalizedQuery;
            const rightExact = right.symbol.toUpperCase() === normalizedQuery;
            return Number(rightExact) - Number(leftExact);
          })
          .slice(0, 10);

        setSuggestions(results);
        setHighlightedIndex(results.length > 0 ? 0 : -1);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setSymbolLookupError("Could not load ticker suggestions.");
      } finally {
        if (!controller.signal.aborted) setSymbolLookupLoading(false);
      }
    }, 275);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedTicker, tickerInput]);

  const selectSuggestion = (suggestion: SymbolSuggestion) => {
    setSelectedTicker(suggestion);
    setTickerInput(suggestion.displaySymbol);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSymbolLookupError("");
  };

  const handleResearchSearch = async () => {
    if (!selectedTicker || researchLoading) return;

    const ticker = selectedTicker.symbol.trim().toUpperCase();
    setResearchLoading(true);
    setResearchError("");

    try {
      const response = await fetch(
        `${RESEARCH_SERVICE_BASE_URL}/research/${encodeURIComponent(ticker)}`,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message || `Research request failed (${response.status}).`);
      }

      setResearch((await response.json()) as ResearchResponse);
    } catch (error) {
      const unavailable = error instanceof TypeError;
      setResearchError(
        unavailable
          ? "Research service is unavailable. Start it with: npm run research:dev"
          : `Could not load research for ${ticker}. ${
              error instanceof Error ? error.message : "Please try again."
            }`,
      );
    } finally {
      setResearchLoading(false);
    }
  };

  const sections = useMemo(
    () => research
      ? [
          research.sections.financialStrength,
          research.sections.gfValueRank,
          research.sections.momentum,
          research.sections.profitability,
        ]
      : [],
    [research],
  );

  const dailyChangeClass =
    (research?.snapshot.priceChange ?? 0) < 0 ? "negative" : "positive";

  return (
    <div className="research-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EQUITY RESEARCH</p>
          <h1>Research</h1>
          <p className="page-description">
            Search US-listed securities and load normalized GuruFocus research.
          </p>
        </div>
      </div>

      <section className="research-search-panel">
        <div className="research-search-control">
          <label htmlFor="research-ticker">Ticker or company</label>
          <div className="research-input-wrap">
            <input
              id="research-ticker"
              value={tickerInput}
              placeholder="Search ticker or company..."
              autoComplete="off"
              onChange={(event) => {
                setTickerInput(event.target.value);
                setSelectedTicker(null);
                setSuggestions([]);
                setSymbolLookupLoading(false);
                setSymbolLookupError("");
                setHighlightedIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && suggestions.length > 0) {
                  event.preventDefault();
                  setHighlightedIndex((current) =>
                    Math.min(current + 1, suggestions.length - 1),
                  );
                } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                  event.preventDefault();
                  setHighlightedIndex((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter" && highlightedIndex >= 0) {
                  event.preventDefault();
                  selectSuggestion(suggestions[highlightedIndex]);
                } else if (event.key === "Escape") {
                  setSuggestions([]);
                  setHighlightedIndex(-1);
                }
              }}
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="research-suggestions"
              aria-activedescendant={
                highlightedIndex >= 0
                  ? `research-suggestion-${highlightedIndex}`
                  : undefined
              }
            />
            {symbolLookupLoading && <span className="research-lookup-loader">Loading…</span>}
            {suggestions.length > 0 && (
              <div className="research-suggestions" id="research-suggestions" role="listbox">
                {suggestions.map((suggestion, index) => (
                  <button
                    id={`research-suggestion-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === highlightedIndex}
                    className={index === highlightedIndex ? "highlighted" : ""}
                    key={suggestion.symbol}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    <strong>{suggestion.displaySymbol}</strong>
                    <span>{suggestion.description}</span>
                    <small>{suggestion.type}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedTicker && (
            <p className="research-selected-ticker">
              {selectedTicker.displaySymbol} — {selectedTicker.description}
            </p>
          )}
          {symbolLookupError && <p className="research-inline-error">{symbolLookupError}</p>}
        </div>

        <button
          type="button"
          className="research-search-button"
          disabled={!selectedTicker || researchLoading}
          onClick={handleResearchSearch}
        >
          {researchLoading ? "Searching…" : "Search"}
        </button>
      </section>

      {researchLoading && selectedTicker && (
        <p className="research-loading-message">
          Loading research for {selectedTicker.symbol.toUpperCase()}…
        </p>
      )}
      {researchError && <p className="research-request-error">{researchError}</p>}

      {research && (
        <div className="research-results">
          <header className="research-company-header">
            {research.logoUrl && (
              <img
                src={research.logoUrl}
                alt=""
                onError={(event) => { event.currentTarget.style.display = "none"; }}
              />
            )}
            <div>
              <div className="research-symbol-line">
                <h2>{research.ticker}</h2>
                {research.exchange && <span>{research.exchange}</span>}
              </div>
              <p>{research.companyName}</p>
              <small>
                Research updated {new Date(research.scrapedAt).toLocaleString()}
              </small>
            </div>
          </header>

          <div className="research-hero-grid">
            <article><span>Current Price</span><strong>{formatCurrency(research.snapshot.price)}</strong></article>
            <article className="gf-score-card"><span>GF Score</span><strong>{formatNumber(research.guruFocus.gfScore)} <small>/ {research.guruFocus.gfScoreMax}</small></strong></article>
            <article><span>GF Value</span><strong>{formatCurrency(research.guruFocus.gfValue)}</strong></article>
          </div>

          <div className="research-snapshot-grid">
            <article>
              <span>Daily Change</span>
              <strong className={dailyChangeClass}>
                {research.snapshot.priceChange === null
                  ? "—"
                  : `${research.snapshot.priceChange >= 0 ? "+" : ""}${formatCurrency(research.snapshot.priceChange)} (${research.snapshot.priceChangePercent === null ? "—" : `${research.snapshot.priceChangePercent >= 0 ? "+" : ""}${research.snapshot.priceChangePercent.toFixed(2)}%`})`}
              </strong>
            </article>
            <article><span>P/E</span><strong>{formatNumber(research.snapshot.peRatio)}</strong></article>
            <article><span>P/B</span><strong>{formatNumber(research.snapshot.pbRatio)}</strong></article>
            <article><span>Market Cap</span><strong>{research.snapshot.marketCap ? `$${research.snapshot.marketCap}` : "—"}</strong></article>
            <article><span>Enterprise Value</span><strong>{research.snapshot.enterpriseValue ? `$${research.snapshot.enterpriseValue}` : "—"}</strong></article>
            <article><span>Volume</span><strong>{research.snapshot.volume ?? "—"}</strong></article>
            <article><span>Average Volume (2M)</span><strong>{research.snapshot.averageVolume2m ?? "—"}</strong></article>
          </div>

          <div className="research-sections-grid">
            {sections.map((section) => (
              <ResearchSectionCard key={section.title} section={section} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ResearchView;
