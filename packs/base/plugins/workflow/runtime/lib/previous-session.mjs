// previous-session.mjs: how a session that ended left the working tree, for the session history line that
// lib/lifecycle.mjs prints at the next start (sessionsCheck). docs/CONTRACTS.md sections 9 and 11.
//
// A session that ended with uncommitted changes and recorded no checkpoint is said so, instead of "ended normally",
// so the next session reads git status and the open task before carrying on. The end state is the dirty count on
// that session's session-end event; when that is missing (the session-end hook abandoned a slow `git status`), the
// newest stop-hook event of that session that carries one. A checkpoint event (which the checkpoint command writes
// with no session id) counts for the session when it falls between the session's last start and its end.
// Nothing here imports from outside the plugin folder.

// How the session history line names a session.
export const sessionWho = (s) => `session ${s.session ?? "(no id)"} (started ${s.startedAt})`;

const STOP_EVENTS = new Set(["stop", "stop-reminded", "maintain-reminded", "dispatch-reminded"]);

// events: the journal's events in order; previous: sessionHistory's { session, startedAt }. Returns
// { dirty: number | null, checkpoint: boolean }; dirty is null when no event of that session recorded a count.
export function sessionEndState(events, previous) {
  const id = previous?.session ?? null;
  if (id === null) return { dirty: null, checkpoint: false };
  const same = (e) => (e.session ?? null) === id;
  let start = -1;
  events.forEach((e, i) => { if (e.event === "session-start" && same(e) && e.at === previous.startedAt) start = i; });
  if (start < 0) return { dirty: null, checkpoint: false };
  let end = events.length;
  for (let i = start + 1; i < events.length; i++) if (events[i].event === "session-end" && same(events[i])) { end = i; break; }
  const counted = (e) => Number.isInteger(e?.dirty);
  let dirty = end < events.length && counted(events[end]) ? events[end].dirty : null;
  if (dirty === null) {
    for (let i = Math.min(end, events.length - 1); i > start; i--) {
      if (STOP_EVENTS.has(events[i].event) && same(events[i]) && counted(events[i])) { dirty = events[i].dirty; break; }
    }
  }
  const checkpoint = events.slice(start + 1, end + 1).some((e) => e.event === "checkpoint");
  return { dirty, checkpoint };
}

// The words for a session that ended: { unrecorded, words }, where words is "<who> ended normally" or, when it left
// uncommitted changes and no checkpoint, the warning that says so (unrecorded true).
export function endedWords(who, events, previous) {
  const { dirty, checkpoint } = sessionEndState(events, previous);
  if (dirty > 0 && !checkpoint) {
    const words = `the previous session ended with ${dirty} uncommitted change(s) and no checkpoint: read git status and the open task before carrying on`;
    return { unrecorded: true, words: `${words} (${who})` };
  }
  return { unrecorded: false, words: `${who} ended normally` };
}

// endedWords for sessionHistory's previous session when it ended (hook mode, not live, not interrupted), else null.
export function endedFor(history, events) {
  if (history.mode !== "hook" || !history.previous || history.live || history.interrupted) return null;
  return endedWords(sessionWho(history.previous), events, history.previous);
}
