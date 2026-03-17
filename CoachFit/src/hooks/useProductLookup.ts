import { useState, useEffect } from 'react';
import type { Product } from '../types';
import { getCachedProduct, saveProduct } from '../services/database';
import { lookupBarcode } from '../services/openFoodFacts';

type LookupState =
  | { status: 'loading' }
  | { status: 'found'; product: Product }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

export function useProductLookup(barcode: string): LookupState {
  const [state, setState] = useState<LookupState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function lookup() {
      setState({ status: 'loading' });

      try {
        // Check cache first
        const cached = await getCachedProduct(barcode);
        if (cached && !cancelled) {
          // Update scanned_at timestamp
          const updated = { ...cached, scannedAt: new Date().toISOString() };
          await saveProduct(updated);
          setState({ status: 'found', product: updated });
          return;
        }

        // Fetch from API
        const product = await lookupBarcode(barcode);
        if (cancelled) return;

        if (product) {
          await saveProduct(product);
          setState({ status: 'found', product });
        } else {
          setState({ status: 'not_found' });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to look up product',
          });
        }
      }
    }

    lookup();
    return () => {
      cancelled = true;
    };
  }, [barcode]);

  return state;
}
