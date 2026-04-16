"use client";
import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVapi } from "@/hooks/use-vapi";

interface KnowledgeChunk {
  id: string;
  source: string;
  category: string;
  textPreview: string;
  text: string;
}

interface SearchResult {
  source: string;
  category: string;
  text: string;
  similarity: number;
}

interface QAResult {
  question: string;
  answer: string;
  sources: SearchResult[];
}

const SOURCE_COLORS: Record<string, string> = {
  policy_terms: "bg-[#c96442]/15 text-[#c96442] border-[#c96442]/30",
  adjudication_rules: "bg-[#8b6f4e]/15 text-[#8b6f4e] border-[#8b6f4e]/30",
  medical_knowledge: "bg-[#5a7a5a]/15 text-[#5a7a5a] border-[#5a7a5a]/30",
};

const SOURCE_ICONS: Record<string, string> = {
  policy_terms: "📋",
  adjudication_rules: "⚖️",
  medical_knowledge: "🏥",
};

/** Render simple markdown (bold, code, backticks) as inline HTML */
function renderMarkdown(text: string) {
  // First, normalize list-style content: insert newlines before "- " and "N. " patterns
  let normalized = text
    .replace(/ - /g, '\n- ')
    .replace(/ (\d+)\. /g, '\n$1. ');

  const parts: React.ReactNode[] = [];
  let key = 0;

  // Split by newlines first, then process each line for inline markdown
  const lines = normalized.split('\n');

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) parts.push(<br key={key++} />);

    const trimmed = line.replace(/^[-•]\s*/, '');
    const isList = line.match(/^[-•]\s/) !== null;
    const isNumbered = line.match(/^\d+\.\s/) !== null;

    const lineContent: React.ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*|`{3}([\s\S]*?)`{3}|`(.+?)`/g;
    let lastIndex = 0;
    let match;
    const processText = isList ? trimmed : line;

    while ((match = regex.exec(processText)) !== null) {
      if (match.index > lastIndex) {
        lineContent.push(processText.slice(lastIndex, match.index));
      }
      if (match[1]) {
        lineContent.push(<strong key={key++}>{match[1]}</strong>);
      } else if (match[2]) {
        lineContent.push(<code key={key++} className="block bg-[#f0eee6] px-3 py-2 rounded text-xs font-mono my-1 whitespace-pre-wrap">{match[2].trim()}</code>);
      } else if (match[3]) {
        lineContent.push(<code key={key++} className="bg-[#f0eee6] px-1 py-0.5 rounded text-xs font-mono">{match[3]}</code>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < processText.length) {
      lineContent.push(processText.slice(lastIndex));
    }

    if (isList) {
      parts.push(<span key={key++} className="flex gap-1.5 pl-2"><span className="text-[#87867f]">•</span><span>{lineContent}</span></span>);
    } else if (isNumbered) {
      parts.push(<span key={key++} className="pl-2">{lineContent}</span>);
    } else {
      parts.push(...lineContent);
    }
  });

  return parts.length > 0 ? parts : [text];
}

const SAMPLE_QUESTIONS = [
  "Am I covered for Ayurvedic treatment?",
  "What is the per-claim limit?",
  "Is teeth whitening covered?",
  "What is the waiting period for diabetes?",
  "Do I need pre-authorization for an MRI?",
  "What documents do I need to submit a claim?",
];

