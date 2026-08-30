CREATE TABLE research_companies (
  ticker TEXT PRIMARY KEY,
  company_name TEXT,
  exchange TEXT,
  last_viewed_at TEXT NOT NULL,
  last_searched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE research_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  research_json TEXT NOT NULL,
  FOREIGN KEY (ticker)
    REFERENCES research_companies(ticker)
    ON DELETE CASCADE
);

CREATE INDEX idx_research_companies_last_viewed
  ON research_companies(last_viewed_at DESC);

CREATE INDEX idx_research_snapshots_ticker_scraped
  ON research_snapshots(ticker, scraped_at DESC);
