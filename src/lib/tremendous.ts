const SANDBOX = "https://testflight.tremendous.com/api/v2";
const PROD = "https://api.tremendous.com/api/v2";

function baseUrl(key: string) {
  return key.startsWith("TEST_") ? SANDBOX : PROD;
}

export async function createTremendousLink(opts: {
  amount: number;
  recipientName: string;
  recipientEmail: string;
  externalId: string;
}): Promise<string | null> {
  const key = process.env.TREMENDOUS_API_KEY;
  if (!key) return null;

  const productId = process.env.TREMENDOUS_PRODUCT_ID || "OKMHM2X2OHYV"; // sandbox Amazon-style product; override if needed
  const funding = process.env.TREMENDOUS_FUNDING_SOURCE || "BALANCE";

  const body = {
    external_id: opts.externalId,
    payment: { funding_source_id: funding },
    reward: {
      value: { denomination: opts.amount, currency_code: "USD" },
      delivery: { method: "LINK" },
      recipient: {
        name: opts.recipientName || "LitLoot Kid",
        email: opts.recipientEmail || "kid@litloot.invalid"
      },
      products: [productId]
    }
  };

  try {
    const res = await fetch(`${baseUrl(key)}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Tremendous order failed", res.status, err.slice(0, 300));
      return null;
    }
    const data = (await res.json()) as {
      order?: { rewards?: { delivery?: { link?: string } }[] };
    };
    return data.order?.rewards?.[0]?.delivery?.link ?? null;
  } catch (err) {
    console.error("Tremendous request error", err);
    return null;
  }
}
