# A replacement string ending in a dollar-backtick splices the file into itself

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-a-replacement-string-ending-in-a-dollar-1e99
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

Twice in one session, a small patch script that edited a source file in place corrupted it. The file grew by several thousand characters, and the inserted text was the file's own earlier content, spliced in at the point of the edit. The failure surfaced as a syntax error at a line that read perfectly well, because the real damage was above it.

Once the shape was recognized, the second occurrence cost minutes. The first cost much longer, because a file that contains a copy of itself does not look like a bad `replace` call. It looks like a bad merge.

## The mechanism

`String.prototype.replace(searchValue, replacement)` treats `$` in a **string** replacement as a substitution pattern:

| Pattern | What it inserts |
|---|---|
| `` $` `` | everything in the subject string before the match |
| `$'` | everything after the match |
| `$&` | the match itself |
| `$1` | a capture group |

The replacement text here was built with a template literal and ended with a Markdown code span, so its last two characters were `` $` ``. JavaScript expanded that into the entire prefix of the file. No exception is raised, nothing warns, and the result is a valid string. The only symptom is a file that got bigger than the edit.

## The fix

Pass a **function** as the replacement. A function replacer's return value is used literally and no `$` pattern is ever interpreted:

```js
s = s.replace(from, () => to);   // safe
s = s.replace(from, to);         // interprets $`, $', $&, $1 in `to`
```

Recovering the already-damaged file: find the marker that should follow the edit, confirm the text after it, then walk `s[idx + k] === s[k]` to measure how long the duplicated prefix is, and slice exactly that many characters out.

## The rule

Never pass a computed string as the second argument of `.replace()` or `.replaceAll()`. Use a function replacer every time, including when the text looks harmless, because the text comes from a variable whose last character nobody checked. The same applies to `RegExp` replacement strings.

When a patch script runs and a check then fails at a line that looks fine, compare the file's size before and after before reading the line. A file larger than the edit means the edit inserted something nobody wrote.

## What now enforces it

Nothing in this repository, and that is the honest state: the scripts that do this are written per session and thrown away, so there is no file a test could check. It is a practice, recorded here and carried in the session contract. The detection recipe above is the backstop.
