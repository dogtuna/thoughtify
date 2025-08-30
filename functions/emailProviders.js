
import { Buffer } from "buffer";
import crypto from "crypto";

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import { google } from "googleapis";
import nodemailer from "nodemailer";

// --- Firebase Functions v2 (https) ---
import {
  onCall,
  onRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// ==============================
// Admin initialization (singleton)
// ==============================
if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();
const auth = getAuth();

// ==============================
// Secrets (configure via CLI)
// ==============================
const TOKEN_ENCRYPTION_KEY = defineSecret("TOKEN_ENCRYPTION_KEY"); // hex, 32 bytes => 64 hex chars
const GMAIL_CLIENT_ID = defineSecret("GMAIL_CLIENT_ID");
const GMAIL_CLIENT_SECRET = defineSecret("GMAIL_CLIENT_SECRET");
const GMAIL_REDIRECT_URI = defineSecret("GMAIL_REDIRECT_URI");
const APP_BASE_URL = defineSecret("APP_BASE_URL");

// ==============================
// Crypto helpers
// ==============================
function requireKey(keyHex) {
  if (!keyHex) {
    throw new Error("Server misconfigured: TOKEN_ENCRYPTION_KEY is not set");
  }
  if (keyHex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)");
  }
  return Buffer.from(keyHex, "hex");
}

