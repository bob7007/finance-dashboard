import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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
    gfScorePrevious?: number | null;
    gfScorePreviousPeriod?: string | null;
    gfScoreComponents?: {
      profitability: number | null;
      growth: number | null;
      financialStrength: number | null;
      momentum: number | null;
      gfValue: number | null;
    };
    gfValue: number | null;
    gfValuationCode?: number | null;
    valuationLabel?: string | null;
    gfValuationPreviousCode?: number | null;
    gfValuationPreviousLabel?: string | null;
    gfValuationPreviousPeriod?: string | null;
    valueTrapWarning?: {
      active: boolean;
      label: string | null;
      reasons: string[];
    };
  };
  sections: {
    financialStrength: ResearchSection;
    gfValueRank: ResearchSection;
    momentum: ResearchSection;
    profitability: ResearchSection;
  };
  scrapedAt: string;
}

interface GfScoreRadarDatum {
  metric: string;
  score: number;
}

function GfScoreTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: GfScoreRadarDatum;
  }>;
}) {
  const datum = payload?.[0]?.payload;

  if (!active || !datum) return null;

  return (
    <div className="gf-score-radar-tooltip">
      <strong>{datum.metric}</strong>
      <span>{datum.score} / 10</span>
    </div>
  );
}

const GF_SCORE_DEFINITIONS = [
  ["91–100", "Highest outperformance potential", "strong-positive"],
  ["81–90", "Good outperformance potential", "positive"],
  ["71–80", "Likely to have average performance", "neutral"],
  ["51–70", "Poor future performance potential", "warning"],
  ["0–50", "Worst future performance potential, or not enough data", "danger"],
] as const;

const GF_VALUE_DEFINITIONS = [
  [2, "Possible Value Trap, Think Twice"],
  [7, "Significantly Overvalued"],
  [6, "Modestly Overvalued"],
  [5, "Fairly Valued"],
  [4, "Modestly Undervalued"],
  [3, "Significantly Undervalued"],
] as const;

const GF_VALUATION_LABELS: Record<number, string> = {
  2: "Possible Value Trap, Think Twice",
  3: "Significantly Undervalued",
  4: "Modestly Undervalued",
  5: "Fairly Valued",
  6: "Modestly Overvalued",
  7: "Significantly Overvalued",
};

function getGfScoreInterpretation(score: number | null) {
  if (score === null) return null;
  if (score >= 91) return GF_SCORE_DEFINITIONS[0][1];
  if (score >= 81) return GF_SCORE_DEFINITIONS[1][1];
  if (score >= 71) return GF_SCORE_DEFINITIONS[2][1];
  if (score >= 51) return GF_SCORE_DEFINITIONS[3][1];
  return GF_SCORE_DEFINITIONS[4][1];
}

function getGfScoreTone(score: number | null) {
  if (score === null) return "";
  if (score >= 91) return "strong-positive";
  if (score >= 81) return "positive";
  if (score >= 71) return "neutral";
  if (score >= 51) return "warning";
  return "danger";
}

function getGfValuationTone(code: number | null | undefined) {
  if (code === 2 || code === 7) return "danger";
  if (code === 6) return "warning";
  if (code === 5) return "neutral";
  if (code === 4) return "positive";
  if (code === 3) return "strong-positive";
  return "";
}

function formatGfScorePeriod(period: string | null) {
  if (!period) return null;
  const compactPeriod = period.match(/^(\d{4})(\d{2})$/);
  return compactPeriod ? `${compactPeriod[1]}-${compactPeriod[2]}` : period;
}

