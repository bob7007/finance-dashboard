interface Env {
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
  finance_dashboard_db: D1Database;
}

interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;

  balances: {
    available: number | null;
    current: number | null;
    limit: number | null;
    iso_currency_code: string | null;
  };
}

interface PlaidHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price: number | null;
  institution_price_as_of: string | null;
  institution_value: number | null;
  cost_basis: number | null;
  iso_currency_code: string | null;
}

interface PlaidSecurity {
  security_id: string;
  proxy_security_id: string | null;
  ticker_symbol: string | null;
  name: string | null;
  type: string | null;
  subtype: string | null;
  is_cash_equivalent: boolean;
}

interface PlaidInvestmentsResponse {
  accounts?: PlaidAccount[];
  holdings?: PlaidHolding[];
  securities?: PlaidSecurity[];

  error_type?: string;
  error_code?: string;
  error_message?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --------------------------------------------------
    // Create Plaid Link token
    // --------------------------------------------------
    if (
      url.pathname === "/api/plaid/link-token" &&
      request.method === "GET"
    ) {
      const response = await fetch(
        "https://sandbox.plaid.com/link/token/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,

            client_name: "Personal Finance Dashboard",

            user: {
              client_user_id: "personal-finance-user",
            },

            products: [
              "transactions",
              "investments",
            ],

            transactions: {
              days_requested: 30,
            },

            country_codes: ["US"],
            language: "en",
          }),
        }
      );

      const data = await response.json();

      return Response.json(data, {
        status: response.status,
      });
    }

    // --------------------------------------------------
    // Get raw investment holdings
    // Debug endpoint
    // --------------------------------------------------
    if (
      url.pathname === "/api/investments" &&
      request.method === "GET"
    ) {
      try {
        const result = await env.finance_dashboard_db
          .prepare(`
            SELECT item_id, access_token
            FROM plaid_items
          `)
          .all<{
            item_id: string;
            access_token: string;
          }>();

        const accounts: PlaidAccount[] = [];
        const holdings: PlaidHolding[] = [];
        const securities: PlaidSecurity[] = [];

        for (const item of result.results) {
          const response = await fetch(
            "https://sandbox.plaid.com/investments/holdings/get",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                client_id: env.PLAID_CLIENT_ID,
                secret: env.PLAID_SECRET,
                access_token: item.access_token,
              }),
            }
          );

          const data =
            (await response.json()) as PlaidInvestmentsResponse;

          if (!response.ok) {
            console.log(
              `No investments for Item ${item.item_id}:`,
              data.error_message
            );

            continue;
          }

          accounts.push(...(data.accounts ?? []));
          holdings.push(...(data.holdings ?? []));
          securities.push(...(data.securities ?? []));
        }

        return Response.json({
          accounts,
          holdings,
          securities,
        });
      } catch (error) {
        console.error("Investments error:", error);

        return Response.json(
          {
            error: "Unable to retrieve investments",
          },
          {
            status: 500,
          }
        );
      }
    }

    // --------------------------------------------------
    // Get normalized portfolio
    // This is what React will use
    // --------------------------------------------------
    if (
      url.pathname === "/api/portfolio" &&
      request.method === "GET"
    ) {
      try {
        const result = await env.finance_dashboard_db
          .prepare(`
            SELECT item_id, access_token
            FROM plaid_items
          `)
          .all<{
            item_id: string;
            access_token: string;
          }>();

        const portfolioAccounts: Array<{
          itemId: string;
          accountId: string;
          name: string;
          subtype: string | null;
          mask: string | null;
          value: number;
          currency: string | null;
        }> = [];

        const portfolioHoldings: Array<{
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
        }> = [];

        for (const item of result.results) {
          const response = await fetch(
            "https://sandbox.plaid.com/investments/holdings/get",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                client_id: env.PLAID_CLIENT_ID,
                secret: env.PLAID_SECRET,
                access_token: item.access_token,
              }),
            }
          );

          const data =
            (await response.json()) as PlaidInvestmentsResponse;

          if (!response.ok) {
            console.log(
              `Skipping non-investment Item ${item.item_id}:`,
              data.error_message
            );

            continue;
          }

          const allAccounts = data.accounts ?? [];
          const holdings = data.holdings ?? [];
          const securities = data.securities ?? [];

          // Only actual investment accounts belong
          // in the portfolio.
          const investmentAccounts =
            allAccounts.filter(
              (account) => account.type === "investment"
            );

          const investmentAccountIds = new Set(
            investmentAccounts.map(
              (account) => account.account_id
            )
          );

          // --------------------------------------------------
          // Build security lookup
          // security_id -> security information
          // --------------------------------------------------
          const securityMap = new Map<
            string,
            PlaidSecurity
          >();

          for (const security of securities) {
            securityMap.set(
              security.security_id,
              security
            );
          }

          // --------------------------------------------------
          // Normalize investment accounts
          // --------------------------------------------------
          for (const account of investmentAccounts) {
            portfolioAccounts.push({
              itemId: item.item_id,

              accountId: account.account_id,

              name: account.name,

              subtype: account.subtype,

              mask: account.mask,

              value:
                account.balances.current ?? 0,

              currency:
                account.balances.iso_currency_code,
            });
          }

          // --------------------------------------------------
          // Normalize holdings
          // --------------------------------------------------
          for (const holding of holdings) {
            // Ignore holdings belonging to
            // non-investment accounts.
            if (
              !investmentAccountIds.has(
                holding.account_id
              )
            ) {
              continue;
            }

            const account =
              investmentAccounts.find(
                (account) =>
                  account.account_id ===
                  holding.account_id
              );

            const security =
              securityMap.get(
                holding.security_id
              );

            // Some securities use a proxy security.
            // Example: a fund may point to another
            // security record containing the ticker.
            const proxySecurity =
              security?.proxy_security_id
                ? securityMap.get(
                    security.proxy_security_id
                  )
                : undefined;

            let ticker =
              security?.ticker_symbol ??
              proxySecurity?.ticker_symbol ??
              "";

            if (
              !ticker &&
              security?.is_cash_equivalent
            ) {
              ticker = "CASH";
            }

            if (!ticker) {
              ticker = "—";
            }

            const name =
              security?.name ??
              proxySecurity?.name ??
              "Unknown Security";

            const value =
              holding.institution_value;

            const costBasis =
              holding.cost_basis;

            let gain: number | null = null;
            let gainPercent: number | null =
              null;

            if (
              value !== null &&
              costBasis !== null
            ) {
              gain = value - costBasis;

              if (costBasis !== 0) {
                gainPercent =
                  (gain / costBasis) * 100;
              }
            }

            portfolioHoldings.push({
              itemId: item.item_id,

              accountId:
                holding.account_id,

              accountName:
                account?.name ??
                "Investment Account",

              securityId:
                holding.security_id,

              ticker,

              name,

              securityType:
                security?.type ??
                proxySecurity?.type ??
                null,

              quantity:
                holding.quantity,

              price:
                holding.institution_price,

              priceAsOf:
                holding.institution_price_as_of,

              value,

              costBasis,

              gain,

              gainPercent,

              currency:
                holding.iso_currency_code,
            });
          }
        }

        // Largest positions first
        portfolioHoldings.sort(
          (a, b) =>
            (b.value ?? 0) -
            (a.value ?? 0)
        );

        const totalValue =
          portfolioAccounts.reduce(
            (total, account) =>
              total + account.value,
            0
          );

        return Response.json({
          totalValue,

          accounts: portfolioAccounts,

          holdings: portfolioHoldings,
        });
      } catch (error) {
        console.error(
          "Portfolio error:",
          error
        );

        return Response.json(
          {
            error:
              "Unable to retrieve portfolio",
          },
          {
            status: 500,
          }
        );
      }
    }

    // --------------------------------------------------
    // Exchange public_token for access_token
    // and save connection in D1
    // --------------------------------------------------
    if (
      url.pathname === "/api/plaid/exchange" &&
      request.method === "POST"
    ) {
      const body =
        (await request.json()) as {
          public_token?: string;
        };

      if (!body.public_token) {
        return Response.json(
          {
            error:
              "public_token is required",
          },
          {
            status: 400,
          }
        );
      }

      const response = await fetch(
        "https://sandbox.plaid.com/item/public_token/exchange",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            client_id:
              env.PLAID_CLIENT_ID,

            secret:
              env.PLAID_SECRET,

            public_token:
              body.public_token,
          }),
        }
      );

      const data =
        (await response.json()) as {
          access_token?: string;
          item_id?: string;
          request_id?: string;
          error_type?: string;
          error_code?: string;
          error_message?: string;
        };

      if (
        !response.ok ||
        !data.access_token ||
        !data.item_id
      ) {
        return Response.json(data, {
          status: response.status,
        });
      }

      await env.finance_dashboard_db
        .prepare(`
          INSERT INTO plaid_items (
            item_id,
            access_token
          )
          VALUES (?, ?)
        `)
        .bind(
          data.item_id,
          data.access_token
        )
        .run();

      // Never expose access_token to React
      return Response.json({
        success: true,
        item_id: data.item_id,
      });
    }

    // --------------------------------------------------
    // Get connected Plaid accounts
    // --------------------------------------------------
    if (
      url.pathname === "/api/accounts" &&
      request.method === "GET"
    ) {
      try {
        const result =
          await env.finance_dashboard_db
            .prepare(`
              SELECT item_id, access_token
              FROM plaid_items
            `)
            .all<{
              item_id: string;
              access_token: string;
            }>();

        if (
          result.results.length === 0
        ) {
          return Response.json({
            accounts: [],
          });
        }

        const allAccounts: Array<
          PlaidAccount & {
            item_id: string;
          }
        > = [];

        for (
          const item of result.results
        ) {
          const response = await fetch(
            "https://sandbox.plaid.com/accounts/get",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                client_id:
                  env.PLAID_CLIENT_ID,

                secret:
                  env.PLAID_SECRET,

                access_token:
                  item.access_token,
              }),
            }
          );

          const data =
            (await response.json()) as {
              accounts?: PlaidAccount[];
              error_message?: string;
            };

          if (!response.ok) {
            console.error(
              "Plaid accounts error:",
              data.error_message
            );

            continue;
          }

          if (data.accounts) {
            allAccounts.push(
              ...data.accounts.map(
                (account) => ({
                  ...account,
                  item_id: item.item_id,
                })
              )
            );
          }
        }

        return Response.json({
          accounts: allAccounts,
        });
      } catch (error) {
        console.error(
          "Accounts error:",
          error
        );

        return Response.json(
          {
            error:
              "Unable to retrieve accounts",
          },
          {
            status: 500,
          }
        );
      }
    }

    // --------------------------------------------------
    // Unknown API route
    // --------------------------------------------------
    return Response.json(
      {
        error: "Not found",
      },
      {
        status: 404,
      }
    );
  },
} satisfies ExportedHandler<Env>;