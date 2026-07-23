import React, { useContext } from "react";
import UserDashboardNavbar from "../Dashboard/Navbar/UserDashboardNav";
import Footer from "../Footer/Footer";
import LocationPermissionBanner from "./LocationPermissionBanner";
import PageTransition from "../common/Animations/PageTransition";
import { AuthContext } from "../Auth/context/authContextValue";
import "./PageShell.css";

/** Consistent shell used by every authenticated page: navbar, content, footer. */
const PageShell = ({ children, noFooter = false }) => {
  const { user } = useContext(AuthContext);
  return (
    <div className="v-page-shell">
      <UserDashboardNavbar user={user} />
      <LocationPermissionBanner />
      <main className="v-page-content">
        <PageTransition>{children}</PageTransition>
      </main>
      {!noFooter && <Footer />}
    </div>
  );
};

export default PageShell;
