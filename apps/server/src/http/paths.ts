// SPDX-License-Identifier: EUPL-1.2

/**
 * The path of a request URL as `HttpServerRequest.url` gives it: everything from the first `?`
 * or `#` is removed. The path is not decoded.
 */
export const requestPath = (url: string): string => {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
};

const normalisePath = (path: string): string => {
  let decoded = path;
  try {
    decoded = decodeURI(path);
  } catch {
    // A malformed escape: the router keeps the raw path too.
  }
  return decoded.replace(/\/{2,}/g, '/').toLowerCase();
};

/**
 * Whether a request path belongs to the API: exactly `/v1`, or anything below `/v1/`. The path
 * is normalised the way the router matches it first: percent-decoded (a malformed escape keeps
 * the raw path), runs of slashes collapsed and lower-cased.
 */
export const isApiPath = (path: string): boolean => {
  const normalised = normalisePath(path);
  return normalised === '/v1' || normalised.startsWith('/v1/');
};
