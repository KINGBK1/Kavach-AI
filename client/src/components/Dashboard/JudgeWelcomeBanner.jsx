import React, { useEffect, useState } from "react";
import { Shield, X } from "lucide-react";
import "./JudgeWelcomeBanner.css";

// Set by SignIn.jsx right before the judge demo login request fires.
// sessionStorage (not localStorage) so it only persists for this tab/visit
// — a judge who closes the tab and comes back later isn't stuck seeing a
// "welcome" banner forever, and it doesn't leak into a normal user's
// session if they happen to share a browser profile.
export const JUDGE_SESSION_FLAG = "kavach_judge_session";

const JudgeWelcomeBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(JUDGE_SESSION_FLAG) === "true") {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.removeItem(JUDGE_SESSION_FLAG);
  };

  if (!visible) return null;

  return (
    <div className="v-judge-banner">
      <div className="v-judge-banner__icon">
        <Shield size={20} />
      </div>
      <div className="v-judge-banner__body">
        <strong>Welcome — thanks for reviewing Kavach!</strong>
        <p>
          This dashboard shows live, AI-triaged disaster data pulled from GDACS, USGS, NASA EONET,
          and social sources, refreshed automatically. A few places worth a quick look:
        </p>
        <ul>
          <li><strong>Live Map</strong> — real-time incidents with a "Currently Active" filter that
            tells still-ongoing events apart from resolved ones.</li>
          <li><strong>Reports</strong> — click "Analyze an incident" to see the Gemini-powered
            triage pipeline run on a report you submit yourself.</li>
          <li><strong>Chat</strong> — ask a natural-language question like
            "which region has the highest concentration of incidents?"</li>
        </ul>
        <p className="v-judge-banner__note">
          You're signed in on a shared demo account, so please don't rely on anything you enter here
          being private — feel free to explore freely otherwise.
        </p>
      </div>
      <button className="v-judge-banner__close" onClick={dismiss} aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  );
};

export default JudgeWelcomeBanner;