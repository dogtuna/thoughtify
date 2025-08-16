
import process from "process"; 
import { Buffer } from "buffer";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import { google } from "googleapis";
import crypto from "crypto";

// ------------------------------
// FIREBASE INIT
// ------------------------------
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// ------------------------------
// SECRETS
// ------------------------------
const TOKEN_ENCRYPTION_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");
const GMAIL_CLIENT_ID = defineSecret("GMAIL_CLIENT_ID");
const GMAIL_CLIENT_SECRET = defineSecret("GMAIL_CLIENT_SECRET");
const GMAIL_REDIRECT_URI = defineSecret("GMAIL_REDIRECT_URI");

// If/when Outlook is re-enabled:
// const OUTLOOK_CLIENT_ID = defineSecret("OUTLOOK_CLIENT_ID");
// const OUTLOOK_TENANT_ID = defineSecret("OUTLOOK_TENANT_ID");
// const OUTLOOK_CLIENT_SECRET = defineSecret("OUTLOOK_CLIENT_SECRET");
// const OUTLOOK_REDIRECT_URI = defineSecret("OUTLOOK_REDIRECT_URI");

// ------------------------------
// ENCRYPTION HELPERS
// ------------------------------
function encrypt(text) {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  const [ivHex, data] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key, "hex"), iv);
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ------------------------------
// GMAIL OAUTH CLIENT
// ------------------------------
const gmailClient = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

// ------------------------------
// 1. Generate provider auth URL
// ------------------------------
export const getEmailAuthUrl = onRequest(
  { secrets: [TOKEN_ENCRYPTION_KEY, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI] },
  async (req, res) => {
    const { provider, state = "" } = req.query;
    try {
      if (provider === "gmail") {
        const url = gmailClient.generateAuthUrl({
          access_type: "offline",
          prompt: "consent", // ensures refresh_token every time
          scope: ["https://www.googleapis.com/auth/gmail.send"],
          state,
        });
        res.redirect(url);
      } else {
        res.status(400).send("Unknown provider");
      }
    } catch (err) {
      console.error("getEmailAuthUrl error", err);
      res.status(500).send("OAuth error");
    }
  }
);

// ------------------------------
// 2. OAuth callback
// ------------------------------
export const emailOAuthCallback = onRequest(
  { secrets: [TOKEN_ENCRYPTION_KEY, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI] },
  async (req, res) => {
    const { code, state, provider } = { ...req.query, ...req.body };
    const uid = state;
    if (!uid) return res.status(400).send("Missing user state");

    try {
      if (provider === "gmail") {
        const { tokens } = await gmailClient.getToken(code);
        const enc = encrypt(JSON.stringify(tokens));
        await db.collection("users").doc(uid).collection("emailTokens").doc("gmail").set({ token: enc });
      } else {
        return res.status(400).send("Unknown provider");
      }
      res.send("Connected");
    } catch (err) {
      console.error("emailOAuthCallback error", err);
      res.status(500).send("OAuth error");
    }
  }
);

// ------------------------------
// Helper to read stored token
// ------------------------------
async function getToken(uid, provider) {
  const snap = await db.collection("users").doc(uid).collection("emailTokens").doc(provider).get();
  if (!snap.exists) throw new Error("No token stored");
  return JSON.parse(decrypt(snap.data().token));
}

// ------------------------------
// 3. Send or draft email
// ------------------------------
export const sendQuestionEmail = onCall(
  { secrets: [TOKEN_ENCRYPTION_KEY, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI] },
  async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const { provider, recipientEmail, subject, message, questionId, draft = false } = data;
    if (!provider || !recipientEmail || !subject || !message || !questionId) {
      throw new HttpsError("invalid-argument", "Missing fields");
    }

    try {
      let messageId = "";
      if (provider === "gmail") {
        const tokens = await getToken(uid, "gmail");
        gmailClient.setCredentials(tokens);
        const gmail = google.gmail({ version: "v1", auth: gmailClient });

        const raw = Buffer.from(`To: ${recipientEmail}\r\nSubject: ${subject}\r\n\r\n${message}`)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const response = draft
          ? await gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } })
          : await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

        messageId = response.data.id;
      } else {
        throw new Error("Unknown provider");
      }

      await db.collection("users").doc(uid).collection("questions").doc(questionId)
        .set({ providerMessageId: messageId }, { merge: true });

      return { messageId };
    } catch (err) {
      console.error("sendQuestionEmail error", err);
      throw new HttpsError("internal", err.message);
    }
  }
);
