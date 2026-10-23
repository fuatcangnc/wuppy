---
title: Redirects
description: Send old URLs to new ones and fix broken links.
sidebar:
  order: 12
---

Redirects can come from `wuppy.config` (`redirects: [{ from, to }]`) or be managed in **Redirects**.

- Each rule has a source, a target, permanent (301) or temporary (302), a note and an on/off switch.
- Sources can be exact paths, wildcards or regular expressions. The most specific wins: exact, then the longest
  wildcard, then regex. Unsafe expressions are refused.
- Loops, duplicates and redirects to other sites (open redirects) are refused. Query strings are kept.
- The **404 log** lists missing paths with a hit count and last-seen time; create a redirect from any of them.
- Import and export rules as CSV or JSON.
