import React, { useState, useRef, useEffect } from "react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import "../SignIn/SignIn.css";

const RESEND_COOLDOWN = 60;

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const showMessage = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => { setMessage(""); setMessageType(""); }, 6000);
  };

  const handleOtpChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSendOtp = async () => {
    if (!email.includes("@")) {
      showMessage("Please enter a valid email address.", "error");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL || "http://localhost:8080"}/api/auth/send-otp`, {
        email,
        purpose: "reset-password",
      });
      setStep("otp");
      setCountdown(RESEND_COOLDOWN);
      showMessage("If an account exists with this email, a reset code has been sent.", "success");
    } catch (err) {
      showMessage(err.response?.data?.message || "Failed to send reset code.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      showMessage("Please enter the 6-digit code.", "error");
      return;
    }
    if (password.length < 6) {
      showMessage("Password must be at least 6 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL || "http://localhost:8080"}/api/auth/verify-otp`, {
        email,
        code,
        purpose: "reset-password",
        password,
      });
      showMessage("Password reset successful! Redirecting to sign in...", "success");
      setTimeout(() => navigate("/signin"), 2000);
    } catch (err) {
      showMessage(err.response?.data?.message || "Invalid or expired code.", "error");
    } finally {
      setLoading(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const digits = text.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = ["", "", "", "", "", ""];
      digits.forEach((d, i) => { newOtp[i] = d; });
      setOtp(newOtp);
    } catch {}
  };

  return (
    <div className="page__wrapper">
      <div className="signin-layout">
        <div className="signin-layout__visuals">
          <div className="overlay"></div>
          <div className="visuals__content">
            <div className="center__welcome">
              <h1 className="center__title">Reset Password</h1>
            </div>
          </div>
        </div>

        <div className="signin-layout__form-container">
          <div className="form__header">
            <h2 className="form__title">Forgot Password</h2>
            <p className="form__subtitle">
              {step === "email"
                ? "Enter your email to receive a reset code."
                : step === "otp"
                ? "Enter the 6-digit code sent to your email."
                : "Set your new password."}
            </p>
          </div>

          <div className="form__main">
            {message && <div className={`message-box message-box--${messageType}`}>{message}</div>}

            {step === "email" ? (
              <div className="form__section">
                <div className="input__container">
                  <label htmlFor="email" className="input__label">Email</label>
                  <div className="input__wrapper">
                    <input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                      className="input__field"
                      autoFocus
                    />
                    <Mail size={20} className="input__icon" />
                  </div>
                </div>
                <div className="form__actions" style={{ marginTop: 16 }}>
                  <button onClick={handleSendOtp} disabled={loading} className="button button--primary">
                    {loading ? "Sending..." : "Send Reset Code →"}
                  </button>
                </div>
              </div>
            ) : step === "otp" ? (
              <div className="form__section">
                <div className="otp-step-indicator">
                  <span className="otp-step-back" onClick={() => { setStep("email"); setOtp(["", "", "", "", "", ""]); }}>
                    ← Change email
                  </span>
                  <span className="otp-email-display">{email}</span>
                </div>

                <div className="otp-input-group" onClick={pasteFromClipboard}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="otp-digit-input"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <div className="form__actions" style={{ marginTop: 16 }}>
                  <button onClick={() => setStep("password")} disabled={loading || otp.join("").length !== 6} className="button button--primary">
                    Continue →
                  </button>
                </div>

                <div className="otp-resend" onClick={handleSendOtp}>
                  {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
                </div>
              </div>
            ) : (
              <div className="form__section">
                <div className="otp-step-indicator">
                  <span className="otp-step-back" onClick={() => setStep("otp")}>
                    ← Change code
                  </span>
                  <span className="otp-email-display">{email}</span>
                </div>

                <div className="input__container" style={{ marginTop: 12 }}>
                  <label className="input__label">New Password</label>
                  <div className="input__wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input__field"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="input__password-toggle">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="input__container">
                  <label className="input__label">Confirm Password</label>
                  <div className="input__wrapper">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input__field"
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="input__password-toggle">
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="form__actions" style={{ marginTop: 16 }}>
                  <button onClick={handleVerifyOtp} disabled={loading} className="button button--primary">
                    {loading ? "Resetting..." : "Reset Password →"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="form__footer">
            <span>Remember your password? </span>
            <Link to="/signin" className="link--inline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
