import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID") || "";

  return new Response(
    JSON.stringify({
      google_client_id: clientId || null,
      auth_configured: !!(clientId && Netlify.env.get("GOOGLE_CLIENT_SECRET")),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const config: Config = {
  path: "/api/auth/config",
};
