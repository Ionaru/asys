// SPDX-License-Identifier: MPL-2.0

/**
 * Orders two strings by UTF-16 code unit, so the same data sorts the same way in every runtime.
 * `localeCompare` is never used for this: its order depends on the machine's locale.
 * Code-unit order is also not code-point order: a character above U+FFFF is a surrogate pair
 * (U+D800 to U+DFFF), so it sorts before a character from U+E000 to U+FFFF.
 */
export const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
