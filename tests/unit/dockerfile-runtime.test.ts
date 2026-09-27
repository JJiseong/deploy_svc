import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

describe("production container runtime", () => {
  test("installs CA certificates for HTTPS integrations", () => {
    const dockerfile = readFileSync(resolve(import.meta.dir, "../../Dockerfile"), "utf8");

    expect(dockerfile).toMatch(/apt-get install[^\n]*ca-certificates/);
  });
});
