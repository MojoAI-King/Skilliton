#!/usr/bin/env bash
# live-capability-probe.sh: proves, in one real headless Claude Code session, the client behaviors Skillgate's
# lifecycle design depends on. It builds a disposable probe plugin and repository in a temp folder, so nothing in
# this repository or your configuration is used or changed.
#
#   bash scripts/live-capability-probe.sh [--claude <path to claude>] [--keep]
#
# COSTS REAL USAGE: one short session (about six turns) on the logged-in account.
#
# Checks, each reported PASS, FAIL, or NOT RUN:
#   C1 SessionStart hook output reaches the model (the model quotes a nonce only the hook printed)
#   C2 a plugin's bin/ folder is on the Bash tool's PATH (a probe executable runs by name)
#   C3 a PreToolUse "ask" with nobody to answer is denied, and the command does not run
#   C4 a Stop hook "block" makes the model continue once, and the next Stop carries stop_hook_active true
#   C5 ${CLAUDE_PLUGIN_ROOT} and ${CLAUDE_SKILL_DIR} are substituted inside a plugin SKILL.md
#   C6 --include-hook-events shows hook_started and hook_response events for SessionStart
# Exit: 0 every check PASS; 1 at least one FAIL; 2 the session did not run (nothing was proved).
set -u
CLAUDE="claude"
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --claude) CLAUDE="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "usage: $0 [--claude <path>] [--keep]" >&2; exit 2 ;;
  esac
done
command -v "$CLAUDE" >/dev/null 2>&1 || [ -x "$CLAUDE" ] || { echo "NOT RUN: claude not found ($CLAUDE)"; exit 2; }
command -v node >/dev/null 2>&1 || { echo "NOT RUN: node is needed to read the session output"; exit 2; }

W="$(mktemp -d "${TMPDIR:-/tmp}/skillgate-capability-probe.XXXXXX")"
[ "$KEEP" = 1 ] || trap 'rm -rf "$W"' EXIT
P="$W/plugin"; L="$W/log"; R="$W/repo"
mkdir -p "$P/.claude-plugin" "$P/bin" "$P/hooks" "$P/skills/probe-paths" "$L" "$R"
NONCE="SGPROBE-$(node -e 'process.stdout.write(require("crypto").randomBytes(4).toString("hex"))')"

cat > "$P/.claude-plugin/plugin.json" <<'EOF'
{ "name": "sgprobe", "version": "0.0.1", "description": "Disposable capability probe." }
EOF
printf '#!/bin/sh\necho "SGPROBE-BIN-OK"\n' > "$P/bin/sgprobe-bin"
cat > "$P/hooks/session-start.sh" <<EOF
#!/bin/sh
cat > "$L/SessionStart.json"
echo "SGPROBE-SESSIONSTART $NONCE"
EOF
cat > "$P/hooks/stop.sh" <<EOF
#!/bin/sh
n=\$(ls "$L" | grep -c '^Stop-' || true)
cat > "$L/Stop-\$n.json"
if [ ! -e "$L/stop-blocked-once" ]; then
  touch "$L/stop-blocked-once"
  printf '%s\n' '{"decision":"block","reason":"Probe: before stopping, write the single word PINEAPPLESTOP on its own line."}'
fi
exit 0
EOF
cat > "$P/hooks/pretool.sh" <<EOF
#!/bin/sh
in="\$(cat)"
case "\$in" in
  *sgprobe-ask*) touch "$L/ask-issued"; printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Probe asks for confirmation."}}' ;;
