# Intake service

A small service that takes a submitted form, checks it, and hands it to whatever the company does next. It exists so
a demonstration has a real repository to work in: real tests, a real bug, and nothing anyone has to be careful about.

- `src/validate.mjs` decides whether a submission is usable.
- `src/intake.mjs` turns a submission into a record for the next system.
- `npm test` runs the tests (`node --test test/*.test.mjs`).

Nothing here is anyone's product. It is 200 lines written for a demonstration.
