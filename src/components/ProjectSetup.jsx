import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { app, auth } from "../firebase";
import { saveInitiative, loadInitiative } from "../utils/initiatives";
import "./AIToolsGenerators.css";

const ProjectSetup = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const navigate = useNavigate();

  const functions = getFunctions(app, "us-central1");
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
  const [projectConstraints, setProjectConstraints] = useState("");
  const genId = () => crypto.randomUUID();
  const emptyContact = () => ({
    id: genId(),
    name: "",
    jobTitle: "",
    profile: "",
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
          setProjectConstraints(init.projectConstraints || "");
          setKeyContacts(
            (init.keyContacts || [emptyContact()]).map((c) => ({
              id: c.id || genId(),
              name: c.name || "",
              jobTitle: c.jobTitle || c.role || "",
              profile: c.profile || "",
              info: {
                email: c.info?.email || c.email || "",
                slack: c.info?.slack || "",
                teams: c.info?.teams || "",
              },
            }))
          );
          setSourceMaterials(init.sourceMaterials || []);
        }
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
    setKeyContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await generateProjectQuestions({
        businessGoal,
        audienceProfile,
        sourceMaterial: getCombinedSource(),
        projectConstraints,
        keyContacts: keyContacts.map(({ id, name, jobTitle, profile, info }) => ({
          id,
          name,
          jobTitle,
          profile,
          info,
        })),
      });
      const qsRaw = (data.projectQuestions || []).slice(0, 9);
      const qs = qsRaw.map((q, idx) => {
        const contactIds = (q.stakeholders || q.contacts || []).map((name) => {
          const match = keyContacts.find((c) => c.name === name || c.id === name);
          return match ? match.id : name;
        });
        const statusMap = {};
        contactIds.forEach((cid) => {
          statusMap[cid] = { current: "Ask", history: [{ status: "Ask", timestamp: new Date().toISOString() }], answers: [] };
        });
        return {
          id: `Q${idx + 1}`,
          question: typeof q === "string" ? q : q.question,
          phase: q.phase || "General",
          contacts: contactIds,
          contactStatus: statusMap,
        };
      });
      const uid = auth.currentUser?.uid;
        if (uid) {
          await saveInitiative(uid, initiativeId, {
            projectName,
            businessGoal,
            audienceProfile,
            sourceMaterials,
            projectConstraints,
            keyContacts,
            projectQuestions: qs,
          });

          const brief = `Project Name: ${projectName}\nBusiness Goal: ${businessGoal}\nAudience: ${audienceProfile}\nConstraints:${projectConstraints}`;
          try {
            const mapResp = await generateInitialInquiryMap({
              uid,
              initiativeId,
              brief,
              documents: getCombinedSource(),
              answers: "",
            });
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
          <div className="intake-grid">
            <div className="intake-left">
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
                What is the primary business goal?
                <input
                  type="text"
                  value={businessGoal}
                  placeholder="e.g., 'Reduce support tickets for Product X by 20%'"
                  onChange={(e) => setBusinessGoal(e.target.value)}
                  className="generator-input"
                />
              </label>
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
                  <div key={idx} className="contact-row">
                    <input
                      type="text"
                      value={c.name}
                      placeholder="Name"
                      onChange={(e) => handleContactChange(idx, "name", e.target.value)}
                      className="generator-input"
                    />
                    <input
                      type="text"
                      value={c.jobTitle}
                      placeholder="Job Title"
                      onChange={(e) =>
                        handleContactChange(idx, "jobTitle", e.target.value)
                      }
                      className="generator-input"
                    />
                    <input
                      type="email"
                      value={c.info.email}
                      placeholder="Email"
                      onChange={(e) =>
                        handleContactChange(idx, "info.email", e.target.value)
                      }
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
            </div>
            <div
              className="upload-card"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
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
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default ProjectSetup;

