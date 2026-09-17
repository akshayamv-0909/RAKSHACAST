# 🚀 Google Play Deployment & Release Guide for RakshaCast
**Application: RakshaCast (com.rakshacast.app)**  
**Target API: Android 14 (API Level 34)**  
**Version: 1.0.0 (VersionCode: 1)**

---

## 📋 1. Release Checklist Summary

| Requirement | Configured Value | Status |
| :--- | :--- | :--- |
| **Package Name** | `com.rakshacast.app` | ✅ Verified |
| **Target SDK Version** | `34` (Android 14) | ✅ Google Play Compliant |
| **Minimum SDK Version** | `26` (Android 8.0 Oreo) | ✅ Broad 95%+ device reach |
| **Permissions Policy** | Foreground Location & Notifications only | ✅ No background location abuse |
| **Privacy Policy URL** | Hosted in-app & available at `docs/PRIVACY_POLICY.md` | ✅ Compliant |
| **Data Safety Sheet** | Defined at `docs/DATA_SAFETY.md` | ✅ Ready for Play Console |
| **Build Artifacts** | Signed Android App Bundle (`.aab`) & Direct APK (`.apk`) | ✅ Configured |

---

## 🛠️ 2. Generating the Signed Android App Bundle (.aab)

### Step 1: Generate Release Keystore (if not already created)
```bash
keytool -genkeypair -v -keystore release/rakshacast-release-key.keystore -alias rakshacast -keyalg RSA -keysize 2048 -validity 10000
```

### Step 2: Build the Production `.aab` via EAS
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build signed production .aab bundle for Google Play
eas build --platform android --profile production
```
*(EAS will automatically sign your bundle with the release keystore and output `rakshacast-release.aab`)*.

---

## 📱 3. Generating Direct Test APK (.apk) for Local Testing
To distribute the APK directly to jury members or field rescue teams:
```bash
eas build --platform android --profile preview
```
*(Outputs standalone `rakshacast-preview.apk` installable on any Android phone).*

---

## 📤 4. Uploading to Google Play Console

1. Log in to [Google Play Console](https://play.google.com/console).
2. Click **Create App**:
   - **App Name**: `RakshaCast`
   - **Default Language**: `English (India) - en-IN`
   - **App or Game**: `App`
   - **Free or Paid**: `Free`
3. In the left menu, navigate to **Testing > Internal Testing**:
   - Click **Create new release**.
   - Drag and drop your generated **`rakshacast-release.aab`** file.
   - Release name: `1.0.0 (1) - Initial SIH 2026 Production Candidate`.
   - Release notes:
     ```
     Initial release of RakshaCast AI Early Warning & Severe Weather Nowcasting Platform.
     - Real-time IMD Doppler radar nowcast telemetry.
     - Topographical high-ridge safe evacuation routing.
     - Zero-signal offline BLE mesh distress beacon.
     ```
4. Complete the **Policy > App Content** sections:
   - **Privacy Policy**: Paste your hosted privacy policy URL.
   - **Data Safety**: Refer to `docs/DATA_SAFETY.md`.
   - **Location Permissions**: Declare *“Foreground use only for high-ground flood evacuation routing.”*
5. Click **Review and Rollout Release**!