function ResearchHelp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="research-help">
      <summary aria-label={label}>?</summary>
      <div>{children}</div>
    </details>
  );
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
  const activeResearchTicker = useRef<string | null>(null);

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
    void handleResearchSearch(suggestion.symbol);
  };

  async function handleResearchSearch(selectedSymbol: string) {
    const ticker = selectedSymbol.trim().toUpperCase();
    if (activeResearchTicker.current === ticker) return;

    activeResearchTicker.current = ticker;
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
      if (activeResearchTicker.current === ticker) {
        activeResearchTicker.current = null;
      }
      setResearchLoading(false);
    }
  }

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

  const gfScoreRadarData = useMemo<GfScoreRadarDatum[] | null>(() => {
    const components = research?.guruFocus.gfScoreComponents;
    if (!components) return null;

    const data = [
      { metric: "Profitability", score: components.profitability },
      { metric: "GF Value", score: components.gfValue },
      { metric: "Momentum", score: components.momentum },
      { metric: "Financial Strength", score: components.financialStrength },
      { metric: "Growth", score: components.growth },
    ];

    if (
      data.some(
        (datum) =>
          datum.score === null ||
          !Number.isFinite(datum.score) ||
          datum.score < 0 ||
          datum.score > 10,
      )
    ) {
      return null;
    }

    return data as GfScoreRadarDatum[];
  }, [research]);

  const dailyChangeClass =
    (research?.snapshot.priceChange ?? 0) < 0 ? "negative" : "positive";
  const valueTrapWarning = research?.guruFocus.valueTrapWarning ?? {
    active: false,
    label: null,
    reasons: [],
  };
  const gfScoreTone = getGfScoreTone(research?.guruFocus.gfScore ?? null);
  const gfValuationTone = getGfValuationTone(
    research?.guruFocus.gfValuationCode,
  );
  const valuationLabel = research
    ? research.guruFocus.valuationLabel ??
      (research.guruFocus.gfValuationCode == null
        ? null
        : GF_VALUATION_LABELS[research.guruFocus.gfValuationCode] ?? null)
    : null;

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
            <article className={`gf-score-card ${gfScoreTone}`}>
              <div className="research-card-label">
                <span>GF Score</span>
                <ResearchHelp label="Explain GF Score ranges">
                  <strong>GF Score ranges</strong>
                  {GF_SCORE_DEFINITIONS.map(([range, definition, tone]) => (
                    <p className={`research-help-tone ${tone}`} key={range}>
                      <b>{range}</b>{definition}
                    </p>
                  ))}
                  {research.guruFocus.gfScorePrevious != null && (
                    <small className="research-help-previous">
                      Last period: {formatNumber(research.guruFocus.gfScorePrevious)} / 100
                      {research.guruFocus.gfScorePreviousPeriod
                        ? ` (${formatGfScorePeriod(research.guruFocus.gfScorePreviousPeriod)})`
                        : ""}
                    </small>
                  )}
                </ResearchHelp>
              </div>
              <strong>{formatNumber(research.guruFocus.gfScore)} <small>/ {research.guruFocus.gfScoreMax}</small></strong>
              {getGfScoreInterpretation(research.guruFocus.gfScore) && (
                <p className={`research-score-interpretation ${gfScoreTone}`}>
                  {getGfScoreInterpretation(research.guruFocus.gfScore)}
                </p>
              )}
              {research.guruFocus.gfScorePrevious != null && (
                <small className="research-previous-value">
                  Previous: {formatNumber(research.guruFocus.gfScorePrevious)} / 100
                  {research.guruFocus.gfScorePreviousPeriod
                    ? ` · ${formatGfScorePeriod(research.guruFocus.gfScorePreviousPeriod)}`
                    : ""}
                </small>
              )}
            </article>
            <article className={`gf-value-card ${gfValuationTone}`}>
              <div className="research-card-label">
                <span>GF Value</span>
                <ResearchHelp label="Explain GF Value categories">
                  <strong>GF Value categories</strong>
                  <p className="research-help-copy">
                    Based on the relationship between the current stock price and the GF Value, GuruFocus provides six valuation classifications.
                  </p>
                  {GF_VALUE_DEFINITIONS.map(([code, definition]) => (
                    <p className={`research-help-tone ${getGfValuationTone(code)}`} key={code}>
                      {definition}
                    </p>
                  ))}
                  <p className="research-help-copy">
                    There is only a sufficient margin of safety when the stock is undervalued.
                  </p>
                  {research.guruFocus.gfValuationPreviousLabel && (
                    <small className="research-help-previous">
                      Previous: {research.guruFocus.gfValuationPreviousLabel}
                      {research.guruFocus.gfValuationPreviousPeriod
                        ? ` · ${formatGfScorePeriod(research.guruFocus.gfValuationPreviousPeriod)}`
                        : ""}
                    </small>
                  )}
                </ResearchHelp>
              </div>
              <strong>{formatCurrency(research.guruFocus.gfValue)}</strong>
              {valuationLabel && (
                <p className={`research-valuation-label ${gfValuationTone}`}>
                  {valuationLabel}
                </p>
              )}
              {valueTrapWarning.active && valueTrapWarning.reasons.length > 0 && (
                <div className="research-value-trap-warning">
                  <b>{valueTrapWarning.label ?? "Possible Value Trap"}</b>
                  {valueTrapWarning.reasons.length > 0 && (
                    <ul>
                      {valueTrapWarning.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          </div>

          <section className="gf-score-breakdown-card">
            <header>
              <h2>GF Score Breakdown</h2>
              <strong>
                {formatNumber(research.guruFocus.gfScore)} /{" "}
                {research.guruFocus.gfScoreMax}
              </strong>
            </header>

            {gfScoreRadarData ? (
              <div className="gf-score-radar-container">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={gfScoreRadarData}
                    margin={{ top: 28, right: 56, bottom: 28, left: 56 }}
                  >
                    <PolarGrid stroke="#2b3747" />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: "#9aa8bb", fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 10]}
                      ticks={[0, 5, 10]}
                      axisLine={false}
                      tick={{ fill: "#637287", fontSize: 9 }}
                    />
                    <Radar
                      dataKey="score"
                      stroke="#76a1f5"
                      strokeWidth={2}
                      fill="#628dea"
                      fillOpacity={0.24}
                    />
                    <Tooltip content={<GfScoreTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="gf-score-breakdown-empty">
                GF Score component breakdown unavailable.
              </p>
            )}
          </section>

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
