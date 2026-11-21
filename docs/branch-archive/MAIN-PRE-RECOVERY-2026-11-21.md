# Asteria main branch — pre-recovery snapshot

**Purpose:** Preserve the full Git commit history and complete source tree of the original `main` branch before resetting `main` to the user-verified PR #280 website.

- Repository: `GrayIronwolf/AsteriaTTRPG`
- Preserved original `main` commit: `0886510609f1554ec20cfbb7717ff772e921b59d`
- Preserved original `main` tree: `077f9453a216e6748df271fa35da9dfc91631f46`
- Recovery target (merged PR #280): `e3eff761f3113263c2e4da3dee30ba9acb656dbb`
- Backup destination: `Asteria-Development-Archive`
- Snapshot recorded: 21 November 2026 (UTC)

## How the backup is preserved

The archive branch will include a Git **merge commit with an additional parent pointing to the entire original main commit**. This permanently makes the main snapshot and all its ancestor commits reachable through the archive branch without replacing the archive's own checked-out source tree or merging the newer React website into the recovered website.

The original main revision remains browsable at:
https://github.com/GrayIronwolf/AsteriaTTRPG/tree/0886510609f1554ec20cfbb7717ff772e921b59d

To restore this exact code in a local clone:
```sh
git fetch origin Asteria-Development-Archive
git switch --detach 0886510609f1554ec20cfbb7717ff772e921b59d
```

This archived snapshot preserves Git-tracked source, committed assets, workflows, and history. It does **not** snapshot live Firebase / Firestore / Auth / Storage data, deployed Firebase Functions, GitHub repository settings or Actions secrets.

Do not overwrite `Asteria-W-Recovery`: it is the separate user-verified PR #280 recovery backup.
