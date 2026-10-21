# admin-scripts

One-off scripts that need real admin access to Firestore -- something the
site itself never has (the client SDK loaded on every page, via
`public/cloud-sync.js`, is bound by Firestore security rules restricting a
`/users/{uid}` doc to reads/writes from that exact signed-in uid). Isolated
here exactly like `news-pipeline/` isolates its own Python dependencies:
its own `package.json`, never touched by the Astro build, never served to
the client.

## currency-reform.js

One-time migration converting every account's Strubles balance on a
progressive curve (0-10,000 untouched, 10,000-50,000 at 1:5, 50,000+ at
1:20), to bring balances that grew past intended limits back in line. See
the comment at the top of the script for the exact formula.

### Setup

```bash
cd admin-scripts
npm install
```

Then get a service-account key: **Firebase Console -> iantopia project ->
Project Settings -> Service Accounts -> Generate new private key**. Save
the downloaded file as exactly `service-account-key.json` in this
directory. It's gitignored -- never commit it, never paste its contents
anywhere outside this one file.

### Running

```bash
node currency-reform.js            # dry run -- prints a full before/after
                                    # table and summary, writes nothing
node currency-reform.js --apply    # backs up the entire users collection
                                    # to backups/, then actually writes
```

Always run the dry run first and read the table. `--apply` is the only
thing that ever writes -- a bare invocation with no flags can never mutate
data. The script is idempotent (it flags every processed doc, and skips
anything already flagged), so re-running `--apply` after a partial
failure, or just to double check, is safe -- it won't convert anyone twice.

Can be run from anywhere with network access and the key file present --
a laptop, or Qasim over the existing `ssh user@100.74.195.52` connection.
Doesn't need to live on Qasim specifically; this isn't a recurring job.
