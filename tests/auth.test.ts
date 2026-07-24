import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { verifyAccessJwt } from "../worker/src/auth";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "usage-guard-audience";
let validToken: string;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  jwks = createLocalJWKSet({ keys: [publicJwk] });
  validToken = await new SignJWT({ email: "owner@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
});

function request(token?: string): Request {
  return token
    ? new Request("https://usage.example/v1/usage", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      })
    : new Request("https://usage.example/v1/usage");
}

describe("Cloudflare Access JWT authentication", () => {
  it("accepts a correctly signed token for the configured application", async () => {
    await expect(
      verifyAccessJwt(request(validToken), `${ISSUER}/`, AUDIENCE, jwks),
    ).resolves.toBe(true);
  });

  it.each([
    ["missing token", undefined, ISSUER, AUDIENCE],
    ["wrong issuer", validToken, "https://other.cloudflareaccess.com", AUDIENCE],
    ["wrong audience", validToken, ISSUER, "other-audience"],
    ["missing issuer", validToken, "", AUDIENCE],
    ["missing audience", validToken, ISSUER, ""],
  ])("rejects %s", async (_label, token, issuer, audience) => {
    await expect(
      verifyAccessJwt(request(token), issuer, audience, jwks),
    ).resolves.toBe(false);
  });
});
