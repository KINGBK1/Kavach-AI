import React, { useState, useEffect, useContext } from "react";
import {
  User,
  Shield,
  Building,
  MapPin,
  Eye,
  EyeOff,
  Briefcase,
} from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import "./SignUp.css";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../../Auth/context/authContextValue";
import TriColorAnimation from "../TriColorAnimation/TriColorAnimation";
import nightImage from "../../../assets/night-mountain-city.jpg";
import brandLogo from "../../../assets/varuna.png";
import { API_BASE_URL, GOOGLE_AUTH_ENABLED } from "../../../config";

const SignUpPage = () => {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [userType, setUserType] = useState("");
  
  // ✅ All state declarations at the top level
  const [formData, setFormData] = useState({
    entityId: "",
    username: "",
    password: "",
    confirmPassword: "",
    location: "",
    email: "",
    phone: "",
    organizationName: "",
    serviceRadius: 50000,
    specializations: "",
    termsAccepted: false,
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showAnimation, setShowAnimation] = useState(false);
  const [userName, setUserName] = useState("");

  const userTypes = [
    { value: "admin", label: "Admin", icon: Shield, color: "admin" },
    { value: "ngo", label: "NGO", icon: Building, color: "ngo" },
    { value: "ddmo", label: "DDMO Official", icon: Briefcase, color: "ddmo" },
    { value: "user", label: "General User", icon: User, color: "user" },
  ];

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData((prev) => ({
            ...prev,
            location: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
          }));
        },
        (error) => {
          console.error("Geolocation error:", error);
        }
      );
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (name === "password" || name === "confirmPassword") {
      setPasswordError("");
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      if (formData.password !== formData.confirmPassword) {
        setPasswordError("Passwords do not match.");
      }
      return;
    }
    if (!navigator.cookieEnabled) {
      alert("Please enable cookies in your browser to continue.");
      return;
    }
    if (!formData.location) {
      alert("Please allow location access to continue.");
      return;
    }

    try {
      const payload = {
        role: userType,
        username: userType === "user" ? formData.username : `${userType}_${Date.now()}`,
        password: userType === "user" ? formData.password : undefined,
        location: formData.location,
        [`${userType}Id`]: formData.entityId || undefined,
      };

      // Add NGO-specific fields
      if (userType === 'ngo') {
        payload.email = formData.email;
        payload.phone = formData.phone;
        
        const [lat, lng] = formData.location.split(',').map(s => parseFloat(s.trim()));
        
        payload.ngoDetails = {
          organizationName: formData.organizationName,
          registrationNumber: formData.entityId,
          serviceRadius: parseInt(formData.serviceRadius) || 50000,
          specializations: formData.specializations 
            ? formData.specializations.split(',').map(s => s.trim()) 
            : [],
          emergencyContact: formData.phone,
          coordinates: { lat, lng }
        };
      }

      const res = await axios.post(
        `${API_BASE_URL}/auth/register`,
        payload
      );

      setUserName(res.data.user?.name || formData.organizationName || formData.username || "New User");
      
      if (userType === 'ngo') {
        alert("NGO account created successfully! Your account is pending admin approval. You will receive an email notification once approved.");
        navigate('/signin');
      } else {
        login(res.data.token);
        setShowAnimation(true);
      }
    } catch (err) {
      console.error(err.response?.data || err.message);
      alert("Error creating account: " + (err.response?.data?.message || err.message));
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/auth/google-login`,
        { token: credentialResponse.credential },
        { withCredentials: true }
      );

      setUserName(res.data.user?.name || "New User");
      login(res.data.token);
      setShowAnimation(true);
    } catch (err) {
      console.error("Google login error:", err.response?.data || err.message);
      alert(`Google login failed: ${err.response?.data?.message || err.message}`);
    }
  };

  // ✅ Helper function to render NGO fields
  const renderNGOFields = () => (
    <>
      <div className="input__container">
        <label htmlFor="entityId" className="input__label">NGO Registration Number</label>
        <div className="input__wrapper">
          <input
            id="entityId"
            type="text"
            name="entityId"
            value={formData.entityId}
            onChange={handleInputChange}
            placeholder="Enter NGO Registration Number"
            className="input__field"
          />
          <Building size={20} className="input__icon ngo" />
        </div>
      </div>

      <div className="input__container">
        <label htmlFor="organizationName" className="input__label">Organization Name</label>
        <div className="input__wrapper">
          <input
            id="organizationName"
            type="text"
            name="organizationName"
            value={formData.organizationName || ''}
            onChange={handleInputChange}
            placeholder="Enter organization name"
            className="input__field"
          />
        </div>
      </div>

      <div className="input__container">
        <label htmlFor="email" className="input__label">Official Email (for alerts)</label>
        <div className="input__wrapper">
          <input
            id="email"
            type="email"
            name="email"
            value={formData.email || ''}
            onChange={handleInputChange}
            placeholder="contact@yourorganization.org"
            className="input__field"
            required
          />
        </div>
      </div>

      <div className="input__container">
        <label htmlFor="phone" className="input__label">Emergency Contact Number</label>
        <div className="input__wrapper">
          <input
            id="phone"
            type="tel"
            name="phone"
            value={formData.phone || ''}
            onChange={handleInputChange}
            placeholder="+91 XXXXXXXXXX"
            className="input__field"
          />
        </div>
      </div>

      <div className="input__container">
        <label htmlFor="serviceRadius" className="input__label">Service Radius (in meters)</label>
        <div className="input__wrapper">
          <input
            id="serviceRadius"
            type="number"
            name="serviceRadius"
            value={formData.serviceRadius || 50000}
            onChange={handleInputChange}
            placeholder="50000"
            className="input__field"
            min="1000"
            max="200000"
          />
        </div>
        <p className="form__helper-text">
          You'll receive alerts for disaster zones within this radius from your location.
        </p>
      </div>

      <div className="input__container">
        <label htmlFor="specializations" className="input__label">Areas of Specialization</label>
        <div className="input__wrapper">
          <input
            id="specializations"
            type="text"
            name="specializations"
            value={formData.specializations || ''}
            onChange={handleInputChange}
            placeholder="e.g., Flood Relief, Medical Aid, Shelter"
            className="input__field"
          />
        </div>
        <p className="form__helper-text">
          Enter comma-separated specializations
        </p>
      </div>
    </>
  );

  // ✅ Main render function for form fields
  const renderSpecificFields = () => {
    const isUser = userType === "user";
    
    if (userType === 'ngo') {
      return renderNGOFields();
    }
    
    const entityIdPlaceholder = {
      admin: "Admin ID",
      ddmo: "DDMO Official ID",
    }[userType];

    return (
      <div className="form__section">
        {!isUser && userType !== 'ngo' && (
          <div className="input__container">
            <label htmlFor="entityId" className="input__label">
              {entityIdPlaceholder}
            </label>
            <div className="input__wrapper">
              <input
                id="entityId"
                type="text"
                name="entityId"
                value={formData.entityId}
                onChange={handleInputChange}
                placeholder={entityIdPlaceholder}
                className="input__field"
              />
              <span className={`input__icon ${userType}`}>
                {userTypes.find((t) => t.value === userType)?.icon &&
                  React.createElement(
                    userTypes.find((t) => t.value === userType).icon,
                    { size: 20 }
                  )}
              </span>
            </div>
          </div>
        )}
        {isUser && (
          <>
            <div className="input__container">
              <label htmlFor="username" className="input__label">Username</label>
              <div className="input__wrapper">
                <input
                  id="username"
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Choose a username"
                  className="input__field"
                />
                <User size={20} className="input__icon user" />
              </div>
            </div>
            <div className="input__container">
              <label htmlFor="password" className="input__label">Password</label>
              <div className="input__wrapper">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter a strong password"
                  className="input__field"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="input__password-toggle"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <div className="input__container">
              <label htmlFor="confirmPassword" className="input__label">Confirm Password</label>
              <div className="input__wrapper">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Re-enter your password"
                  className="input__field"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="input__password-toggle"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            {passwordError && <p className="form__error">{passwordError}</p>}
          </>
        )}
      </div>
    );
  };

  const isFormValid = () => {
    if (!userType || !formData.termsAccepted) return false;
    
    if (userType === 'ngo') {
      return formData.entityId.trim() !== "" && 
             formData.email.trim() !== "" && 
             formData.organizationName.trim() !== "";
    }
    
    if (userType !== "user" && formData.entityId.trim() === "") return false;
    
    if (userType === "user") {
      if (
        formData.username.trim() === "" ||
        formData.password.length < 8 ||
        formData.password !== formData.confirmPassword
      ) {
        return false;
      }
    }
    return true;
  };

  const handleAnimationComplete = () => {
    navigate("/dashboard");
  };

  return (
    <div className="page__wrapper">
      <TriColorAnimation
        isVisible={showAnimation}
        onComplete={handleAnimationComplete}
        userName={userName}
      />

      <div className="signup-layout">
        <div className="signup-layout__visuals">
          <img src={nightImage} alt="Night Mountain City" className="background-image" />
          <div className="overlay"></div>
          <div className="visuals__content">
            <div className="center__welcome">
              <h1 className="center__title">Welcome</h1>
            </div>
            <div className="bottom__branding">
              <div className="brand__logo-container">
                <div className="brand__logo">
                  <img src={brandLogo} alt="Kavach Logo" className="brand__icon" width={60} height={60} />
                </div>
                <div className="brand__text">
                  <h2 className="brand__name">KAVACH</h2>
                  <p className="brand__tagline">
                    Unified disaster management platform for building a resilient nation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="signup-layout__form-container">
          <div className="form__header">
            <h2 className="form__title">Create Your Account</h2>
            <p className="form__subtitle">
              {!userType && "Choose your role to get started."}
              {userType === "admin" && "Fill in your Admin details below."}
              {userType === "ngo" && "Provide your NGO credentials to continue."}
              {userType === "ddmo" && "Enter your DDMO Official information."}
              {userType === "user" && "Set up your General User account."}
            </p>
          </div>
          <div className="form__main">
            <div className="form__section user-type-grid">
              {userTypes.map((type) => {
                const IconComponent = type.icon;
                return (
                  <button
                    key={type.value}
                    onClick={() => {
                      setUserType(type.value);
                      setFormData((prev) => ({
                        ...prev,
                        entityId: "",
                        username: "",
                        password: "",
                        confirmPassword: "",
                      }));
                      setPasswordError("");
                    }}
                    className={`user-type__button ${userType === type.value ? "is-active" : ""}`}
                  >
                    <IconComponent className={`user-type__icon ${type.color}`} />
                    <span className="user-type__label">{type.label}</span>
                  </button>
                );
              })}
            </div>

            {userType && renderSpecificFields()}

            {userType === "user" && GOOGLE_AUTH_ENABLED && (
              <div className="oauth-section">
                <div className="divider-container">
                  <div className="line"></div>
                  <span className="divider-text">or continue with</span>
                  <div className="line"></div>
                </div>
                <div className="google-btn-wrapper">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => alert("Google login failed")}
                  />
                </div>
              </div>
            )}

            {userType && (
              <>
                <div className="form__section">
                  <label htmlFor="location" className="input__label">Your Location</label>
                  <div className="input__wrapper">
                    <input
                      id="location"
                      type="text"
                      name="location"
                      value={formData.location}
                      onChange={handleInputChange}
                      placeholder="Retrieving your location..."
                      className="input__field"
                      disabled
                    />
                    <MapPin size={20} className="input__icon location" />
                  </div>
                  <p className="form__helper-text">
                    Your location is used to connect you with relevant local resources.
                  </p>
                </div>

                <div className="form__section form__terms">
                  <label className="checkbox__container">
                    <input
                      type="checkbox"
                      name="termsAccepted"
                      checked={formData.termsAccepted}
                      onChange={handleInputChange}
                    />
                    <span>
                      I agree to the{" "}
                      <Link to="/terms" className="link--inline">Terms and Conditions</Link>
                    </span>
                  </label>
                </div>

                <div className="form__section form__actions">
                  <button
                    onClick={handleSubmit}
                    disabled={!isFormValid()}
                    className={`button button--primary ${!isFormValid() ? "is-disabled" : ""}`}
                  >
                    Create Account →
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="form__footer">
            <span>Already have an account? </span>
            <Link to="/signin" className="link--inline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
