import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // Determine the origin for redirects
  const origin = url.origin;

  if (error) {
    return Response.redirect(
      `${origin}/?auth_error=${encodeURIComponent(error)}`,
      302
    );
  }

  if (!code) {
    return Response.redirect(`${origin}/?auth_error=no_code`, 302);
  }

  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Netlify.env.get("GOOGLE_CLIENT_SECRET") || "";

  if (!clientId || !clientSecret) {
    return Response.redirect(
      `${origin}/?auth_error=missing_server_config`,
      302
    );
  }

  // The redirect URI must match exactly what was sent in the authorize request
  const redirectUri = `${origin}/api/auth/callback`;

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      const errMsg =
        tokenData.error_description ||
        tokenData.error ||
        "token_exchange_failed";
      return Response.redirect(
        `${origin}/?auth_error=${encodeURIComponent(errMsg)}`,
        302
      );
    }

    // Build fragment to pass tokens to the SPA.
    // Fragment data is never sent to the server, keeping tokens secure in transit.
    const fragment = new URLSearchParams({
      access_token: tokenData.access_token,
      expires_in: String(tokenData.expires_in || 3600),
      ...(tokenData.refresh_token
        ? { refresh_token: tokenData.refresh_token }
        : {}),
    });

    // Use an HTML page with JS redirect because Response.redirect cannot set fragments
    const redirectUrl = `${origin}/#auth=${fragment.toString()}`;
    return new Response(
      `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head><body>Weiterleitung...</body></html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  } catch (e: any) {
    return Response.redirect(
      `${origin}/?auth_error=${encodeURIComponent(e.message || "network_error")}`,
      302
    );
  }
};

export const config: Config = {
  path: "/api/auth/callback",
};
