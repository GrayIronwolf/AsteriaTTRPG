#!/usr/bin/env python3
"""Consolidate GitHub branch names only after archived commit ancestry is verified.

This is a repository administration operation, NOT a website or Firebase deploy.
A no-op audit is the default; deletion requires a workflow-dispatch confirmation.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO = "GrayIronwolf/AsteriaTTRPG"
KEEP = frozenset({
    "main",
    "Website-Build-Test",
    "react-vite-live",
    "Asteria-W-Recovery",
    "Asteria-Development-Archive",
})
MANIFEST = "docs/branch-archive/branch-heads-pre-consolidation-2026-11-21.json"
RECOVERY_SHA = "e3eff761f3113263c2e4da3dee30ba9acb656dbb"
MANIFEST_COMMIT = "8509b3a075bbb8e0dbd6647e874fd2bf7bf546dd"
CONFIRM = "REMOVE-UNAPPROVED-BRANCHES"
BASE = "https://api.github.com/repos/" + REPO
TOKEN = os.environ.get("GH_TOKEN", "")
ACTION = os.environ.get("CLEANUP_ACTION", "audit")
CONFIRMATION = os.environ.get("CLEANUP_CONFIRM", "")


def api(path, method="GET", body=None):
    payload = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=payload,
        method=method,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "asteria-safe-branch-cleanup",
            **({"Content-Type": "application/json"} if payload is not None else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read()
        return json.loads(data) if data else None


def all_pages(path):
    rows = []
    page = 1
    while True:
        separator = "&" if "?" in path else "?"
        part = api(path + separator + "per_page=100&page=" + str(page))
        if not isinstance(part, list):
            raise RuntimeError("Expected paginated list from " + path)
        rows.extend(part)
        if len(part) < 100:
            return rows
        page += 1
        if page > 50:
            raise RuntimeError("Unexpected pagination volume")


def ref_sha(name):
    encoded = urllib.parse.quote(name, safe="/")
    row = api("/git/ref/heads/" + encoded)
    return row["object"]["sha"]


def main():
    if (os.environ.get("GITHUB_REPOSITORY") != REPO or
            os.environ.get("GITHUB_REF") != "refs/heads/main" or
            os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch"):
        raise RuntimeError("Only a manually dispatched main-branch workflow is permitted")
    if ACTION not in ("audit", "delete"):
        raise RuntimeError("Unsupported operation")
    if ACTION == "delete" and CONFIRMATION != CONFIRM:
        raise RuntimeError("Exact confirmation phrase required")
    if not TOKEN:
        raise RuntimeError("GitHub token unavailable")

    manifest_url = "/contents/" + MANIFEST + "?ref=Asteria-Development-Archive"
    manifest_data = api(manifest_url)
    manifest = json.loads(base64.b64decode(manifest_data["content"]).decode("utf-8"))
    expected = {entry["name"]: entry["sha"] for entry in manifest["branches"]}
    if len(expected) != 380 or set(manifest["retain"]) != KEEP:
        raise RuntimeError("Manifest inventory or approved branch list differs")
    if ref_sha("Asteria-W-Recovery") != RECOVERY_SHA:
        raise RuntimeError("Recovery baseline has changed; refusing cleanup")

    current_rows = all_pages("/branches")
    current = {row["name"]: row["commit"]["sha"] for row in current_rows}
    # The previously approved cleanup can already be complete. This is a
    # valid, safe end state, provided the archive history is still verified.
    already_clean = set(current) == KEEP and len(current) == len(KEEP)
    if not already_clean and (len(current) != len(expected) or
                              set(current) != set(expected)):
        added = sorted(set(current) - set(expected))
        missing = sorted(set(expected) - set(current))
        raise RuntimeError("Branch inventory changed. New: " + repr(added) +
                           ", missing: " + repr(missing))
    for name in sorted(set(current) - KEEP):
        if current[name] != expected[name]:
            raise RuntimeError("Unapproved branch has new work: " + name)

    # The archive keeps its original website tree, but adds octopus merge
    # commits to make every original branch tip reachable from the archive.
    archive_head = ref_sha("Asteria-Development-Archive")
    archive_parents = set()
    sha = archive_head
    traversed = 0
    main_saved = False
    while sha != MANIFEST_COMMIT:
        entry = api("/git/commits/" + sha)
        parents = [parent["sha"] for parent in entry["parents"]]
        if not parents or traversed > 16:
            raise RuntimeError("Archive history was not recognized")
        archive_parents.update(parents[1:])
        if entry["message"].startswith("archive: preserve pre-cleanup main"):
            main_saved = expected["main"] in parents[1:]
        sha = parents[0]
        traversed += 1

    # The initial archive tip is an ancestor of the manifest commit. One
    # stacked feature branch shares that exact commit and must count as saved.
    original = api("/git/commits/" + MANIFEST_COMMIT)
    if not original["parents"] or original["parents"][0]["sha"] != expected["Asteria-Development-Archive"]:
        raise RuntimeError("Original archive ancestry differs from manifest")
    archive_parents.add(expected["Asteria-Development-Archive"])
    missed = sorted({expected[name] for name in expected if name not in KEEP}
                    - archive_parents)
    if missed or not main_saved:
        raise RuntimeError("Archive is incomplete. Missing commit tips: " +
                           repr(missed) + ", main preserved: " + repr(main_saved))
    prs = all_pages("/pulls?state=open")
    unsafe = [p["number"] for p in prs
              if p["head"]["repo"] is None or
              p["head"]["repo"]["full_name"] != REPO or
              p["head"]["ref"] in KEEP or
              p["head"]["ref"] not in current]
    if unsafe:
        raise RuntimeError("Open PR has unsupported head or protected branch: " + repr(unsafe))
    if already_clean and prs:
        raise RuntimeError("Unexpected open pull requests after completed cleanup")

    pending = sorted(set(current) - KEEP)
    print("Verified recovery SHA:", RECOVERY_SHA)
    print("Verified archived branch tips:", len(archive_parents))
    print("Branches to keep:", ", ".join(sorted(KEEP)))
    print("Branches to delete:", len(pending))
    print("Open PRs whose work is archived:", len(prs))
    if already_clean:
        print("SUCCESS: previously completed cleanup verified. Exactly five approved branches remain.")
        return
    if ACTION == "audit":
        print("AUDIT ONLY: Nothing deleted or closed.")
        return

    # Close only PRs whose source branches are explicitly being removed.
    errors = []
    for pr in prs:
        number = pr["number"]
        try:
            api("/pulls/" + str(number), "PATCH", {"state": "closed"})
            print("Closed draft/open PR #", number)
        except urllib.error.HTTPError as error:
            errors.append("Could not close PR " + str(number) + ": " + str(error))
    if errors:
        raise RuntimeError("PR closure incomplete; no branches deleted: " + repr(errors))

    for name in pending:
        try:
            # Do not destroy a branch that advanced after the initial inventory.
            if ref_sha(name) != expected[name]:
                errors.append("Branch advanced during cleanup: " + name)
                continue
            api("/git/refs/heads/" + urllib.parse.quote(name, safe="/"), "DELETE")
            print("Deleted branch:", name)
        except urllib.error.HTTPError as error:
            errors.append(name + ": HTTP " + str(error.code))
        except Exception as error:
            errors.append(name + ": " + str(error))

    remaining = {r["name"] for r in all_pages("/branches")}
    unexpected = sorted(remaining - KEEP)
    missing_keep = sorted(KEEP - remaining)
    print("Remaining branches:", len(remaining), sorted(remaining))
    # GitHub may auto-delete Dependabot heads when their PRs are closed.
    # A branch that is now absent is not a cleanup failure; only remaining
    # unapproved branches or missing approved branches are fatal.
    if errors:
        print("Nonfatal deletion responses (verified absent at end):", repr(errors[:50]))
    if unexpected or missing_keep:
        raise RuntimeError("Cleanup incomplete; work remains archived. Errors: " +
                           repr(errors[:50]) + ", extras: " + repr(unexpected[:50]) +
                           ", missing protected: " + repr(missing_keep))
    print("SUCCESS: only the five approved branches remain.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("BLOCKED:", exc, file=sys.stderr)
        sys.exit(1)
