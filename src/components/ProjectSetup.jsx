import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { functions, auth, appCheck } from "../firebase";
import { getToken } from "firebase/app-check";
import { saveInitiative, loadInitiative } from "../utils/initiatives";
import { generate as aiGenerate } from "../ai";
import { parseJsonFromText } from "../utils/json";
import { loadCompanies, upsertCompaniesAndContacts } from "../utils/companies";
import { loadUserContacts, upsertUserContacts } from "../utils/contacts";
import { omitEmptyStrings } from "../utils/omitEmptyStrings.js";
import { generateQuestionId } from "../utils/questions.js";
import "./AIToolsGenerators.css";

const ProjectSetup = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const navigate = useNavigate();

  const generateProjectQuestions = httpsCallable(
    functions,
    "generateProjectQuestions"
  );
  const generateInitialInquiryMap = httpsCallable(
    functions,
    "generateInitialInquiryMap"
  );

  const [projectName, setProjectName] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  // Audience is no longer collected at setup
  const [projectScope, setProjectScope] = useState("internal"); // internal | external
  const [companyName, setCompanyName] = useState("");
  const [companiesList, setCompaniesList] = useState([]);
  const [contactsIndex, setContactsIndex] = useState({}); // key: "Name — Company" => details
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [companyInput, setCompanyInput] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");
  const genId = () => crypto.randomUUID();
  const emptyContact = () => ({
    id: genId(),
    name: "",
    jobTitle: "",
    profile: "",
    scope: "internal",
    company: "",
    info: { email: "", slack: "", teams: "" },
  });
  const [keyContacts, setKeyContacts] = useState([emptyContact()]);
  const [sourceMaterials, setSourceMaterials] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [step, setStep] = useState(1); // 1: Project Info, 2: Partners, 3: Source Material

  const isStep1Valid = () => projectName.trim() && businessGoal.trim();
  const isStep2Valid = () => projectScope === "internal" || (projectScope === "external" && companyName.trim());

  // Analysis progress indicator
  const initialProgress = {
    save: "pending",
    questions: "pending",
    hypotheses: "pending",
    map: "pending",
    dashboard: "pending",
  };
  const [progress, setProgress] = useState(initialProgress);
  const setProg = (k, status) => setProgress((p) => ({ ...p, [k]: status }));

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Pulse the background while analyzing
  useEffect(() => {
    document.body.classList.toggle("pulsing", loading);
    return () => document.body.classList.remove("pulsing");
  }, [loading]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && initiativeId) {
        const init = await loadInitiative(user.uid, initiativeId);
        if (init) {
          setProjectName(init.projectName || "");
          setBusinessGoal(init.businessGoal || "");
          // audienceProfile no longer used at setup
          setProjectScope(init.projectScope || "internal");
          setCompanyName(init.company || "");
          setProjectConstraints(init.projectConstraints || "");
          setKeyContacts(
            (init.keyContacts || [emptyContact()]).map((c) => ({
              id: c.id || genId(),
              name: c.name || "",
              jobTitle: c.jobTitle || c.role || "",
              profile: c.profile || "",
              scope: c.scope || "internal",
              company: c.company || "",
              info: {
                email: c.info?.email || c.email || "",
                slack: c.info?.slack || "",
                teams: c.info?.teams || "",
              },
            }))
          );
          setSourceMaterials(init.sourceMaterials || []);
          // Initialize companies array for this project
          const initCompanies = Array.isArray(init.companies)
            ? init.companies
            : (init.company ? [init.company] : []);
          setSelectedCompanies(initCompanies);
        }
        // Load reusable companies and contacts for suggestions
        try {
          const companies = await loadCompanies(user.uid);
          setCompaniesList(companies);
        } catch {}
        try {
          const contacts = await loadUserContacts(user.uid);
          const idx = {};
          contacts.forEach((c) => {
            const company = (c.scope || "").toLowerCase() === "external" ? (c.company || "") : "Internal";
            const details = { name: c.name, company, email: c.email || "", jobTitle: c.jobTitle || "" };
            const keyed = `${c.name} — ${company || "Internal"}`;
            idx[keyed] = details;
            if (c.name && !idx[c.name]) idx[c.name] = details;
          });
          setContactsIndex(idx);
        } catch {}
      }
    });
    return () => unsub();
  }, [initiativeId]);

  const getCombinedSource = () =>
    sourceMaterials.map((f) => f.content).join("\n");

  const extractTextFromPdf = async (buffer) => {
    const BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.54";
    const pdfjs = await import(
      /* @vite-ignore */
      `${BASE}/build/pdf.mjs`
    );
    pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/build/pdf.worker.mjs`;
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let text = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return text.trim();
  };

  const extractTextFromDocx = async (buffer) => {
    if (
      typeof window === "undefined" ||
      typeof window.DecompressionStream === "undefined"
    )
      return "";
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let offset = buffer.byteLength - 22;
    while (offset >= 0 && view.getUint32(offset, true) !== 0x06054b50) {
      offset--;
    }
    if (offset < 0) return "";
    const entries = view.getUint16(offset + 8, true);
    const cdOffset = view.getUint32(offset + 16, true);
    offset = cdOffset;
    for (let i = 0; i < entries; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(
        new Uint8Array(buffer, offset + 46, nameLen)
      );
      if (name === "word/document.xml") {
        const lhNameLen = view.getUint16(localOffset + 26, true);
        const lhExtraLen = view.getUint16(localOffset + 28, true);
        const compSize = view.getUint32(localOffset + 18, true);
        const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
        const compressed = buffer.slice(dataStart, dataStart + compSize);
        const ds = new window.DecompressionStream("deflate-raw");
        const stream = new Response(new Blob([compressed]).stream().pipeThrough(ds));
        const xml = await stream.text();
        return xml
          .replace(/<w:p[^>]*>/g, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return "";
  };

  const handleFiles = async (files) => {
    for (const file of Array.from(files)) {
      try {
        if (file.name.toLowerCase().endsWith(".pdf")) {
          const buffer = await file.arrayBuffer();
          let text = await extractTextFromPdf(buffer);
          if (!text) text = await file.text();
          setSourceMaterials((prev) => [...prev, { name: file.name, content: text }]);
        } else if (file.name.toLowerCase().endsWith(".docx")) {
          const buffer = await file.arrayBuffer();
          const text = await extractTextFromDocx(buffer);
          setSourceMaterials((prev) => [...prev, { name: file.name, content: text }]);
        } else {
          const text = await file.text();
          setSourceMaterials((prev) => [...prev, { name: file.name, content: text }]);
        }
      } catch (err) {
        console.error("Failed to read file", err);
        setError(`Failed to process ${file.name}`);
      }
    }
  };

  const handleFileInput = (e) => {
    const { files } = e.target;
    if (files) handleFiles(files);
  };

  const filePickerRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handlePasteText = () => {
    const text = window.prompt("Paste your text:");
    if (text && text.trim()) {
      const defaultName = `pasted-${sourceMaterials.length + 1}.txt`;
      const name =
        window.prompt("Enter a filename", defaultName) || defaultName;
      setSourceMaterials((prev) => [...prev, { name, content: text }]);
    }
  };

  const removeFile = (index) => {
    setSourceMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleContactChange = (index, field, value) => {
    setKeyContacts((prev) => {
      const updated = [...prev];
      if (field.startsWith("info.")) {
        const key = field.split(".")[1];
        updated[index] = {
          ...updated[index],
          info: { ...updated[index].info, [key]: value },
        };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const addKeyContact = () => {
    setKeyContacts((prev) => [...prev, emptyContact()]);
  };

  const removeKeyContact = (index) => {
    setKeyContacts((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.length > 0 ? updated : [emptyContact()];
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProgress(initialProgress);
    try {
      const filteredContacts = keyContacts.filter(
        (c) => c.name && c.jobTitle
      );
      const uid = auth.currentUser?.uid;

      // 1) Save initial project data
      if (uid) {
        setProg("save", "in_progress");
        await saveInitiative(uid, initiativeId, {
          projectName,
          businessGoal,
          // audienceProfile removed
          projectScope,
          company: companyName,
          companies: Array.from(new Set([companyName, ...selectedCompanies].filter(Boolean))),
          sourceMaterials,
          projectConstraints,
          keyContacts: filteredContacts,
        });
        setProg("save", "done");
      }

      // 2) Generate initial hypotheses first (Inquiry Map)
      const brief = `Project Name: ${projectName}\nBusiness Goal: ${businessGoal}\nConstraints:${projectConstraints}`;
      try {
        setProg("hypotheses", "in_progress");
        setProg("map", "in_progress");
        // Ensure App Check token is attached if enabled
        try { if (appCheck) { await getToken(appCheck); } } catch {}
        try { if (auth.currentUser) { await auth.currentUser.getIdToken(true); } } catch {}
        const mapResp = await generateInitialInquiryMap(
          omitEmptyStrings({
            uid,
            initiativeId,
            brief,
            documents: getCombinedSource(),
            answers: "",
          })
        );
        const hypotheses = mapResp?.data?.hypotheses || [];
        setToast(`Inquiry map created with ${hypotheses.length} hypotheses.`);
        setProg("hypotheses", "done");
        setProg("map", "done");

        // 3) Generate discovery questions, then tag with hypotheses or general categories
        setProg("questions", "in_progress");
        const { data } = await generateProjectQuestions(
          omitEmptyStrings({
            businessGoal,
            // audienceProfile removed
            sourceMaterial: getCombinedSource(),
            projectConstraints,
            keyContacts: filteredContacts.map(
              ({ id, name, jobTitle, profile, scope, company, info }) => ({
                id,
                name,
                jobTitle,
                profile,
                scope,
                company,
                info,
              })
            ),
          })
        );
        const qsRaw = (data.projectQuestions || []).slice(0, 9);
        let qs = qsRaw.map((q) => {
          const contactIds = (q.stakeholders || q.contacts || []).map((name) => {
            const match = keyContacts.find(
              (c) => c.name === name || c.id === name
            );
            return match ? match.id : name;
          });
          const statusArr = contactIds.map((cid) => ({
            contactId: cid,
            currentStatus: "Ask",
            askedAt: new Date().toISOString(),
            askedBy: auth.currentUser?.uid || null,
            answers: [],
          }));
          return {
            id: generateQuestionId(),
            question: typeof q === "string" ? q : q.question,
            phase: q.phase || "General",
            contacts: contactIds,
            contactStatus: statusArr,
          };
        });

        // Categorize/link questions using hypotheses
        try {
          if (hypotheses && hypotheses.length && qs.length) {
            const hypList = hypotheses
              .map((h) => `${h.id}: ${h.hypothesis || h.statement || ""}`)
              .join("\n");
            const qList = qs.map((q) => `${q.id}: ${q.question}`).join("\n");
            const catPrompt = `You are a strategic analyst. Given the hypotheses and questions below, return JSON mapping each question id to either a list of linked hypothesis ids (if it directly investigates one or more hypotheses) or a general category when it does not. Use categories from this set only: ["Logistics","Scope","Stakeholders","Timeline","Risks","Dependencies","Success Criteria","Budget","Tools/Systems","Compliance","Other"].

Hypotheses:\n${hypList}

Questions:\n${qList}

Return JSON exactly like:\n{"items":[{"id":"<questionId>","hypothesisIds":["A"],"category":""}]}`;
            const { text } = await aiGenerate(catPrompt);
            const mapping = parseJsonFromText(text);
            const byId = new Map(
              (mapping.items || []).map((m) => [m.id, m])
            );
            qs = qs.map((q) => {
              const m = byId.get(q.id);
              if (!m) return q;
              const hypothesisIds = Array.isArray(m.hypothesisIds)
                ? m.hypothesisIds.filter(Boolean)
                : [];
              return {
                ...q,
                category: hypothesisIds.length ? undefined : (m.category || undefined),
                hypothesisIds,
                hypothesisId: hypothesisIds[0] || null,
              };
            });
          }
        } catch (catErr) {
          console.warn("Question categorization failed; proceeding without tags", catErr);
        }

        setProg("questions", "done");
        await saveInitiative(uid, initiativeId, { projectQuestions: qs });

        // Persist companies and contacts to profile and global contacts for future suggestions
        try {
          const companiesToSave = projectScope === "external"
            ? Array.from(new Set([companyName, ...selectedCompanies].filter(Boolean)))
            : [];
          await upsertCompaniesAndContacts(uid, companiesToSave, filteredContacts);
          await upsertUserContacts(uid, filteredContacts);
        } catch (persistErr) {
          console.warn("Failed to upsert companies/contacts index", persistErr);
        }
        await new Promise((res) => setTimeout(res, 1000));
      } catch (mapErr) {
        console.error("Error generating inquiry map or questions:", mapErr);
      }
      setProg("dashboard", "in_progress");
      await new Promise((res) => setTimeout(res, 250));
      setProg("dashboard", "done");
      navigate(`/discovery?initiativeId=${initiativeId}`);
    } catch (err) {
      console.error("Error generating project questions:", err);
      setError(err?.message || "Error generating project questions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className={`initiative-card ${loading ? "pulsing" : ""}`}>
        <form onSubmit={handleSubmit} className="generator-form">
          <h3>Project Intake</h3>
          <p>Tell us about your project. The more detail, the better.</p>
          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 12 }}>
            {[
              { key: 1, label: "Project Info", complete: step > 1 && isStep1Valid() },
              { key: 2, label: "Partners", complete: step > 2 && isStep2Valid() },
              { key: 3, label: "Source Material", complete: false },
            ].map((s) => (
              <div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "2px solid #fff",
                    background: s.complete ? "#8C259E" : step === s.key ? "rgba(255,255,255,0.6)" : "transparent",
                  }}
                  title={s.label}
                />
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Step 1: Project Information */}
          {step === 1 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 160, fontWeight: 600 }}>Project Name</div>
                <input
                  type="text"
                  value={projectName}
                  placeholder="e.g., 'Q3 Sales Onboarding'"
                  onChange={(e) => setProjectName(e.target.value)}
                  className="generator-input"
                  style={{ flex: 1, margin: 0 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 160, fontWeight: 600 }}>Primary Goal</div>
                <input
                  type="text"
                  value={businessGoal}
                  placeholder="e.g., 'Reduce support tickets for Product X by 20%'"
                  onChange={(e) => setBusinessGoal(e.target.value)}
                  className="generator-input"
                  style={{ flex: 1, margin: 0 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 160, fontWeight: 600 }}>Project Constraints</div>
                <textarea
                  value={projectConstraints}
                  onChange={(e) => setProjectConstraints(e.target.value)}
                  className="generator-input"
                  rows={3}
                  style={{ flex: 1, margin: 0 }}
                />
              </div>
            </>
          )}
          {/* Step 2: Partners */}
          {step === 2 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 160, fontWeight: 600 }}>Project Type</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <label><input type="radio" name="scope" value="internal" checked={projectScope === "internal"} onChange={() => setProjectScope("internal")} /> Internal</label>
                  <label><input type="radio" name="scope" value="external" checked={projectScope === "external"} onChange={() => setProjectScope("external")} /> External</label>
                </div>
              </div>
              {projectScope === "external" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ minWidth: 160, fontWeight: 600 }}>Primary Company</div>
                    <input
                      type="text"
                      value={companyName}
                      placeholder="e.g., Acme Corp"
                      list="company-suggestions"
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="generator-input"
                      style={{ flex: 1, margin: 0 }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                    <div style={{ minWidth: 160, fontWeight: 600 }}>Other Companies</div>
                    <input
                      type="text"
                      value={companyInput}
                      list="company-suggestions"
                      placeholder="Type to add company and press Enter"
                      onChange={(e) => setCompanyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = companyInput.trim();
                          if (val && !selectedCompanies.includes(val)) {
                            setSelectedCompanies((prev) => [...prev, val]);
                          }
                          setCompanyInput("");
                        }
                      }}
                      className="generator-input"
                      style={{ flex: 1, margin: 0 }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                    {selectedCompanies.map((c) => (
                      <span key={c} className="glass-card" style={{ padding: "4px 8px", borderRadius: 9999 }}>
                        {c}
                        <button type="button" className="remove-file" onClick={() => setSelectedCompanies((prev) => prev.filter((x) => x !== c))} style={{ marginLeft: 6 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <datalist id="company-suggestions">
                    {companiesList.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              )}
              {/* Key Contacts */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 160, fontWeight: 600 }}>Key Contacts</div>
                <div style={{ flex: 1 }} />
              </div>
              <div className="contacts-section">
            {keyContacts.map((c, idx) => (
              <div key={idx} className="contact-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, width: "100%" }}>
                {/* Row 1: Name + Job Title */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                  <input
                    type="text"
                    value={c.name}
                    placeholder="Name"
                    list="contact-suggestions"
                    onFocus={(e) => {
                      // Show full suggestions without manual delete: temporarily clear value
                      e.target.dataset.prev = e.target.value;
                      e.target.value = "";
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      // If user picked a suggestion, populate fields immediately
                      const normalized = contactsIndex[val] ? val : val.replace(/\s*[–—-]\s*internal$/i, "").trim();
                      const s = contactsIndex[normalized] || Object.values(contactsIndex).find((d) => {
                        const byName = (d.name || "").toLowerCase() === normalized.toLowerCase();
                        const byPair = (`${d.name} — ${d.company || 'Internal'}`).toLowerCase() === val.toLowerCase();
                        return byName || byPair;
                      });
                      if (s) {
                        handleContactChange(idx, "name", s.name);
                        handleContactChange(idx, "jobTitle", s.jobTitle || "");
                        handleContactChange(idx, "info.email", s.email || "");
                        handleContactChange(idx, "company", s.company || "");
                        const isInternal = (s.company || "").toLowerCase() === "internal";
                        handleContactChange(idx, "scope", isInternal ? "internal" : "external");
                      } else {
                        handleContactChange(idx, "name", val);
                      }
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      // Normalize suggestion format variations ("Name — Company", "Name - internal", or name only)
                      const key = contactsIndex[val] ? val : val.replace(/\s*[–—-]\s*internal$/i, "").trim();
                      const s = contactsIndex[key] || Object.values(contactsIndex).find((d) => {
                        const byName = (d.name || "").toLowerCase() === key.toLowerCase();
                        const byPair = (`${d.name} — ${d.company || 'Internal'}`).toLowerCase() === val.toLowerCase();
                        return byName || byPair;
                      });
                      if (s) {
                        handleContactChange(idx, "name", s.name);
                        handleContactChange(idx, "jobTitle", s.jobTitle || "");
                        handleContactChange(idx, "info.email", s.email || "");
                        handleContactChange(idx, "company", s.company || "");
                        const isInternal = (s.company || "").toLowerCase() === "internal";
                        handleContactChange(idx, "scope", isInternal ? "internal" : "external");
                        e.target.dataset.prev = "";
                      } else if (!val && e.target.dataset.prev) {
                        // Restore previous value if user didn't pick anything
                        handleContactChange(idx, "name", e.target.dataset.prev);
                        e.target.value = e.target.dataset.prev;
                        e.target.dataset.prev = "";
                      }
                    }}
                    className="generator-input"
                    style={{ flex: 1, margin: 0 }}
                  />
                  </div>
                  <input
                    type="text"
                    value={c.jobTitle}
                    placeholder="Job Title"
                    onChange={(e) => handleContactChange(idx, "jobTitle", e.target.value)}
                    className="generator-input"
                    style={{ flex: 1, margin: 0 }}
                  />
                </div>
                {/* Row 2: Email + Company (Company only if external). Email width equals Name; Company width equals Job Title */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    value={c.info.email}
                    placeholder="Email"
                    onChange={(e) => handleContactChange(idx, "info.email", e.target.value)}
                    className="generator-input"
                    style={{ flex: 1, margin: 0 }}
                  />
                  {c.scope === "external" ? (
                    <input
                      type="text"
                      value={c.company}
                      placeholder="Company"
                      onChange={(e) => handleContactChange(idx, "company", e.target.value)}
                      className="generator-input"
                      style={{ flex: 1, margin: 0 }}
                    />
                  ) : (
                    <div style={{ flex: 1 }} />
                  )}
                </div>
                {/* Row 3: Internal/External selector */}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label><input type="radio" name={`contact-scope-${c.id}`} value="internal" checked={c.scope === "internal"} onChange={() => handleContactChange(idx, "scope", "internal")} /> Internal</label>
                  <label><input type="radio" name={`contact-scope-${c.id}`} value="external" checked={c.scope === "external"} onChange={() => handleContactChange(idx, "scope", "external")} /> External</label>
                  {keyContacts.length > 1 && (
                    <button
                      type="button"
                      className="remove-file"
                      onClick={() => removeKeyContact(idx)}
                      style={{ marginLeft: "auto" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="generator-button add-contact-button"
              onClick={addKeyContact}
            >
              Add Contact
            </button>
              </div>
            </>
          )}
          {/* Step 3: Source Material */}
          {step === 3 && (
            <>
              <div
                className="upload-card"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={(e) => { if (e.target.tagName !== 'BUTTON') filePickerRef.current?.click(); }}
              >
                <input
                  ref={filePickerRef}
                  type="file"
                  onChange={handleFileInput}
                  className="file-input"
                  accept=".pdf,.docx,.txt"
                  multiple
                />
                <div className="upload-title">Upload Source Material (Optional)</div>
                <div className="upload-subtitle">Click to upload or drag and drop</div>
                <div className="upload-hint">PDF, DOCX, TXT (MAX. 10MB)</div>
                <button
                  type="button"
                  className="generator-button paste-text"
                  onClick={handlePasteText}
                >
                  Paste Text
                </button>
                {sourceMaterials.length > 0 && (
                  <ul className="file-list">
                    {sourceMaterials.map((f, idx) => (
                      <li key={idx}>
                        {f.name}
                        <button
                          type="button"
                          className="remove-file"
                          onClick={() => removeFile(idx)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          {/* Navigation */}
          <div className="button-row">
            {step > 1 && (
              <button
                type="button"
                className="generator-button back-button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={loading}
              >
                Back
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                className="generator-button next-button"
                onClick={() => {
                  if (step === 1 && !isStep1Valid()) { setError("Please enter Project Name and Primary Goal."); return; }
                  if (step === 2 && !isStep2Valid()) { setError("Please provide a Primary Company for External projects."); return; }
                  setError("");
                  setStep((s) => Math.min(3, s + 1));
                }}
                disabled={loading}
              >
                Next
              </button>
            )}
            {step === 3 && (
              <button
                type="submit"
                disabled={loading || !isStep1Valid() || !isStep2Valid()}
                className="generator-button next-button"
              >
                {loading ? "Analyzing..." : "Save and Analyze"}
              </button>
            )}
          </div>
          {loading && (
            <div className="glass-card" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Analyzing your project…</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {[
                  { k: "save", label: "Saving project data" },
                  { k: "questions", label: "Generating discovery questions" },
                  { k: "hypotheses", label: "Creating hypotheses" },
                  { k: "map", label: "Building inquiry map" },
                  { k: "dashboard", label: "Finalizing project dashboard" },
                ].map(({ k, label }) => (
                  <li key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {progress[k] === "done" ? (
                      <span aria-hidden>✓</span>
                    ) : progress[k] === "in_progress" ? (
                      <span className="spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                      <span aria-hidden>○</span>
                    )}
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* <div
            className="upload-card"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={(e) => { if (e.target.tagName !== 'BUTTON') filePickerRef.current?.click(); }}
          >
            <input
              ref={filePickerRef}
              type="file"
              onChange={handleFileInput}
              className="file-input"
              accept=".pdf,.docx,.txt"
              multiple
            />
            <div className="upload-title">Upload Source Material (Optional)</div>
            <div className="upload-subtitle">Click to upload or drag and drop</div>
            <div className="upload-hint">PDF, DOCX, TXT (MAX. 10MB)</div>
            <button
              type="button"
              className="generator-button paste-text"
              onClick={handlePasteText}
            >
              Paste Text
            </button>
            {sourceMaterials.length > 0 && (
              <ul className="file-list">
                {sourceMaterials.map((f, idx) => (
                  <li key={idx}>
                    {f.name}
                    <button
                      type="button"
                      className="remove-file"
                      onClick={() => removeFile(idx)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="button-row">
            <button
              type="submit"
              disabled={loading}
              className="generator-button next-button"
            >
              {loading ? "Analyzing..." : "Next"}
            </button>
          </div>
          {error && <p className="generator-error">{error}</p>} */}
        </form>
      </div>
      {/* global datalist for contact suggestions */}
      <datalist id="contact-suggestions">
        {Array.from(new Set(Object.values(contactsIndex).map((v) => `${v.name} — ${v.company || 'Internal'}`))).map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default ProjectSetup;
