# 📱 RakshaCast — AI-Powered Hyper-Local Disaster Early-Warning Android App
**Smart India Hackathon 2026 | Problem Statement: SIH26077**  
**Ministry of Earth Sciences (MoES) & India Meteorological Department (IMD)**  
*Tagline: “Predict Early. Respond Faster. Recover Stronger.”*

---

## 🚀 1. Overview & Mobile Purpose
**RakshaCast** is a complete, mobile-first Android application designed specifically for high-stress disaster emergencies. Engineered with large touch targets, high contrast, bottom-tab navigation, and instant 1-touch SOS beacons, RakshaCast executes the full disaster resilience lifecycle:
$$\text{PREDICT} \longrightarrow \text{WARN} \longrightarrow \text{EVACUATE} \longrightarrow \text{RESCUE} \longrightarrow \text{RECOVER}$$

---

## 📱 2. How to Open & Run the Mobile App

### Option A: Instant Browser Mobile View (Standalone)
Open the bundled mobile application in your browser:  
📂 [`file:///Users/jacobkothapally/.gemini/antigravity/scratch/rakshacast/public/standalone-mobile.html`](file:///Users/jacobkothapally/.gemini/antigravity/scratch/rakshacast/public/standalone-mobile.html)

### Option B: Local Android Proxy Server
```bash
cd /Users/jacobkothapally/.gemini/antigravity/scratch/rakshacast
node server/index.js
```
Open **`http://localhost:8080`** in Chrome / Safari with Mobile Device Mode enabled ($390 \times 844\text{px}$).

---

## 🗺️ 3. Mobile Screens & Bottom Tabs
1. **Home Screen**:
   - Live IMD Doppler radar weather telemetry (Rainfall intensity, surge water level, wind gusts, humidity, pressure).
   - Prominent **Risk Level Card** with lead time countdown and recommended action.
   - **4 Big Emergency Touch Actions**: *Live Risk Map*, *Safe Shelters*, *Report Hazard*, *Recovery Aid*.
   - Nearest safe high-ground shelter preview.
   - Persistent pulsing **SOS emergency button**.
2. **Live Map**:
   - Real-time GPS location marker.
   - Color-coded flood polygons (Critical, High, Moderate).
   - High-ground relief shelters with available bed counters.
   - Active NDRF rescue boats and amphibious vehicles.
3. **Evacuate Route**:
   - **Dynamic Elevation Routing**: Reroutes users along high ridges ($410m$) away from fatal submerged underpasses ($1.85m$ water depth).
   - Turn-by-Turn GPS navigation instructions.
4. **Alerts**:
   - Official IMD weather bulletins and AI nowcasts with simulated push notifications.
5. **Profile**:
   - Emergency family contact numbers and wheelchair accessibility preferences.
6. **NDRF Authority Mode**:
   - 1-Click switch to tactical emergency response queue with AI triage scoring and boat dispatching.

---

## 📦 4. React Native & Expo APK Build Instructions
To compile as a native Android APK:
1. Initialize EAS Build:
   ```bash
   npm install -g eas-cli
   eas build:configure
   ```
2. Build Android APK:
   ```bash
   eas build -p android --profile preview
   ```
