# Release checklist: Tycoon, server, and Firestore rules

Run these in order. The order matters: the server must start writing wallet fields
before the rules stop browsers from writing them.

## 1. Before anything goes live

- [ ] `main` contains the release commit, and `arena-server` tests pass:
      `cd arena-server && npm test` (expect 298 passing).
- [ ] Rules tests pass against the emulator (needs Java 11 or newer):
      `npx firebase emulators:exec --only firestore --project iantopia-rules-test "cd firestore-tests && npm test"`
      (expect 23 passing).
- [ ] `npx astro build` succeeds.

## 2. VM: server code and settings

1. Add the owner setting to `/srv/iantopia/secrets/arena.env`:

   ```
   OWNER_EMAIL=dirpysquid45@gmail.com
   ```

   It enables the owner-only `GET /owner/check` endpoint, and it's a separate
   setting from `ADMIN_EMAILS`. Without it, nobody can call that endpoint.

2. Deploy the code from `main`:

   ```bash
   gcloud compute ssh dirpysquid45@instance-20261021-231846 --zone=us-central1-a --project=iantopia \
     --command="cd /srv/iantopia/repo && BRANCH=main bash deploy/vm/bootstrap.sh"
   ```

   The bootstrap also rebuilds the site and reinstalls the news timer. It sets the
   news service user from the account running it.

3. Check the server and the news timer:

   ```bash
   docker ps --filter name=iantopia-arena-server
   systemctl list-timers iantopia-news.timer --no-pager
   journalctl -u iantopia-news.service -n 20 --no-pager
   ```

## 3. Firestore rules (after the server is running the new code)

```bash
firebase deploy --only firestore:rules --project iantopia
```

This uploads `firestore.rules` to the live database and takes effect immediately
for every player. Run it only after step 2, because the tightened rules refuse
browser writes to wallet fields. The server writes those fields itself.

## 4. Smoke test (live site)

- [ ] Home page loads, and "My Iantopia" opens `/tycoon`.
- [ ] Tycoon: place a road and a building; income ticks; the "Next:" goal shows.
- [ ] Sign in, then reload: the village and balance survive.
- [ ] Arena lobby loads; Pong and Air Hockey open.
- [ ] `/news` shows a digest, and `stocks.json` is recent.

## Rollback

Before step 2, keep the last good `main` on a branch, so there's something to roll back to:

```bash
git branch pre-tycoon <last-good-main-commit> && git push origin pre-tycoon
```

(A branch, not a tag: the bootstrap pulls the branch it checks out.)

- Server: `BRANCH=pre-tycoon bash deploy/vm/bootstrap.sh` on the VM.
- Rules: the old rules are in git on that branch, `git show origin/pre-tycoon:firestore.rules`.
  Paste that file in the Firebase console, or deploy it with `firebase deploy --only firestore:rules`.
