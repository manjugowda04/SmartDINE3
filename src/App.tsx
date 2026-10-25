import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import NotFound from "./NotFound.tsx";
import Index from "./Index.tsx";
import TablePage from "./pages/table/page.tsx";
import ManagementLayout from "./pages/management/_components/ManagementLayout.tsx";
import DashboardPage from "./pages/management/dashboard/page.tsx";
import OrdersPage from "./pages/management/orders/page.tsx";
import TablesPage from "./pages/management/tables/page.tsx";
import MenuPage from "./pages/management/menu/page.tsx";
import PaymentsPage from "./pages/management/payments/page.tsx";
import RequestsPage from "./pages/management/requests/page.tsx";
import AnalyticsPage from "./pages/management/analytics/page.tsx";
import ReportsPage from "./pages/management/reports/page.tsx";
import StaffManagementPage from "./pages/management/staff/page.tsx";
import AcceptInvitePage from "./pages/auth/AcceptInvite.tsx";
import ManagementLoginPage from "./pages/management/login/page.tsx";

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Index />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Customer QR table route */}
          <Route path="/table/:token" element={<TablePage />} />

          {/* Staff Invitation acceptance route */}
          <Route path="/invite/:token" element={<AcceptInvitePage />} />

          {/* Management login */}
          <Route path="/management/login" element={<ManagementLoginPage />} />

          {/* Management app */}
          <Route path="/management" element={<ManagementLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="tables" element={<TablesPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="staff" element={<StaffManagementPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DefaultProviders>
  );
}
