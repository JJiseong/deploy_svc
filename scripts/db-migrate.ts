/** db-migrate.ts — Apply Prisma migrations with the SQLite engine diagnostic workaround. @version 1.0.0 */
import { spawnSync } from "node:child_process";

const prismaBin = process.platform === "win32" ? "node_modules/.bin/prisma.cmd" : "./node_modules/.bin/prisma";
const result = spawnSync(prismaBin, ["migrate", "deploy", "--schema", "prisma/schema.prisma"], {
  env: { ...process.env, RUST_LOG: "info" },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
