import React from "react";
import { Shield, Loader2 } from "lucide-react";
import "./CreativeLoaders.css";

/** Concentric radar scan with pulse sweep & center indicator */
export const RadarPulseLoader = ({ label = "Scanning live telemetry feeds..." }) => {
  return (
    <div className="kv-radar-container">
      <div className="kv-radar-wrapper">
        <div className="kv-radar-ring" />
        <div className="kv-radar-ring" />
        <div className="kv-radar-ring" />
        <div className="kv-radar-sweep" />
        <div className="kv-radar-core" />
      </div>
      {label && <div className="kv-loader-text v-mono">{label}</div>}
    </div>
  );
};

/** Hexagonal shield with orbiting satellite dots */
export const ShieldAgentLoader = ({ label = "AI Verification Agent active..." }) => {
  return (
    <div className="kv-shield-container">
      <div className="kv-shield-hex">
        <div className="kv-shield-icon-bg" />
        <div className="kv-shield-orbit" />
        <Shield size={28} className="kv-shield-icon" />
      </div>
      {label && <div className="kv-loader-text v-mono">{label}</div>}
    </div>
  );
};

/** Cybernetic wave bar typing loader for chat / NLP responses */
export const QuantumTypingLoader = ({ message = "Synthesizing intelligence response..." }) => {
  return (
    <div className="kv-quantum-box">
      <div className="kv-quantum-wave">
        <div className="kv-quantum-bar" />
        <div className="kv-quantum-bar" />
        <div className="kv-quantum-bar" />
        <div className="kv-quantum-bar" />
      </div>
      <span className="kv-quantum-msg v-mono">{message}</span>
    </div>
  );
};

/** High-tech shimmering skeleton placeholder */
export const KavachSkeleton = ({ height = 120, width = "100%", borderRadius = "12px", className = "" }) => {
  return (
    <div
      className={`kv-skeleton-pulse ${className}`}
      style={{ height, width, borderRadius }}
    />
  );
};

/** Inline button loading spinner */
export const ButtonSpinner = ({ size = 15 }) => {
  return <Loader2 size={size} className="spinning" />;
};
