import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { functions, auth, appCheck } from "../firebase";
import { getToken } from "firebase/app-check";
import { saveInitiative, loadInitiative } from "../utils/initiatives";
import { loadCompanies, loadAllContacts, upsertCompaniesAndContacts } from "../utils/companies";
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
  const [audienceProfile, setAudienceProfile] = useState("");
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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && initiativeId) {
        const init = await loadInitiative(user.uid, initiativeId);
        if (init) {
          setProjectName(init.projectName || "");
          setBusinessGoal(init.businessGoal || "");
          setAudienceProfile(init.audienceProfile || "");
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
          const contacts = await loadAllContacts(user.uid);
          const idx = {};
          contacts.forEach((c) => {
            const key = `${c.name} — ${c.company}`;
            idx[key] = { name: c.name, company: c.company, email: c.email || "", jobTitle: c.jobTitle || "" };
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
    try {
      const filteredContacts = keyContacts.filter(
        (c) => c.name && c.jobTitle
      );
      const { data } = await generateProjectQuestions(
        omitEmptyStrings({
          businessGoal,
          audienceProfile,
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
      const qs = qsRaw.map((q) => {
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
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, {
          projectName,
          businessGoal,
          audienceProfile,
          projectScope,
          company: companyName,
          companies: Array.from(new Set([companyName, ...selectedCompanies].filter(Boolean))),
          sourceMaterials,
          projectConstraints,
          keyContacts: filteredContacts,
          projectQuestions: qs,
        });

        // Persist companies and contacts to profile for future suggestions
        try {
          const companiesToSave = projectScope === "external"
            ? Array.from(new Set([companyName, ...selectedCompanies].filter(Boolean)))
            : [];
          await upsertCompaniesAndContacts(uid, companiesToSave, filteredContacts);
        } catch (persistErr) {
          console.warn("Failed to upsert companies/contacts index", persistErr);
        }

        const brief = `Project Name: ${projectName}\nBusiness Goal: ${businessGoal}\nAudience: ${audienceProfile}\nConstraints:${projectConstraints}`;
        try {
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
          await new Promise((res) => setTimeout(res, 1000));
        } catch (mapErr) {
          console.error("Error generating inquiry map:", mapErr);
        }
      }
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
          {/* Single-column layout */}
          <label>
            Project Name
            <input
              type="text"
              value={projectName}
              placeholder="e.g., 'Q3 Sales Onboarding'"
              onChange={(e) => setProjectName(e.target.value)}
              className="generator-input"
            />
          </label>
          <label>
            Primary Business Goal
            <input
              type="text"
              value={businessGoal}
              placeholder="e.g., 'Reduce support tickets for Product X by 20%'"
              onChange={(e) => setBusinessGoal(e.target.value)}
              className="generator-input"
            />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span>Project Type:</span>
            <label><input type="radio" name="scope" value="internal" checked={projectScope === "internal"} onChange={() => setProjectScope("internal")} /> Internal</label>
            <label><input type="radio" name="scope" value="external" checked={projectScope === "external"} onChange={() => setProjectScope("external")} /> External</label>
          </div>
          {projectScope === "external" && (
            <div>
              <label>
                Primary Company (External)
                <input
                  type="text"
                  value={companyName}
                  placeholder="e.g., Acme Corp"
                  list="company-suggestions"
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="generator-input"
                />
              </label>
              <label>
                Other Companies (Optional)
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {selectedCompanies.map((c) => (
                    <span key={c} className="glass-card" style={{ padding: "4px 8px", borderRadius: 9999 }}>
                      {c}
                      <button type="button" className="remove-file" onClick={() => setSelectedCompanies((prev) => prev.filter((x) => x !== c))} style={{ marginLeft: 6 }}>×</button>
                    </span>
                  ))}
                </div>
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
                />
                <datalist id="company-suggestions">
                  {companiesList.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </label>
            </div>
          )}
          <label>
            Who is the target audience?
            <textarea
              value={audienceProfile}
              placeholder="e.g., 'New sales hires, age 22-28, with no prior industry experience'"
              onChange={(e) => setAudienceProfile(e.target.value)}
              className="generator-input"
              rows={3}
            />
          </label>
          <div className="contacts-section">
            <p>Key Contacts</p>
            {keyContacts.map((c, idx) => (
              <div key={idx} className="contact-row" style={{ flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={c.name}
                  placeholder="Name"
                  list="contact-suggestions"
                  onChange={(e) => handleContactChange(idx, "name", e.target.value)}
                  onBlur={(e) => {
                    const val = e.target.value;
                    const key = val.includes(" — ") ? val : null;
                    if (key && contactsIndex[key]) {
                      const s = contactsIndex[key];
                      handleContactChange(idx, "name", s.name);
                      handleContactChange(idx, "jobTitle", s.jobTitle || "");
                      handleContactChange(idx, "info.email", s.email || "");
                      handleContactChange(idx, "company", s.company || "");
                      handleContactChange(idx, "scope", "external");
                    }
                  }}
                  className="generator-input"
                />
                <input
                  type="text"
                  value={c.jobTitle}
                  placeholder="Job Title"
                  onChange={(e) => handleContactChange(idx, "jobTitle", e.target.value)}
                  className="generator-input"
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                  <label><input type="radio" name={`contact-scope-${c.id}`} value="internal" checked={c.scope === "internal"} onChange={() => handleContactChange(idx, "scope", "internal")} /> Internal</label>
                  <label><input type="radio" name={`contact-scope-${c.id}`} value="external" checked={c.scope === "external"} onChange={() => handleContactChange(idx, "scope", "external")} /> External</label>
                  {c.scope === "external" && (
                    <input
                      type="text"
                      value={c.company}
                      placeholder="Company"
                      onChange={(e) => handleContactChange(idx, "company", e.target.value)}
                      className="generator-input"
                      style={{ maxWidth: 300 }}
                    />
                  )}
                </div>
                <input
                  type="email"
                  value={c.info.email}
                  placeholder="Email"
                  onChange={(e) => handleContactChange(idx, "info.email", e.target.value)}
                  className="generator-input"
                />
                {keyContacts.length > 1 && (
                  <button
                    type="button"
                    className="remove-file"
                    onClick={() => removeKeyContact(idx)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="generator-button add-contact-button"
              onClick={addKeyContact}
            >
              +
            </button>
          </div>
          <label>
            Project Constraints or Limitations
            <textarea
              value={projectConstraints}
              onChange={(e) => setProjectConstraints(e.target.value)}
              className="generator-input"
              rows={3}
            />
          </label>

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
          <div className="button-row">
            <button
              type="submit"
              disabled={loading}
              className="generator-button next-button"
            >
              {loading ? "Analyzing..." : "Next"}
            </button>
          </div>
          {error && <p className="generator-error">{error}</p>}
        </form>
      </div>
      {/* global datalist for contact suggestions */}
      <datalist id="contact-suggestions">
        {Object.keys(contactsIndex).map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default ProjectSetup;
