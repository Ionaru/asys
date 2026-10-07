// SPDX-License-Identifier: EUPL-1.2

/** The path of a router URL, without its query and fragment. */
export const pathOf = (url: string): string => url.split(/[?#]/, 1)[0] ?? url;
