export async function verifyDashboardToken(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const providedToken = authorization.slice("Bearer ".length);
  if (!providedToken || !expectedToken) return false;

  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(providedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
  ]);

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(
      left: ArrayBuffer | ArrayBufferView,
      right: ArrayBuffer | ArrayBufferView,
    ): boolean;
  };
  return subtle.timingSafeEqual(providedDigest, expectedDigest);
}
