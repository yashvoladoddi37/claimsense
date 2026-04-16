"use client";

import { useEffect, useRef } from "react";
import { useVapi, VapiMessage } from "@/hooks/use-vapi";

function VolumeRing({ level, isActive }: { level: number; isActive: boolean }) {
  const scale = isActive ? 1 + level * 0.4 : 1;
  return (
    <div className="relative w-20 h-20" aria-hidden="true">
      {/* Outer pulse ring */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-200"
        style={{
          transform: `scale(${scale})`,
          background: isActive
            ? `radial-gradient(circle, rgba(201,100,66,${0.08 + level * 0.12}) 0%, transparent 70%)`
            : 'transparent',
        }}
      />
      {/* Inner ring */}
      <div
        className="absolute inset-2 rounded-full border-2 transition-all duration-200"
        style={{
          borderColor: isActive ? `rgba(201,100,66,${0.4 + level * 0.4})` : '#e8e6dc',
          background: isActive ? 'rgba(201,100,66,0.06)' : '#f0eee6',
        }}
      />
      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isActive ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c96442" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#87867f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        )}
      </div>
    </div>
  );
}

function TranscriptLine({ msg }: { msg: VapiMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[80%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed"
        style={isUser
          ? { background: '#c96442', color: '#fff', borderBottomRightRadius: '6px' }
          : { background: '#f0eee6', color: '#141413', borderBottomLeftRadius: '6px', border: '1px solid #e8e6dc' }
        }
      >
        {msg.text}
      </div>
    </div>
  );
}

export function VoiceClaimPanel() {
  const { isSessionActive, isConnecting, volumeLevel, conversation, toggleCall } = useVapi();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation]);

  return (
    <div
      className="rounded-xl border-2 overflow-hidden transition-all"
      style={{
        borderColor: isSessionActive ? '#c96442' : '#e8e6dc',
        background: '#faf9f5',
        boxShadow: isSessionActive ? '0 4px 24px rgba(201,100,66,0.12)' : 'none',
      }}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Left: call controls */}
        <div className="flex flex-col items-center justify-center px-6 py-6 sm:py-8 sm:border-r" style={{ borderColor: '#e8e6dc' }}>
          <VolumeRing level={volumeLevel} isActive={isSessionActive} />

          <button
            onClick={toggleCall}
            disabled={isConnecting}
            className="mt-4 px-6 h-10 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
            style={isSessionActive
              ? { background: '#b53333', color: '#fff' }
              : { background: '#141413', color: '#fff' }
            }
          >
            {isConnecting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting...
              </>
            ) : isSessionActive ? (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
                End Call
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
                Start Voice Call
              </>
            )}
          </button>

          <p className="text-[10px] mt-2.5 text-center" style={{ color: '#87867f' }}>
            Hindi & English supported
          </p>
        </div>

        {/* Right: transcript + info */}
        <div className="flex-1 min-w-0">
          {/* Transcript or info */}
          {conversation.length > 0 ? (
            <div
              ref={scrollRef}
              className="px-4 py-4 space-y-2 overflow-y-auto"
              style={{ maxHeight: '200px' }}
            >
              {conversation.map((msg, i) => (
                <TranscriptLine key={i} msg={msg} />
              ))}
            </div>
          ) : (
            <div className="px-5 py-5">
              <p className="text-sm font-semibold mb-3" style={{ color: '#141413' }}>
                {isSessionActive ? "Listening... speak now" : "Voice-First Claims"}
              </p>

              {isSessionActive ? (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#c96442' }} />
                  <p className="text-xs" style={{ color: '#5e5d59' }}>
                    Try saying "I want to file a claim" or "What is my per-claim limit?"
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: 'File a claim', desc: 'Describe your visit — the agent handles the rest', icon: '📋' },
                    { label: 'Check claim status', desc: 'Ask about any existing claim by ID', icon: '🔍' },
                    { label: 'Policy questions', desc: 'Coverage limits, exclusions, waiting periods', icon: '📚' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-2.5">
                      <span className="text-sm mt-0.5">{item.icon}</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#141413' }}>{item.label}</p>
                        <p className="text-[11px]" style={{ color: '#87867f' }}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: '#e8e6dc', background: '#f0eee6' }}>
            <p className="text-[10px]" style={{ color: '#87867f' }}>
              Powered by Vapi + Qdrant + Groq
            </p>
            {isSessionActive && (
              <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: '#c96442' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#27a644] animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
