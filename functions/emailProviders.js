
import { Buffer } from "buffer";
import crypto from "crypto";

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import { google } from "googleapis";
import { gemini, googleAI } from "@genkit-ai/googleai";
import { genkit } from "genkit";
import nodemailer from "nodemailer";
import { generateTriagePrompt, calculateNewConfidence } from "../src/utils/inquiryLogic.js";

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
const GOOGLE_GENAI_API_KEY = defineSecret("GOOGLE_GENAI_API_KEY");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const REPLIES_DOMAIN = defineSecret("REPLIES_DOMAIN");

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
    cors: ["https://thoughtify.training"],
    secrets: [
      TOKEN_ENCRYPTION_KEY,
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI,
      REPLIES_DOMAIN
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

    const qId = String(questionId);

    try {
      const refToken = `Ref:QID${qId}|UID${uid}`;
      const subjectWithRef = `${subject} [${refToken}]`;
      const bodyWithFooter = `${message}\n\n${refToken}\n<!-- THOUGHTIFY_REF QID${qId} UID${uid} -->`;
      const hmac = crypto
        .createHmac("sha256", TOKEN_ENCRYPTION_KEY.value())
        .update(`QID${qId}_UID${uid}`)
        .digest("hex")
        .slice(0, 16);
      const replyTo = `reply+QID${qId}_UID${uid}_SIG${hmac}@${REPLIES_DOMAIN.value() || "replies.thoughtify.training"}`;

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
        await transporter.verify();
        const info = await transporter.sendMail({
          from: data.user,
          to: recipientEmail,
          subject: subjectWithRef,
          text: bodyWithFooter,
          replyTo,
        });
        await transporter.close();
        messageId = info.messageId || "";
      } else {
        throw new HttpsError("invalid-argument", "Unknown provider");
      }

      // Touch user doc to ensure existence
      await db.collection("users").doc(uid).set({}, { merge: true });

      // Mark project question as asked for the matching initiative/contact(s)
      try {
        const userRecord = await auth.getUser(uid);
        const asker = userRecord?.displayName || userRecord?.email || "";
        const emails = String(recipientEmail)
          .split(/[;,]/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const initsSnap = await db
          .collection("users")
          .doc(uid)
          .collection("initiatives")
          .get();
        for (const docSnap of initsSnap.docs) {
          const data = docSnap.data() || {};
          const qArr = data.projectQuestions || [];
          const qIdx = qArr.findIndex((q) => String(q.id) === qId);
          if (qIdx === -1) continue;

          const contacts = data.keyContacts || [];
          const emailToContact = new Map(
            contacts
              .map((c) => {
                const addr = c?.email || c?.info?.email;
                return addr ? [String(addr).toLowerCase(), c] : null;
              })
              .filter(Boolean)
          );
          const matched = emails
            .map((e) => emailToContact.get(e))
            .filter(Boolean);
          if (!matched.length) continue;

          const q = qArr[qIdx] || {};
          const statusEntry = Array.isArray(q.contactStatus)
            ? q.contactStatus
            : Object.entries(q.contactStatus || {}).map(
                ([contactId, status]) => ({ contactId, ...status })
              );
          const now = new Date().toISOString();
          matched.forEach((contact) => {
            if (!contact.id) return;
            let entry = statusEntry.find((cs) => cs.contactId === contact.id);
            if (!entry) {
              entry = { contactId: contact.id, answers: [] };
              statusEntry.push(entry);
            }
            entry.askedAt = now;
            entry.askedBy = asker;
            entry.currentStatus = "Asked";
            entry.history = Array.isArray(entry.history)
              ? [...entry.history, { status: "Asked", timestamp: now }]
              : [{ status: "Asked", timestamp: now }];
          });
          q.contactStatus = statusEntry;
          qArr[qIdx] = q;
          await docSnap.ref.set(
            { projectQuestions: qArr },
            { merge: true }
          );
          break; // we found and updated the matching initiative
        }
      } catch (e) {
        console.error("Failed to mark question as asked from sendQuestionEmail", e);
      }

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
  {
    region: "us-central1",
    cors: true,
    secrets: [TOKEN_ENCRYPTION_KEY, SMTP_USER, SMTP_PASS, GOOGLE_GENAI_API_KEY],
    timeoutSeconds: 30,
  },
  async (req, res) => {
    // Allow Postmark’s GET “test” pings
    if (req.method !== "POST") {
      res.status(200).send({ status: "ok" });
      return;
    }

    // Safely read secrets so missing values don't crash the function
    const safeSecret = (secret) => {
      try {
        return secret.value();
      } catch {
        return "";
      }
    };
    const tokenKey = safeSecret(TOKEN_ENCRYPTION_KEY);
    const smtpUser = safeSecret(SMTP_USER);
    const smtpPass = safeSecret(SMTP_PASS);
    const genAiKey = safeSecret(GOOGLE_GENAI_API_KEY);

    const body = req.body || {};
    // Helpful logs in case of shape surprises
    console.log("Inbound keys:", Object.keys(body));

    const {
      MailboxHash,
      OriginalRecipient,
      To,
      ToFull,
      From,
      Subject,
      StrippedTextReply,
      TextBody,
      HtmlBody,
      Headers = [],
      FromFull,
    } = body;

    // 1) Find the “plus” tag (MailboxHash preferred)
    const extractPlus = (addr) => {
      if (!addr || typeof addr !== "string") return "";
      const local = addr.split("@")[0] || "";
      const parts = local.split("+");
      return parts.length > 1 ? parts.slice(1).join("+") : ""; // handle multi-plus just in case
    };

    let tag = MailboxHash || "";

    if (!tag) {
      // Try ToFull array
      if (Array.isArray(ToFull)) {
        for (const t of ToFull) {
          const a = t?.Email || t?.Address || t;
          const p = extractPlus(String(a || ""));
          if (p) { tag = p; break; }
        }
      }
    }

    if (!tag) {
      // Try To (comma separated)
      if (typeof To === "string") {
        for (const raw of To.split(",")) {
          const p = extractPlus(raw.trim());
          if (p) { tag = p; break; }
        }
      }
    }

    if (!tag) {
      // Try OriginalRecipient
      const p = extractPlus(String(OriginalRecipient || ""));
      if (p) tag = p;
    }

    // 2) Parse identifiers
    // Supported formats:
    //   A) QID123_UIDabc123_SIGdeadbeefcafebabe
    //   B) q123.uabc123   (from Reply-To: ref+q<id>.u<uid>@...)
    let questionId = null, uid = null, sig = null;

    let m = /^QID([^_]+)_UID([A-Za-z0-9\-_]+)_SIG([a-f0-9]{16})$/i.exec(tag || "");
    if (m) {
      questionId = m[1];
      uid = m[2];
      sig = m[3];
    } else {
      m = /^q([^.]+)\.u(.+)$/i.exec(tag || "");
      if (m) {
        questionId = m[1];
        uid = m[2];
      }
    }

    // 3) Fallback to custom headers
    if (!questionId || !uid) {
      const headerMap = Object.fromEntries(
        Headers.map((h) => [String(h.Name || "").toLowerCase(), h.Value])
      );
      if (!questionId && headerMap["x-question-id"]) {
        questionId = String(headerMap["x-question-id"]).trim();
      }
      if (!uid && headerMap["x-user-id"]) {
        uid = String(headerMap["x-user-id"]).trim();
      }
    }

    // Required basics
    const extractEmail = (raw) => {
      if (!raw) return "";
      if (typeof raw === "string") {
        const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        return match ? match[0].toLowerCase() : raw.trim().toLowerCase();
      }
      return String(raw).trim().toLowerCase();
    };

    const fromEmail = extractEmail(FromFull?.Email || From || body.from);
    const subject = Subject || body.subject;
    const rawText =
      StrippedTextReply || TextBody ||
      (HtmlBody ? HtmlBody.replace(/<[^>]+>/g, " ") : "");

    if (!questionId || !uid || !fromEmail || !subject || !rawText) {
      console.warn("Missing fields", {
        questionId,
        uid,
        from: !!fromEmail,
        subject: !!subject,
        hasBody: !!rawText,
      });
      res
        .status(400)
        .send({ status: "error", message: "Missing required fields" });
      return;
    }

    // 4) Enforce HMAC only if SIG was present in tag
    if (sig && tokenKey) {
      const expected = crypto
        .createHmac("sha256", tokenKey)
        .update(`QID${questionId}_UID${uid}`)
        .digest("hex")
        .slice(0, 16);
      if (sig !== expected) {
        console.warn("Bad signature", { questionId, uid });
        res.status(403).send({ status: "error", message: "Bad signature" });
        return;
      }
    }

    // 5) Clean footer markers if present
    const cleaned = String(rawText)
      .replace(/Ref:QID[^\s]+\|UID[^\s]+/gi, "")
      .replace(/<!--\s*THOUGHTIFY_REF.*?-->/gis, "")
      .trim();

    // Step 1: Extract the direct answer and any extra commentary via AI
    let answerText = cleaned;
    let extraText = "";
    if (genAiKey) {
      try {
        const extractor = genkit({
          plugins: [googleAI({ apiKey: genAiKey })],
          model: gemini("gemini-1.5-pro"),
        });
        const extractPrompt = `You are reading an email reply and must separate the direct answer to the question from any additional commentary. Respond only in JSON with keys "answer" and "extra".\n\nEmail Reply:\n${cleaned}`;
        const { text: extractText } = await extractor.generate(extractPrompt);
        const parsed = JSON.parse(extractText.match(/\{[\s\S]*\}/)?.[0] || "{}");
        if (parsed.answer) answerText = String(parsed.answer).trim();
        if (parsed.extra) extraText = String(parsed.extra).trim();
      } catch (err) {
        console.error("answer extraction failed", err);
      }
    }

    // 6) Update project question answers on the related initiative and surface the message
    const answeredAt = new Date().toISOString();

    // Best guess for the contact name corresponding to the reply
    let answeredBy = fromEmail;
    let answeredById = null;
    let initiativeId = null;

    try {
      const initsSnap = await db
        .collection("users")
        .doc(uid)
        .collection("initiatives")
        .get();

      for (const docSnap of initsSnap.docs) {
        const data = docSnap.data() || {};
        const qArr = data.projectQuestions || [];
        const qIdx = qArr.findIndex((q) => String(q.id) === questionId);
        if (qIdx === -1) continue;

        const contacts = data.keyContacts || [];
        const matchedContact = contacts.find(
          (c) => extractEmail(c.email || c.info?.email) === fromEmail
        );
        if (!matchedContact) continue;

        const name = matchedContact.name;
        const contactId = matchedContact.id || null;

        const q = qArr[qIdx];
        const statusArr = Array.isArray(q.contactStatus)
          ? q.contactStatus
          : Object.entries(q.contactStatus || {}).map(
              ([contactId, status]) => ({ contactId, ...status })
            );
        const key = contactId || name;
        let entry = statusArr.find(
          (cs) => cs.contactId === key || cs.contactId === name,
        );
        if (!entry) {
          entry = { contactId: key, answers: [] };
          statusArr.push(entry);
        }
        entry.answers = Array.isArray(entry.answers) ? entry.answers : [];
        if (entry.currentStatus === "asked" || entry.askedAt) {
          entry.answers.push({ text: answerText, answeredAt });
          entry.currentStatus = "answered";
        } else {
          entry.answersForReview = Array.isArray(entry.answersForReview)
            ? entry.answersForReview
            : [];
          entry.answersForReview.push({ text: answerText, answeredAt });
        }
        q.contactStatus = statusArr;
        qArr[qIdx] = q;

        await docSnap.ref.set(
          { projectQuestions: qArr },
          { merge: true }
        );

        answeredBy = name;
        answeredById = key;
        initiativeId = docSnap.id;
        break; // stop after updating the matching initiative
      }
    } catch (err) {
      console.error("Failed to update project question answers", err);
    }

    const msgRef = await db
      .collection("users")
      .doc(uid)
      .collection("messages")
      .add({
        subject,
        body: answerText,
        extra: extraText,
        questionId: String(questionId),
        createdAt: answeredAt,
        from: answeredBy,
        fromEmail: fromEmail,
        contactId: answeredById,
        initiativeId,
      });

    // Increment notifications: questions answered
    try {
      const nref = db
        .collection("users")
        .doc(uid)
        .collection("notifications")
        .doc("questionsAnswered");
      await nref.set(
        {
          type: "questionsAnswered",
          message: "A stakeholder answered a question.",
          href: initiativeId
            ? `/discovery?initiativeId=${initiativeId}`
            : undefined,
          count: FieldValue.increment(1),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("notif increment failed", e);
    }

    // Respond quickly to Postmark
    res.status(200).send({ status: "ok" });

    // Continue heavy processing asynchronously and ensure completion.
    // If this work risks exceeding the function timeout, move it to a
    // background trigger or queue.
    await (async () => {
      if (initiativeId && genAiKey) {
        try {
          const initSnap = await db
            .collection("users")
            .doc(uid)
            .collection("initiatives")
            .doc(initiativeId)
            .get();
          const init = initSnap.data() || {};

          // Build project context
          const contextPieces = [];
          if (init.projectName) contextPieces.push(`Project Name: ${init.projectName}`);
          if (init.businessGoal) contextPieces.push(`Business Goal: ${init.businessGoal}`);
          if (init.audienceProfile)
            contextPieces.push(`Audience Profile: ${init.audienceProfile}`);
          if (init.projectConstraints)
            contextPieces.push(`Project Constraints: ${init.projectConstraints}`);
          const contacts = init.keyContacts || init.contacts || [];
          if (contacts.length) {
            contextPieces.push(
              `Key Contacts: ${contacts
                .map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`)
                .join(", ")}`,
            );
          }
          const questionsArr = init.projectQuestions || [];
          if (questionsArr.length) {
            const qa = questionsArr
              .map((q) => {
                const answers = Array.isArray(q.contactStatus)
                  ? q.contactStatus
                      .map((cs) => {
                        const contact = contacts.find((c) => c.id === cs.contactId);
                        const name = contact?.name || cs.contactId;
                        const texts = (cs.answers || [])
                          .map((a) => a?.text || "")
                          .filter((s) => String(s).trim())
                          .join("; ");
                        return texts ? `${name}: ${texts}` : null;
                      })
                      .filter(Boolean)
                      .join("; ")
                  : "";
                return answers
                  ? `${q?.question || q}: ${answers}`
                  : `${q?.question || q}`;
              })
              .join("\n");
            contextPieces.push(`Existing Q&A:\n${qa}`);
          }
          const documents = init.sourceMaterials || [];
          if (Array.isArray(documents) && documents.length) {
            const docs = documents.map((d) => `${d.name}:\n${d.content || ""}`).join("\n");
            contextPieces.push(`Source Materials:\n${docs}`);
          }
          const projectContext = contextPieces.join("\n\n");
          const hypotheses = (init.inquiryMap && init.inquiryMap.hypotheses) || init.hypotheses || [];
          const hypothesisList = hypotheses
            .map((h) => `${h.id}: ${h.statement || h.hypothesis || h.text || h.label || h.id}`)
            .join("\n");

          const dhQuestion =
            questionsArr.find((q) => String(q.id) === questionId)?.question ||
            subject ||
            "Incoming answer";
          const respondent = answeredBy || fromEmail;

          const analysisPrompt = `You are an expert Instructional Designer and Performance Consultant. You are analyzing ${respondent}'s answer to a specific discovery question. Your goal is to understand what this answer means for the training project and to determine follow-up actions.

Project Context:
${projectContext}

Existing Hypotheses:
${hypothesisList}

Discovery Question:
${dhQuestion}

Answer from ${respondent}:
  ${answerText}

Avoid suggesting tasks or questions that already exist in the provided lists.

Please provide a JSON object with two fields:
- "analysis": a concise summary of what this answer reveals about the question in the context of the project.
- "suggestions": An array of objects for follow-up actions. Each object must have these fields:
    1. "text": The follow-up action. Do not include any names in this text.
    2. "category": One of "question", "meeting", "email", "research", or "instructional-design".
    3. "who": The person or group to work with (a known contact name, known stakeholder, or the current user).
    4. "hypothesisId": The ID of the related hypothesis, or null if exploring a new idea.
    5. "taskType": One of "validate", "refute", or "explore".

Respond ONLY in this JSON format:
{"analysis": "...", "suggestions": [{"text": "...", "category": "...", "who": "...", "hypothesisId": "A", "taskType": "validate"}, ...]}`;

          const ai = genkit({ plugins: [googleAI({ apiKey: genAiKey })], model: gemini("gemini-1.5-pro") });
          const { text: aiText } = await ai.generate(analysisPrompt);
          let parsed;
          try {
            parsed = JSON.parse(aiText);
          } catch {
            const m = aiText && aiText.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }
          const allowedCategories = ["question", "meeting", "email", "research", "instructional-design"];
          const allowedTaskTypes = ["validate", "refute", "explore"];
          const suggestions = Array.isArray(parsed?.suggestions)
            ? parsed.suggestions
                .filter(
                  (s) =>
                    s &&
                    typeof s.text === "string" &&
                    typeof s.category === "string" &&
                    typeof s.who === "string" &&
                    allowedCategories.includes(s.category.toLowerCase())
                )
                .map((s) => ({
                  text: s.text,
                  category: s.category.toLowerCase(),
                  who: s.who,
                  hypothesisId:
                    typeof s.hypothesisId === "string" && s.hypothesisId.trim()
                      ? s.hypothesisId.trim()
                      : null,
                  taskType: allowedTaskTypes.includes((s.taskType || "").toLowerCase())
                    ? s.taskType.toLowerCase()
                    : "explore",
                }))
            : [];

          // If the email contained additional commentary, analyze it separately for suggestions
          if (extraText) {
            try {
              const extraPrompt = `You are an expert Instructional Designer and Performance Consultant. Review the following unprompted additional information from ${respondent} for possible follow-up actions.\n\nProject Context:\n${projectContext}\n\nExisting Hypotheses:\n${hypothesisList}\n\nInformation:\n${extraText}\n\nRespond ONLY in the JSON format used previously.`;
              const { text: extraAiText } = await ai.generate(extraPrompt);
              let extraParsed;
              try {
                extraParsed = JSON.parse(extraAiText);
              } catch {
                const m2 = extraAiText && extraAiText.match(/\{[\s\S]*\}/);
                if (m2) extraParsed = JSON.parse(m2[0]);
              }
              if (Array.isArray(extraParsed?.suggestions)) {
                const extraSuggestions = extraParsed.suggestions
                  .filter(
                    (s) =>
                      s &&
                      typeof s.text === "string" &&
                      typeof s.category === "string" &&
                      typeof s.who === "string" &&
                      allowedCategories.includes(s.category.toLowerCase())
                  )
                  .map((s) => ({
                    text: s.text,
                    category: s.category.toLowerCase(),
                    who: s.who,
                    hypothesisId:
                      typeof s.hypothesisId === "string" && s.hypothesisId.trim()
                        ? s.hypothesisId.trim()
                        : null,
                    taskType: allowedTaskTypes.includes((s.taskType || "").toLowerCase())
                      ? s.taskType.toLowerCase()
                      : "explore",
                  }));
                suggestions.push(...extraSuggestions);
              }
            } catch (err) {
              console.error("extra analysis failed", err);
            }
          }

          // Persist suggested tasks (non-question)
          const suggestedTasks = suggestions.filter((s) => s.category !== "question");
          if (suggestedTasks.length) {
            const tasksCol = db
              .collection("users")
              .doc(uid)
              .collection("initiatives")
              .doc(initiativeId)
              .collection("suggestedTasks");
            await Promise.all(
              suggestedTasks.map((s) =>
                tasksCol.add({
                  message: s.text,
                  subType: s.category,
                  who: s.who,
                  hypothesisId: s.hypothesisId || null,
                  taskType: s.taskType,
                  status: "pending",
                  createdAt: FieldValue.serverTimestamp(),
                  source: { kind: "email", questionId, respondent },
                })
              )
            );
            await db
              .collection("users").doc(uid)
              .collection("notifications").doc("suggestedTasks")
              .set({ type: "suggestedTasks", count: FieldValue.increment(suggestedTasks.length), createdAt: FieldValue.serverTimestamp() }, { merge: true });
          }

          // Persist question suggestions separately so the user can approve them
          const questionSuggestions = suggestions.filter((s) => s.category === "question");
          if (questionSuggestions.length) {
            const qCol = db
              .collection("users")
              .doc(uid)
              .collection("initiatives")
              .doc(initiativeId)
              .collection("suggestedQuestions");
            await Promise.all(
              questionSuggestions.map((s) =>
                qCol.add({
                  question: s.text,
                  hypothesisId: s.hypothesisId || null,
                  createdAt: FieldValue.serverTimestamp(),
                  source: { kind: "email", questionId, respondent },
                })
              )
            );
            await db
              .collection("users").doc(uid)
              .collection("notifications").doc("suggestedQuestions")
              .set({
                type: "suggestedQuestions",
                count: FieldValue.increment(questionSuggestions.length),
                createdAt: FieldValue.serverTimestamp(),
              }, { merge: true });
          }

          // Persist analysis and notify user of the new answer
          try {
            await msgRef.set({ analysis: parsed?.analysis || "", suggestions }, { merge: true });
            await db
              .collection("users").doc(uid)
              .collection("notifications")
              .add({
                type: "answerReceived",
                message: "New answer received - Click to view analysis.",
                questionId: String(questionId),
                initiativeId,
                href: initiativeId
                  ? `/discovery?initiativeId=${initiativeId}&questionId=${questionId}&messageId=${msgRef.id}&qa=1`
                  : undefined,
                messageId: msgRef.id,
                createdAt: FieldValue.serverTimestamp(),
                count: 1,
              });
          } catch (err) {
            console.error("failed to record analysis notification", err);
          }

          // Triage evidence to update hypothesis confidences and suggest new hypotheses
          try {
            const evidenceText = `Question: ${dhQuestion}\nAnswer: ${answerText}${extraText ? `\nAdditional: ${extraText}` : ""}`;
            const triagePrompt = generateTriagePrompt(evidenceText, hypotheses, contacts);
            const { text: triageText } = await ai.generate(triagePrompt);
            let triage;
            try {
              triage = JSON.parse(triageText);
            } catch {
              const m = triageText && triageText.match(/\{[\s\S]*\}/);
              if (m) triage = JSON.parse(m[0]);
            }
            if (triage?.hypothesisLinks?.length) {
              let updatedHypotheses = [...hypotheses];
              let allNewRecommendations = [
                ...(triage.strategicRecommendations || []),
              ];
              let newProjectQuestions = [
                ...(triage.projectQuestions || []),
              ];
              const before = new Map(
                updatedHypotheses.map((h) => [h.id, h.confidence || 0])
              );
              triage.hypothesisLinks.forEach((link) => {
                const idx = updatedHypotheses.findIndex(
                  (h) => h.id === link.hypothesisId
                );
                if (idx === -1) return;
                const { updatedHypothesis, extraRecommendations } =
                  calculateNewConfidence(
                    updatedHypotheses[idx],
                    link,
                    evidenceText,
                    triage.analysisSummary || "",
                    respondent
                  );
                updatedHypotheses[idx] = updatedHypothesis;
                allNewRecommendations.push(...extraRecommendations);
              });

              if (triage.newHypothesis?.statement) {
                const suggested = (init.suggestedHypotheses || []).slice();
                suggested.push({
                  id: `sh-${Date.now()}`,
                  statement: triage.newHypothesis.statement,
                  confidence: triage.newHypothesis.confidence ?? 0,
                  suggestedAt: FieldValue.serverTimestamp(),
                  status: "pending",
                });
                await db
                  .collection("users")
                  .doc(uid)
                  .collection("initiatives")
                  .doc(initiativeId)
                  .set({ suggestedHypotheses: suggested }, { merge: true });
                await db
                  .collection("users")
                  .doc(uid)
                  .collection("notifications")
                  .doc("suggestedHypotheses")
                  .set(
                    {
                      type: "suggestedHypotheses",
                      count: FieldValue.increment(1),
                      createdAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                  );
              }

              const updatedRecommendations = [
                ...(init.inquiryMap?.recommendations || init.recommendations || []),
                ...allNewRecommendations,
              ];
              const updatedProjectQuestions = [
                ...(init.projectQuestions || []),
                ...newProjectQuestions,
              ];

              await db
                .collection("users")
                .doc(uid)
                .collection("initiatives")
                .doc(initiativeId)
                .set(
                  {
                    "inquiryMap.hypotheses": updatedHypotheses,
                    hypotheses: updatedHypotheses,
                    "inquiryMap.recommendations": updatedRecommendations,
                    recommendations: updatedRecommendations,
                    projectQuestions: updatedProjectQuestions,
                  },
                  { merge: true }
                );

              for (const h of updatedHypotheses) {
                const was = before.get(h.id) || 0;
                const now = h.confidence || 0;
                if (was < 0.8 && now >= 0.8) {
                  await db
                    .collection("users")
                    .doc(uid)
                    .collection("notifications")
                    .doc(`hyp-${h.id}`)
                    .set(
                      {
                        type: "hypothesisConfidence",
                        message: `${
                          h.statement || h.hypothesis || h.id
                        } confidence now at ${(now * 100).toFixed(0)}%`,
                        count: FieldValue.increment(1),
                        createdAt: FieldValue.serverTimestamp(),
                      },
                      { merge: true }
                    );
                }
              }
            }
          } catch (err) {
            console.error("inbound triage failed", err);
          }
        } catch (e) {
          console.error("inbound analysis failed", e);
        }
      }

      // 7) Optional: forward the reply to the Thoughtify user (uses secrets, not process.env)
      try {
        const userRecord = await auth.getUser(uid);
        const userEmail = userRecord?.email || null;

        if (userEmail && smtpUser && smtpPass) {
          const forwarder = nodemailer.createTransport({
            host: "smtp.zoho.com",
            port: 465,
            secure: true,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });
          await forwarder.sendMail({
            from: smtpUser,
            to: userEmail,
            subject,
            text: answerText + (extraText ? `\n\n${extraText}` : ""),
          });
        }
      } catch (err) {
        console.error("Error forwarding reply", err);
        // don’t fail the webhook on forward errors
      }
    })();
  }
);
