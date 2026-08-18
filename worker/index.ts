interface Env {
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
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

            products: ["transactions"],

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
    // Exchange public_token for access_token
    // --------------------------------------------------
    if (
      url.pathname === "/api/plaid/exchange" &&
      request.method === "POST"
    ) {
      const body = (await request.json()) as {
        public_token?: string;
      };

      if (!body.public_token) {
        return Response.json(
          {
            error: "public_token is required",
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
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            public_token: body.public_token,
          }),
        }
      );

      const data = await response.json();

      return Response.json(data, {
        status: response.status,
      });
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