export const appConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api",
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS,
  chainId: Number(import.meta.env.VITE_CHAIN_ID || 11155111),
  chainName: import.meta.env.VITE_CHAIN_NAME || "Sepolia",
  rpcUrl: import.meta.env.VITE_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY"
};

