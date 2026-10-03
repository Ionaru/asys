// SPDX-License-Identifier: EUPL-1.2
import { Service } from '@angular/core';

/** Per-device key-value storage over `localStorage`. Never throws: blocked storage reads as empty. */
@Service()
export class DeviceStorage {
  /** The stored value, or null when absent or when storage is unavailable. */
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  /** Stores a value; does nothing when storage is unavailable. */
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage is blocked or full; the value is simply not kept.
    }
  }

  /** Removes a value; does nothing when storage is unavailable. */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage is blocked; nothing to remove.
    }
  }
}
