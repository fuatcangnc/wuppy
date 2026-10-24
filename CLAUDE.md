Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass.
Decisions live in .opencode/KARARLAR.md; progress in yapılacaklar.md (`+ [x]` done, `- [ ]` open). Architecture: .opencode/PROJE-YAPISI.md.
Every user-visible feature ships with docs in the same change: an English page in docs/src/content/docs/ and its Turkish twin under tr/ (`pnpm --filter @wuppycms/docs test` checks the pairs).
Site templates are always Tailwind CSS 4 + bejamas/ui (`templates/starter`; see ADR-015).
