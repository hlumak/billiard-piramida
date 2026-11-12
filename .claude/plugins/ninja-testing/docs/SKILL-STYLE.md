# Style guide for ninja-testing procedure skills

You are writing one `skills/<name>/SKILL.md` for the `ninja-testing` Claude Code plugin. The plugin distils a JavaScript testing course by Illya Klymov (JavaScript Ninja). The skill must read as a **procedure the author himself would run**, in his formulations, not as generic best practice.

## Format (Agent Skills standard, agentskills.io)

```
---
name: <dir name, kebab-case>
description: <what it does + when to use it, ≤ 300 chars; include trigger phrases users say>
argument-hint: "<optional>"
---
```

Body in **English**, ≤ 220 lines, Markdown. Structure, in this order:

1. `# <Title>` + one paragraph: the problem in the author's framing (why an agent gets this wrong).
2. `## When to use` — triggers, and when *not* to use (hand off to which other skill).
3. `## Inputs` — what must be in hand before starting; what to ask for if missing.
4. `## Procedure` — numbered steps. Each step says who does it (you = the agent, or the human) and what artifact it produces. Include **verbatim prompt texts** that are known to work, as "A prompt that worked:" — never framed as a lecture, a stream or an author.
5. `## Done when` — checkable criteria, no vagueness.
6. `## Red flags` — the specific failure modes of agents for this procedure, each with the counter-move.

## Voice

- Imperative, concrete, no hedging. "Run Stryker on the changed file" not "consider running".
- Use the shared vocabulary exactly: *test as spec*, *characterization (pinning) tests*, *test gap vs equivalent mutant*, *always-green test*, *implementation coupling*, *vertical slice*, *boundary of ours*, *stop-words*, *execution ≠ verification*, *Goodhart*, *"you did this — fix it" instead of "don't do X"*.
- A memorable line may be quoted in a blockquote, unattributed. **No provenance in agent-facing text**: no `video N.N`, `practice N`, `on air`, `the course`, `the author`. The skill exists apart from the course; the mapping to lessons lives in `docs/Голос курса.md` and the README, for people.
- Refer to the shared contract as `AGENTS.md §N` when a rule already lives there; do not restate AGENTS.md at length.
- Stack-specific commands assume Vitest/Stryker/MSW/Playwright/testcontainers but are written so that a Jest project can map them (mention the equivalent once).
- No emojis, no marketing, no "best practices" phrase.

## Sources you must read before writing

- `templates/AGENTS.md` — the contract; your skill must not contradict it.
- The distillate sections listed in your task (under `distill/`), especially section 9 («Заготовки для скиллов»), section 2 («Правила для промпта»), section 4 («ИИ-угол») and section 5 («Инструменты и конкретика»). Read them in full. Where the transcript and the scenario differ, the transcript wins; scenario-only material may be used if marked "(scenario)".

## Optional reference file

If the skill benefits from a longer checklist, table or example (e.g. survivor classification examples, a slice-classification table, a prompt template), put it in `skills/<name>/reference.md` (≤ 150 lines) and link it from SKILL.md. Do not duplicate content between the two.
