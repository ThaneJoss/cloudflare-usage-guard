export async function verifyDashboardToken(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer[ \t]+(.+)$/i);
  if (!match) return false;

  const providedToken = match[1];
  if (!providedToken || !expectedToken) return false;

  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(providedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
  ]);

  return constantTimeEqual(
    new Uint8Array(providedDigest),
    new Uint8Array(expectedDigest),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return mismatch === 0;
}