export default function PolicyExplorer() {
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [stats, setStats] = useState<{ totalChunks: number; bySource: Record<string, number>; embeddingsLoaded: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchSourceFilter, setSearchSourceFilter] = useState<string>("all");

  // Q&A
  const [question, setQuestion] = useState("");
  const [qaResult, setQaResult] = useState<QAResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<QAResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Voice
  const { isSessionActive, isConnecting, volumeLevel, conversation, toggleCall } = useVapi();
  const voiceScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (voiceScrollRef.current) {
      voiceScrollRef.current.scrollTop = voiceScrollRef.current.scrollHeight;
    }
  }, [conversation]);

  // Knowledge Base filter + expanded cards
  const [kbFilter, setKbFilter] = useState<string>("all");
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/rag")
      .then(r => r.json())
      .then(data => {
        setChunks(data.chunks || []);
        setStats({ totalChunks: data.totalChunks, bySource: data.bySource, embeddingsLoaded: data.embeddingsLoaded });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, topK: 8, source: searchSourceFilter === "all" ? undefined : searchSourceFilter }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch { /* */ }
    setSearching(false);
  }

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setAsking(false);
  }

  async function handleAsk(q?: string) {
    const finalQ = q || question;
    if (!finalQ.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAsking(true);
    setQuestion(finalQ);
    try {
      const res = await fetch("/api/rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: finalQ }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.error || !data.answer) {
        setQaResult({ question: finalQ, answer: data.error || 'Something went wrong — please try again.', sources: [] });
      } else {
        const safe = { ...data, sources: data.sources || [] };
        setQaResult(safe);
        setQaHistory(prev => [safe, ...prev]);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setQaResult({ question: finalQ, answer: 'Network error — the server may be busy. Please try again in a moment.', sources: [] });
    }
    setAsking(false);
  }

  function toggleChunk(id: string) {
    setExpandedChunks(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const filteredChunks = kbFilter === "all" ? chunks : chunks.filter(c => c.source === kbFilter);

  // Poll embedding status on mount
  const [embeddingReady, setEmbeddingReady] = useState(false);
  const [embeddingInitializing, setEmbeddingInitializing] = useState(false);
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/rag/status");
        const data = await res.json();
        if (!active) return;
        setEmbeddingReady(data.ready);
        setEmbeddingInitializing(data.initializing);
        if (!data.ready) setTimeout(poll, 3000);
      } catch { /* */ }
    }
    poll();
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-8 bg-[#faf9f5] min-h-screen">
      {/* Embedding loading banner */}
      {!embeddingReady && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 text-center">
          <span className="inline-block animate-pulse mr-2">&#9679;</span>
          {embeddingInitializing
            ? "Loading AI embedding model (~23MB). First query may take 20-30 seconds..."
            : "AI embeddings not yet initialized. They will load on the first query."}
        </div>
      )}

      {/* Header — centered */}
      <div className="text-center pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-[#141413]">Policy Explorer</h1>
        <p className="text-[#5e5d59] text-sm mt-2 max-w-lg mx-auto">
          Browse the RAG knowledge base, search policy terms, or ask natural language questions
        </p>
      </div>

      {/* Stats — centered row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-4xl mx-auto">
          <Card className="border-l-4 border-l-[#c96442] bg-[#faf9f5]">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-xs text-[#5e5d59] uppercase tracking-wider mb-1">Total Chunks</div>
              <div className="text-3xl font-semibold text-[#141413]">{stats.totalChunks}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#c96442] bg-[#faf9f5]">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-xs text-[#5e5d59] uppercase tracking-wider mb-1">📋 Policy Terms</div>
              <div className="text-3xl font-semibold text-[#141413]">{stats.bySource.policy_terms || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#8b6f4e] bg-[#faf9f5]">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-xs text-[#5e5d59] uppercase tracking-wider mb-1">⚖️ Rules</div>
              <div className="text-3xl font-semibold text-[#141413]">{stats.bySource.adjudication_rules || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#5a7a5a] bg-[#faf9f5]">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-xs text-[#5e5d59] uppercase tracking-wider mb-1">🏥 Medical</div>
              <div className="text-3xl font-semibold text-[#141413]">{stats.bySource.medical_knowledge || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#87867f] bg-[#faf9f5]">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-xs text-[#5e5d59] uppercase tracking-wider mb-1">Embeddings</div>
              <div className="text-2xl font-semibold text-[#141413]">{stats.embeddingsLoaded ? "✅ Active" : "⚠️ Keywords"}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ====== ASK ABOUT YOUR POLICY — Hero Section ====== */}
      <div className="max-w-3xl mx-auto">
        <Card className="border-2 border-[#c96442]/30 bg-gradient-to-br from-[#c96442]/5 to-[#d97757]/5 shadow-lg">
          <CardContent className="pt-6 pb-6 px-4 sm:pt-8 sm:pb-8 sm:px-8">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight text-[#141413]">Ask About Your Policy</h2>
              <p className="text-sm text-[#5e5d59]">Type a question or use voice — supports Hindi & English</p>

              {/* Sample questions — centered */}
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {SAMPLE_QUESTIONS.map((q, i) => (
                  <button key={i} onClick={() => handleAsk(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[#e8e6dc] bg-[#faf9f5] hover:bg-[#f0eee6] hover:border-[#c96442]/30 transition-all shadow-sm text-[#4d4c48]">
                    {q}
                  </button>
                ))}
              </div>

              {/* Input row — text + mic + ask */}
              <form onSubmit={(e) => { e.preventDefault(); asking ? handleStop() : handleAsk(); }} className="flex gap-2 max-w-xl mx-auto pt-2 items-stretch">
                <input className="flex-1 border border-[#e8e6dc] rounded-lg px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#c96442]/30 focus:border-[#c96442]/30 bg-[#faf9f5] text-[#141413] placeholder:text-[#87867f]" type="text"
                  value={question} onChange={e => setQuestion(e.target.value)}
                  placeholder="Ask anything about your insurance policy..." />
                <button
                  type="button"
                  onClick={toggleCall}
                  disabled={isConnecting}
                  className="h-[42px] w-[42px] shrink-0 rounded-lg flex items-center justify-center transition-all disabled:opacity-50"
                  style={isSessionActive
                    ? { background: '#b53333', color: '#fff', boxShadow: '0 0 12px rgba(181,51,51,0.3)' }
                    : { background: '#f0eee6', color: '#5e5d59', border: '1px solid #e8e6dc' }
                  }
                  title={isSessionActive ? "End voice call" : "Ask by voice"}
                >
                  {isConnecting ? (
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : isSessionActive ? (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    </svg>
                  )}
                </button>
                {asking ? (
                  <Button type="button" onClick={handleStop} className="px-6 bg-[#b53333] hover:bg-[#b53333]/80 text-white">
                    Stop
                  </Button>
                ) : (
                  <Button type="submit" disabled={!question.trim()} className="px-6 bg-[#c96442] hover:bg-[#d97757] text-white">
                    Ask
                  </Button>
                )}
              </form>
            </div>

            {/* Voice conversation transcript */}
            {isSessionActive && (
              <div className="mt-5 rounded-xl border-2 border-[#c96442]/40 overflow-hidden" style={{ background: '#faf9f5' }}>
                <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#e8e6dc]" style={{ background: 'rgba(201,100,66,0.06)' }}>
                  <span className="w-2 h-2 rounded-full bg-[#27a644] animate-pulse" />
                  <span className="text-xs font-semibold text-[#c96442]">Voice Active</span>
                  <span className="text-[10px] text-[#87867f] ml-auto">Hindi & English</span>
                  {/* Volume bars */}
                  <div className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="w-[3px] rounded-full transition-all duration-150"
                        style={{ height: `${40 + i * 15}%`, background: isSessionActive && volumeLevel > (i + 1) / 5 * 0.5 ? '#c96442' : '#e8e6dc' }} />
                    ))}
                  </div>
                </div>
                <div ref={voiceScrollRef} className="px-4 py-3 space-y-2 max-h-[240px] overflow-y-auto min-h-[80px]">
                  {conversation.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <div className="w-5 h-5 rounded-full animate-pulse" style={{ background: 'rgba(201,100,66,0.3)' }} />
                      <p className="text-sm text-[#5e5d59]">Listening... ask about your policy</p>
                    </div>
                  ) : (
                    conversation.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed"
                          style={msg.role === "user"
                            ? { background: '#c96442', color: '#fff', borderBottomRightRadius: '4px' }
                            : { background: '#f0eee6', color: '#141413', borderBottomLeftRadius: '4px' }
                          }>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: '#e8e6dc', background: '#f0eee6' }}>
                  <p className="text-[10px] text-[#87867f]">Powered by Vapi + Qdrant + Groq</p>
                  <button onClick={toggleCall} className="text-[10px] font-semibold text-[#b53333] hover:underline">End Call</button>
                </div>
              </div>
            )}

            {/* Voice ended — show conversation summary */}
            {!isSessionActive && conversation.length > 0 && (
              <div className="mt-5 rounded-xl border border-[#e8e6dc] overflow-hidden" style={{ background: '#faf9f5' }}>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8e6dc]" style={{ background: '#f0eee6' }}>
                  <span className="text-xs font-semibold text-[#5e5d59]">Voice Conversation</span>
                  <span className="text-[10px] text-[#87867f] ml-auto">{conversation.length} messages</span>
                </div>
                <div className="px-4 py-3 space-y-2 max-h-[200px] overflow-y-auto">
                  {conversation.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed"
                        style={msg.role === "user"
                          ? { background: '#c96442', color: '#fff', borderBottomRightRadius: '4px' }
                          : { background: '#f0eee6', color: '#141413', borderBottomLeftRadius: '4px', border: '1px solid #e8e6dc' }
                        }>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Text Q&A answer */}
            {qaResult && (
              <div className="space-y-3 mt-6">
                <div className="p-5 rounded-xl bg-[#faf9f5] border border-[#e8e6dc] shadow-sm">
                  <div className="text-xs text-[#5e5d59] mb-2 font-medium text-center">Q: {qaResult.question}</div>
                  <div className="text-sm leading-relaxed whitespace-pre-line text-[#141413]">{renderMarkdown(qaResult.answer)}</div>
                </div>
                {qaResult.sources?.length > 0 && (
                  <div>
                    <div className="text-xs text-[#5e5d59] mb-2 text-center">Sources used</div>
                    <div className="space-y-1">
                      {qaResult.sources.slice(0, 3).map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-[#faf9f5] border border-[#e8e6dc]">
                          <Badge className={`text-xs ${SOURCE_COLORS[s.source] || ""}`}>{s.source}</Badge>
                          <span className="text-[#5e5d59] truncate flex-1">{s.text.slice(0, 100)}...</span>
                          <span className="font-mono text-[#5e5d59]">{(s.similarity * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Semantic Search */}
      <Card className="max-w-4xl mx-auto bg-[#faf9f5] border-[#e8e6dc]">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-[#141413]">🔍 Semantic Search</CardTitle>
          <p className="text-xs text-[#5e5d59]">Find relevant policy sections using semantic similarity</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <select className="border border-[#e8e6dc] rounded px-3 py-2 text-sm bg-[#faf9f5] text-[#141413]" value={searchSourceFilter} onChange={e => setSearchSourceFilter(e.target.value)}>
              <option value="all">All Sources</option>
              <option value="policy_terms">Policy Terms</option>
              <option value="adjudication_rules">Adjudication Rules</option>
              <option value="medical_knowledge">Medical Knowledge</option>
            </select>
            <input className="flex-1 border border-[#e8e6dc] rounded px-4 py-2 text-sm bg-[#faf9f5] text-[#141413] placeholder:text-[#87867f]" type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} placeholder="Search: dental coverage, MRI pre-auth, waiting period..." />
            <Button type="submit" variant="outline" disabled={searching} className="border-[#e8e6dc] text-[#4d4c48] hover:bg-[#f0eee6]">
              {searching ? "Searching..." : "Search"}
            </Button>
          </form>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r, i) => (
                <div key={i} className="p-3 rounded-lg border border-[#e8e6dc] bg-[#faf9f5] hover:bg-[#f0eee6] transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{SOURCE_ICONS[r.source] || "📄"}</span>
                    <Badge className={`text-xs ${SOURCE_COLORS[r.source] || ""}`}>{r.source}</Badge>
                    <Badge variant="secondary" className="text-xs bg-[#f0eee6] text-[#4d4c48]">{r.category}</Badge>
                    <span className="text-xs text-[#5e5d59] ml-auto font-mono font-semibold">
                      {(r.similarity * 100).toFixed(0)}% match
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#141413]">{renderMarkdown(r.text)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Base Browser */}
      <Card className="max-w-4xl mx-auto bg-[#faf9f5] border-[#e8e6dc]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#141413]">📚 Knowledge Base</CardTitle>
            <div className="flex gap-1">
              {["all", "policy_terms", "adjudication_rules", "medical_knowledge"].map(s => (
                <Button key={s} variant={kbFilter === s ? "default" : "outline"} className={`text-xs h-7 px-2 ${kbFilter === s ? "bg-[#c96442] hover:bg-[#d97757] text-white" : "border-[#e8e6dc] text-[#4d4c48] hover:bg-[#f0eee6]"}`}
                  onClick={() => setKbFilter(s)}>
                  {s === "all" ? "All" : s === "policy_terms" ? "📋 Policy" : s === "adjudication_rules" ? "⚖️ Rules" : "🏥 Medical"}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-[#5e5d59]">Click on any chunk to expand its full content. {filteredChunks.length} chunks shown.</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse bg-[#f0eee6] rounded h-12" />)}</div>
          ) : filteredChunks.length === 0 ? (
            <div className="text-center py-8 text-[#5e5d59]">
              <p className="text-lg mb-1">No chunks found</p>
              <p className="text-sm">No knowledge chunks available for this source filter.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredChunks.map((chunk) => {
                const isExpanded = expandedChunks[chunk.id] ?? false;
                return (
                  <button
                    key={chunk.id}
                    onClick={() => toggleChunk(chunk.id)}
                    className="w-full text-left p-3 rounded-lg border border-[#e8e6dc] hover:bg-[#f0eee6] hover:shadow-sm transition-all text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-[#5e5d59]">{chunk.id}</span>
                      <Badge className={`text-xs ${SOURCE_COLORS[chunk.source] || ""}`}>{chunk.source}</Badge>
                      <Badge variant="secondary" className="text-xs bg-[#f0eee6] text-[#4d4c48]">{chunk.category}</Badge>
                      <span className="text-xs text-[#5e5d59] ml-auto">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                    {isExpanded ? (
                      <p className="text-sm leading-relaxed mt-2 whitespace-pre-wrap text-[#141413]">{renderMarkdown(chunk.text)}</p>
                    ) : (
                      <p className="text-[#5e5d59] text-xs truncate">{chunk.textPreview}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Q&A History */}
      {qaHistory.length > 1 && (
        <Card className="max-w-4xl mx-auto bg-[#faf9f5] border-[#e8e6dc]">
          <CardHeader><CardTitle className="text-sm text-center text-[#141413]">💬 Previous Questions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {qaHistory.slice(1).map((qa, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#f0eee6] border border-[#e8e6dc] text-sm">
                <p className="font-medium text-xs text-[#5e5d59]">Q: {qa.question}</p>
                <p className="mt-1 text-[#141413]">{qa.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
