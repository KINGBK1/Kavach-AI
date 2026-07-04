// src/components/common/InfoTooltip.jsx
//
// Small "i" icon that shows an explanatory tooltip on hover/focus/tap.
// Drop this next to any chart heading so a normal user understands what
// the visualization actually represents.
//
// Positioning: the bubble is rendered through a portal with
// `position: fixed`, and its coordinates are calculated from the
// trigger's actual bounding box, then clamped to stay within the
// viewport. This is what makes it safe to use inside narrow KPI cards —
// a naive `left: 0` bubble anchored to an icon near the right edge of a
// card overflows the card and overlaps neighboring content (which is
// exactly what happened before: the bubble opened to the right and got
// clipped/overlapped the trend icon next to it). Now it measures
// available space and clamps horizontally, and flips above the icon if
// there isn't enough room below.
//
// Usage:
//   <div className="v-card-header-context">
//     <Activity size={15} className="v-panel-icon" />
//     <h3>Incident chronology trend</h3>
//     <InfoTooltip text="Counts how many incidents were analyzed in each
//       time bucket. Taller bars/areas mean more incidents were logged
//       around that time." />
//   </div>

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import "./InfoTooltip.css";

const BUBBLE_WIDTH = 240;
const VIEWPORT_MARGIN = 12;
const GAP_FROM_TRIGGER = 8;

const InfoTooltip = ({ text, title }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null); // { top, left, placement, arrowLeft }
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);

  const computePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Horizontal: prefer aligning the bubble's left edge with the trigger,
    // but clamp so it never runs past either viewport edge.
    let left = rect.left;
    const maxLeft = viewportWidth - BUBBLE_WIDTH - VIEWPORT_MARGIN;
    if (left > maxLeft) left = maxLeft;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    // Vertical: prefer below the icon; flip above if there isn't enough
    // room below (estimate bubble height generously since content varies).
    const estimatedBubbleHeight = 120;
    const spaceBelow = viewportHeight - rect.bottom;
    const placement = spaceBelow < estimatedBubbleHeight + VIEWPORT_MARGIN ? "top" : "bottom";
    const top = placement === "bottom" ? rect.bottom + GAP_FROM_TRIGGER : rect.top - GAP_FROM_TRIGGER;

    // Arrow should still visually point at the trigger icon even though
    // the bubble itself got clamped horizontally.
    const arrowLeft = Math.min(
      Math.max(rect.left + rect.width / 2 - left, 14),
      BUBBLE_WIDTH - 14
    );

    setCoords({ top, left, placement, arrowLeft });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const handleReposition = () => computePosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target) &&
        bubbleRef.current &&
        !bubbleRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <span
      className="v-info-tooltip-wrap"
      ref={wrapperRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        ref={triggerRef}
        className="v-info-tooltip-trigger"
        aria-label={title ? `About ${title}` : "More information"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info size={13} />
      </button>
      {open && coords &&
        createPortal(
          <div
            ref={bubbleRef}
            className={`v-info-tooltip-bubble v-info-tooltip-${coords.placement}`}
            role="tooltip"
            style={{
              top: coords.top,
              left: coords.left,
              width: BUBBLE_WIDTH,
              "--arrow-left": `${coords.arrowLeft}px`
            }}
          >
            {title && <strong className="v-info-tooltip-title">{title}</strong>}
            <p>{text}</p>
          </div>,
          document.body
        )}
    </span>
  );
};

export default InfoTooltip;