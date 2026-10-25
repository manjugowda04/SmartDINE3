import { Navigate } from "react-router-dom";

// Management authentication is handled by the management layout.
export default function ManagementLoginPage() {
  return <Navigate to="/management" replace />;
}
