import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ReviewerPortal from './pages/ReviewerPortal';
import Departments from './pages/Departments';
import AuditLog from './pages/AuditLog';
import Analytics from './pages/Analytics';
import AddRecord from './pages/AddRecord';
import UploadCsv from './pages/UploadCsv';
import Landing from './pages/Landing';
import Sync from './pages/Sync';
import { RoleProvider } from './context/RoleContext';
import { useRole } from './context/RoleContext';

function ProtectedLayout() {
  const { hasRole } = useRole();
  return hasRole ? <Layout /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <RoleProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/add-record" element={<AddRecord />} />
            <Route path="/upload-csv" element={<UploadCsv />} />
            <Route path="/review" element={<ReviewerPortal />} />
            <Route path="/sync" element={<Sync />} />
            <Route path="/departments" element={<Departments />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/audit-log" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </RoleProvider>
  );
}
