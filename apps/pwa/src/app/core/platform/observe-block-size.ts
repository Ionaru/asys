// SPDX-License-Identifier: EUPL-1.2

/**
 * Calls `onSize` with the border-box block size of `element`, now and as it changes. Returns the
 * function that stops observing. Callers guard for a missing `ResizeObserver` themselves.
 */
export const observeBlockSize = (
  element: Element,
  onSize: (blockSize: number) => void,
): (() => void) => {
  const observer = new ResizeObserver((entries) => {
    // An entry without borderBoxSize (older engines) reports nothing rather than throwing.
    const size = entries[0]?.borderBoxSize?.[0]?.blockSize;

    if (typeof size === 'number') {
      onSize(size);
    }
  });

  observer.observe(element);

  return () => observer.disconnect();
};
