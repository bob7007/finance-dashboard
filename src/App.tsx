import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

function App() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState("Not connected");

  useEffect(() => {
    fetch("/api/plaid/link-token")
      .then((response) => response.json())
      .then((data) => {
        setLinkToken(data.link_token);
      });
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,

    onSuccess: async (publicToken) => {
      setStatus("Connected. Exchanging token...");

      const response = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          public_token: publicToken,
        }),
      });

      const data = await response.json();

      console.log("Plaid exchange response:", data);

      if (response.ok) {
        setStatus("Account connected successfully");
      } else {
        setStatus("Connection failed");
      }
    },

    onExit: (error) => {
      if (error) {
        console.error("Plaid Link error:", error);
      }
    },
  });

  return (
    <main>
      <h1>Personal Finance Dashboard</h1>

      <button
        onClick={() => open()}
        disabled={!ready}
      >
        Connect Account
      </button>

      <p>{status}</p>
    </main>
  );
}

export default App;