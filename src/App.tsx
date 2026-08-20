import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import "./App.css";

interface PortfolioAccount {
  itemId: string;
  accountId: string;
  name: string;
  subtype: string | null;
  mask: string | null;
  value: number;
  currency: string | null;
}

interface PortfolioHolding {
  itemId: string;
  accountId: string;
  accountName: string;

  securityId: string;

  ticker: string;
  name: string;
  securityType: string | null;

  quantity: number;

  price: number | null;
  priceAsOf: string | null;

  value: number | null;
  costBasis: number | null;

  gain: number | null;
  gainPercent: number | null;

  currency: string | null;
}

interface PortfolioResponse {
  totalValue: number;
  plaidEnvironment: string;
  accounts: PortfolioAccount[];
  holdings: PortfolioHolding[];
}

interface CryptoHolding {
  coinId: string;
  walletId: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  value: number;
  costBasis: number;
  gain: number;
  gainPercent: number;
  change24h: number;
}

interface CryptoWallet {
  id: string;
  name: string;
  type:
    | "exchange"
    | "hardware_wallet"
    | "software_wallet"
    | "other";
}

const developmentCryptoWallets: CryptoWallet[] =
  import.meta.env.DEV
    ? [
        {
          id: "trezor-safe-3",
          name: "Trezor Safe 3",
          type: "hardware_wallet",
        },
        {
          id: "kraken",
          name: "Kraken",
          type: "exchange",
        },
        {
          id: "phantom",
          name: "Phantom",
          type: "software_wallet",
        },
        {
          id: "coinbase",
          name: "Coinbase",
          type: "exchange",
        },
      ]
    : [];

// Temporary development test data; replace with the crypto portfolio API later.
const developmentCryptoHoldings: CryptoHolding[] =
  import.meta.env.DEV
    ? [
        {
          coinId: "btc-local",
          walletId: "trezor-safe-3",
          symbol: "BTC",
          name: "Bitcoin",
          quantity: 0.18,
          price: 64250,
          value: 11565,
          costBasis: 9800,
          gain: 1765,
          gainPercent: 18.01,
          change24h: 2.4,
        },
        {
          coinId: "eth-local",
          walletId: "kraken",
          symbol: "ETH",
          name: "Ethereum",
          quantity: 2.4,
          price: 3450,
          value: 8280,
          costBasis: 7600,
          gain: 680,
          gainPercent: 8.95,
          change24h: 1.7,
        },
        {
          coinId: "sol-local",
          walletId: "phantom",
          symbol: "SOL",
          name: "Solana",
          quantity: 18,
          price: 172,
          value: 3096,
          costBasis: 3420,
          gain: -324,
          gainPercent: -9.47,
          change24h: -0.8,
        },
        {
          coinId: "link-local",
          walletId: "coinbase",
          symbol: "LINK",
          name: "Chainlink",
          quantity: 42,
          price: 14.8,
          value: 621.6,
          costBasis: 560,
          gain: 61.6,
          gainPercent: 11,
          change24h: 3.1,
        },
      ]
    : [];

