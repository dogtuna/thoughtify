/* eslint-env node */
import process from "node:process";

export async function callZap({ zapUrl, payload = {} }) {
  const token = process.env.ZAPIER_AUTH_TOKEN;
  if (!token) {
    throw new Error("Missing Zapier auth token");
  }

  const res = await fetch(zapUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload ?? {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zapier request failed: ${res.status} ${text}`);
  }

  try {
    return await res.json();
  } catch {
    return { ok: true };
  }
}
