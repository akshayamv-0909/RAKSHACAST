# 📡 How to Integrate Live Real-World Indian Meteorological & Sensor Data into RakshaCast

This guide explains how **RakshaCast** connects to real-world live APIs and sensors, along with instructions for production deployment.

---

## 🏛️ 1. Official Live Indian Data Feeds Used

### A. India Meteorological Department (IMD) Doppler Radar & AWS APIs
* **Endpoint**: `https://mausam.imd.gov.in/api/v1/nowcast`
* **Radar Gateway**: `https://radar.imd.gov.in/products/`
* **Parameters Retrieved**:
  - Rainfall rate ($Z-R$ power relationship from reflectivity $dBZ$).
  - Surface wind gusts and direction.
  - Lightning flash density ($strikes/min$).

### B. Global/Indian Catchment Open-Meteo High-Resolution API
* **Endpoint**: `https://api.open-meteo.com/v1/forecast`
* **Real-time Call**:
  ```javascript
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,rain,surface_pressure,wind_speed_10m&hourly=precipitation_probability,rain&timezone=auto`;
  const response = await fetch(url);
  const data = await response.json();
  ```
* **Parameters Retrieved**:
  - Temperature ($2^\circ	ext{C}$ air temperature).
  - Relative Humidity (antecedent soil moisture proxy).
  - Hourly precipitation rate ($mm/hr$).
  - Surface Atmospheric Pressure ($hPa$).

### C. Central Water Commission (CWC) River Gauge Telemetry
* **Parameters**:
  - Current river gauge water level ($m$).
  - Danger Mark & Warning Mark thresholds.

---

## ⚙️ 2. Real-World API Gateway Architecture

```
[ Central Water Commission Sensors ]   [ IMD Doppler Radars ]   [ Open-Meteo / Satellites ]
                   │                              │                           │
                   └──────────────────────────────┼───────────────────────────┘
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │   RakshaCast Backend Proxy (`server/index.js`)   │
                         │   • Ingests Live JSON Feeds every 5 mins        │
                         │   • Computes SCS-CN Runoff & Triage Risk Score  │
                         │   • Fails gracefully to local cached telemetry  │
                         └─────────────────────────────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │   Android Mobile App (Citizen & NDRF Interface)  │
                         │   • Live GPS Location Mapping                   │
                         │   • Dynamic Elevation Safe Routing              │
                         │   • Offline BLE Mesh Packet Relay               │
                         └─────────────────────────────────────────────────┘
```

---

## 🔑 3. Configuring Live Keys in `.env.production`
Edit your `.env.production` file:
```bash
# IMD & Ministry Gateways
EXPO_PUBLIC_IMD_GATEWAY_URL=https://mausam.imd.gov.in/api/v1/nowcast
EXPO_PUBLIC_OPEN_METEO_API=https://api.open-meteo.com/v1/forecast

# Google Maps SDK Key for Android
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyYourProductionGoogleMapsKeyHere
```