function formatCurrency(
  value: number | null,
  currency = "USD"
) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function App() {
  const [portfolio, setPortfolio] =
    useState<PortfolioResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [linkToken, setLinkToken] =
    useState<string | null>(null);

  const [connectionStatus, setConnectionStatus] =
    useState("");

  const [selectedAccountKey, setSelectedAccountKey] =
    useState<string | null>(null);

  const [portfolioCategory, setPortfolioCategory] =
    useState<"brokerage" | "crypto">("brokerage");

  const [selectedCryptoWalletId, setSelectedCryptoWalletId] =
    useState<string | null>(null);

  // --------------------------------------------------
  // Load normalized portfolio
  // --------------------------------------------------
  const loadPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response =
        await fetch("/api/portfolio");

      const data =
        (await response.json()) as
          | PortfolioResponse
          | {
              error?: string;
            };

      if (
        !response.ok ||
        !("holdings" in data)
      ) {
        throw new Error(
          "error" in data
            ? data.error
            : "Unable to load portfolio"
        );
      }

      setPortfolio(data);
    } catch (err) {
      console.error(
        "Portfolio load error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load portfolio"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // --------------------------------------------------
  // Get Plaid Link token
  // --------------------------------------------------
  useEffect(() => {
    const initializePlaid = async () => {
      try {
        const response = await fetch(
          "/api/plaid/link-token"
        );

        const data =
          (await response.json()) as {
            link_token?: string;
            error_message?: string;
          };

        if (
          !response.ok ||
          !data.link_token
        ) {
          console.error(
            "Unable to initialize Plaid:",
            data
          );

          return;
        }

        setLinkToken(
          data.link_token
        );
      } catch (err) {
        console.error(
          "Plaid initialization error:",
          err
        );
      }
    };

    initializePlaid();
  }, []);

  // --------------------------------------------------
  // Load portfolio on page load
  // --------------------------------------------------
  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  // --------------------------------------------------
  // Plaid Link
  // --------------------------------------------------
  const { open, ready } =
    usePlaidLink({
      token: linkToken,

      onSuccess: async (
        publicToken
      ) => {
        try {
          setConnectionStatus(
            "Saving account..."
          );

          const response =
            await fetch(
              "/api/plaid/exchange",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body: JSON.stringify({
                  public_token:
                    publicToken,
                }),
              }
            );

          const data =
            (await response.json()) as {
              success?: boolean;
              error?: string;
            };

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ??
                "Unable to save account"
            );
          }

          setConnectionStatus(
            "Account connected"
          );

          await loadPortfolio();
        } catch (err) {
          console.error(
            "Plaid exchange error:",
            err
          );

          setConnectionStatus(
            "Connection failed"
          );
        }
      },

      onExit: (error) => {
        if (error) {
          console.error(
            "Plaid Link error:",
            error
          );
        }
      },
    });

  const investmentAccountCount =
    portfolio?.accounts.length ?? 0;

  const positionCount =
    portfolio?.holdings.length ?? 0;

  const filteredHoldings =
    selectedAccountKey === null
      ? portfolio?.holdings ?? []
      : portfolio?.holdings.filter(
          (holding) =>
            `${holding.itemId}:${holding.accountId}` ===
            selectedAccountKey
        ) ?? [];

  const cryptoTotalValue =
    developmentCryptoHoldings.reduce(
      (total, holding) => total + holding.value,
      0
    );

  const cryptoChange24h =
    cryptoTotalValue === 0
      ? 0
      : developmentCryptoHoldings.reduce(
          (total, holding) =>
            total +
            holding.value *
              (holding.change24h / 100),
          0
        ) /
          cryptoTotalValue *
        100;

  const filteredCryptoHoldings =
    selectedCryptoWalletId === null
      ? developmentCryptoHoldings
      : developmentCryptoHoldings.filter(
          (holding) =>
            holding.walletId ===
            selectedCryptoWalletId
        );

  const getWalletValue = (walletId: string) =>
    developmentCryptoHoldings
      .filter(
        (holding) => holding.walletId === walletId
      )
      .reduce(
        (total, holding) => total + holding.value,
        0
      );

  const getWalletTypeLabel = (
    type: CryptoWallet["type"]
  ) =>
    type === "hardware_wallet"
      ? "Hardware Wallet"
      : type === "software_wallet"
        ? "Software Wallet"
        : type === "exchange"
          ? "Exchange"
          : "Other";

  const latestPriceDate =
    useMemo(() => {
      if (!portfolio) {
        return null;
      }

      const dates =
        portfolio.holdings
          .map(
            (holding) =>
              holding.priceAsOf
          )
          .filter(
            (
              date
            ): date is string =>
              Boolean(date)
          )
          .sort();

      return dates.at(-1) ?? null;
    }, [portfolio]);

  return (
    <div className="app-shell">
      {/* --------------------------------------------
          Header
      --------------------------------------------- */}
      <header className="topbar">
        <div>
          <div className="brand">
            FINANCE TERMINAL
          </div>

          <div className="environment-badge">
            PLAID {portfolio?.plaidEnvironment?.toUpperCase() ?? "..."}
          </div>
        </div>

        <div className="topbar-actions">
          {connectionStatus && (
            <span className="connection-status">
              {connectionStatus}
            </span>
          )}

          <button
            className="refresh-button"
            onClick={loadPortfolio}
          >
            Refresh
          </button>

          <button
            className="connect-button"
            disabled={!ready}
            onClick={() => open()}
          >
            + Add Institution
          </button>
        </div>
      </header>

      {/* --------------------------------------------
          Navigation
      --------------------------------------------- */}
      <nav className="navigation">
        <button>Overview</button>
        <button>Accounts</button>

        <button className="active">
          Portfolio
        </button>

        <button>
          Transactions
        </button>

        <button>Research</button>
        <button>Settings</button>
      </nav>

      <main className="content">
        {/* ------------------------------------------
            Page title
        ------------------------------------------- */}
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              INVESTMENTS
            </p>

            <h1>Portfolio</h1>

            <p className="page-description">
              Investment accounts and
              holdings retrieved through
              Plaid.
            </p>
          </div>

          {portfolioCategory === "brokerage" &&
            latestPriceDate && (
            <div className="price-date">
              Institution prices as of{" "}
              <strong>
                {latestPriceDate}
              </strong>
            </div>
          )}
        </div>

        <div className="portfolio-category-nav">
          <button
            className={
              portfolioCategory === "brokerage"
                ? "active"
                : ""
            }
            onClick={() =>
              setPortfolioCategory("brokerage")
            }
          >
            Brokerage
          </button>

          <button
            className={
              portfolioCategory === "crypto"
                ? "active"
                : ""
            }
            onClick={() =>
              setPortfolioCategory("crypto")
            }
          >
            Crypto
          </button>
        </div>

        {loading && (
          <div className="state-message">
            Loading portfolio...
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          portfolio && (
            <>
              {/* ------------------------------------
                  Summary cards
              ------------------------------------- */}
              {portfolioCategory === "brokerage" ? (
                <section className="summary-grid">
                  <div className="summary-card primary-card">
                    <span className="summary-label">
                      Total Investment
                      Value
                    </span>

                    <strong className="summary-value">
                      {formatCurrency(
                        portfolio.totalValue
                      )}
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Investment Accounts
                    </span>

                    <strong className="summary-value small">
                      {
                        investmentAccountCount
                      }
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Positions
                    </span>

                    <strong className="summary-value small">
                      {positionCount}
                    </strong>
                  </div>
                </section>
              ) : (
                <section className="summary-grid">
                  <div className="summary-card primary-card">
                    <span className="summary-label">
                      Total Crypto Value
                    </span>

                    <strong className="summary-value">
                      {formatCurrency(
                        cryptoTotalValue
                      )}
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Wallets
                    </span>

                    <strong className="summary-value small">
                      {developmentCryptoWallets.length}
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      24H Change
                    </span>

                    <strong className="summary-value small">
                      {formatPercent(
                        cryptoChange24h
                      )}
                    </strong>
                  </div>
                </section>
              )}

              {/* ------------------------------------
                  Accounts
              ------------------------------------- */}
              {portfolioCategory === "brokerage" && (
              <section className="section">
                <div className="section-header">
                  <div>
                    <p className="section-eyebrow">
                      ACCOUNTS
                    </p>

                    <h2>
                      Investment Accounts
                    </h2>
                  </div>
                </div>

                <div className="account-grid">
                  {portfolio.accounts.map(
                    (account) => (
                      <div
                        className={`account-card ${
                          selectedAccountKey ===
                          `${account.itemId}:${account.accountId}`
                            ? "selected"
                            : ""
                        }`}
                        key={
                          `${account.itemId}:${account.accountId}`
                        }
                        onClick={() =>
                          setSelectedAccountKey(
                            selectedAccountKey ===
                              `${account.itemId}:${account.accountId}`
                              ? null
                              : `${account.itemId}:${account.accountId}`
                          )
                        }
                      >
                        <div className="account-card-top">
                          <div>
                            <div className="account-name">
                              {
                                account.name
                              }
                            </div>

                            <div className="account-meta">
                              {account.subtype ??
                                "Investment"}

                              {account.mask
                                ? ` •••• ${account.mask}`
                                : ""}
                            </div>
                          </div>

                          <span className="account-type">
                            {
                              account.subtype
                            }
                          </span>
                        </div>

                        <div className="account-balance">
                          {formatCurrency(
                            account.value,
                            account.currency ??
                              "USD"
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>
              )}

              {portfolioCategory === "crypto" && (
                <section className="section">
                  <div className="section-header">
                    <div>
                      <p className="section-eyebrow">
                        WALLETS
                      </p>

                      <h2>Wallets</h2>
                    </div>
                  </div>

                  <div className="account-grid">
                    {developmentCryptoWallets.map(
                      (wallet) => (
                        <div
                          className={`account-card ${
                            selectedCryptoWalletId ===
                            wallet.id
                              ? "selected"
                              : ""
                          }`}
                          key={wallet.id}
                          onClick={() =>
                            setSelectedCryptoWalletId(
                              selectedCryptoWalletId ===
                                wallet.id
                                ? null
                                : wallet.id
                            )
                          }
                        >
                          <div className="account-card-top">
                            <div className="account-name">
                              {wallet.name}
                            </div>

                            <span className="account-type">
                              {getWalletTypeLabel(
                                wallet.type
                              )}
                            </span>
                          </div>

                          <div className="account-balance">
                            {formatCurrency(
                              getWalletValue(
                                wallet.id
                              )
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>
              )}

              {/* ------------------------------------
                  Holdings table
              ------------------------------------- */}
              <section className="section">
                <div className="section-header">
                  <div>
                    <p className="section-eyebrow">
                      {portfolioCategory === "crypto"
                        ? "CRYPTO ASSETS"
                        : "POSITIONS"}
                    </p>

                    <h2>Holdings</h2>
                  </div>
                </div>

                <div className="table-container">
                  {portfolioCategory === "brokerage" ? (
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Security</th>
                        <th>Account</th>
                        <th className="numeric">
                          Quantity
                        </th>
                        <th className="numeric">
                          Price
                        </th>
                        <th className="numeric">
                          Value
                        </th>
                        <th className="numeric">
                          Cost Basis
                        </th>
                        <th className="numeric">
                          Gain / Loss
                        </th>
                        <th className="numeric">
                          Return
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredHoldings.map(
                        (holding) => {
                          const gainClass =
                            holding.gain ===
                            null
                              ? ""
                              : holding.gain >
                                  0
                                ? "positive"
                                : holding.gain <
                                    0
                                  ? "negative"
                                  : "";

                          return (
                            <tr
                              key={`${holding.itemId}-${holding.accountId}-${holding.securityId}`}
                            >
                              <td>
                                <span className="ticker">
                                  {
                                    holding.ticker
                                  }
                                </span>
                              </td>

                              <td>
                                <div className="security-name">
                                  {
                                    holding.name
                                  }
                                </div>

                                <div className="security-type">
                                  {holding.securityType ??
                                    "Security"}
                                </div>
                              </td>

                              <td>
                                <span className="account-pill">
                                  {
                                    holding.accountName
                                  }
                                </span>
                              </td>

                              <td className="numeric">
                                {formatQuantity(
                                  holding.quantity
                                )}
                              </td>

                              <td className="numeric">
                                {formatCurrency(
                                  holding.price,
                                  holding.currency ??
                                    "USD"
                                )}
                              </td>

                              <td className="numeric value-cell">
                                {formatCurrency(
                                  holding.value,
                                  holding.currency ??
                                    "USD"
                                )}
                              </td>

                              <td className="numeric">
                                {formatCurrency(
                                  holding.costBasis,
                                  holding.currency ??
                                    "USD"
                                )}
                              </td>

                              <td
                                className={`numeric ${gainClass}`}
                              >
                                {holding.gain !==
                                null
                                  ? `${holding.gain >= 0 ? "+" : ""}${formatCurrency(
                                      holding.gain,
                                      holding.currency ??
                                        "USD"
                                    )}`
                                  : "—"}
                              </td>

                              <td
                                className={`numeric ${gainClass}`}
                              >
                                {formatPercent(
                                  holding.gainPercent
                                )}
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                  ) : (
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Asset</th>
                        <th>Wallet</th>
                        <th className="numeric">Quantity</th>
                        <th className="numeric">Price</th>
                        <th className="numeric">Value</th>
                        <th className="numeric">Cost Basis</th>
                        <th className="numeric">Gain / Loss</th>
                        <th className="numeric">Return</th>
                        <th className="numeric">24H</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredCryptoHoldings.map(
                        (holding) => (
                          <tr key={holding.coinId}>
                            <td>
                              <span className="ticker">
                                {holding.symbol}
                              </span>
                            </td>

                            <td>
                              <div className="security-name">
                                {holding.name}
                              </div>
                              <div className="security-type">
                                {holding.coinId}
                              </div>
                            </td>

                            <td>
                              <span className="account-pill">
                                {developmentCryptoWallets.find(
                                  (wallet) =>
                                    wallet.id ===
                                    holding.walletId
                                )?.name ?? "Wallet"}
                              </span>
                            </td>

                            <td className="numeric">
                              {formatQuantity(
                                holding.quantity
                              )}
                            </td>

                            <td className="numeric">
                              {formatCurrency(
                                holding.price
                              )}
                            </td>

                            <td className="numeric value-cell">
                              {formatCurrency(
                                holding.value
                              )}
                            </td>

                            <td className="numeric">
                              {formatCurrency(
                                holding.costBasis
                              )}
                            </td>

                            <td
                              className={`numeric ${
                                holding.gain >= 0
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {holding.gain >= 0
                                ? "+"
                                : ""}
                              {formatCurrency(
                                holding.gain
                              )}
                            </td>

                            <td
                              className={`numeric ${
                                holding.gainPercent >= 0
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {formatPercent(
                                holding.gainPercent
                              )}
                            </td>

                            <td
                              className={`numeric ${
                                holding.change24h >= 0
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {formatPercent(
                                holding.change24h
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                  )}
                </div>
              </section>
            </>
          )}
      </main>
    </div>
  );
}

export default App;