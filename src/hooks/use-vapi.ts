"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Vapi from "@vapi-ai/web";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!;
const ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!;

export interface VapiMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export function useVapi() {
  const vapiRef = useRef<Vapi | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [conversation, setConversation] = useState<VapiMessage[]>([]);

  const initVapi = useCallback(() => {
    if (vapiRef.current) return;
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setIsSessionActive(true);
      setIsConnecting(false);
    });

    vapi.on("call-end", () => {
      setIsSessionActive(false);
      setIsConnecting(false);
    });

    vapi.on("volume-level", (level: number) => setVolumeLevel(level));

    vapi.on("message", (msg: Record<string, unknown>) => {
      if (msg.type === "transcript" && msg.transcriptType === "final") {
        setConversation((prev) => [
          ...prev,
          {
            role: msg.role as "user" | "assistant",
            text: msg.transcript as string,
            timestamp: Date.now(),
          },
        ]);
      }
    });

    vapi.on("error", (err: unknown) => {
      console.error("Vapi error:", err);
      setIsConnecting(false);
    });
  }, []);

  useEffect(() => {
    initVapi();
    return () => {
      vapiRef.current?.stop();
      vapiRef.current = null;
    };
  }, [initVapi]);

  const startCall = useCallback(async () => {
    if (!vapiRef.current) return;
    setIsConnecting(true);
    setConversation([]);
    try {
      await vapiRef.current.start(ASSISTANT_ID);
    } catch (err) {
      console.error("Failed to start call:", err);
      setIsConnecting(false);
    }
  }, []);

  const stopCall = useCallback(() => {
    vapiRef.current?.stop();
    setIsSessionActive(false);
  }, []);

  const toggleCall = useCallback(() => {
    if (isSessionActive) stopCall();
    else startCall();
  }, [isSessionActive, startCall, stopCall]);

  return {
    isSessionActive,
    isConnecting,
    volumeLevel,
    conversation,
    toggleCall,
    startCall,
    stopCall,
  };
}