function encrypt(plain, keyHex) {
  const key = requireKey(keyHex);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let enc = cipher.update(plain, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${enc}`;
}

function decrypt(enc, keyHex) {
  const key = requireKey(keyHex);
  const [ivHex, dataHex] = enc.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let dec = decipher.update(dataHex, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

// ==============================
// Gmail OAuth client factory
// ==============================
function createGmailClient(clientId, clientSecret, redirectUri) {
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Gmail OAuth environment variables are not set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ==============================
// 1) Generate provider authorization URL (HTTP)
// ==============================
export const getEmailAuthUrl = onRequest(
  {
    region: "us-central1",
    cors: true,
    secrets: [GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI],
  },
  async (req, res) => {
    try {
      const provider = req.query.provider || "";
      const state = req.query.state || "";

      if (provider !== "gmail") {
        res.status(400).send("Unknown provider");
        return;
      }

      const gmailClient = createGmailClient(
        GMAIL_CLIENT_ID.value(),
        GMAIL_CLIENT_SECRET.value(),
        GMAIL_REDIRECT_URI.value()
      );

      const url = gmailClient.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: false,
        scope: ["https://www.googleapis.com/auth/gmail.send"],
        state,
        client_id: GMAIL_CLIENT_ID.value(),
      });

      res.redirect(url);
    } catch (err) {
      console.error("getEmailAuthUrl error", err);
      res.status(500).send("OAuth error");
    }
  }
);

// ==============================
// 2) OAuth callback to store encrypted tokens (HTTP)
// ==============================
export const emailOAuthCallback = onRequest(
  {
    region: "us-central1",
    cors: true,
    secrets: [
      TOKEN_ENCRYPTION_KEY,
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI,
      APP_BASE_URL,
    ],
  },
  async (req, res) => {
    try {
      const method = req.method.toUpperCase();
      const payload = method === "GET" ? req.query : req.body;
      const code = payload.code || "";
      const state = payload.state || "";
      const provider = payload.provider || "gmail";

      const uid = state;
      if (!uid) {
        res.status(400).send("Missing user state");
        return;
      }
      if (provider !== "gmail") {
        res.status(400).send("Unknown provider");
        return;
      }

      const gmailClient = createGmailClient(
        GMAIL_CLIENT_ID.value(),
        GMAIL_CLIENT_SECRET.value(),
        GMAIL_REDIRECT_URI.value()
      );
      const { tokens } = await gmailClient.getToken(code);

      const enc = encrypt(JSON.stringify(tokens), TOKEN_ENCRYPTION_KEY.value());
      await db
        .collection("users")
        .doc(uid)
        .collection("emailTokens")
        .doc("gmail")
        .set({ token: enc });

      const base = APP_BASE_URL.value() || "https://thoughtify.web.app";
      res.status(200).send(
        `<html><body><script>
           if (window.opener) { window.opener.location = '${base}/dashboard'; window.close(); }
           else { window.location = '${base}/dashboard'; }
         </script></body></html>`
      );
    } catch (err) {
      console.error("emailOAuthCallback error", err);
      res.status(500).send(`<p>OAuth error: ${err.message || "unknown"}</p>`);
    }
  }
);

// ==============================
// Helper: read stored (decrypted) token
// ==============================
async function getStoredProviderToken(uid, provider, keyHex) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("emailTokens")
    .doc(provider)
    .get();

  if (!snap.exists) throw new Error("No token stored");
  const enc = (snap.data() && snap.data().token) || "";
  const json = decrypt(enc, keyHex);
  return JSON.parse(json);
}

// ==============================
// 3) Save IMAP/POP credentials (CALLABLE)
// ==============================
export const saveEmailCredentials = onCall(
  {
    region: "us-central1",
    // App Check not enforced here to prevent CORS errors when tokens are missing
    secrets: [TOKEN_ENCRYPTION_KEY],
  },
  async (request) => {
    const uid = (request.auth && request.auth.uid) || null;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const {
      provider,
      host,
      port,
      smtpHost,
      smtpPort,
      user,
      pass,
    } = request.data || {};

    if (provider !== "imap" && provider !== "pop3") {
      throw new HttpsError("invalid-argument", "Unknown provider");
    }

    const trimmedUser = (user || "").trim();
    const trimmedPass = (pass || "").trim();
    const trimmedHost = (host || "").trim();
    const normalizedPort = Number(port) || 0;
    const trimmedSmtpHost = (smtpHost || "").trim();
    const normalizedSmtpPort = Number(smtpPort) || 0;

    if (!trimmedUser || !trimmedPass || !trimmedHost || !normalizedPort) {
      throw new HttpsError("invalid-argument", "Missing credentials");
    }

    try {
      const data = {
        user: trimmedUser,
        pass: encrypt(trimmedPass, TOKEN_ENCRYPTION_KEY.value()),
        host: trimmedHost,
        port: normalizedPort,
      };
      if (trimmedSmtpHost) data.smtpHost = trimmedSmtpHost;
      if (normalizedSmtpPort) data.smtpPort = normalizedSmtpPort;

      await db
        .collection("users")
        .doc(uid)
        .collection("emailTokens")
        .doc(provider)
        .set(data);

      return { ok: true };
    } catch (err) {
      console.error("saveEmailCredentials error", err);
      if (
        err &&
        typeof err.message === "string" &&
        err.message.toLowerCase().includes("token_encryption_key")
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Email credential encryption key not configured"
        );
      }
      throw new HttpsError("internal", "Failed to save credentials");
    }
  }
);

// ==============================
// 3) Send email (CALLABLE with App Check)
// ==============================
export const sendQuestionEmail = onCall(
  {
    region: "us-central1",
    enforceAppCheck: true,
    invoker: "public",
    // Allow requests from production web app to bypass CORS preflight
    cors: ["https://thoughtify.training"],
    secrets: [
      TOKEN_ENCRYPTION_KEY,
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI,
    ],
  },
  async (request) => {
    const uid = (request.auth && request.auth.uid) || null;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const {
      provider: rawProvider,
      recipientEmail,
      subject,
      message,
      questionId,
    } = request.data || {};

    const provider = (rawProvider || "").toLowerCase();

    if (
      !provider ||
      !recipientEmail ||
      !subject ||
      !message ||
      questionId === undefined ||
      questionId === null
    ) {
      throw new HttpsError("invalid-argument", "Missing fields");
    }

    try {
      const refToken = `Ref:QID${questionId}|UID${uid}`;
      const subjectWithRef = `${subject} [${refToken}]`;
      const bodyWithFooter = `${message}\n\n${refToken}\n<!-- THOUGHTIFY_REF QID${questionId} UID${uid} -->`;
      const hmac = crypto
        .createHmac("sha256", TOKEN_ENCRYPTION_KEY.value())
        .update(`QID${questionId}_UID${uid}`)
        .digest("hex")
        .slice(0, 16);
      const replyTo = `jonny+QID${questionId}_UID${uid}_SIG${hmac}@thoughtify.training`;

      let messageId = "";

      if (provider === "gmail") {
        const gmailClient = createGmailClient(
          GMAIL_CLIENT_ID.value(),
          GMAIL_CLIENT_SECRET.value(),
          GMAIL_REDIRECT_URI.value()
        );
        const tokens = await getStoredProviderToken(
          uid,
          "gmail",
          TOKEN_ENCRYPTION_KEY.value()
        );
        gmailClient.setCredentials(tokens);

        const gmail = google.gmail({ version: "v1", auth: gmailClient });

        const raw = Buffer.from(
          `To: ${recipientEmail}\r\nSubject: ${subjectWithRef}\r\nReply-To: ${replyTo}\r\n\r\n${bodyWithFooter}`
        )
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const resp = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw },
        });
        messageId = resp.data.id || "";
      } else if (["imap", "pop3", "outlook"].includes(provider)) {
        const snap = await db
          .collection("users")
          .doc(uid)
          .collection("emailTokens")
          .doc(provider)
          .get();
        if (!snap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "No stored credentials for provider"
          );
        }
        const data = snap.data() || {};
        const pass = decrypt(data.pass, TOKEN_ENCRYPTION_KEY.value());
        const host = data.smtpHost || data.host;
        const port = data.smtpPort || 465;
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: {
            user: data.user,
            pass,
          },
        });
        const info = await transporter.sendMail({
          from: data.user,
          to: recipientEmail,
          subject: subjectWithRef,
          text: bodyWithFooter,
          replyTo,
        });
        messageId = info.messageId || "";
      } else {
        const snap = await db
          .collection("users")
          .doc(uid)
          .collection("emailTokens")
          .doc(provider)
          .get();
        if (!snap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "No stored credentials for provider"
          );
        }
        const data = snap.data() || {};
        const pass = decrypt(data.pass, TOKEN_ENCRYPTION_KEY.value());
        const host = data.smtpHost || data.host;
        const port = data.smtpPort || 465;
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: {
            user: data.user,
            pass,
          },
        });
        const info = await transporter.sendMail({
          from: data.user,
          to: recipientEmail,
          subject: subjectWithRef,
          text: bodyWithFooter,
          replyTo,
        });
        messageId = info.messageId || "";
      }

      await db.collection("users").doc(uid).set({}, { merge: true });

      await db
        .collection("users")
        .doc(uid)
        .collection("questions")
        .doc(String(questionId))
        .set({ providerMessageId: messageId }, { merge: true });

      return { messageId };
    } catch (err) {
      console.error(
        "sendQuestionEmail error",
        (err && err.response && err.response.data) || err
      );
      if (err instanceof HttpsError) {
        throw err;
      }
      if (
        err &&
        (err.code === "EAUTH" ||
          err.responseCode === 535 ||
          (typeof err.message === "string" &&
            err.message.toLowerCase().includes("invalid login")))
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Invalid email credentials"
        );
      }
      if (
        err &&
        (err.responseCode === 503 ||
          (err.response && err.response.status === 503))
      ) {
        throw new HttpsError(
          "unavailable",
          "Email service temporarily unavailable"
        );
      }
      const msg =
        (err && err.response && err.response.data && JSON.stringify(err.response.data)) ||
        (err && err.message) ||
        "internal error";
      throw new HttpsError("internal", msg);
    }
  }
);

// ==============================
// Inbound reply handler (HTTP)
// ==============================
export const processInboundEmail = onRequest(
  { secrets: [TOKEN_ENCRYPTION_KEY] },
  async (req, res) => {
    const { to, from, subject, text } = req.body || {};

    if (!to || !from || !subject || !text) {
      res
        .status(400)
        .send({ status: "error", message: "Missing required fields" });
      return;
    }

    const match = to.match(/QID(\d+)_UID([A-Za-z0-9]+)_SIG([a-f0-9]{16})/i);
    if (!match) {
      res.status(400).send({ status: "error", message: "Invalid reply" });
      return;
    }
    const [, questionId, uid, sig] = match;

    const expected = crypto
      .createHmac("sha256", TOKEN_ENCRYPTION_KEY.value())
      .update(`QID${questionId}_UID${uid}`)
      .digest("hex")
      .slice(0, 16);

    if (sig !== expected) {
      res.status(403).send({ status: "error", message: "Bad signature" });
      return;
    }

    const cleaned = text
      .replace(
        /Ref:QID\d+\|UID[^\s]+\s*<!--\s*THOUGHTIFY_REF[^>]*-->/gis,
        ""
      )
      .trim();

    await db
      .collection("users")
      .doc(uid)
      .collection("questions")
      .doc(String(questionId))
      .collection("answers")
      .add({
        answer: cleaned,
        from,
        subject,
        createdAt: FieldValue.serverTimestamp(),
      });

    try {
      const userRecord = await auth.getUser(uid);
      const userEmail = userRecord.email;
      if (userEmail && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const forwarder = nodemailer.createTransport({
          host: "smtp.zoho.com",
          port: 465,
          secure: true,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await forwarder.sendMail({
          from: process.env.SMTP_USER,
          to: userEmail,
          subject,
          text,
        });
      }
    } catch (err) {
      console.error("Error forwarding reply", err);
    }

    res.status(200).send({ status: "ok" });
  }
);
