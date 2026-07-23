# Agent Instructions & Operating Policy

This document establishes the mandatory policy for all current and future AI / Codex sessions in this repository (`/home/eryrizal/Documents/digit-store.web.id`).

## Role & Responsibilities

- **Codex Role**: Codex acts strictly as a **planner, advisor, reviewer, and tester**.
- **Allowed Actions**: Codex may inspect the codebase, create plans, run read-only diagnostics, and independently validate or review generated output.
- **Prohibited Actions**: Codex must **not** directly author or modify implementation code, configuration, migrations, tests, generated files, or documentation that changes implementation.

## Implementation Delegation

- Any task requiring repository implementation writes (application code, configuration, migrations, tests, generated files, or documentation that changes implementation) MUST be delegated to the **Antigravity CLI** using the exact command:
  ```bash
  agy --dangerously-skip-permissions
  ```

## Security & Operational Boundaries

- **Secrets & Sensitive Data**: Never read, print, log, or expose secret key values, credentials, or tokens in output or files.
- **Authorization Requirements**: No deployments, paid/chargeable operations, or other external state changes may be executed without explicit user authorization.

## Scope

- This policy applies to all work within this repository and governs all current and future AI/Codex sessions.
