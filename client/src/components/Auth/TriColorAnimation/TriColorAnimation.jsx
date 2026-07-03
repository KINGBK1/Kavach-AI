import React, { useEffect, useState } from 'react';
import './TriColorAnimation.css';

const TriColorAnimation = ({ isVisible, onComplete, userName = "User" }) => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setStage(0);
      return;
    }

    const timeline = [
      // Stage 0: Initial fade in
      { delay: 0, action: () => setStage(1) },
      // Stage 1: Start chakra spin
      { delay: 500, action: () => setStage(2) },
      // Stage 2: Complete animation
      { delay: 2500, action: () => {
        setStage(3);
        setTimeout(onComplete, 500);
      }}
    ];

    timeline.forEach(({ delay, action }) => {
      setTimeout(action, delay);
    });
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="tricolor-overlay" aria-label={`Welcome ${userName}`}>
      <div className="tricolor-container">

        {/* Ashoka Chakra - Always visible and spinning */}
        <div className="chakra-center">
          <div className={`ashoka-chakra ${stage >= 1 ? 'spin' : ''}`}>
            <div className="chakra-inner">
              {[...Array(24)].map((_, i) => (
                <div 
                  key={i} 
                  className="chakra-spoke"
                  style={{ transform: `rotate(${i * 15}deg)` }}
                />
              ))}
              <div className="chakra-rim"></div>
            </div>
          </div>
        </div>

        {/* Saffron Stripe - From left, waving motion */}
        <div className={`flag-stripe saffron-stripe ${stage >= 2 ? 'animate-from-left' : ''}`}>
          <div className="stripe-wave">
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
          </div>
        </div>

        {/* Green Stripe - From right, waving motion */}
        <div className={`flag-stripe green-stripe ${stage >= 2 ? 'animate-from-right' : ''}`}>
          <div className="stripe-wave">
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
            <div className="wave-segment"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TriColorAnimation;
