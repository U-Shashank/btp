import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import App from "./App";
import AdminDoctorManagement from "./pages/AdminDoctorManagement";
import { appConfig } from "./config";
import DOCTOR_ORACLE_ABI from "./lib/DoctorStatusOracleABI.json";

function Navigation() {
  const location = useLocation();
  const { address, isConnected } = useAccount();

  // Check if user is oracle admin
  const { data: oracleAdmin } = useReadContract({
    address: appConfig.oracleAddress,
    abi: DOCTOR_ORACLE_ABI,
    functionName: "admin",
    query: {
      enabled: Boolean(appConfig.oracleAddress && isConnected),
    },
  });

  const isAdmin = isConnected && address && oracleAdmin && 
    address.toLowerCase() === oracleAdmin.toLowerCase();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              to="/"
              className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive("/")
                  ? "text-indigo-600 bg-indigo-50"
                  : "text-gray-700 hover:text-indigo-600 hover:bg-gray-50"
              }`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </Link>

            {isAdmin && (
              <Link
                to="/admin"
                className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive("/admin")
                    ? "text-indigo-600 bg-indigo-50"
                    : "text-gray-700 hover:text-indigo-600 hover:bg-gray-50"
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin
                <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                  Oracle
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminDoctorManagement />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
