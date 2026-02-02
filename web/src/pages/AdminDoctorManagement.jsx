import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { appConfig } from "../config";
import DOCTOR_ORACLE_ABI from "../lib/DoctorStatusOracleABI.json";

const AdminDoctorManagement = () => {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [newDoctorAddress, setNewDoctorAddress] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Read oracle admin address
  const { data: oracleAdmin } = useReadContract({
    address: appConfig.oracleAddress,
    abi: DOCTOR_ORACLE_ABI,
    functionName: "admin",
    query: {
      enabled: Boolean(appConfig.oracleAddress),
    },
  });

  // Check if current user is admin
  const isAdmin = isConnected && address && oracleAdmin && address.toLowerCase() === oracleAdmin.toLowerCase();

  // Fetch doctors from backend
  const fetchDoctors = async () => {
    try {
      const response = await fetch(`${appConfig.apiBaseUrl}/doctors`);
      if (!response.ok) throw new Error("Failed to fetch doctors");
      const data = await response.json();
      setDoctors(data.doctors || []);
    } catch (error) {
      console.error("Error fetching doctors:", error);
      setFeedback({ type: "error", message: error.message });
    }
  };

  // Add new doctor
  const handleAddDoctor = async (e) => {
    e.preventDefault();
    if (!newDoctorAddress.trim()) return;

    setLoading(true);
    setFeedback(null);

    try {
      // Call smart contract
      const txHash = await writeContractAsync({
        address: appConfig.oracleAddress,
        abi: DOCTOR_ORACLE_ABI,
        functionName: "addDoctor",
        args: [newDoctorAddress],
      });

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setFeedback({ 
        type: "success", 
        message: `Doctor ${newDoctorAddress} added successfully!` 
      });
      setNewDoctorAddress("");
      
      // Refetch doctors list
      await fetchDoctors();
    } catch (error) {
      console.error("Error adding doctor:", error);
      let message = "Failed to add doctor";
      if (error.message.includes("OnlyAdmin")) {
        message = "Only oracle admin can add doctors";
      } else if (error.message.includes("DoctorAlreadyExists")) {
        message = "This doctor already exists";
      } else if (error.message.includes("User rejected")) {
        message = "Transaction was rejected";
      }
      setFeedback({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  // Toggle doctor status
  const handleToggleStatus = async (doctorAddress) => {
    setLoading(true);
    setFeedback(null);

    try {
      // Call smart contract
      const txHash = await writeContractAsync({
        address: appConfig.oracleAddress,
        abi: DOCTOR_ORACLE_ABI,
        functionName: "toggleDoctorStatus",
        args: [doctorAddress],
      });

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setFeedback({ 
        type: "success", 
        message: `Doctor status updated successfully!` 
      });
      
      // Refetch doctors list
      await fetchDoctors();
    } catch (error) {
      console.error("Error toggling doctor status:", error);
      let message = "Failed to update doctor status";
      if (error.message.includes("OnlyAdmin")) {
        message = "Only oracle admin can toggle doctor status";
      } else if (error.message.includes("DoctorDoesNotExist")) {
        message = "Doctor does not exist";
      } else if (error.message.includes("User rejected")) {
        message = "Transaction was rejected";
      }
      setFeedback({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  // Load doctors on mount
  useEffect(() => {
    if (isAdmin) {
      fetchDoctors();
    }
  }, [isAdmin]);

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Wallet</h2>
          <p className="text-gray-600">Please connect your wallet to access the admin panel.</p>
        </div>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">Only the oracle admin can access this page.</p>
          <div className="text-sm text-gray-500 bg-gray-100 rounded-lg p-3">
            <p className="font-medium">Connected: {address}</p>
            <p className="font-medium mt-1">Admin: {oracleAdmin || "Loading..."}</p>
          </div>
        </div>
      </div>
    );
  }

  // Admin panel
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Doctor Management</h1>
              <p className="text-gray-600">Manage doctor authorization status</p>
            </div>
            <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-semibold">
              Admin Access
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {feedback && (
          <div className={`rounded-2xl p-4 mb-6 ${
            feedback.type === "success" 
              ? "bg-green-50 border border-green-200 text-green-800" 
              : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            <div className="flex items-start gap-3">
              {feedback.type === "success" ? (
                <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <p className="font-medium">{feedback.message}</p>
            </div>
          </div>
        )}

        {/* Add Doctor Form */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Doctor</h2>
          <form onSubmit={handleAddDoctor} className="flex gap-3">
            <input
              type="text"
              value={newDoctorAddress}
              onChange={(e) => setNewDoctorAddress(e.target.value)}
              placeholder="0x..."
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !newDoctorAddress.trim()}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Adding..." : "Add Doctor"}
            </button>
          </form>
        </div>

        {/* Doctors List */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Active Doctors</h2>
            <button
              onClick={fetchDoctors}
              disabled={loading}
              className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {doctors.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-gray-600 font-medium">No doctors added yet</p>
              <p className="text-gray-500 text-sm mt-1">Add a doctor using the form above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map((doctor) => (
                <div
                  key={doctor.address}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-3 h-3 rounded-full ${doctor.active ? "bg-green-500" : "bg-red-500"}`} />
                    <div className="flex-1">
                      <p className="font-mono text-sm text-gray-900">{doctor.address}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {doctor.active ? "Active" : "Suspended"} • Updated: {new Date(parseInt(doctor.lastUpdated) * 1000).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleStatus(doctor.address)}
                    disabled={loading}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      doctor.active
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    {doctor.active ? "Suspend" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDoctorManagement;
