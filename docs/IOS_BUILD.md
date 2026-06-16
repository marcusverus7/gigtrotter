# iOS Build & Upload (no Mac required)

GigTrotter ships to the App Store as a **Capacitor** native shell that loads the
live site (`https://gigtrotter.vercel.app`) in a WKWebView. The binary is
compiled and uploaded by a **GitHub Actions macOS runner** — you do not need a
Mac. The pipeline lives in [`.github/workflows/ios-build.yml`](../.github/workflows/ios-build.yml).

Everything in this repo (Capacitor config, fastlane, the workflow) is already
done. To make the pipeline run, you need to provide a few **secrets** that live
inside *your* Apple account — I can't create these for you because they require
signing into your Apple ID and the private keys download only once, to you.

Do these once, then every push (or a manual "Run workflow") builds and uploads
a fresh TestFlight build automatically.

---

## 1. Create an App Store Connect API key (~2 min)

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>
   (Users and Access → Integrations → App Store Connect API).
2. Click **+** to generate a key. Name it `gigtrotter-ci`, Access = **App Manager**.
3. Note the **Key ID** and the **Issuer ID** shown on that page.
4. Click **Download API Key** — this gives you `AuthKey_XXXXXXXX.p8`.
   **It downloads only once. Save it somewhere safe.**

Then base64-encode the `.p8` so it can live in a secret. In PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\AuthKey_XXXXXXXX.p8")) | Set-Clipboard
```

(The encoded string is now on your clipboard.)

## 2. Create a private "match" repo for signing certificates (~1 min)

fastlane **match** stores your distribution certificate + provisioning profile
(encrypted) in a private git repo so every CI run reuses the same identity.

1. Create a new **private empty** GitHub repo, e.g. `gigtrotter-certs`.
2. Pick a strong passphrase — this encrypts the certs. Remember it.

## 3. Add the secrets to the GigTrotter repo

In the **gigtrotter** repo: Settings → Secrets and variables → Actions → New
repository secret. Add each of these:

| Secret name                     | Value                                                            |
| ------------------------------- | ---------------------------------------------------------------- |
| `ASC_KEY_ID`                    | Key ID from step 1                                               |
| `ASC_ISSUER_ID`                 | Issuer ID from step 1                                            |
| `ASC_KEY_P8`                    | The base64 string from step 1                                    |
| `MATCH_GIT_URL`                 | `https://github.com/<you>/gigtrotter-certs.git`                  |
| `MATCH_PASSWORD`                | The passphrase from step 2                                       |
| `MATCH_GIT_BASIC_AUTHORIZATION` | base64 of `<github-username>:<a GitHub PAT with repo scope>`     |

For the last one, in PowerShell:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("YOUR_GH_USERNAME:YOUR_PAT")) | Set-Clipboard
```

## 4. First run: generate the certificate

The certificate has to be created once before a build can use it. Trigger the
**iOS Build & Upload** workflow once with the `certificates` lane — easiest way
is to temporarily change the last workflow step's command to
`bundle exec fastlane certificates`, run it, then change it back to
`bundle exec fastlane release`. (Or run `fastlane certificates` from any Mac/
codespace once.) This populates `gigtrotter-certs`.

## 5. Build

From the repo's **Actions** tab → **iOS Build & Upload** → **Run workflow**.
The runner will:

1. install deps, generate the native iOS project (`cap add ios`),
2. fetch signing assets from match,
3. build a signed `.ipa`,
4. upload it to App Store Connect → it appears under **TestFlight** in a few
   minutes, then becomes selectable as the **Build** on the version page.

---

## Notes & known first-run tweaks

- iOS signing pipelines almost always need 1–2 small fixes on the very first
  run (a profile name, a capability, a Ruby/CocoaPods version). Send me the
  failed run's logs and I'll patch the workflow.
- **App Review risk (Guideline 4.2):** a pure website wrapper can be rejected
  for "minimum functionality." If that happens, the fix is adding native
  capabilities (push notifications via `@capacitor/push-notifications`, camera
  capture for tickets via `@capacitor/camera`). The scaffolding is ready for
  these — ask me to wire them in.
- The Team ID is baked into the Fastfile as `JQS67937W6`. Override with a
  `DEVELOPMENT_TEAM` env var if it ever changes.
