// check-tail.mjs: the lines of a check's output that the delivery gate prints when it rejects (lib/delivery.mjs
// runCheck). docs/CONTRACTS.md section 8.
//
// The gate keeps the last lines of a check's output. For a node --test run that is the wrong end: the spec reporter
// prints a "failing tests:" header and then each failure again with its stack, so the last lines are the end of the
// last stack trace, and a short run could leave the header as the last thing kept with every failing test name after
// it cut away. So when that header appears, the tail starts at the header and keeps the lines that name a failing
// test ("test at <file>:<line>", and a cross mark, U+2716, before a name) ahead of the rest; the cut falls before the
// header, never after it.
// Without the header the tail is the last lines, as before. Everything is bounded: at most max lines are kept, and
// the section holds at most max name lines and max other lines, whatever the check prints.
// Nothing here imports from outside the plugin folder.

const HEADER_RE = /^\s*(?:\u2716\s*)?failing tests:\s*$/;
const NAME_RE = /^\s*(?:\u2716\s|test at \S)/;

export function tailCollector(max) {
  const last = [];
  let section = null; // { header, lines: [{ i, line, name }], names, others }
  const keep = (line) => {
    last.push(line);
    if (last.length > max) last.shift();
    if (HEADER_RE.test(line)) { section = { header: line, lines: [], names: 0, others: 0, seen: 0 }; return; }
    if (!section || !line.trim()) return;
    const name = NAME_RE.test(line);
    const i = section.seen++;
    if (name && section.names < max) { section.lines.push({ i, line, name }); section.names++; }
    else if (!name && section.others < max) { section.lines.push({ i, line, name }); section.others++; }
  };
  // The lines to print: the header and as many of the section's lines as fit, name lines first, in output order.
  const lines = () => {
    if (!section) return [...last];
    const room = max - 1;
    const names = section.lines.filter((l) => l.name).slice(0, room);
    const others = section.lines.filter((l) => !l.name).slice(0, room - names.length);
    return [section.header, ...[...names, ...others].sort((a, b) => a.i - b.i).map((l) => l.line)];
  };
  return { keep, lines };
}
