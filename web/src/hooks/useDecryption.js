/**
 * React Hook for Managing Prescription Decryption
 * 
 * Provides a convenient way to decrypt prescriptions with caching and loading states
 */

import { useState, useCallback, useRef } from 'react';
import { useWalletClient, useAccount } from 'wagmi';
import { loadPrescriptionData, isEncrypted } from '../lib/encryption';
import { appConfig } from '../config';
import { logMetric } from '../services/metricsApi';

/**
 * Hook for managing prescription decryption
 * @returns {Object} Decryption utilities
 */
export function useDecryption() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  
  // Cache decrypted payloads by request/prescription ID
  const [decryptedCache, setDecryptedCache] = useState({});
  
  // Track loading state per item
  const [loadingItems, setLoadingItems] = useState(new Set());
  
  // Track errors per item
  const [errors, setErrors] = useState({});
  
  // Ref to prevent duplicate decryption requests
  const inflightRequests = useRef(new Map());

  /**
   * Decrypts a prescription from IPFS bundle
   * @param {string} itemId - Unique identifier for the prescription/request
   * @param {Object} bundle - IPFS data bundle
   * @param {Function} onSuccess - Optional success callback
   * @param {Function} onError - Optional error callback
   * @returns {Promise<Object>} Decrypted payload
   */
  const decrypt = useCallback(
    async (itemId, bundle, onSuccess, onError) => {
      // Return cached result if available
      if (decryptedCache[itemId]) {
        return decryptedCache[itemId];
      }

      // Check if already decrypting this item
      if (inflightRequests.current.has(itemId)) {
        return inflightRequests.current.get(itemId);
      }

      // Validate prerequisites
      if (!address) {
        const error = new Error('Wallet not connected');
        setErrors((prev) => ({ ...prev, [itemId]: error.message }));
        onError?.(error);
        throw error;
      }

      if (!walletClient) {
        const error = new Error('Wallet client not available');
        setErrors((prev) => ({ ...prev, [itemId]: error.message }));
        onError?.(error);
        throw error;
      }

      const startTime = Date.now();

      // Mark as loading
      setLoadingItems((prev) => new Set(prev).add(itemId));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });

      // Create decryption promise
      const decryptionPromise = (async () => {
        try {
          // Check if encrypted or plaintext
          if (!isEncrypted(bundle)) {
            // Legacy plaintext format
            const payload = bundle.payload || bundle;
            setDecryptedCache((prev) => ({ ...prev, [itemId]: payload }));
            setLoadingItems((prev) => {
              const next = new Set(prev);
              next.delete(itemId);
              return next;
            });
            onSuccess?.(payload);
            return payload;
          }

          // Decrypt encrypted bundle
          const payload = await loadPrescriptionData(
            bundle,
            address,
            walletClient,
            appConfig.chainId,
            appConfig.contractAddress
          );

          const decryptionTime = Date.now() - startTime;
          
          // Log metrics
          logMetric('decryption_ms', decryptionTime);

          // Cache result
          setDecryptedCache((prev) => ({ ...prev, [itemId]: payload }));
          
          // Clear loading state
          setLoadingItems((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });

          onSuccess?.(payload);
          return payload;
        } catch (error) {
          const decryptionTime = Date.now() - startTime;
          
          // Log failure
          logMetric('decryption_failure', 1);
          
          console.error('Decryption failed:', error);
          
          setErrors((prev) => ({ ...prev, [itemId]: error.message }));
          setLoadingItems((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });

          onError?.(error);
          throw error;
        } finally {
          inflightRequests.current.delete(itemId);
        }
      })();

      // Track inflight request
      inflightRequests.current.set(itemId, decryptionPromise);

      return decryptionPromise;
    },
    [address, walletClient, decryptedCache]
  );

  /**
   * Gets a decrypted payload from cache
   * @param {string} itemId - Item identifier
   * @returns {Object|null} Cached payload or null
   */
  const getCached = useCallback(
    (itemId) => {
      return decryptedCache[itemId] || null;
    },
    [decryptedCache]
  );

  /**
   * Checks if an item is currently being decrypted
   * @param {string} itemId - Item identifier
   * @returns {boolean}
   */
  const isLoading = useCallback(
    (itemId) => {
      return loadingItems.has(itemId);
    },
    [loadingItems]
  );

  /**
   * Gets error message for an item
   * @param {string} itemId - Item identifier
   * @returns {string|null} Error message or null
   */
  const getError = useCallback(
    (itemId) => {
      return errors[itemId] || null;
    },
    [errors]
  );

  /**
   * Clears cached decryption for an item
   * @param {string} itemId - Item identifier
   */
  const clearCache = useCallback((itemId) => {
    setDecryptedCache((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  /**
   * Clears all cached decryptions
   */
  const clearAllCache = useCallback(() => {
    setDecryptedCache({});
    setErrors({});
    setLoadingItems(new Set());
  }, []);

  /**
   * Pre-decrypts multiple items in parallel
   * @param {Array<{id: string, bundle: Object}>} items - Items to decrypt
   * @returns {Promise<Array<{id: string, payload: Object, error: Error}>>}
   */
  const decryptBatch = useCallback(
    async (items) => {
      const results = await Promise.allSettled(
        items.map(async ({ id, bundle }) => {
          try {
            const payload = await decrypt(id, bundle);
            return { id, payload, error: null };
          } catch (error) {
            return { id, payload: null, error };
          }
        })
      );

      return results.map((result) =>
        result.status === 'fulfilled' ? result.value : result.reason
      );
    },
    [decrypt]
  );

  return {
    decrypt,
    getCached,
    isLoading,
    getError,
    clearCache,
    clearAllCache,
    decryptBatch,
    decryptedCache,
    hasCache: Object.keys(decryptedCache).length > 0,
  };
}
