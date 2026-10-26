# Achievement Hub for Android

A native Kotlin + Jetpack Compose app that uses the same Cloudflare Worker API as the web app.

GitHub Actions builds every change: [`.github/workflows/android.yml`](../.github/workflows/android.yml) runs lint and the unit tests, then builds a release APK that you can download from the workflow run. Pushing a tag like `android-v0.1.0` publishes a signed APK on the repo's **Releases** page ([`android-release.yml`](../.github/workflows/android-release.yml)).

## One-time setup

You do this once. It takes about 15 minutes.

### 1. Create the signing key

Android only installs updates signed with the **same key** as the installed app, and Google sign-in is tied to that key's fingerprint. Create it once and keep it forever. If you lose it, your brother has to uninstall the app and reinstall it.

```bash
keytool -genkeypair -v -keystore achievement-hub-release.jks \
  -alias achievement-hub -keyalg RSA -keysize 4096 -validity 10000
```

It asks for a password and some name fields; you can leave the name fields blank. **Save the `.jks` file and the password in your password manager.** Never commit the file. `.gitignore` already blocks `*.jks`.

### 2. Add it to GitHub

In the repo, go to **Settings → Secrets and variables → Actions**.

**Secrets** tab, then **New repository secret** for each:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the output of `base64 -w0 achievement-hub-release.jks` (on macOS: `base64 -i achievement-hub-release.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `achievement-hub` |
| `ANDROID_KEY_PASSWORD` | the key password. It's the same as the keystore password unless you set a different one. |

**Variables** tab, then **New repository variable** for each. These aren't secret:

| Name | Value |
|---|---|
| `API_BASE_URL` | your Worker URL, e.g. `https://achievement-hub.<you>.workers.dev` |
| `GOOGLE_WEB_CLIENT_ID` | the **web** OAuth client ID you already use for the site (the same value as the `GOOGLE_CLIENT_ID` Worker secret) |

### 3. Register the app with Google

The app signs in with the same Google Cloud project as the website.

1. Get the key's SHA-1 fingerprint:
   ```bash
   keytool -list -v -keystore achievement-hub-release.jks -alias achievement-hub
   ```
   Copy the line that starts with `SHA1:`.
2. In Google Cloud Console, open **Google Auth Platform → Clients → Create client**.
3. Choose **Android**, enter the package name `com.johnlanni.achievementhub`, paste the SHA-1, and click **Create**.

You don't need to put this client's ID anywhere. Google matches it by package name and fingerprint. The app asks Google for a token addressed to the **web** client ID, which is what the Worker checks.

If you build from Android Studio, also add an Android client with your local debug key's SHA-1. You can get it with `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`.

## Installing on a phone or the Thor

- **A test build from any CI run:** open the run in the repo's **Actions** tab, download the `achievement-hub-ci-…` artifact, unzip it, and install the APK.
- **A release:** open the repo's **Releases** page on the device and download `achievement-hub-<version>.apk`.

Android asks you to allow installing from your browser or file manager the first time. Updates install over the existing app, as long as they're signed with the same key.

For automatic updates, the free [Obtainium](https://github.com/ImranR98/Obtainium) app can watch this repo's Releases. The repo is private, so Obtainium needs a GitHub token with read access.

## Publishing a release

```bash
git tag android-v0.1.0
git push origin android-v0.1.0
```

## Building locally (optional)

Open the `android/` folder in Android Studio, or run `./gradlew assembleDebug` with the Android SDK installed. Put the configuration in `~/.gradle/gradle.properties` so it stays out of the repo:

```properties
apiBaseUrl=https://achievement-hub.<you>.workers.dev
googleWebClientId=<web client id>
```

For the Android emulator talking to `npm run dev` on your computer, use `apiBaseUrl=http://10.0.2.2:8787`.
