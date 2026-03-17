import { useCallback, useRef } from 'react';
import { BARCODE_SCAN_DEBOUNCE_MS } from '../constants/api';

interface BarcodeScanResult {
  type: string;
  data: string;
}

export function useBarcodeScan(onScan: (barcode: string) => void) {
  const lastScannedRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  const handleBarCodeScanned = useCallback(
    (result: BarcodeScanResult) => {
      const now = Date.now();
      const barcode = result.data;

      if (
        barcode === lastScannedRef.current &&
        now - lastScanTimeRef.current < BARCODE_SCAN_DEBOUNCE_MS
      ) {
        return;
      }

      lastScannedRef.current = barcode;
      lastScanTimeRef.current = now;
      onScan(barcode);
    },
    [onScan]
  );

  const resetScan = useCallback(() => {
    lastScannedRef.current = null;
    lastScanTimeRef.current = 0;
  }, []);

  return { handleBarCodeScanned, resetScan };
}
