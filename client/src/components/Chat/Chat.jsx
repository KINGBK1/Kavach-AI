import React, { useEffect, useRef, useState } from "react";
import { Send, Bot, User as UserIcon, Sparkles, MapPin, Copy, Check, Trash2, RotateCcw } from "lucide-react";
import PageShell from "../Layout/PageShell";
import { askAI } from "../../api/varunaApi";
import { lookUpLocationName } from "../../utils/geolocation";
import "./Chat.css";

const SUGGESTIONS = [
  "What are the most critical incidents right now?",
  "Summarize today's wildfire activity",
  "Which region has the highest concentration of incidents?",
  "Are there any incidents that need immediate evacuation?",
];

const WELCOME_MESSAGE = {
  role: "assistant",
  answer:
    "I'm Kavach. Ask me about current incidents — severity, location, trends, or what needs attention first.",
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked — silently ignore, this is a convenience action.
    }
  };
  return (
    <button className="v-chat-copy-btn" onClick={handleCopy} title="Copy response" aria-label="Copy response">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
};

const Chat = () => {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [locationNames, setLocationNames] = useState({});
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    const incidentsToResolve = [];

    messages.forEach((m) => {
      if (m.role !== "assistant" || !Array.isArray(m.relevant_incidents)) return;
      m.relevant_incidents.forEach((incident) => {
        if (incident && typeof incident === "object") {
          const lat = incident.latitude ?? incident.lat ?? incident.coordinates?.latitude;
          const lng = incident.longitude ?? incident.lng ?? incident.coordinates?.longitude;
          if (lat != null && lng != null) {
            const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
            if (!(key in locationNames)) {
              incidentsToResolve.push({ key, lat, lng });
            }
          }
        }
      });
    });

    if (!incidentsToResolve.length) return;

    let active = true;
    const loadNames = async () => {
      const newNames = {};
      await Promise.all(
        incidentsToResolve.map(async ({ key, lat, lng }) => {
          const name = await lookUpLocationName(lat, lng);
          if (active) {
            newNames[key] = name;
          }
        })
      );
      if (active) {
        setLocationNames((prev) => ({ ...prev, ...newNames }));
      }
    };

    loadNames();
    return () => {
      active = false;
    };
  }, [messages, locationNames]);

  const send = async (question) => {
    const q = (question ?? input).trim();
    if (!q || sending) return;
    setMessages((prev) => [...prev, { role: "user", answer: q }]);
    setInput("");
    setSending(true);
    try {
      const result = await askAI(q);
      const normalizedResult = {
        ...result,
        answer: typeof result.answer === "string" ? result.answer : JSON.stringify(result.answer || result),
      };
      setMessages((prev) => [...prev, { role: "assistant", ...normalizedResult }]);
    } catch (err) {
      console.error("Chat request failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          answer: "I couldn't reach the analysis service just now. Check that the backend is running and try again.",
          isError: true,
          failedQuery: q,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const retryLast = (query) => {
    // Drop the trailing failed assistant bubble before resending so the
    // conversation doesn't accumulate duplicate error messages on retry.
    setMessages((prev) => prev.slice(0, -1));
    send(query);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearConversation = () => {
    setMessages([WELCOME_MESSAGE]);
    setLocationNames({});
  };

  const hasConversation = messages.length > 1;

  return (
    <PageShell noFooter>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Ask Kavach</h1>
          <p className="v-dash-subtitle">Natural-language answers grounded in the current incident set.</p>
        </div>
        {hasConversation && (
          <div className="v-dash-header-actions">
            <button className="v-btn" onClick={clearConversation}>
              <Trash2 size={14} /> Clear conversation
            </button>
          </div>
        )}
      </div>

      <div className="v-chat-panel">
        <div className="v-chat-scroll" ref={scrollRef}>
          {messages.map((m, idx) => (
            <div key={idx} className={`v-chat-row ${m.role}`}>
              <div className="v-chat-avatar">
                {m.role === "assistant" ? <Bot size={16} /> : <UserIcon size={16} />}
              </div>
              <div className={`v-chat-bubble ${m.isError ? "error" : ""}`}>
                <p>{m.answer}</p>

                {m.isError && m.failedQuery && (
                  <button className="v-chat-retry-btn" onClick={() => retryLast(m.failedQuery)}>
                    <RotateCcw size={12} /> Retry
                  </button>
                )}

                {!!m.relevant_incidents?.length && (
                  <div className="v-chat-incidents">
                    {m.relevant_incidents.map((inc, i) => {
                      if (inc && typeof inc === "object") {
                        const lat = inc.latitude ?? inc.lat ?? inc.coordinates?.latitude;
                        const lng = inc.longitude ?? inc.lng ?? inc.coordinates?.longitude;
                        const key = lat != null && lng != null ? `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}` : null;
                        const locationName = key ? locationNames[key] : null;
                        const title = inc.title || inc.incident_id || "Incident";
                        const coords = lat != null && lng != null ? `(${Number(lat).toFixed(3)}, ${Number(lng).toFixed(3)})` : "";

                        return (
                          <span key={i} className="v-chat-incident-chip">
                            <MapPin size={12} />
                            <strong>{title}</strong>
                            {locationName ? ` — ${locationName}` : coords ? ` — ${coords}` : ""}
                          </span>
                        );
                      }
                      return (
                        <span key={i} className="v-chat-incident-chip">
                          {String(inc)}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="v-chat-bubble-footer">
                  {m.role === "assistant" && m.model && (
                    <div className="v-chat-meta v-mono">
                      {m.model} · {(m.confidence * 100).toFixed(0)}% confidence ·{" "}
                      {(m.processing_time_ms / 1000).toFixed(1)}s
                    </div>
                  )}
                  {m.role === "assistant" && !m.isError && <CopyButton text={m.answer} />}
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="v-chat-row assistant">
              <div className="v-chat-avatar"><Bot size={16} /></div>
              <div className="v-chat-bubble v-chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="v-chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="v-chat-suggestion-chip" onClick={() => send(s)}>
                <Sparkles size={12} /> {s}
              </button>
            ))}
          </div>
        )}

        <form className="v-chat-input-row" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about current incidents… (Enter to send, Shift+Enter for a new line)"
            disabled={sending}
          />
          <button type="submit" className="v-btn v-btn-primary" disabled={sending || !input.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </PageShell>
  );
};

export default Chat;