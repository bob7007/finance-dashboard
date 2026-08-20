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
  id: string;
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
          id: "holding-kraken-btc",
          coinId: "btc-local",
          walletId: "kraken",
          symbol: "BTC",
          name: "Bitcoin",
          quantity: 0.152,
          price: 64250,
          value: 9762,
          costBasis: 8600,
          gain: 1162,
          gainPercent: 13.51,
          change24h: 2.4,
        },
        {
          id: "holding-kraken-eth",
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
          id: "holding-kraken-sol",
          coinId: "sol-local",
          walletId: "kraken",
          symbol: "SOL",
          name: "Solana",
          quantity: 9.5,
          price: 172,
          value: 1634,
          costBasis: 1480,
          gain: 154,
          gainPercent: 10.41,
          change24h: -0.8,
        },
        {
          id: "holding-coinbase-btc",
          coinId: "btc-local",
          walletId: "coinbase",
          symbol: "BTC",
          name: "Bitcoin",
          quantity: 0.08,
          price: 64250,
          value: 5140,
          costBasis: 4700,
          gain: 440,
          gainPercent: 9.36,
          change24h: 2.4,
        },
        {
          id: "holding-coinbase-eth",
          coinId: "eth-local",
          walletId: "coinbase",
          symbol: "ETH",
          name: "Ethereum",
          quantity: 1.1,
          price: 3450,
          value: 3795,
          costBasis: 3600,
          gain: 195,
          gainPercent: 5.42,
          change24h: 1.7,
        },
        {
          id: "holding-coinbase-link",
          coinId: "link-local",
          walletId: "coinbase",
          symbol: "LINK",
          name: "Chainlink",
          quantity: 28,
          price: 14.8,
          value: 414.4,
          costBasis: 390,
          gain: 24.4,
          gainPercent: 6.26,
          change24h: 3.1,
        },
        {
          id: "holding-trezor-btc",
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
          id: "holding-trezor-sol",
          coinId: "sol-local",
          walletId: "trezor-safe-3",
          symbol: "SOL",
          name: "Solana",
          quantity: 14,
          price: 172,
          value: 2408,
          costBasis: 2200,
          gain: 208,
          gainPercent: 9.45,
          change24h: -0.8,
        },
        {
          id: "holding-trezor-link",
          coinId: "link-local",
          walletId: "trezor-safe-3",
          symbol: "LINK",
          name: "Chainlink",
          quantity: 35,
          price: 14.8,
          value: 518,
          costBasis: 480,
          gain: 38,
          gainPercent: 7.92,
          change24h: 3.1,
        },
        {
          id: "holding-phantom-sol",
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
          id: "holding-phantom-eth",
          coinId: "eth-local",
          walletId: "phantom",
          symbol: "ETH",
          name: "Ethereum",
          quantity: 0.75,
          price: 3450,
          value: 2587.5,
          costBasis: 2400,
          gain: 187.5,
          gainPercent: 7.81,
          change24h: 1.7,
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

  const [cryptoWallets, setCryptoWallets] =
    useState<CryptoWallet[]>(
      developmentCryptoWallets
    );

  const [cryptoHoldings, setCryptoHoldings] =
    useState<CryptoHolding[]>(
      developmentCryptoHoldings
    );

  const [walletOrder, setWalletOrder] =
    useState<string[]>(() =>
      developmentCryptoWallets.map(
        (wallet) => wallet.id
      )
    );

  const [openWalletMenuId, setOpenWalletMenuId] =
    useState<string | null>(null);

  const [editingWalletId, setEditingWalletId] =
    useState<string | null>(null);

  const [deleteWalletId, setDeleteWalletId] =
    useState<string | null>(null);

  const [deleteValidationMessage, setDeleteValidationMessage] =
    useState("");

  const [holdingToRemoveId, setHoldingToRemoveId] =
    useState<string | null>(null);

  const [isAddWalletOpen, setIsAddWalletOpen] =
    useState(false);

  const [walletName, setWalletName] =
    useState("");

  const [walletType, setWalletType] =
    useState<CryptoWallet["type"]>(
      "hardware_wallet"
    );

  const [walletValidationMessage, setWalletValidationMessage] =
    useState("");

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
    cryptoHoldings.reduce(
      (total, holding) => total + holding.value,
      0
    );

  const cryptoAssetCount = new Set(
    cryptoHoldings.map(
      (holding) => holding.coinId || holding.symbol
    )
  ).size;

  const filteredCryptoHoldings =
    selectedCryptoWalletId === null
      ? cryptoHoldings
      : cryptoHoldings.filter(
          (holding) =>
            holding.walletId ===
            selectedCryptoWalletId
        );

  const orderedWallets = walletOrder
    .map((walletId) =>
      cryptoWallets.find(
        (wallet) => wallet.id === walletId
      )
    )
    .filter(
      (wallet): wallet is CryptoWallet =>
        Boolean(wallet)
    );

    const editingWallet = editingWalletId
      ? cryptoWallets.find(
          (wallet) => wallet.id === editingWalletId
        )
      : undefined;

    const editingWalletHoldings = editingWallet
      ? cryptoHoldings.filter(
          (holding) =>
            holding.walletId === editingWallet.id
        )
      : [];

    const holdingToRemove = holdingToRemoveId
      ? cryptoHoldings.find(
          (holding) => holding.id === holdingToRemoveId
        )
      : undefined;

    const holdingToRemoveWallet = holdingToRemove
      ? cryptoWallets.find(
          (wallet) =>
            wallet.id === holdingToRemove.walletId
        )
      : undefined;

    const deleteWalletHoldingCount = deleteWalletId
        ? cryptoHoldings.filter(
          (holding) =>
            holding.walletId === deleteWalletId
        ).length
      : 0;

  const getWalletValue = (walletId: string) =>
    cryptoHoldings
      .filter(
        (holding) => holding.walletId === walletId
      )
      .reduce(
        (total, holding) => total + holding.value,
        0
      );

  const resetWalletForm = () => {
    setWalletName("");
    setWalletType("hardware_wallet");
    setWalletValidationMessage("");
    setEditingWalletId(null);
  };

  const openAddWalletModal = () => {
    resetWalletForm();
    setIsAddWalletOpen(true);
  };

  const openEditWalletModal = (
    wallet: CryptoWallet
  ) => {
    setEditingWalletId(wallet.id);
    setWalletName(wallet.name);
    setWalletType(wallet.type);
    setWalletValidationMessage("");
    setOpenWalletMenuId(null);
    setIsAddWalletOpen(true);
  };

  const handleAddWallet = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const trimmedName = walletName.trim();

    if (!trimmedName) {
      setWalletValidationMessage(
        "Wallet name is required."
      );
      return;
    }

    const isDuplicate = cryptoWallets.some(
      (wallet) =>
        wallet.id !== editingWalletId &&
        wallet.name.toLowerCase() ===
        trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      setWalletValidationMessage(
        "A wallet with this name already exists."
      );
      return;
    }

    if (editingWalletId) {
      setCryptoWallets((wallets) =>
        wallets.map((wallet) =>
          wallet.id === editingWalletId
            ? {
                ...wallet,
                name: trimmedName,
                type: walletType,
              }
            : wallet
        )
      );
    } else {
      const walletId = crypto.randomUUID();

      setCryptoWallets((wallets) => [
        ...wallets,
        {
          id: walletId,
          name: trimmedName,
          type: walletType,
        },
      ]);
      setWalletOrder((order) => [
        ...order,
        walletId,
      ]);
    }

    resetWalletForm();
    setIsAddWalletOpen(false);
  };

  const openDeleteWalletModal = (
    walletId: string
  ) => {
    const wallet = cryptoWallets.find(
      (candidate) => candidate.id === walletId
    );

    const holdingsCount =
      cryptoHoldings.filter(
        (holding) => holding.walletId === walletId
      ).length;

    setOpenWalletMenuId(null);

    if (holdingsCount > 0 && wallet) {
      openEditWalletModal(wallet);
      setWalletValidationMessage(
        "Remove all holdings before deleting this wallet."
      );
      return;
    }

    setDeleteValidationMessage("");
    setDeleteWalletId(walletId);
  };

  const confirmDeleteWallet = () => {
    if (!deleteWalletId) {
      return;
    }

    const holdingsCount =
      cryptoHoldings.filter(
        (holding) =>
          holding.walletId === deleteWalletId
      ).length;

    if (holdingsCount > 0) {
      setDeleteValidationMessage(
        "Remove all holdings before deleting this wallet."
      );
      return;
    }

    setCryptoWallets((wallets) =>
      wallets.filter(
        (wallet) => wallet.id !== deleteWalletId
      )
    );
    setWalletOrder((order) =>
      order.filter((walletId) =>
        walletId !== deleteWalletId
      )
    );

    if (selectedCryptoWalletId === deleteWalletId) {
      setSelectedCryptoWalletId(null);
    }

    setDeleteWalletId(null);
  };

  const confirmHoldingRemoval = () => {
    if (!holdingToRemoveId) {
      return;
    }

    const holding = cryptoHoldings.find(
      (current) => current.id === holdingToRemoveId
    );

    setCryptoHoldings((current) =>
      current.filter(
        (holding) => holding.id !== holdingToRemoveId
      )
    );

    if (
      holding &&
      cryptoHoldings.filter(
        (current) =>
          current.walletId === holding.walletId &&
          current.id !== holdingToRemoveId
      ).length === 0
    ) {
      setWalletValidationMessage("");
    }

    setHoldingToRemoveId(null);
  };

  const handleDeleteFromEdit = () => {
    if (!editingWalletId) {
      return;
    }

    const walletId = editingWalletId;
    resetWalletForm();
    setIsAddWalletOpen(false);
    openDeleteWalletModal(walletId);
  };

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
    <div
      className="app-shell"
      onClick={() => setOpenWalletMenuId(null)}
    >
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
                      {cryptoWallets.length}
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Assets
                    </span>

                    <strong className="summary-value small">
                      {cryptoAssetCount}
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

                    <button
                      className="add-wallet-button"
                      onClick={openAddWalletModal}
                    >
                      + Add Wallet
                    </button>
                  </div>

                  <div className="account-grid">
                    {orderedWallets.map(
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
                          <div className="wallet-card-controls">
                            <button
                              className="wallet-drag-handle"
                              type="button"
                              aria-label={`Reorder ${wallet.name}`}
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                            >
                              ⠿
                            </button>

                            <div className="wallet-menu-wrapper">
                              <button
                                className="wallet-menu-button"
                                type="button"
                                aria-label={`Actions for ${wallet.name}`}
                                aria-expanded={
                                  openWalletMenuId ===
                                  wallet.id
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenWalletMenuId(
                                    openWalletMenuId ===
                                      wallet.id
                                      ? null
                                      : wallet.id
                                  );
                                }}
                              >
                                ⋮
                              </button>

                              {openWalletMenuId ===
                                wallet.id && (
                                <div
                                  className="wallet-menu"
                                  onClick={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openEditWalletModal(
                                        wallet
                                      );
                                    }}
                                  >
                                    Edit Wallet
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDeleteWalletModal(
                                        wallet.id
                                      );
                                    }}
                                  >
                                    Delete Wallet
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

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
                          <tr key={holding.id}>
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
                                {cryptoWallets.find(
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

      {isAddWalletOpen && (
        <div
          className="wallet-modal-backdrop"
          onClick={() => {
            resetWalletForm();
            setIsAddWalletOpen(false);
          }}
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-wallet-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="wallet-modal-header">
              <div>
                <p className="section-eyebrow">
                  CRYPTO
                </p>

                <h2 id="add-wallet-title">
                  {editingWalletId
                    ? "Edit Wallet"
                    : "Add Wallet"}
                </h2>
              </div>

              <button
                className="wallet-modal-close"
                type="button"
                aria-label="Close Add Wallet"
                onClick={() => {
                  resetWalletForm();
                  setIsAddWalletOpen(false);
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddWallet}>
              <label className="wallet-form-field">
                <span>Wallet Name</span>
                <input
                  autoFocus
                  value={walletName}
                  onChange={(event) =>
                    setWalletName(event.target.value)
                  }
                />
              </label>

              <label className="wallet-form-field">
                <span>Type</span>
                <select
                  value={walletType}
                  onChange={(event) =>
                    setWalletType(
                      event.target.value as CryptoWallet["type"]
                    )
                  }
                >
                  <option value="hardware_wallet">
                    Hardware Wallet
                  </option>
                  <option value="software_wallet">
                    Software Wallet
                  </option>
                  <option value="exchange">
                    Exchange
                  </option>
                  <option value="other">
                    Other
                  </option>
                </select>
              </label>

              {editingWallet && (
                <section className="wallet-holdings-section">
                  <div className="wallet-holdings-header">
                    <span>Holdings</span>
                    <span>
                      {editingWalletHoldings.length} {editingWalletHoldings.length === 1 ? "holding" : "holdings"}
                    </span>
                  </div>

                  {editingWalletHoldings.length > 0 ? (
                    <div className="wallet-holdings-list">
                      {editingWalletHoldings.map(
                        (holding) => (
                          <div
                            className="wallet-holding-row"
                            key={holding.id}
                          >
                            <div>
                              <strong>{holding.symbol}</strong>
                              <span>
                                {formatQuantity(
                                  holding.quantity
                                )} {holding.symbol}
                              </span>
                            </div>

                            <button
                              className="wallet-remove-holding-button"
                              type="button"
                              onClick={() =>
                                setHoldingToRemoveId(
                                  holding.id
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="wallet-delete-message">
                      No holdings in this wallet.
                    </p>
                  )}
                </section>
              )}

              {walletValidationMessage && (
                <p className="wallet-validation-message">
                  {walletValidationMessage}
                </p>
              )}

              <div className="wallet-modal-actions">
                <button
                  className="wallet-cancel-button"
                  type="button"
                  onClick={() => {
                    resetWalletForm();
                    setIsAddWalletOpen(false);
                  }}
                >
                  Cancel
                </button>

                {editingWallet &&
                  editingWalletHoldings.length === 0 && (
                  <button
                    className="wallet-delete-action"
                    type="button"
                    onClick={handleDeleteFromEdit}
                  >
                    Delete Wallet
                  </button>
                )}

                <button
                  className="wallet-submit-button"
                  type="submit"
                >
                  {editingWalletId
                    ? "Save Changes"
                    : "Add Wallet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteWalletId && (
        <div
          className="wallet-modal-backdrop"
          onClick={() =>
            setDeleteWalletId(null)
          }
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-wallet-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="wallet-modal-header">
              <div>
                <p className="section-eyebrow">
                  CRYPTO
                </p>

                <h2 id="delete-wallet-title">
                  Delete Wallet
                </h2>
              </div>

              <button
                className="wallet-modal-close"
                type="button"
                aria-label="Close Delete Wallet"
                onClick={() =>
                  setDeleteWalletId(null)
                }
              >
                ×
              </button>
            </div>

            <p className="wallet-delete-message">
              Delete "
              {cryptoWallets.find(
                (wallet) =>
                  wallet.id === deleteWalletId
              )?.name ?? "this wallet"}
              "?
            </p>

            {deleteValidationMessage ||
            deleteWalletHoldingCount > 0 ? (
              <p className="wallet-validation-message">
                {deleteValidationMessage ||
                  `This wallet contains ${deleteWalletHoldingCount} holdings. Remove or move its holdings before deleting the wallet.`}
              </p>
            ) : (
              <p className="wallet-delete-message">
                This wallet has no holdings.
              </p>
            )}

            <div className="wallet-modal-actions">
              <button
                className="wallet-cancel-button"
                type="button"
                onClick={() =>
                  setDeleteWalletId(null)
                }
              >
                Cancel
              </button>

              <button
                className="wallet-submit-button"
                type="button"
                onClick={confirmDeleteWallet}
              >
                Delete Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {holdingToRemove && (
        <div
          className="wallet-modal-backdrop"
          onClick={() =>
            setHoldingToRemoveId(null)
          }
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-holding-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="wallet-modal-header">
              <div>
                <p className="section-eyebrow">
                  HOLDINGS
                </p>

                <h2 id="remove-holding-title">
                  Remove {holdingToRemove.symbol}?
                </h2>
              </div>

              <button
                className="wallet-modal-close"
                type="button"
                aria-label="Close Remove Holding"
                onClick={() =>
                  setHoldingToRemoveId(null)
                }
              >
                ×
              </button>
            </div>

            <p className="wallet-delete-message">
              This will remove this holding from {holdingToRemoveWallet?.name ?? "the wallet"}.
            </p>

            <div className="wallet-modal-actions">
              <button
                className="wallet-cancel-button"
                type="button"
                onClick={() =>
                  setHoldingToRemoveId(null)
                }
              >
                Cancel
              </button>

              <button
                className="wallet-submit-button"
                type="button"
                onClick={confirmHoldingRemoval}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;