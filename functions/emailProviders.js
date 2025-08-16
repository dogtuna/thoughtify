import process from "process";
import { Buffer } from "buffer";
import functions from "firebase-functions";
import admin from "firebase-admin";
import { google } from "googleapis";
// import { ConfidentialClientApplication } from "@azure/msal-node"; // Outlook integration disabled
import crypto from "crypto";

// Encryption helpers for storing tokens securely
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || ""; // must be 32 bytes hex
function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    console.warn(
      "TOKEN_ENCRYPTION_KEY not set; storing OAuth token in plain text"
    );
    return text;
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}
function decrypt(text) {
  if (!ENCRYPTION_KEY) return text;
  const [ivHex, data] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Helper to build a Google OAuth client after verifying env vars
function createGmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI } =
    process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REDIRECT_URI) {
    throw new Error("Gmail OAuth environment variables are not set");
  }
  return new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );
}

// Microsoft OAuth configuration (temporarily disabled)
// const msalClient = new ConfidentialClientApplication({
//   auth: {
//    clientId: process.env.OUTLOOK_CLIENT_ID || "",
//    authority: `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID}`,
//    clientSecret: process.env.OUTLOOK_CLIENT_SECRET || "",
//   },
// });

// 1. Generate provider authorization URL
export const getEmailAuthUrl = functions.https.onRequest(async (req, res) => {
  const { provider, state = "" } = req.query;
  try {
    if (provider === "gmail") {
      const gmailClient = createGmailClient();
      const url = gmailClient.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/gmail.send"],
        state,
        client_id: process.env.GMAIL_CLIENT_ID,
      });
      res.redirect(url);
      // Outlook integration temporarily disabled
      // } else if (provider === "outlook") {
      //   const url = await msalClient.getAuthCodeUrl({
      //     scopes: ["https://graph.microsoft.com/Mail.Send", "offline_access"],
      //     redirectUri: process.env.OUTLOOK_REDIRECT_URI,
      //     state,
      //   });
      //   res.redirect(url);
    } else {
      res.status(400).send("Unknown provider");
    }
  } catch (err) {
    console.error("getEmailAuthUrl error", err);
    res.status(500).send("OAuth error");
  }
});

// 2. OAuth callback to store encrypted tokens
export const emailOAuthCallback = functions.https.onRequest(async (req, res) => {
  const { code, state, provider } = { ...req.query, ...req.body };
  const uid = state; // state should carry the user ID
  if (!uid) return res.status(400).send("Missing user state");
  try {
    const db = admin.firestore();
    if (provider === "gmail") {
      const gmailClient = createGmailClient();
      const { tokens } = await gmailClient.getToken(code);
      const enc = encrypt(JSON.stringify(tokens));
      await db
        .collection("users")
        .doc(uid)
        .collection("emailTokens")
        .doc("gmail")
        .set({ token: enc });
      // Outlook integration temporarily disabled
      // } else if (provider === "outlook") {
      //   const tokenResponse = await msalClient.acquireTokenByCode({
      //     code,
      //     scopes: ["https://graph.microsoft.com/Mail.Send", "offline_access"],
      //     redirectUri: process.env.OUTLOOK_REDIRECT_URI,
      //   });
      //   const enc = encrypt(JSON.stringify(tokenResponse));
      //   await db
      //     .collection("users")
      //     .doc(uid)
      //     .collection("emailTokens")
      //     .doc("outlook")
      //     .set({ token: enc });
    } else {
      return res.status(400).send("Unknown provider");
    }
    res.status(200).send(
      "<p>Gmail account connected. You can close this window.</p>"
    );
  } catch (err) {
    console.error("emailOAuthCallback error", err);
    res
      .status(500)
      .send(`<p>OAuth error: ${err.message || "unknown"}</p>`);
  }
});

// Helper to read stored token
async function getToken(uid, provider) {
  const db = admin.firestore();
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("emailTokens")
    .doc(provider)
    .get();
  if (!snap.exists) throw new Error("No token stored");
  return JSON.parse(decrypt(snap.data().token));
}

// 3. Send or draft email and record provider message ID
export const sendQuestionEmail = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth required");
  const { provider, recipientEmail, subject, message, questionId, draft = false } = data;
  if (!provider || !recipientEmail || !subject || !message || !questionId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing fields");
  }
  try {
    const db = admin.firestore();
    let messageId = "";
    if (provider === "gmail") {
      const gmailClient = createGmailClient();
      const tokens = await getToken(uid, "gmail");
      gmailClient.setCredentials(tokens);
      const gmail = google.gmail({ version: "v1", auth: gmailClient });
      const raw = Buffer.from(
        `To: ${recipientEmail}\r\nSubject: ${subject}\r\n\r\n${message}`
      )
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const response = draft
        ? await gmail.users.drafts.create({
            userId: "me",
            requestBody: { message: { raw } },
          })
        : await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw },
          });
      messageId = response.data.id;
      // Outlook integration temporarily disabled
      // } else if (provider === "outlook") {
      //   const tokens = await getToken(uid, "outlook");
      //   const accessToken = tokens.accessToken;
      //   const url = draft
      //     ? "https://graph.microsoft.com/v1.0/me/messages"
      //     : "https://graph.microsoft.com/v1.0/me/sendMail";
      //   const payload = draft
      //     ? {
      //         subject,
      //         body: { contentType: "Text", content: message },
      //         toRecipients: [{ emailAddress: { address: recipientEmail } }],
      //       }
      //     : {
      //         message: {
      //           subject,
      //           body: { contentType: "Text", content: message },
      //           toRecipients: [{ emailAddress: { address: recipientEmail } }],
      //         },
      //       };
      //   const resp = await fetch(url, {
      //     method: "POST",
      //     headers: {
      //       Authorization: `Bearer ${accessToken}`,
      //       "Content-Type": "application/json",
      //     },
      //     body: JSON.stringify(payload),
      //   });
      //   if (!resp.ok) {
      //     throw new Error(await resp.text());
      //   }
      //   if (draft) {
      //     const data = await resp.json();
      //     messageId = data.id;
      //   } else {
      //     messageId = "sent";
      //   }
    } else {
      throw new Error("Unknown provider");
    }
    await db
      .collection("users")
      .doc(uid)
      .collection("questions")
      .doc(questionId)
      .set({ providerMessageId: messageId }, { merge: true });
    return { messageId };
  } catch (err) {
    console.error("sendQuestionEmail error", err);
    throw new functions.https.HttpsError("internal", err.message);
  }
});

