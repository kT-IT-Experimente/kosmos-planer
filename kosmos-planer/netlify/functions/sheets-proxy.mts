import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const accessToken = authHeader.slice(7);
  const apiKey = Netlify.env.get("GOOGLE_API_KEY") || "";

  try {
    const body = await req.json();
    const { action, spreadsheetId, ranges, range, values } = body;

    if (!spreadsheetId) {
      return new Response(JSON.stringify({ error: "Missing spreadsheetId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "batchGet") {
      if (!ranges || !Array.isArray(ranges)) {
        return new Response(JSON.stringify({ error: "Missing ranges array" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams();
      ranges.forEach((r: string) => params.append("ranges", r));
      if (apiKey) params.append("key", apiKey);

      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`;

      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await sheetsResponse.json();

      if (!sheetsResponse.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || "Sheets API error" }), {
          status: sheetsResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      if (!range || !values) {
        return new Response(JSON.stringify({ error: "Missing range or values" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams({ valueInputOption: "USER_ENTERED" });
      if (apiKey) params.append("key", apiKey);

      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${params.toString()}`;

      const sheetsResponse = await fetch(sheetsUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      });

      const data = await sheetsResponse.json();

      if (!sheetsResponse.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || "Sheets API error" }), {
          status: sheetsResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use 'batchGet' or 'update'." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/sheets",
};
