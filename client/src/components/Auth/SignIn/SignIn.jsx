import React, { useState, useContext, useRef, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Shield } from "lucide-react";
import { AuthContext } from "../../Auth/context/authContextValue";
import TriColorAnimation from "../TriColorAnimation/TriColorAnimation";
import "./SignIn.css";
import nightImage from "../../../assets/night-mountain-city.jpg";
import brandLogo from "../../../assets/varuna.png";
import { API_BASE_URL, AUTH_BASE_URL, GOOGLE_AUTH_ENABLED } from "../../../config";

const RESEND_COOLDOWN = 60;

const SignInPage = () => {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [step, setStep] = useState("email");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showAnimation, setShowAnimation] = useState(false);
  const [userName, setUserName] = useState("");
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
    setTimeout(() => { setMessage(""); setMessageType(""); }, 5000);
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
    if (!identifier.trim()) {
      showMessage("Please enter your email or username.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${AUTH_BASE_URL}/auth/send-otp`, { identifier: identifier.trim(), purpose: "signin" });
      setEmail(res.data.email);
      setStep("otp");
      setCountdown(RESEND_COOLDOWN);
      showMessage("OTP sent to your email.", "success");
    } catch (err) {
      showMessage(err.response?.data?.message || "Failed to send OTP.", "error");
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
    setLoading(true);
    try {
      const res = await axios.post(`${AUTH_BASE_URL}/auth/verify-otp`, {
        email, code, purpose: "signin",
      });
      setUserName(res.data.user?.username || email.split("@")[0]);
      login(res.data.token);
      setShowAnimation(true);
    } catch (err) {
      showMessage(err.response?.data?.message || "Invalid or expired OTP.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await axios.post(`${AUTH_BASE_URL}/auth/google-login`, {
        token: credentialResponse.credential,
      });
      setUserName(res.data.user?.name || res.data.username || "User");
      login(res.data.token);
      setShowAnimation(true);
    } catch (err) {
      showMessage("Google login failed.", "error");
    }
  };

  const handleGoogleError = () => {
    showMessage("Google login failed.", "error");
  };

  const handleAnimationComplete = () => {
    navigate("/dashboard");
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const digits = text.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = ["", "", "", "", "", ""];
      digits.forEach((d, i) => { newOtp[i] = d; });
      setOtp(newOtp);
      if (digits.length === 6) {
        setTimeout(handleVerifyOtp, 300);
      }
    } catch {}
  };

  return (
    <div className="page__wrapper">
      <TriColorAnimation
        isVisible={showAnimation}
        onComplete={handleAnimationComplete}
        userName={userName}
      />
      <div className="signin-layout">
        <div className="signin-layout__visuals">
          <img src={nightImage} alt="" className="background-image" />
          <div className="overlay"></div>
          <div className="visuals__content">
            <div className="center__welcome">
              <h1 className="center__title">Welcome Back</h1>
            </div>
            <div className="bottom__branding">
              <div className="brand__logo-container">
                <div className="brand__logo">
                  <img src={brandLogo} alt="Kavach Logo" className="brand__icon" width={60} height={60} />
                </div>
                <div className="brand__text">
                  <h2 className="brand__name">KAVACH</h2>
                  <p className="brand__tagline">Unified disaster management platform for building a resilient nation.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="signin-layout__form-container">
          <div className="form__header">
            <h2 className="form__title">Sign In</h2>
            <p className="form__subtitle">
              {step === "email" ? "Enter your email or username to receive a verification code." : "Enter the 6-digit code sent to your email."}
            </p>
          </div>

          <div className="form__main">
            {message && <div className={`message-box message-box--${messageType}`}>{message}</div>}

            {step === "email" ? (
              <div className="form__section">
                <div className="input__container">
                  <label htmlFor="identifier" className="input__label">Email or Username</label>
                  <div className="input__wrapper">
                    <input
                      id="identifier"
                      type="text"
                      placeholder="Enter your email or username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                      className="input__field"
                      autoFocus
                    />
                    <Mail size={20} className="input__icon" />
                  </div>
                </div>
                <div className="form__actions" style={{ marginTop: 16 }}>
                  <button onClick={handleSendOtp} disabled={loading} className="button button--primary">
                    {loading ? "Sending..." : "Send OTP →"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="form__section">
                <div className="otp-step-indicator">
                  <span className="otp-step-back" onClick={() => { setStep("email"); setOtp(["", "", "", "", "", ""]); }}>
                    ← Change
                  </span>
                  <span className="otp-email-display">{email}</span>
                </div>

                <div className="otp-input-group" onClick={pasteFromClipboard} title="Tap to paste from clipboard">
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
                  <button onClick={handleVerifyOtp} disabled={loading} className="button button--primary">
                    {loading ? "Verifying..." : "Verify & Sign In →"}
                  </button>
                </div>

                <div className="otp-resend" onClick={handleSendOtp}>
                  {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
                </div>
              </div>
            )}

            {GOOGLE_AUTH_ENABLED && (
              <div className="oauth-section">
                <div className="divider"><span className="divider__text">or continue with</span></div>
                <div className="google-btn-wrapper">
                  <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} useOneTap={false} />
                </div>
              </div>
            )}
          </div>

          <div className="form__footer">
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
              <span><Link to="/forgot-password" className="link--inline">Forgot password?</Link></span>
              <span>New user? <Link to="/signup" className="link--inline">Create an account</Link></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
