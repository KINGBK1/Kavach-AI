import React, { useEffect, useState } from "react";
import "./Animations.css";

const PageTransition = ({ children }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className={`v-page-transition ${visible ? "v-page-enter" : ""}`}>
      {children}
    </div>
  );
};

export default PageTransition;
