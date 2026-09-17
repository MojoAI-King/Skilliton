#!/usr/bin/env node
// The Skilliton command line, run from a company skills repository checkout. The runtime itself lives in the workflow
// plugin (packs/base/plugins/workflow/runtime/), so an installed copy of the plugin carries the same code as the
// release it came from. See that folder's skilliton.mjs for commands and exit codes.
import "../packs/base/plugins/workflow/runtime/skilliton.mjs";
