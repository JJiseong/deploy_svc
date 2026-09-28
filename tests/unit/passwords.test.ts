import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../../src/lib/auth/passwords";

describe("portal password storage", () => {
  test("stores passwords as a one-way scrypt hash and verifies only the correct password", async () => {
    const hash = await hashPassword("Temporary-password-123!");
    expect(hash).toStartWith("scrypt$");
    expect(hash).not.toContain("Temporary-password-123!");
    await expect(verifyPassword("Temporary-password-123!", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
