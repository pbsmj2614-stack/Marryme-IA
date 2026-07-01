/**
 * Token OAuth para Google Sheets API via service account (server-side).
 * Quota muito maior que API key pública — evita 429 no sync de dezenas de abas.
 */

import { createSign } from "node:crypto";

let cached: { token: string; expMs: number } | null = null;

function makeJWT(email: string, key: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const msg = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(msg);
  return `${msg}.${sign.sign(key, "base64url")}`;
}

/** Retorna access token ou null se GOOGLE_SERVICE_ACCOUNT_JSON não estiver configurado. */
export async function getGoogleSheetsAccessTokenOptional(): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  if (cached && cached.expMs > Date.now() + 60_000) {
    return cached.token;
  }

  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const jwt = makeJWT(sa.client_email, sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(`Google Auth falhou: ${data.error_description ?? JSON.stringify(data)}`);
  }
  cached = { token: data.access_token, expMs: Date.now() + 3500 * 1000 };
  return data.access_token;
}
