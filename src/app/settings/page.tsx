"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface SettingsData {
  groq: { available: boolean; model: string; keyCount: number; maskedKeys: string[] };
  gemini: { available: boolean; source: "runtime" | "env" | "none"; maskedKey: string | null };
  embeddings: { model: string; status: string };
  database: { url: string };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [groqKey, setGroqKey] = useState("");
  const [groqLoading, setGroqLoading] = useState(false);
  const [groqMessage, setGroqMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      setSettings(await res.json());
    } catch {
      setSettings(null);
    }
  }

  useEffect(() => { fetchSettings(); }, []);

  async function handleSaveGroqKey(e: React.FormEvent) {
    e.preventDefault();
    setGroqLoading(true);
    setGroqMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: groqKey }),
      });
      const data = await res.json();
      if (data.success) {
        setGroqMessage({ text: data.message, type: "success" });
        setGroqKey("");
        fetchSettings();
      } else {
        setGroqMessage({ text: data.error, type: "error" });
      }
    } catch (err) {
      setGroqMessage({ text: String(err), type: "error" });
    } finally {
      setGroqLoading(false);
    }
  }

  async function handleClearGroqKey() {
    setGroqLoading(true);
    setGroqMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const data = await res.json();
      setGroqMessage({ text: data.message, type: "success" });
      fetchSettings();
    } catch (err) {
      setGroqMessage({ text: String(err), type: "error" });
    } finally {
      setGroqLoading(false);
    }
  }

  const allActive = settings?.groq.available && settings?.gemini.available;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#141413]">Settings</h1>
        <p className="text-[#5e5d59] text-sm mt-1">Configure AI features for claim adjudication</p>
      </div>

      {/* AI Status Overview */}
      <Card className="border-[#4d4c48]/20 bg-[#faf9f5]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-[#141413]">
            <span>AI Status</span>
            {settings && (
              <Badge className={allActive
                ? "bg-[#27a644]/15 text-[#27a644] border-[#27a644]/30"
                : settings.groq.available || settings.gemini.available
                ? "bg-amber-600/10 text-amber-700 border-amber-300"
                : "bg-[#b53333]/10 text-[#b53333] border-[#b53333]/20"
              }>
                {allActive ? "All Active" : settings.groq.available || settings.gemini.available ? "Partially Active" : "Inactive"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-lg border p-3 ${settings.groq.available ? 'border-[#27a644]/30 bg-[#27a644]/5' : 'border-[#b53333]/20 bg-[#b53333]/5'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold uppercase text-[#5e5d59]">Groq (Agent LLM)</span>
                    <span className={`text-xs font-bold ${settings.groq.available ? 'text-[#27a644]' : 'text-[#b53333]'}`}>
                      {settings.groq.available ? 'Connected' : 'Not configured'}
                    </span>
                  </div>
                  <p className="font-mono text-sm text-[#141413]">{settings.groq.model}</p>
                  {settings.groq.keyCount > 0 && (
                    <p className="text-[11px] text-[#5e5d59] mt-1">{settings.groq.keyCount} key{settings.groq.keyCount > 1 ? 's' : ''} configured</p>
                  )}
                </div>
                <div className={`rounded-lg border p-3 ${settings.gemini.available ? 'border-[#27a644]/30 bg-[#27a644]/5' : 'border-[#b53333]/20 bg-[#b53333]/5'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold uppercase text-[#5e5d59]">Gemini (Vision/OCR)</span>
                    <span className={`text-xs font-bold ${settings.gemini.available ? 'text-[#27a644]' : 'text-[#b53333]'}`}>
                      {settings.gemini.available ? 'Connected' : 'Not configured'}
                    </span>
                  </div>
                  <p className="font-mono text-sm text-[#141413]">gemini-2.5-flash</p>
                  {settings.gemini.maskedKey && (
                    <p className="text-[11px] text-[#5e5d59] mt-1">{settings.gemini.source === 'env' ? 'From .env' : 'Set via settings'}</p>
                  )}
                </div>
              </div>
              <div className="bg-[#f0eee6] rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-[#141413]">AI features:</p>
                <ul className="text-[#5e5d59] space-y-0.5 ml-4 list-disc">
                  <li className={settings.groq.available ? "" : "opacity-50"}>🤖 Agentic claim adjudication pipeline (Groq / {settings.groq.model})</li>
                  <li className={settings.groq.available ? "" : "opacity-50"}>🧠 Medical necessity review with RAG context</li>
                  <li className={settings.gemini.available ? "" : "opacity-50"}>📄 Document OCR extraction (Gemini Vision)</li>
                  <li className={settings.gemini.available ? "" : "opacity-50"}>📚 Semantic policy search (embeddings)</li>
                </ul>
                {!allActive && (
                  <p className="text-amber-600 mt-2 font-medium">⚠️ Without API keys, the deterministic rule engine still works — AI features are just disabled.</p>
                )}
              </div>
            </>
          ) : (
            <div className="animate-pulse bg-[#f0eee6] rounded h-20" />
          )}
        </CardContent>
      </Card>

      {/* Groq API Key */}
      <Card className="border-[#4d4c48]/20 bg-[#faf9f5]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#141413]">
            Groq API Key
            <Badge variant="outline" className="text-[10px] font-normal">Powers the agent pipeline</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-[#c96442]/8 border border-[#c96442]/20 rounded-lg p-3 text-sm text-[#87867f]">
            <p className="font-medium text-[#141413]">🔑 How to get a Groq API key:</p>
            <ol className="list-decimal ml-5 mt-1 space-y-0.5">
              <li>Go to <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline font-medium text-[#c96442]">console.groq.com/keys</a></li>
              <li>Sign up or log in to your Groq account</li>
              <li>Click &quot;Create API Key&quot;</li>
              <li>Copy the key and paste it below</li>
            </ol>
            <p className="text-xs mt-2 text-[#5e5d59]">Free tier includes 30K tokens/min. The agent pipeline uses Groq for fast inference (default: Llama 4 Scout).</p>
          </div>

          {settings?.groq.maskedKeys && settings.groq.maskedKeys.length > 0 && (
            <div className="text-sm">
              <span className="text-[#5e5d59]">Active keys:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {settings.groq.maskedKeys.map((k, i) => (
                  <span key={i} className="font-mono text-xs px-2 py-1 rounded-md bg-[#27a644]/10 text-[#27a644] border border-[#27a644]/20">{k}</span>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSaveGroqKey} className="space-y-3">
            <div>
              <Label htmlFor="groq-key" className="text-[#141413]">API Key</Label>
              <Input
                id="groq-key"
                type="password"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="gsk_..."
                className="font-mono mt-1 border-[#4d4c48]/20 bg-[#faf9f5]"
                autoComplete="off"
              />
              <p className="text-xs text-[#5e5d59] mt-1">
                Your key is validated with a test API call and stored in server memory only (resets on redeploy).
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={groqLoading || !groqKey.trim()} className="flex-1 bg-[#c96442] hover:bg-[#d97757] text-white">
                {groqLoading ? "Validating..." : "Save & Verify Key"}
              </Button>
              {settings?.groq.available && (
                <Button type="button" variant="outline" onClick={handleClearGroqKey} disabled={groqLoading} className="border-[#4d4c48]/20 text-[#141413]">
                  Clear
                </Button>
              )}
            </div>
          </form>

          {groqMessage && (
            <div className={`rounded-lg p-3 text-sm ${
              groqMessage.type === "success" ? "bg-[#27a644]/15 text-[#27a644] border border-[#27a644]/30" : "bg-[#b53333]/10 text-[#b53333] border border-[#b53333]/20"
            }`}>
              {groqMessage.type === "success" ? "✅" : "❌"} {groqMessage.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="border-[#4d4c48]/20 bg-[#faf9f5]">
        <CardHeader>
          <CardTitle className="text-sm text-[#141413]">System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-[#5e5d59]">Agent LLM</span><p className="font-mono mt-0.5 text-[#141413]">{settings?.groq.model || '—'} (via Groq)</p></div>
            <div><span className="text-[#5e5d59]">Vision / OCR</span><p className="font-mono mt-0.5 text-[#141413]">gemini-2.5-flash</p></div>
            <div><span className="text-[#5e5d59]">Embeddings</span><p className="font-mono mt-0.5 text-[#141413]">{settings?.embeddings.model || '—'}</p></div>
            <div><span className="text-[#5e5d59]">Database</span><p className="font-mono mt-0.5 text-[#141413]">{settings?.database.url || '—'}</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
