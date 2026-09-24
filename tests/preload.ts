/**
 * Test-only shim for Next.js' server-only package.
 *
 * Next.js evaluates `server-only` during the client/server graph build and
 * intentionally throws when it is imported from a client graph. Bun's test
 * runner executes modules directly, so it needs an empty test-time module in
 * order to exercise server modules without weakening the production boundary.
 */
import { mock } from "bun:test";

mock.module("server-only", () => ({}));
