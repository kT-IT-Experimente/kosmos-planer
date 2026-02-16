import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Netlify.env.get("GOOGLE_CLIENT_SECRET") || "";

  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: "Server missing Google OAuth configuration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      return new Response(
        JSON.stringify({ error: "Missing refresh_token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return new Response(
        JSON.stringify({
          error: tokenData.error_description || tokenData.error || "refresh_failed",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in || 3600,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message || "network_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/auth/refresh",
};
