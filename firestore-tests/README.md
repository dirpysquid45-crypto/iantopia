# Firestore rules tests

These check `firestore.rules` against the local Firestore emulator. Each test is one promise
the rules make to a browser: what a player can read, what they can write, and what stays closed.

Run from the repository root (needs Java 11 or newer on the PATH):

```bash
cd firestore-tests && npm install --legacy-peer-deps && cd ..
npx firebase emulators:exec --only firestore --project iantopia-rules-test "cd firestore-tests && npm test"
```

The emulator reads `firestore.rules` and the port in `firebase.json` (8080).
