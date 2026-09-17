# Desk

Day-one **local** scope. Catch-all for “whatever I’m doing right now” until you create a project-specific id (then swap `desk` in `get_context` / `session_note`).

This file is meant to be useful on first load — edit it; don’t leave the placeholders forever.

## Operator prefs

- Prefer concrete next actions over long essays
- Ask before destructive or irreversible steps
- At session start: load memory (`get_context`) before answering from “what we decided”
- Before you stop or switch clients: leave a `session_note` so the next chat can continue
- One local scope per `get_context` call — this `desk`, or your project id

## Open threads

- [ ] Rewrite **Operator prefs** to match how you actually want the agent to behave
- [ ] Pick the real mid-flight work and replace this checklist
- [ ] After the first real session, leave a `new:` handoff (see `_session`)

## Standing decisions

- Load contract is in force: scoped `get_context`, must-load always merged, no full dump
- Default skill at session start: `learn_workflow({ skill: "resume-work" })`
- Durable truth lives in scopes; live dumps belong in `session_note` or a domain tool

## Done recently

- Seeded OpenPort — fridge has starter prefs + an example session handoff; overwrite as you go