esac
exit 0
EOF
cat > "$P/hooks/hooks.json" <<'EOF'
{ "hooks": {
  "SessionStart": [ { "hooks": [ { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/session-start.sh", "timeout": 10 } ] } ],
  "Stop": [ { "hooks": [ { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/stop.sh", "timeout": 10 } ] } ],
  "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/pretool.sh", "timeout": 10 } ] } ]
} }
EOF
cat > "$P/skills/probe-paths/SKILL.md" <<'EOF'
---
name: probe-paths
description: Probe skill. Use only when the user asks for the probe-paths skill by name.
---

# probe-paths

Report these two lines to the user exactly as they appear here, character for character:

PLUGINROOT=${CLAUDE_PLUGIN_ROOT}
SKILLDIR=${CLAUDE_SKILL_DIR}
EOF
chmod +x "$P/bin/sgprobe-bin" "$P/hooks/"*.sh
( cd "$R" && git init -q && git -c user.name=probe -c user.email=probe@example.invalid commit -q --allow-empty -m init )

VERSION="$("$CLAUDE" --version 2>/dev/null | head -1)"
PROMPT="This is an automated capability probe in a disposable folder. Do these four steps in order, then give a short numbered report. 1) Quote exactly any line starting with SGPROBE-SESSIONSTART that you were given before this message, or write NONE. 2) Run the shell command: sgprobe-bin (just that) and report its output or error. 3) Run the shell command: echo sgprobe-ask (just that) and report exactly what happened. 4) Use the probe-paths skill and report the two lines it tells you to report."
( cd "$R" && "$CLAUDE" -p "$PROMPT" --plugin-dir "$P" --setting-sources project --output-format stream-json --verbose --include-hook-events --permission-prompts none --max-turns 14 --allowedTools Bash Skill < /dev/null ) > "$W/stream.jsonl" 2> "$W/stderr.txt"
RC=$?
echo "claude: $VERSION; session exit $RC"
if [ "$RC" -ne 0 ] || [ ! -s "$W/stream.jsonl" ]; then
  echo "NOT RUN: the session did not complete (exit $RC); nothing below was proved."
  head -c 400 "$W/stderr.txt"
  exit 2
fi

node - "$W" "$NONCE" <<'EOF'
const fs = require("fs"), path = require("path");
const [W, NONCE] = process.argv.slice(2);
const events = fs.readFileSync(path.join(W, "stream.jsonl"), "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const texts = events.filter((e) => e.type === "assistant").flatMap((e) => e.message.content.filter((c) => c.type === "text").map((c) => c.text)).join("\n");
const toolResults = events.filter((e) => e.type === "user").flatMap((e) => (e.message.content || []).filter((c) => c.type === "tool_result"));
const resultText = (r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content));
const log = (f) => { try { return JSON.parse(fs.readFileSync(path.join(W, "log", f), "utf8")); } catch { return null; } };
const checks = [];
const check = (id, label, ok, detail) => checks.push({ id, label, ok, detail });
const hookEvents = events.filter((e) => e.type === "system" && /hook_(started|response)/.test(e.subtype || ""));
check("C1", "SessionStart output reaches the model", texts.includes(NONCE), texts.includes(NONCE) ? "the model quoted the nonce" : "the nonce was not quoted");
check("C2", "plugin bin/ on the Bash tool PATH", toolResults.some((r) => resultText(r).includes("SGPROBE-BIN-OK")), "probe executable output seen in a tool result");
const denied = events.some((e) => e.type === "system" && e.subtype === "permission_denied");
const askIssued = fs.existsSync(path.join(W, "log", "ask-issued"));
check("C3", "PreToolUse ask with nobody to answer is denied", askIssued && denied && !toolResults.some((r) => /^sgprobe-ask\s*$/m.test(resultText(r))), `ask issued: ${askIssued}; permission_denied event: ${denied}`);
const stop0 = log("Stop-0.json"), stop1 = log("Stop-1.json");
check("C4", "Stop block continues once, then stop_hook_active is true", !!stop0 && stop0.stop_hook_active === false && !!stop1 && stop1.stop_hook_active === true && /PINEAPPLESTOP/.test(texts), `first Stop stop_hook_active=${stop0?.stop_hook_active}; second=${stop1?.stop_hook_active}`);
const subst = /PLUGINROOT=\/\S+/.test(texts) && /SKILLDIR=\/\S+probe-paths/.test(texts) && !texts.includes("${CLAUDE_PLUGIN_ROOT}");
check("C5", "SKILL.md path variables substituted", subst, subst ? "both lines carried absolute paths" : "placeholders not substituted or not reported");
check("C6", "hook events in stream-json", hookEvents.some((e) => e.hook_event === "SessionStart" && e.subtype === "hook_response"), `${hookEvents.length} hook events`);
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id} ${c.label}: ${c.detail}`);
const ss = log("SessionStart.json");
console.log(`SessionStart input keys: ${ss ? Object.keys(ss).join(", ") : "not captured"}; source=${ss?.source}`);
console.log(`Stop input keys: ${stop0 ? Object.keys(stop0).join(", ") : "not captured"}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
EOF
