# Google Play Data Safety Declaration
**App Name: RakshaCast**  
**Package: com.rakshacast.app**  
**Target Audience: 13+ (General Public & Emergency Personnel)**

---

## 1. Data Collection & Sharing Overview

| Data Category | Data Type | Collected | Shared | Ephemeral | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Location** | Approximate Location | Yes | No | Yes | App Functionality, Disaster Early Warning |
| **Location** | Precise Location | Yes | No | Yes | High-ground evacuation routing, Rescue Triage |
| **Personal Info** | Name & Phone Number | Optional | Yes (Only on SOS) | No | Emergency rescue identification |
| **User Content** | Photos & Hazard Reports | Optional | Yes | No | Crowdsourced road blockage reporting |
| **Device IDs** | Device identifiers / BLE UUID | Yes | No | Yes | Offline mesh network routing |

---

## 2. Security Practices
* **Data Encrypted in Transit**: All data transmitted over HTTPS (TLS 1.3) and encrypted WebSocket connections.
* **Data Deletion Mechanism**: Users can delete their emergency profiles and reported claims directly within the Profile screen.
* **No Third-Party Advertising**: RakshaCast contains zero third-party advertisement SDKs or trackers.

---

## 3. Disclaimers & Regulatory Notices
* **Prototype Notice**: *“RakshaCast is an AI research prototype developed for Smart India Hackathon 2026 (SIH26077). In life-threatening emergencies, always dial official National Emergency Helplines (112 / 1078).”*
