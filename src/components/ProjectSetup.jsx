import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../firebase";
import { saveInitiative } from "../utils/initiatives";
import "./AIToolsGenerators.css";

const ProjectSetup = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const navigate = useNavigate();

  const functions = getFunctions(app, "us-central1");
  const generateClarifyingQuestions = httpsCallable(
    functions,
    "generateClarifyingQuestions"
  );

  const [projectName, setProjectName] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");
  const [keyContacts, setKeyContacts] = useState([{ name: "", role: "" }]);
  const [sourceMaterials, setSourceMaterials] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const removeFile = (index) => {
    setSourceMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleContactChange = (index, field, value) => {
    setKeyContacts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addKeyContact = () => {
    setKeyContacts((prev) => [...prev, { name: "", role: "" }]);
  };

  const removeKeyContact = (index) => {
    setKeyContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await generateClarifyingQuestions({
        businessGoal,
        audienceProfile,
        sourceMaterial: getCombinedSource(),
        projectConstraints,
        keyContacts,
      });
      const qsRaw = (data.clarifyingQuestions || []).slice(0, 9);
      const qs = qsRaw.map((q) =>
        typeof q === "string" ? { question: q, stakeholders: [], phase: "General" } : q
      );
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, {
          projectName,
          businessGoal,
          audienceProfile,
          sourceMaterials,
          projectConstraints,
          keyContacts,
          clarifyingQuestions: qs,
          clarifyingContacts: qs.map((q) => q.stakeholders || []),
          clarifyingAnswers: qs.map(() => ({})),
          clarifyingAsked: qs.map(() => false),
        });
      }
      navigate(`/discovery?initiativeId=${initiativeId}`);
    } catch (err) {
      console.error("Error generating clarifying questions:", err);
      setError(err?.message || "Error generating clarifying questions.");
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
                      value={c.role}
                      placeholder="Role"
                      onChange={(e) => handleContactChange(idx, "role", e.target.value)}
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
    </div>
  );
};

export default ProjectSetup;

