# iantopia VM setup (Oracle Cloud, Ubuntu 22.04 ARM)

Runs everything that used to live on qasim: the static site, the arena server,
the transcript app, and the news job. Firestore and Auth are already in the
cloud, so no user data lives on this machine.

## 1. Secrets (not in git)

On the VM, as the `ubuntu` user:

```bash
mkdir -p /srv/iantopia/secrets && chmod 700 /srv/iantopia/secrets
```

- **Firebase service account key:** in the Firebase console, go to Project
  settings → Service accounts → Generate new private key. Copy the file to
  `/srv/iantopia/secrets/service-account-key.json` (use Tailscale file copy, or
  paste it over SSH). Then revoke the old key that's on qasim.
- **arena.env:** create `/srv/iantopia/secrets/arena.env` with:
  ```
  ADMIN_EMAILS=dirpysquid45@gmail.com
  ADMIN_UIDS=
  ```

## 2. Run the bootstrap

```bash
git clone https://github.com/dirpysquid45-crypto/iantopia.git /tmp/iantopia-bootstrap
BRANCH=wip/halloween-maze bash /tmp/iantopia-bootstrap/deploy/vm/bootstrap.sh
```

(Use `BRANCH=main` once the branch is merged.) The script can be re-run to
update the machine. Log out and back in after the first run, so the Docker
group applies.

Check it:
```bash
curl -I http://localhost/            # the site
curl -I http://localhost/arena-ws/   # the arena (a 400 or 426 here is normal)
docker ps                            # arena-server and transcript containers up
```

## 3. Cloudflare Tunnel (switch-over)

1. Stop the tunnel on qasim first, so the two don't fight over `iantopia.com`:
   on qasim run `sudo systemctl stop cloudflared` (or whatever the service is
   called there).
2. In the Cloudflare dashboard, go to Zero Trust → Networks → Tunnels → Create
   a tunnel. Name it `iantopia-vm`. Install the connector on the VM using the
   install command Cloudflare shows (it installs `cloudflared` as a service).
3. Add a public hostname: `iantopia.com` → `http://localhost:80`. Add `www` the
   same way if you use it.
4. Confirm the site loads at https://iantopia.com and arena multiplayer
   connects.

## 4. Things to watch

- **Oracle reclaims idle free VMs.** Check the instance's status in the Oracle
  console if the site goes down unexpectedly.
- **Secrets stay on the VM.** Never commit them, and keep the Firebase key out
  of chat.
- **Deploying updates:** re-run `bootstrap.sh` (it pulls, rebuilds, and
  restarts). For only a site change, `git pull` plus the `docker run ... npm run
  build` line is enough.
