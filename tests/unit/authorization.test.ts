import { describe, expect, test } from "bun:test";
import { AuthorizationError, canViewDeployment, requireAdmin } from "../../src/lib/auth/authorization";

describe("authorization", () => {
  test("allows users to view their own deployment and admins to view any deployment", () => {
    expect(canViewDeployment({ id: "u1", role: "USER" }, { ownerId: "u1" })).toBe(true);
    expect(canViewDeployment({ id: "u1", role: "USER" }, { ownerId: "u2" })).toBe(false);
    expect(canViewDeployment({ id: "u1", role: "ADMIN" }, { ownerId: "u2" })).toBe(true);
  });

  test("requires an active administrator", () => {
    expect(() => requireAdmin({ id: "u1", role: "USER", status: "ACTIVE" })).toThrow(AuthorizationError);
    expect(requireAdmin({ id: "u1", role: "ADMIN", status: "ACTIVE" }).id).toBe("u1");
    expect(() => requireAdmin({ id: "u1", role: "ADMIN", status: "INACTIVE" })).toThrow(AuthorizationError);
  });
});
