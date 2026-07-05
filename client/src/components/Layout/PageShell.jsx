import React, { useContext } from "react";
import UserDashboardNavbar from "../Dashboard/Navbar/UserDashboardNav";
import Footer from "../Footer/Footer";
import { AuthContext } from "../Auth/context/authContextValue";
import "./PageShell.css";

/** Consistent shell used by every authenticated page: navbar, content, footer. */
const PageShell = ({ children, noFooter = false, fullViewport = false }) => {
  const { user } = useContext(AuthContext);
  return (
    <div className="v-page-shell">
      <UserDashboardNavbar user={user} />
      <main className={`v-page-content${fullViewport ? " v-page-content--full" : ""}`}>{children}</main>
      {!noFooter && <Footer />}
    </div>
  );
};

export default PageShell;
