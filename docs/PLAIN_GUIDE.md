# Skilliton, in plain language

Kind: Living. Written 2026-09-22 for a business owner, a finance lead or an operations lead who has never written code and wants to understand what this is, what it costs, and what to ask before saying yes. Nothing here needs a technical word that is not explained on the spot.

## The one-paragraph version

Your developers now write software with an AI assistant sitting beside them. That assistant is capable and fast, and it does whatever the person in front of it happens to ask. Skilliton is a rulebook the assistant has to follow: which notes to keep so work survives a lost afternoon, which checks to run before it says it is finished, which dangerous commands it may never run, how it reviews work before it is saved, and what proof of security it keeps on file. The company writes the rulebook once. Every developer's assistant then follows it, in every project, without anyone having to remember.

## A picture to hold in mind

Think of a new employee who is brilliant but has no memory between days and no sense of the company's habits. Each morning you would have to explain again how we file things, what we check before shipping, what we never touch. Skilliton is the laminated card on that employee's desk, except the card is read automatically at the start of every shift, some of its rules physically stop a wrong move, and the card is signed by the company so nobody can quietly change it.

## What it actually does, in five sentences

1. **When a developer opens a project, the assistant is told where things stood** last time: what was being worked on, what was decided, what is next. Nobody has to re-explain.
2. **Before the assistant starts a piece of work, it writes down what "done" means**, in the developer's own words, and records progress as it goes. If the session is interrupted, the next one picks up from the note.
3. **Some commands are stopped before they run.** The ones that erase shared history, skip the safety checks, or add a password file by accident are refused with a reason. The ones that would throw away unsaved work ask first.
4. **Before work is saved, the assistant writes a short review in plain English**: what changed, what could break, what was tested, and a verdict.
5. **Improvements are shared the way software updates are**: the company signs a new version, every machine checks it is the genuine one, and everyone gets it. Nobody emails files around.

## What it is not

- It is not a product you pay for. It is free and open source (MIT licence). There is no service to subscribe to and nothing runs on someone else's servers.
- It is not a spy. It reads what the assistant reads, on the developer's own machine, and sends nothing anywhere. The list of every folder it writes to is a document your IT people can check against the code, and a test fails if the two disagree.
- It is not a certificate of security or compliance. It keeps evidence for your own team's review; it does not make your company compliant with anything, and nobody should say it does.
- It does not save you money on its own, and nobody here will tell you it does until it is measured. It is built to keep the assistant from wasting effort (see below). The measurement is yours to make against your own bill.

## The three levels of "it is enforced"

When someone says "our developers follow the rules," ask which of these they mean. Skilliton labels every rule with one of them.

| Level | What it means | Can a developer get around it? |
|---|---|---|
| **Enforced on the laptop** | The assistant's software runs the rule automatically, every time | A determined person with administrator rights could disable it on their own machine. You would see that in the next check. |
| **Instructed** | The assistant is asked to do it, in writing, every session | Yes, the way any written policy can be ignored. The company measures whether it is followed. |
| **Checked at the door** | The shared code repository refuses work that did not pass the company's checks, whatever happened on the laptop | No. This one does not depend on anyone's cooperation. |

The first level is the convenience. The third level is the control.

## How it gets onto every computer

Once per computer, one file from the company and one command. The file says who the company is, where its rulebook lives, and whose signatures to trust. After that, the rulebook applies to every project that developer opens. Removing it is one command too.

For a company with an IT department, that file and command are what an endpoint management tool (the kind that already pushes settings to every laptop) would run at login. That integration is designed and written up; it has not yet been built. Today a developer runs the two commands themselves.

## What "keeping the assistant from wasting effort" means

An AI assistant is billed on how much it reads and writes. Two habits inflate that: reading enormous files whole when a page would do, and pasting the entire output of a test run into the conversation. Skilliton refuses the first and routes the second into a log file, showing only the verdict. It also keeps its notes small and structured so that when the assistant's memory fills up, what it needs is a short note rather than a long transcript.

Does that lower the bill? It should. The honest answer is that it has not yet been measured properly. The repository includes a meter that reads the assistant's own usage logs, and the rule inside the project is that no number leaves the building until the meter's figure has been checked against the real bill. Ask for that comparison after a month of use; do not accept an estimate.

## What has been proven, and what has not

**Proven, with the evidence filed in the repository:** every automatic rule firing in a real session on a real machine; the dangerous commands being refused; a signed version being installed and verified as genuine on a fresh machine; the "checked at the door" refusal working on a real shared repository; the company's own rulebook being forked, renamed and released; two assistants working in parallel on separate tasks without stepping on each other, each under its assigned memory budget.

**Not yet proven:** a whole team using it day to day (one project on one machine is the live user so far); Windows; the endpoint-management integration; any figure for time or money saved.

## Questions worth asking before saying yes

- **Who decides the rulebook, and who can change it?** The people whose signing keys are on the list. Changing that list is deliberate and visible.
- **What happens if a developer's copy is tampered with?** A check reports it by name. The shared repository's own check is what stops the result from being merged.
- **What does it cost to run?** Nothing to license, no servers. The cost is a few hours of a technical person's time to fork it, name it, and sign the first version.
- **What if we stop using it?** One command removes it from a computer; another removes it from a project and leaves every note it kept. The notes are plain text files in your own repositories.
- **What could go wrong?** A rule that is too strict slows people down; the rulebook is the company's to loosen, and loosening is announced, never silent. A rule that only exists as an instruction can be ignored; the "checked at the door" level is there for the ones that matter.

## The short version to repeat in a meeting

It is a free, open-source rulebook for AI coding assistants. The company writes it once and signs it; every developer's assistant follows it automatically; the shared repository refuses work that broke the rules; the notes it keeps mean nothing is lost when a session ends. It has been measured working on real machines. It has not been measured saving money, and it will not be described that way until it is.
