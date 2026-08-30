# awake-axi agent rules

- The runtime is macOS-only and must fail safe: an unreadable or unknown power
  state never creates or keeps a sleep assertion.
- Validate changes with `npm run check` and a real `pmset -g assertions` smoke
  when running on macOS.
- Every started lease must be stopped by its owner; never use broad process
  killing or stop sessions created by another agent.
- The skill source of truth is `skill/awake-axi/SKILL.md`.
