# Multiplayer AI development: a companion project

Kind: Living. An idea the owner recorded on 2026-09-17 for a separate project with its own repository, meant to work alongside Skilliton. It is not a Skilliton milestone (PLAN.md section 9). Written for the owner and for sessions in this repository; the new project starts from its own standalone brief (last section). Nothing here is built or researched; beyond what the owner said, the sketch and the questions are proposals to react to.

## Two projects and the line between them

**Skilliton is the harness for each developer working with an AI assistant.** In the owner's words, it is how a company harnesses all of its codebases and repositories so a developer has an easier time coding and gets the job done faster, in line with company policy and coding practices, instead of being stuck working out how to do all of it alone. That also lets a company put more creative people into coding roles.

**The companion project is the environment for a team working with AI together.** A team of, say, four developers shares one session: everyone sees what the agent is doing, anyone can steer it while it works, and what the team learns stays with the team.

| | Skilliton | The multiplayer project |
|---|---|---|
| Who | One developer and their assistant | A team and its agents, together |
| How people coordinate | Asynchronously, through records in the repository and the merge gate | Live, while the work happens |
| What it gives a company | Its policy, skills and checks on every machine and in every repository | Sessions where the team's work is visible and steerable |
| Where context lives | Files in the repository: handoff, task records, decisions, lessons | Context that belongs to the team, channel or project |
| State | Built through M9; the rest of Phase 3 is planned in [PHASE-3.md](PHASE-3.md) | An idea; nothing built |

The owner expects the two to work in conjunction. How they connect is an open question (see "How it could connect to Skilliton"); until it is answered, no Skilliton milestone depends on the multiplayer project.

## The analogy

The owner's comparison is Google Docs. It did not win by being a better word processor. It put everyone in the same document at the same time, so students and professionals saw each other's changes as they happened and steered the direction together. That became the normal way of working, and word processors and slide tools now let several people work in one file at once.

The multiplayer project aims at the same shift for AI-assisted development: from one person prompting a private agent to a whole technical team working in the same live context and moving faster.

## Four pillars and the shifts they make

The owner named four pillars and four shifts. Three of the shifts match a pillar; the fourth is what all of them add up to.

| Pillar | From | To | What it means for a development team |
|---|---|---|---|
| Shared sessions | | | The setting for the rest: several people join one agent session on the same work, instead of each running a separate chat about it |
| Observable work | Private output | Visible work | Teammates see what the agent is doing (its plan, the commands it runs, the changes it makes) while it works, not only the final answer |
| Live steering and handoffs | One-shot prompts | Live participation | People redirect, annotate and join while the work is happening, and one person can hand the session to another without losing the thread |
| Team-owned context | Personal memory | Shared context | Durable context belongs to the team, channel or project, not to whoever happened to write the prompt |

**The outcome: from individual leverage to team capability.** Agents become reusable organizational infrastructure instead of personal hacks.

## A sketch of one session (for discussion, not a design)

1. A developer starts a session to fix a failing checkout test and invites two teammates.
2. Everyone sees the agent's plan and each command as it runs. One teammate annotates the plan: leave the payment module alone, its tests fail for an unrelated reason.
3. The agent adjusts. When the first developer leaves for a meeting, a teammate who knows the area takes over steering.
4. When the session ends, what was decided and what was tried stays with the project, so the next session, or another teammate, starts from there.

## Questions to answer before building

- **Where the agent runs.** One agent on a shared machine that people attach to, or each person's own agent kept in step with the others. This decides most of what follows: whose credentials the agent uses, which files it can change, and on whose machine a command runs.
- **Who may do what.** Who can steer, who approves a risky command, who can stop the agent, and what happens when two people give conflicting instructions at the same moment.
- **What teammates can see.** Watching a command means watching its output, which can contain secrets or customer data. Redaction and access rules have to exist before the work becomes visible, not after.
- **How simultaneous input combines.** Shared editors merge several people's changes with techniques such as operational transformation or conflict-free replicated data types. Which approach, if either, fits steering an agent has not been researched.
- **Where team context lives and who looks after it.** Files in the repository (as Skilliton keeps them), a chat channel, a hosted service, or a mix; and what is kept, for how long, and who can remove it.
- **Which tools come first.** Claude Code is the natural start, as it was for Skilliton. Whether people using other tools (Codex, Cursor and the others in [PHASE-3.md](PHASE-3.md)) need to join the same session early is open.
- **Prior art.** The owner named Claude Tag (Claude in Slack) as a possible starting point. Shared coding sessions such as VS Code Live Share are also worth studying. Neither was researched for this note, so what each can and cannot do is unverified.
- **How success is measured.** The owner's goal is a team that moves faster by working in the same context. Choose a measure (for example the time from a bug report to a merged fix, or how often a handoff loses work) and take a baseline before claiming any improvement.
- **Name and repository.** Not chosen.

## How it could connect to Skilliton

Much of what the pillars call team-owned context already exists in a repository Skilliton has prepared: the handoff, one task record per piece of work with its acceptance criteria and checkpoints, decisions and lessons kept one file each, and the company's instruction block. A shared session could read and write those records instead of starting a second store, and the merge gate would still decide what reaches the shared branch, whatever happened in the session. Whether to connect them this way, and through what interface, is for the new project to decide once it has a design of its own.

## Starting the new project

Start it from a standalone brief written for a repository that knows nothing about Skilliton. It covers the idea, the pillars, the open questions, a short description of Skilliton and what not to rebuild, working rules, and first steps. That brief is kept outside this repository until the new one exists, and then becomes the new project's own document. This page stays Skilliton's record of the idea and of where Skilliton stops.
