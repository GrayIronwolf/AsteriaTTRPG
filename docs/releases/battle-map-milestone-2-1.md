# Battle map milestone 2.1 — Storage CORS repair
Browser evidence: requests for a WebM scene from https://asteriattrpg.com fail with missing Access-Control-Allow-Origin and retry-limit-exceeded. CORS is the confirmed browser symptom; an upstream error may also be involved.

Run GitHub Actions **Battle map Storage CORS** on the reviewed branch. Select audit to inspect the live bucket without changes, or repair with confirmation REPAIR-ASTERIA-STORAGE-CORS. Uses existing production OIDC identity; requires storage.buckets.get and storage.buckets.update on the existing bucket. Environment approval or branch restrictions may apply. The workflow preserves existing CORS entries, backs up the original list, uses a metageneration precondition, and verifies readback. It changes no Firebase rules, IAM, objects, or download tokens.

If workflow access is denied, a bucket administrator can perform the same reviewed repair. Do not replace existing CORS entries blindly. After repair, reload the GM battle map, test a small PNG and the failing WebM, and repeat on an authenticated player display. Check DevTools for successful media requests and absence of CORS errors. If still failing, inspect the underlying response and deployed Storage permissions before changing any rules. Do not make files public.

Rollback: use the saved original-bucket-cors artifact with gcloud storage buckets update gs://asteria-ttrpg.firebasestorage.app --cors-file=original.json (or --clear-cors if originally empty), only after verifying no intervening configuration changes.
