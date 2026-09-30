// src/components/Tour/AppTour.jsx
//
// Self-contained guided tour — no external library. The previous version
// used react-joyride in "controlled" mode across page navigations, and its
// internal step lifecycle (STEP_AFTER / TARGET_NOT_FOUND timing) is known
// to be unreliable when the target page is still mounting. This version
// advances only when the judge clicks "Next", finds the target element by
// polling for it after navigation, and draws its own spotlight + tooltip.
// Same exports as before (default AppTour, named TourLaunchButton), so
// App.jsx does not need to change.

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const STEPS = [
  {
    path: "/dashboard",
    target: ".v-command-header",
    title: "Live, not simulated",
    content:
      "Every number on this dashboard is pulled right now from GDACS, USGS, NASA EONET and social sources.",
  },
  {
    path: "/dashboard",
    target: ".v-premium-kpi-card",
    title: "AI-scored, not just counted",
    content:
      "Each metric reflects Gemini-based severity and priority scoring on top of raw incident counts.",
  },
  {
    path: "/map",
    target: ".v-filter-dashboard-panel",
    title: "Dynamic red-zone mapping",
    content:
      "Hazard-based red zones update from live feeds. Toggle the filters to see zones and safe-site suitability change.",
  },
  {
    path: "/incidents",
    target: ".v-dash-header-actions .v-btn-primary",
    title: "Watch the triage pipeline run",
    content:
      "Clicking this runs the Gemini-powered severity, priority and red-zone classification pipeline on live data.",
  },
  {
    path: "/chat",
    target: ".v-chat-panel",
    title: "Grounded, not hallucinated",
    content:
      "Ask a natural-language question here. Answers are retrieved from the actual incident store, with citations.",
  },
  {
    path: "/trust-ledger",
    target: ".v-trust-ledger-header",
    title: "Human-verified alert trail",
    content:
      "Every relocation alert dispatch is logged here so unverified reports cannot silently trigger an evacuation SMS.",
  },
];

export default function AppTour() {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const rafRef = useRef(null);

  const step = active ? STEPS[index] : null;

  // Start the tour from anywhere: window.startKavachTour()
  useEffect(() => {
    window.startKavachTour = () => {
      setIndex(0);
      setActive(true);
    };
    return () => {
      delete window.startKavachTour;
    };
  }, []);

  // Whenever the active step changes, make sure we're on the right page.
  useEffect(() => {
    if (step && location.pathname !== step.path) {
      navigate(step.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step && step.path]);

  // Poll for the target element (it may not exist yet right after a
  // navigation) and keep its position updated.
  useEffect(() => {
    setRect(null);
    if (!step) return undefined;

    let tries = 0;
    const tick = () => {
      const el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        rafRef.current = requestAnimationFrame(tick); // keep tracking on scroll/resize
      } else if (tries < 120) {
        tries += 1;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setRect(null);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [step && step.target, location.pathname]);

  if (!active || !step) return null;

  const isLast = index === STEPS.length - 1;
  const next = () => (isLast ? setActive(false) : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const stop = () => setActive(false);

  const tooltipTop = rect
    ? Math.min(rect.top + rect.height + 16, window.innerHeight - 220)
    : window.innerHeight / 2 - 90;
  const tooltipLeft = rect
    ? Math.min(Math.max(rect.left, 16), window.innerWidth - 356)
    : window.innerWidth / 2 - 170;

  return (
    <>
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            border: "3px solid #1d4ed8",
            borderRadius: 10,
            boxShadow: "0 0 0 9999px rgba(2,6,23,0.6)",
            zIndex: 99990,
            pointerEvents: "none",
            transition: "top 0.15s ease, left 0.15s ease",
          }}
        />
      )}
      {!rect && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.6)",
            zIndex: 99990,
          }}
        />
      )}
      <div
        style={{
          position: "fixed",
          top: tooltipTop,
          left: tooltipLeft,
          width: 340,
          background: "#0f172a",
          color: "#f1f5f9",
          borderRadius: 12,
          padding: "16px 18px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          zIndex: 99991,
          fontFamily: "inherit",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>
          Step {index + 1} of {STEPS.length}
        </div>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 16 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14, opacity: 0.9 }}>
          {step.content}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={stop}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Skip tour
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {index > 0 && (
              <button
                onClick={prev}
                style={{
                  background: "transparent",
                  border: "1px solid #334155",
                  color: "#f1f5f9",
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              style={{
                background: "#1d4ed8",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Floating launcher button, visible everywhere the tour is mounted.
export function TourLaunchButton() {
  return (
    <button
      onClick={() => window.startKavachTour && window.startKavachTour()}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        padding: "10px 16px",
        borderRadius: 999,
        border: "none",
        background: "#1d4ed8",
        color: "#fff",
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      }}
    >
      Take the guided tour
    </button>
  );
}
