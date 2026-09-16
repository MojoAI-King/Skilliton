# Release record schema

One file per released version: `releases/<pack>/<version>.json`. Written by `skillgate release` (to be built). Approval binds to these exact bytes; change one byte and the record no longer applies.

```json
{
  "schema": 1,
  "pack": "context-hygiene",
  "plugin": "context-hygiene",
  "version": "0.1.0",
  "commit": "<40-char sha>",
  "tree_hash": "<git tree hash of the plugin directory>",
  "contents_sha256": "<sha256 of canonical tar of the plugin directory>",
  "evidence": {
    "path": "evidence/<sha>/aggregate-result.json",
    "sha256": "<hash of that file>",
    "claude_version": "",
    "model": "",
    "judge_model": "",
    "runs_per_arm": 3,
    "cases": 0,
    "mean_delta": null,
    "partial": false
  },
  "approvals": [ { "github_login": "", "pr": 0, "merged_at": "" } ],
  "released_by": "",
  "released_at": "",
  "status": "released",
  "withdrawn_at": null,
  "withdrawal_reason": null
}
```

`status: withdrawn` removes the marketplace entry. It does not disable copies already installed. `skillgate verify` on an installed withdrawn version reports WITHDRAWN.
