"use client";

import { useState, useRef, useEffect } from "react";
import { useVapi, VapiMessage } from "@/hooks/use-vapi";

function VolumeIndicator({ level, isActive }: { level: number; isActive: boolean }) {
  const bars = 5;
  return (
    <div className="flex items-end gap-[3px] h-4" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const active = isActive && level > threshold * 0.5;
        return (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-150"
            style={{
              height: `${40 + i * 15}%`,
              background: active ? '#c96442' : '#e8e6dc',
            }}
          />
        );
      })}
    </div>
  );
}

function TranscriptBubble({ msg }: { msg: VapiMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed"
        style={isUser
          ? { background: '#c96442', color: '#fff', borderBottomRightRadius: '4px' }
          : { background: '#f0eee6', color: '#141413', borderBottomLeftRadius: '4px' }
        }
      >
        {msg.text}
      </div>
    </div>
  );
}

export function VoiceAssistant() {
  const { isSessionActive, isConnecting, volumeLevel, conversation, toggleCall } = useVapi();
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation]);

  // Auto-open panel when call starts
  useEffect(() => {
    if (isSessionActive) setIsOpen(true);
  }, [isSessionActive]);

  return (
    <>
      {/* Floating action button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{
            background: isSessionActive
              ? 'linear-gradient(135deg, #c96442, #b5532f)'
              : 'linear-gradient(135deg, #141413, #2d2d2a)',
            boxShadow: isSessionActive
              ? '0 4px 20px rgba(201,100,66,0.4)'
              : '0 4px 16px rgba(0,0,0,0.2)',
          }}
          aria-label={isSessionActive ? "Voice call active — open panel" : "Start voice assistant"}
        >
          {isSessionActive ? (
            <div className="relative">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#27a644] rounded-full border-2 border-white animate-pulse" />
            </div>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
      )}

      {/* Voice panel */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[360px] max-h-[520px] rounded-2xl border-2 shadow-2xl flex flex-col overflow-hidden"
          style={{
            background: '#faf9f5',
            borderColor: isSessionActive ? '#c96442' : '#e8e6dc',
            boxShadow: isSessionActive
              ? '0 8px 40px rgba(201,100,66,0.2)'
              : '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#e8e6dc' }}>
            <div className="flex items-center gap-2 flex-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: isSessionActive ? 'rgba(201,100,66,0.15)' : '#f0eee6' }}
              >
                {isSessionActive ? '🎙️' : '🤖'}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#141413' }}>
                  Voice Assistant
                </p>
                <p className="text-[11px]" style={{ color: isSessionActive ? '#c96442' : '#87867f' }}>
                  {isConnecting ? 'Connecting...' : isSessionActive ? 'Listening' : 'Hindi & English'}
                </p>
              </div>
            </div>
            {isSessionActive && <VolumeIndicator level={volumeLevel} isActive={isSessionActive} />}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[#f0eee6] transition-colors"
              style={{ color: '#87867f' }}
              aria-label="Minimize voice panel"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="14" x2="14" y2="14" />
              </svg>
            </button>
          </div>

          {/* Transcript area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-[200px]"
          >
            {conversation.length === 0 && !isSessionActive && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="text-4xl mb-3">🏥</div>
                <p className="text-sm font-medium" style={{ color: '#141413' }}>
                  Policy Assistant
                </p>
                <p className="text-xs mt-1.5 max-w-[240px]" style={{ color: '#87867f' }}>
                  Ask policy questions, understand claim decisions, or check claim status — by voice. Hindi & English.
                </p>
              </div>
            )}

            {conversation.length === 0 && isSessionActive && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(201,100,66,0.1)' }}>
                  <div className="w-6 h-6 rounded-full animate-pulse" style={{ background: '#c96442' }} />
                </div>
                <p className="text-sm" style={{ color: '#5e5d59' }}>
                  Listening... speak now
                </p>
              </div>
            )}

            {conversation.map((msg, i) => (
              <TranscriptBubble key={i} msg={msg} />
            ))}
          </div>

          {/* Call controls */}
          <div className="px-4 py-3 border-t" style={{ borderColor: '#e8e6dc', background: '#f0eee6' }}>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleCall}
                disabled={isConnecting}
                className="flex-1 h-10 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="3" width="10" height="10" rx="1" />
                    </svg>
                    End Call
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    </svg>
                    Start Voice Call
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-center mt-2" style={{ color: '#87867f' }}>
              {isSessionActive
                ? "Ask about coverage, claim decisions, or policy limits"
                : "Powered by Vapi · Qdrant · Groq"
              }
            </p>
          </div>
        </div>
      )}
    </>
  );
}
