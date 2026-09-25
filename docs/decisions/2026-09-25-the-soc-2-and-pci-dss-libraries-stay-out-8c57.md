# The SOC 2 and PCI DSS libraries stay out of public Skilliton under their publishers' terms

Kind: Living. Decision entry.

- **ID:** 2026-09-25-the-soc-2-and-pci-dss-libraries-stay-out-8c57
- **Status:** accepted
- **Date:** 2026-09-25

## Decision

The licence check that decision 2026-09-25-compliance-lives-in-public-skilliton-as-39ef left open is done, and its answer is no for both. MojoComply's SOC 2 Trust Services Criteria library (61 controls) and its PCI DSS v4.0.1 library (71 controls) stay in MojoComply. Skilliton does not publish them, their crosswalks, or their criterion titles, and the compliance scan keeps reporting them as held back when a repository's signals propose them. This changes only when a rights holder grants permission in writing; the owner's approval of 2026-09-25 was given for every waiting item in one sentence, and it cannot stand in for a third party's permission.

## Why

Both libraries say in their own headers that each requirement is a paraphrase in MojoComply's words, cited by criterion id, with the authoritative text in the publisher's document. A paraphrase avoids copying the text; it does not avoid being a derivative of it, and publishing it in a public repository under MIT is distribution to anyone.

- **PCI DSS.** The PCI Security Standards Council's terms and conditions (last updated 12 August 2020, read on 2026-09-25 at pcisecuritystandards.org/terms_and_conditions) allow a user to "view, download and print" the Council's content "solely for your own personal, non-commercial, review, study and informational purposes", and say that, except as granted there or "pursuant to a separate written agreement", a user "may not publish, distribute, copy, assign, license, sublicense, transfer, sell, prepare of derivative works of, or use for any non-personal purpose, any Content". A published library of paraphrased requirements is at least a derivative prepared for a non-personal purpose. The route is a separate written agreement with the Council.
- **SOC 2.** The AICPA's download page for the 2017 Trust Services Criteria (with the 2022 points of focus) carries no terms itself; it points to the PDF "with Copyright Information", which this session did not read. Earlier AICPA Trust Services publications carry the notice "Permission is granted to make copies of this work provided that such copies are for personal, intraorganizational, or educational use only and are not sold or disseminated". Whether the 2017 edition's notice is the same is unverified; on the notice that is known, public dissemination is outside what is granted. The route is the AICPA's permissions department.

## Alternatives rejected

- Publish the paraphrases on the owner's approval: the approval is the owner accepting a risk on the company's behalf without having seen these terms, and the PCI terms name derivative works explicitly.
- Publish only the criterion ids and let the sheet show ids with no wording: a sheet row a person cannot read without the publisher's document is not the sheet the design promised, and the titles that would make the ids readable are the publishers' text.
- Call MojoComply from Skilliton for these two: that is the third kill criterion's route, kept for when MojoComply is installed; it is not built, and it changes nothing about what this repository publishes.

## Risk

LOW for this repository: nothing is published, so nothing needs taking down. The cost is coverage. A project whose scan proposes SOC 2 or PCI DSS (repository A of evidence/live/2026-09-25-compliance-two-repositories.md proposes both) gets no Skilliton sheet for them, and the scan says why.

## Reversibility

EASY in the direction that matters: if either publisher grants permission in writing, the converter runs over that library like the eight already converted, and this entry is superseded with the grant as its evidence. Publishing first and asking later would not be reversible, because what is published stays published.

## Evidence

The two library headers in MojoComply (frameworks/soc2-tsc.yaml and frameworks/pci-dss-v4.yaml, read 2026-09-25, read-only). The PCI SSC terms page, quoted above with its own last-updated date. The AICPA download page, which names the copyright PDF without quoting it. The permission notice on earlier Trust Services documents, found by a web search on 2026-09-25 and not checked against the 2017 edition. The owner's approval of 2026-09-25 ("I approve all the things you are waiting on me for"), which listed "the SOC 2 and PCI DSS terms" among the waiting items.
