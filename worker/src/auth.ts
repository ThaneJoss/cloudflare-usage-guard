import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

const jwksByIssuer = new Map<string, JWTVerifyGetKey>();

export async function verifyAccessJwt(
  request: Request,
  teamDomain: string,
  policyAudience: string,
  jwksOverride?: JWTVerifyGetKey,
): Promise<boolean> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  const issuer = teamDomain.replace(/\/+$/, "");
  if (!token || !issuer || !policyAudience) return false;

  try {
    const jwks = jwksOverride ?? getRemoteJwks(issuer);
    await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      issuer,
      audience: policyAudience,
    });
    return true;
  } catch {
    return false;
  }
}

function getRemoteJwks(issuer: string): JWTVerifyGetKey {
  const cached = jwksByIssuer.get(issuer);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  if (jwksByIssuer.size >= 4) {
    const oldestIssuer = jwksByIssuer.keys().next().value;
    if (oldestIssuer) jwksByIssuer.delete(oldestIssuer);
  }
  jwksByIssuer.set(issuer, jwks);
  return jwks;
}
