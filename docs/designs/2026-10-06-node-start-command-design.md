---
id: 2026-10-06-node-start-command-design
title: Infer Node application start commands for Coolify deployments
status: implemented
date: 2026-10-06
---

# Node start-command inference

## Problem

The portal detects a repository with `package.json` as a Node application, but
Coolify receives no `start_command` when the package does not declare a
`scripts.start` entry. Nixpacks then creates a container with an empty shell
command, which exits immediately and leaves the public route unavailable.

## Decision

The repository analyzer returns an optional `startCommand` for Node projects.
It preserves a declared `scripts.start` value. If that value is absent, it
selects the first existing JavaScript entry file from the package `main` value
or the safe server-file candidates and returns `node <file>`.

The Coolify adapter sends the inferred value as `start_command`. Dockerfile and
static deployments remain unchanged. TypeScript files are not inferred because
they need an explicit runtime or build tool.

## Acceptance criteria

- A Node repository with `server.js` and no `scripts.start` receives
  `start_command: "node server.js"`.
- A declared `scripts.start` value remains the source of truth.
- The detected application port remains unchanged.
- Dockerfile and static application payloads do not receive an inferred start
  command.
- Unit tests cover the analyzer and Coolify payload boundary.

