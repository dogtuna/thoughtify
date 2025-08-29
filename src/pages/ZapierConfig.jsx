import { useState } from "react";
import { runZap } from "../mcp/client.js";

const ZapierConfig = () => {
  const [zapUrl, setZapUrl] = useState("");
  const [payload, setPayload] = useState("{}\n");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    let data = {};
    try {
      data = payload.trim() ? JSON.parse(payload) : {};
    } catch (e) {
      setError("Invalid JSON payload");
      setLoading(false);
      return;
    }
    try {
      const res = await runZap({ zapUrl, payload: data });
      setResult(res);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Zapier Configuration</h1>
      <div>
        <label className="block mb-1">Zap URL</label>
        <input
          type="url"
          value={zapUrl}
          onChange={(e) => setZapUrl(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="https://hooks.zapier.com/..."
        />
      </div>
      <div>
        <label className="block mb-1">Payload (JSON)</label>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          className="w-full p-2 border rounded"
          rows={5}
        />
      </div>
      <button
        type="button"
        className="generator-button"
        onClick={handleTest}
        disabled={loading}
      >
        {loading ? "Testing..." : "Test Zap"}
      </button>
      {error && <div className="text-red-600">{error}</div>}
      {result && (
        <pre className="bg-gray-100 p-2 rounded overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
};

export default ZapierConfig;
