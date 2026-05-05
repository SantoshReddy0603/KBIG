import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ReviewerPortal from './pages/ReviewerPortal';
import Departments from './pages/Departments';
import AuditLog from './pages/AuditLog';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/review" element={<ReviewerPortal />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/audit-log" element={<AuditLog />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
