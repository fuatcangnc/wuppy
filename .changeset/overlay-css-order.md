---
"wuppycms": patch
---

An instant production edit no longer changes other elements: the overlay CSS is made only for classes the theme's build has no rule for. Before, adding `flex` to one element made `.flex` again after the build's CSS, so it beat `sm:grid` on every element that had both.
