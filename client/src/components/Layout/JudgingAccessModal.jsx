import React, { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { JUDGING_MODE } from "../../config";
import "./JudgingAccessModal.css";

// ===========================================================================
// TEMPORARY — HACKATHON JUDGING WINDOW ONLY
// ===========================================================================
// Shown once per browser session (sessionStorage, not localStorage — so it
// doesn't nag a returning judge across days) on any successful login, while
// JUDGING_MODE is on. Explains that every account has full admin-level
// access right now specifically so judges can explore everything, even if
// they sign in with their own email instead of the pre-made demo account.
//
// TO REVERT AFTER JUDGING: set VITE_JUDGING_MODE=false (see config.js).
// Once off, this component always renders null and can be deleted along
// with its import in App.jsx / wherever it's mounted.
const JUDGING_MODAL_SESSION_FLAG = "kavach_judging_modal_seen";

const JudgingAccessModal = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!JUDGING_MODE) return;
    if (sessionStorage.getItem(JUDGING_MODAL_SESSION_FLAG) === "true") return;
    setVisible(true);
    sessionStorage.setItem(JUDGING_MODAL_SESSION_FLAG, "true");
  }, []);

  if (!JUDGING_MODE || !visible) return null;

  const dismiss = () => setVisible(false);

  return (
    <div className="v-judging-modal-overlay" onClick={dismiss}>
      <div className="v-judging-modal" onClick={(e) => e.stopPropagation()}>
        <button className="v-judging-modal__close" onClick={dismiss} aria-label="Dismiss">
          <X size={18} />
        </button>
        <div className="v-judging-modal__icon">
          <ShieldCheck size={28} />
        </div>
        <h2>This is a judging-evaluation build</h2>
        <p>
          To make sure you can see every feature — regardless of which account
          you signed in with — <strong>full admin access is temporarily enabled
          for all accounts</strong> during the evaluation period. This isn't how
          the app works normally; access is role-based in production.
        </p>
        <p className="v-judging-modal__note">
          Look for the <strong>Admin Panel</strong> link in the navigation to
          review account approvals and citizen report verification.
        </p>
        <button className="v-judging-modal__cta" onClick={dismiss}>
          Got it — let's explore
        </button>
      </div>
    </div>
  );
};

export default JudgingAccessModal;