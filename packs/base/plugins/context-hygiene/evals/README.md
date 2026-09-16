Eval cases for `claude plugin eval` go here, one directory per case with a prompt.md and graders/.
Run `claude plugin eval init` from the plugin root to have Claude draft them, or `claude plugin eval init --bare <name>` for a blank template.
Always pass `--max-cost-usd`. results/ is gitignored; copy a finished aggregate-result.json into ../../../../../evidence/<sha>/ via `skillgate evidence`.
