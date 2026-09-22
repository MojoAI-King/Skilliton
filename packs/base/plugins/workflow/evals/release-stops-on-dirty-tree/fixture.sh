#!/usr/bin/env bash
# A small company skills repository on main: a marketplace with one plugin, one commit, and an untracked file inside
# the plugin folder. The request to release arrives with that file in place, so the tree is not what a manifest would
# describe. This plugin's own runtime is on the path as `skilliton` through bin/, the way an installed copy is.
set -eu
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skilliton="$here/../../bin/skilliton"
[ -x "$skilliton" ] || { echo "fixture: the workflow plugin's bin/skilliton was not found at $skilliton" >&2; exit 1; }
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid && git config commit.gpgsign false
mkdir -p .claude-plugin packs/acme/plugins/demo/.claude-plugin packs/acme/plugins/demo/skills/hello releases
printf '{"name":"acme-skills","owner":{"name":"acme"},"plugins":[{"name":"demo","source":"./packs/acme/plugins/demo","description":"a demo plugin"}]}\n' > .claude-plugin/marketplace.json
printf '{"name":"demo","version":"0.1.0","description":"a demo plugin"}\n' > packs/acme/plugins/demo/.claude-plugin/plugin.json
printf -- '---\nname: hello\ndescription: Use when the user asks for a greeting.\n---\n\n# hello\n\nSay hello.\n' > packs/acme/plugins/demo/skills/hello/SKILL.md
printf '# Changelog\n\n## Unreleased\n\n- demo 0.1.0: the hello skill.\n' > CHANGELOG.md
printf '# acme skills\n' > README.md
: > releases/.keep
git add -A && git commit -qm "the acme skills repository with one plugin"
# The untracked file: a scratch note someone left inside the plugin folder.
printf 'reminder: ask about the greeting wording\n' > packs/acme/plugins/demo/notes.txt
