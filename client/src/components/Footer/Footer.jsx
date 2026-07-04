import React from 'react';
import { ShieldCheck } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section footer-brand-section">
          <h3 className="varuna-brand">KAVACH</h3>
          <p className="footer-tagline">
            AI-powered disaster intelligence platform for real-time monitoring, situational awareness, and emergency response.
          </p>
          <p>
            KAVACH aggregates global disaster feeds, weather data, satellite observations, news, and citizen reports into a single
            analytical layer &mdash; scoring every incident for severity and priority to help coordinate a faster response, anywhere in the world.
          </p>
        </div>

        <div className="footer-section">
          <h3>Quick Links</h3>
          <ul>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/incidents">Incident Explorer</a></li>
            <li><a href="/alerts">Critical Alerts</a></li>
            <li><a href="/chat">AI Assistant</a></li>
            <li><a href="/report">Report Incident</a></li>
          </ul>
        </div>

        <div className="footer-section">
          <h3>Data Sources</h3>
          <ul>
            <li><a href="https://eonet.gsfc.nasa.gov" target="_blank" rel="noopener noreferrer">NASA EONET</a></li>
            <li><a href="https://earthquake.usgs.gov" target="_blank" rel="noopener noreferrer">USGS</a></li>
            <li><a href="https://www.gdacs.org" target="_blank" rel="noopener noreferrer">GDACS</a></li>
            <li><a href="https://www.gdeltproject.org" target="_blank" rel="noopener noreferrer">GDELT</a></li>
            <li><a href="https://bsky.app" target="_blank" rel="noopener noreferrer">Bluesky</a></li>
            <li><span className="footer-static-item">Citizen Reports</span></li>
            <li><span className="footer-static-item">Weather Intelligence</span></li>
          </ul>
        </div>

        <div className="footer-section">
          <h3>Agencies &amp; Resources</h3>
          <ul>
            <li><a href="https://ndma.gov.in" target="_blank" rel="noopener noreferrer">NDMA</a></li>
            <li><a href="https://incois.gov.in" target="_blank" rel="noopener noreferrer">INCOIS</a></li>
            <li><a href="https://mausam.imd.gov.in" target="_blank" rel="noopener noreferrer">IMD</a></li>
            <li><a href="https://www.nasa.gov" target="_blank" rel="noopener noreferrer">NASA</a></li>
            <li><a href="https://www.usgs.gov" target="_blank" rel="noopener noreferrer">USGS</a></li>
            <li><a href="https://www.gdacs.org" target="_blank" rel="noopener noreferrer">GDACS</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-powered-strip">
        <span className="footer-powered-label">
          <ShieldCheck size={13} />
          Powered by
        </span>
        <div className="footer-powered-stack">
          <span>React</span>
          <span className="footer-dot">&bull;</span>
          <span>Rust</span>
          <span className="footer-dot">&bull;</span>
          <span>FastAPI</span>
          <span className="footer-dot">&bull;</span>
          <span>Gemini AI</span>
          <span className="footer-dot">&bull;</span>
          <span>PostgreSQL</span>
          <span className="footer-dot">&bull;</span>
          <span>Google Cloud Run</span>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; {year} <span className="varuna-brand">KAVACH</span>. All rights reserved.</p>
        <p>Built for the safety and resilience of communities worldwide.</p>
      </div>
    </footer>
  );
};

export default Footer;