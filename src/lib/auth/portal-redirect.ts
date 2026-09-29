export function portalRedirectUrl(path: string, requestUrl: string, configuredUrl?: string): URL {
  const baseUrl = configuredUrl?.trim() || new URL(requestUrl).origin;
  return new URL(path, baseUrl);
}
