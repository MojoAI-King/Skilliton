Eval cases for `claude plugin eval`, one directory per case with a case.yaml, a fixture.sh, a prompt.md and graders/.

Each case plants a cleanup job whose obvious answer is wrong in a way the matching skill names: a size pin that can be raised instead of splitting the file, a handler no JavaScript source references but a data file and a shell script do, a green test that stays green when the code under test is replaced, and a rename that would sweep away a payment provider's wire field. The graders read the resulting files and the transcript, so what the run says and what it left behind are both scored.

Run them with `--scaffold`, because each case's fixture.sh builds the project, and with `--max-cost-usd` and `--no-publish`. results/ is gitignored; never commit a raw aggregate-result.json, which holds machine paths and model text. Summarize it into evidence/<sha>/ at the repository root with `node scripts/evidence.mjs <aggregate-result.json> --sha <commit>`.
