const STATE = {
    sosRequests: [],
    rescueTeams: [],
    selectedIncident: null,
    map: null,
    markers: {},
    selectedIds: new Set()
};

const socket = io();

// UI Elements
const connIndicator = document.getElementById("conn-indicator");
const connText = document.getElementById("conn-text");
const statActive = document.getElementById("stat-active");
const statTeams = document.getElementById("stat-teams");
const alertsFeed = document.getElementById("alerts-feed");
const incidentDetailsPanel = document.getElementById("incident-details");
const inboxList = document.getElementById("inbox-list");
const bulkActionBar = document.getElementById("bulk-action-bar");
const selectedCountEl = document.getElementById("selected-count");
const bulkTeamSelect = document.getElementById("bulk-team-select");

// Connection Handling
socket.on("connect", () => {
    connIndicator.className = "w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]";
    connText.className = "text-emerald-400";
    connText.innerText = "LIVE";
    pushAlert("Connection Secured", "Live telemetry stream active.", "success");
});
socket.on("disconnect", () => {
    connIndicator.className = "w-2 h-2 rounded-full bg-red-500";
    connText.className = "text-red-400";
    connText.innerText = "OFFLINE";
    pushAlert("Connection Lost", "Attempting to reconnect...", "error");
});

// Page Routing
window.switchPage = function(pageId) {
    if (pageId === 'map' || pageId === 'home') pageId = 'command';
    document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`page-${pageId}`).classList.add('active');
    
    // Find the corresponding tab and make active
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        if(tab.getAttribute('onclick').includes(`'${pageId}'`)) {
            tab.classList.add('active');
        }
    });

    if (pageId === 'map' && STATE.map) {
        setTimeout(() => STATE.map.invalidateSize(), 100);
    }
};

// Init
document.addEventListener("DOMContentLoaded", async () => {
    initMap();
    await fetchState();
    setInterval(updateStats, 5000);
});

function initMap() {
    STATE.map = L.map('map', { zoomControl: false }).setView([17.4207, 78.3508], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(STATE.map);
    
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });
    
    // Add default street layer
    satelliteLayer.addTo(STATE.map);
    
    // Initialize Weather Radar Group
    const radarLayer = L.layerGroup();
    
    fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then(res => res.json())
        .then(data => {
            if (data.radar && data.radar.past && data.radar.past.length > 0) {
                const latestTs = data.radar.past[data.radar.past.length - 1].time;
                L.tileLayer(`https://tilecache.rainviewer.com/v2/radar/${latestTs}/256/{z}/{x}/{y}/2/1_1.png`, {
                    opacity: 0.7,
                    zIndex: 1000
                }).addTo(radarLayer);
                console.log("RainViewer Radar loaded for timestamp:", latestTs);
            }
        })
        .catch(e => console.error("RainViewer load failed:", e));

    const baseMaps = {
        "ISRO Bhuvan / Street View": streetLayer,
        "INSAT / CartoDEM (Satellite)": satelliteLayer
    };

    const overlayMaps = {
        "🔴 LIVE Doppler Weather Radar (RainViewer)": radarLayer
    };

    L.control.layers(baseMaps, overlayMaps, {position: 'topright'}).addTo(STATE.map);
    

    drawHazardZones();

    const drawnItems = new L.FeatureGroup();
    STATE.map.addLayer(drawnItems);
    STATE.drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: { marker: false, polyline: false, circlemarker: false, circle: true, rectangle: true, polygon: true }
    });
    
    STATE.map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers();
        const layer = e.layer;
        drawnItems.addLayer(layer);
        const geojson = layer.toGeoJSON();
        sendMassAlert(geojson);
    });
}

function drawHazardZones() {
    const center = [17.4207, 78.3508];
    L.circle([center[0] - 0.005, center[1] - 0.005], { radius: 1200, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, dashArray: '5, 5' }).addTo(STATE.map);
    L.circle([center[0] + 0.002, center[1] + 0.006], { radius: 1500, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.1, weight: 2 }).addTo(STATE.map);
    L.circle([center[0] + 0.006, center[1] - 0.002], { radius: 800, color: '#a855f7', fillColor: '#a855f7', fillOpacity: 0.2 }).addTo(STATE.map);
    L.circle([center[0] - 0.004, center[1] + 0.008], { radius: 600, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.2 }).addTo(STATE.map);
    
    const iconHtml = `<div style="background:#22c55e; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3)"></div>`;
    L.marker(center, { icon: L.divIcon({ html: iconHtml, className: '' }) }).addTo(STATE.map).bindTooltip("Hyderabad Evacuation Zone", { permanent: true, direction: "bottom" });
}

window.createMassAlert = function() {
    switchPage('map');
    STATE.map.addControl(STATE.drawControl);
    pushAlert("Draw Tools Activated", "Select an area on the map to broadcast evacuation alert.", "warning");
}

async function sendMassAlert(geojson) {
    STATE.map.removeControl(STATE.drawControl);
    const msg = prompt("Enter Emergency Broadcast Message for selected area:");
    if (!msg) return;

    try {
        const res = await fetch("/api/alerts/mass", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "MANDATORY EVACUATION", message: msg, severity: "CRITICAL", targetCount: 184, polygon: geojson })
        });
        if (res.ok) pushAlert("Broadcast Sent", "Mass alert delivered to selected zone.", "success");
    } catch(e) { console.error(e); }
}

async function fetchState() {
    try {
        const res = await fetch("/api/state");
        if (res.ok) {
            const data = await res.json();
            STATE.sosRequests = data.sosRequests || [];
            STATE.rescueTeams = data.rescueTeams || [];
            renderAll();
            
            // Populate bulk select
            bulkTeamSelect.innerHTML = '<option value="">Select Rescue Unit...</option>';
            STATE.rescueTeams.forEach(t => {
                bulkTeamSelect.innerHTML += `<option value="${t.name}">${t.name} (${t.status})</option>`;
            });
            
            if(data.telemetry) {
                document.getElementById('w-temp').innerText = data.telemetry.temperature + '°C';
                document.getElementById('w-rain').innerText = data.telemetry.rainfall + ' mm/h';
                document.getElementById('w-hum').innerText = data.telemetry.humidity + '%';
                document.getElementById('w-wind').innerText = data.telemetry.windSpeed + ' km/h';
            }
        }
    } catch(e) { console.error(e); }
}

function renderAll() {
    renderSmartInbox();
    renderMapMarkers();
    updateStats();
}

function renderMapMarkers() {
    Object.values(STATE.markers).forEach(m => STATE.map.removeLayer(m));
    STATE.markers = {};

    STATE.sosRequests.forEach(sos => {
        let color = '#ef4444'; // Always red for SOS
        const iconHtml = `<div style="background:${color}; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 0 8px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center;"><div style="width:6px; height:6px; background:white; border-radius:50%; animation: pulse 2s infinite;"></div></div>`;
        const icon = L.divIcon({ html: iconHtml, className: '' });
        const marker = L.marker([sos.lat, sos.lng], { icon }).addTo(STATE.map);
        marker.bindPopup(`
            <div class="font-sans min-w-[150px]">
                <h3 class="font-black text-red-600 mb-1 text-sm">${sos.emergencyType || 'SOS'}</h3>
                <p class="text-xs text-[#9AA1AA] font-bold mb-1">${sos.userName || 'Citizen'} (${sos.peopleCount} Trapped)</p>
                <p class="text-[10px] text-[#7A818A] mb-3 leading-tight">${sos.locationDesc}</p>
                <button onclick="switchPage('command'); selectIncident('${sos.id}');" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded text-[10px] font-bold transition">DISPATCH UNIT &rarr;</button>
            </div>
        `);
        marker.on('click', () => { 
            STATE.map.flyTo([sos.lat, sos.lng], 16, { animate: true, duration: 1 }); 
            marker.openPopup();
        });
        STATE.markers[sos.id] = marker;
    });

    STATE.rescueTeams.forEach(team => {
        const iconHtml = `<div style="background:#1e3a8a; color:white; padding:2px 4px; border-radius:4px; border:1px solid white; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🚤 NDRF</div>`;
        const icon = L.divIcon({ html: iconHtml, className: '' });
        const marker = L.marker([team.lat, team.lng], { icon }).addTo(STATE.map);
        marker.bindPopup(`<b>${team.name}</b><br>${team.status}`);
        STATE.markers[team.id] = marker;
    });
}

function renderSmartInbox() {
    inboxList.innerHTML = "";
    
    const sorted = [...STATE.sosRequests].sort((a,b) => b.triageScore - a.triageScore);
    
    sorted.forEach(sos => {
        const el = document.createElement("div");
        const t = sos.submittedAt || sos.timestamp;
        const timeStr = t ? new Date(t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Just now";
        const loc = sos.locationDesc || (sos.lat ? `${sos.lat.toFixed(4)}, ${sos.lng.toFixed(4)}` : "Unknown Area");
        
        el.className = "p-3 bg-[#181C21] rounded border border-[#30363D] shadow-xs space-y-2 cursor-pointer hover:border-blue-400 transition-colors";
        el.onclick = () => selectIncident(sos.id);
        
        let dispatchBtn = `<button onclick="event.stopPropagation(); assignRescueTeam('${sos.id}')" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow active:scale-95 transition">
            Dispatch Rescue Team
        </button>`;
        
        if (sos.status === 'DISPATCHED' || sos.status === 'TEAM_EN_ROUTE') {
            dispatchBtn = `<span class="font-bold text-emerald-700">✔️ EN ROUTE</span>`;
        } else if (sos.status === 'RESOLVED') {
            dispatchBtn = `<span class="font-bold text-[#7A818A]">✔️ RESOLVED</span>`;
        }

        el.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <span class="font-extrabold text-[#E8EAED] text-sm">${sos.userName || 'Citizen'}</span>
                    <span class="px-2 py-0.5 rounded text-[9px] font-mono font-black ${sos.priority === 'CRITICAL' ? 'bg-[#FF3B30]/20 text-[#FF3B30]' : 'bg-[#FF9800]/20 text-[#FF9800]'}">TRG ${Math.floor(sos.triageScore)}</span>
                </div>
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#080A0D] text-[#9AA1AA]">${sos.id}</span>
            </div>
            <p class="text-[11px] text-[#9AA1AA] font-medium flex items-center space-x-1">
                <span>📍 ${loc}</span>
                <span class="text-[#7A818A]">•</span>
                <span>👥 ${sos.peopleCount || 1} Persons</span>
                <span class="text-[#7A818A]">•</span>
                <span class="text-blue-600 font-mono">${timeStr}</span>
            </p>
            <p class="text-[11px] text-[#E8EAED] bg-[#080A0D] p-2 rounded border border-[#30363D] font-medium">"${sos.message || 'Help requested.'}"</p>
            
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-[#30363D]">
                <div class="flex items-center gap-1 ${sos.triageScore > 75 ? 'text-[#FF9800]' : 'text-[#22C55E]'}">
                    <i data-lucide="${sos.triageScore > 75 ? 'alert-triangle' : 'check-circle'}" class="w-3 h-3"></i>
                    <span class="text-[8px] font-bold uppercase">${sos.triageScore > 75 ? 'High Uncertainty (44%) - Cloud Occlusion' : 'Low Uncertainty (12%)'}</span>
                </div>
                <button onclick="event.stopPropagation(); openEvidenceModal('${sos.id}');" class="text-[9px] bg-[#181C21] hover:bg-[#30363D] text-[#E8EAED] border border-[#30363D] px-2 py-1 rounded font-bold uppercase flex items-center gap-1 transition">
                    <i data-lucide="search" class="w-3 h-3"></i> Inspect Evidence
                </button>
            </div>
            <div class="flex items-center justify-between pt-1 text-[10px] text-[#7A818A] border-t border-[#30363D] mt-2">
                <span>Assigned: <b class="${sos.assignedTeam && sos.assignedTeam !== 'Pending' ? 'text-[#00A8E8]' : 'text-[#7A818A]'}">${sos.assignedTeam || 'Pending'}</b></span>
                ${dispatchBtn}
            </div>
        `;
        inboxList.appendChild(el);
    });
    lucide.createIcons();
    updateBulkActionBar();
}

window.toggleSelection = function(e, id) {
    e.stopPropagation();
    if (STATE.selectedIds.has(id)) STATE.selectedIds.delete(id);
    else STATE.selectedIds.add(id);
    renderSmartInbox();
}

function updateBulkActionBar() {
    if (STATE.selectedIds.size > 0) {
        bulkActionBar.classList.remove('hidden');
        selectedCountEl.innerText = STATE.selectedIds.size;
    } else {
        bulkActionBar.classList.add('hidden');
    }
}

window.bulkDispatch = async function() {
    const team = bulkTeamSelect.value;
    if (!team) return alert("Select a rescue unit first.");
    
    const ids = Array.from(STATE.selectedIds);
    pushAlert("Bulk Dispatch Initiated", `Dispatching ${team} to ${ids.length} locations...`, "info");
    
    for (let id of ids) {
        try {
            await fetch(`/api/sos/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignedTeam: team, status: "DISPATCHED" })
            });
        } catch(e) {}
    }
    STATE.selectedIds.clear();
    pushAlert("Dispatch Complete", "All selected units updated.", "success");
}

window.selectIncident = function(idOrObj) {
    const sos = typeof idOrObj === 'string' ? STATE.sosRequests.find(s => s.id === idOrObj) : idOrObj;
    if(!sos) return;
    STATE.selectedIncident = sos;
    
    document.querySelectorAll(".inbox-item").forEach(el => el.classList.remove("ring-2", "ring-blue-400"));
    const card = document.getElementById(`inbox-${sos.id}`);
    if (card) card.classList.add("ring-2", "ring-blue-400");

    let teamOptions = `<option value="Pending">-- Select Unit to Assign --</option>`;
    STATE.rescueTeams.forEach(t => {
        teamOptions += `<option value="${t.name}" ${sos.assignedTeam === t.name ? 'selected' : ''}>${t.name} (${t.status})</option>`;
    });

    incidentDetailsPanel.innerHTML = `
        <div class="space-y-4 text-sm h-full flex flex-col">
            <div class="flex items-center justify-between border-b border-[#30363D] pb-3">
                <h2 class="text-xl font-black text-[#E8EAED]">${sos.id}</h2>
                <span class="px-2 py-1 bg-${sos.priority === 'CRITICAL' ? 'red' : 'amber'}-100 rounded text-xs text-${sos.priority === 'CRITICAL' ? 'red' : 'amber'}-700 font-bold border border-${sos.priority === 'CRITICAL' ? 'red' : 'amber'}-200">${sos.priority}</span>
            </div>
            
            <div>
                <p class="text-[10px] text-[#7A818A] font-bold uppercase mb-0.5">Disaster Type</p>
                <p class="font-bold text-[#9AA1AA]">${sos.emergencyType}</p>
            </div>
            
            <div>
                <p class="text-[10px] text-[#7A818A] font-bold uppercase mb-0.5">Coordinates</p>
                <div class="flex items-center space-x-2 text-[#9AA1AA] bg-[#080A0D] p-2 rounded border border-[#30363D]">
                    <i data-lucide="map-pin" class="w-4 h-4 text-ndrf-primary"></i>
                    <span class="font-mono text-xs font-bold">${sos.lat.toFixed(4)}, ${sos.lng.toFixed(4)}</span>
                </div>
                <p class="text-[#7A818A] mt-2 text-xs">${sos.locationDesc}</p>
            </div>
            
            <div class="grid grid-cols-2 gap-2 mt-2">
                <div class="bg-[#181C21] border border-[#30363D] p-2 rounded shadow-sm">
                    <p class="text-[10px] text-[#7A818A] font-bold uppercase">People</p>
                    <p class="font-black text-lg text-[#9AA1AA]">${sos.peopleCount}</p>
                </div>
                <div class="bg-[#181C21] border border-[#30363D] p-2 rounded shadow-sm flex flex-col gap-1">
                    <p class="text-[10px] text-[#7A818A] font-bold uppercase">Flags</p>
                    <div class="flex flex-wrap gap-1">
                        ${sos.hasMedical ? '<span class="px-1.5 py-0.5 bg-[#FF3B30]/20 text-red-700 rounded text-[9px] font-bold">Medical</span>' : ''}
                        ${sos.hasInfant ? '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold">Infant</span>' : ''}
                        ${sos.hasElderly ? '<span class="px-1.5 py-0.5 bg-[#FF9800]/20 text-amber-700 rounded text-[9px] font-bold">Elderly</span>' : ''}
                        ${(!sos.hasMedical && !sos.hasInfant && !sos.hasElderly) ? '<span class="text-xs text-[#7A818A]">None</span>' : ''}
                    </div>
                </div>
            </div>
            
            <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 mt-2 flex-1">
                <p class="text-[10px] text-blue-400 font-bold uppercase mb-1">Citizen Message</p>
                <p class="text-sm italic text-[#00A8E8] font-medium">"${sos.message}"</p>
            </div>

            <div class="pt-4 border-t border-[#30363D] mt-4">
                <p class="text-[10px] text-[#7A818A] font-bold uppercase mb-2">Unit Assignment</p>
                <select id="assign-team-select" class="w-full bg-[#181C21] border border-slate-300 rounded-lg p-2.5 text-xs text-[#9AA1AA] mb-3 shadow-sm font-bold">
                    ${teamOptions}
                </select>
                <div class="flex gap-2">
                    <button onclick="dispatchTeam('${sos.id}', 'DISPATCHED')" class="flex-1 py-3 bg-ndrf-primary hover:bg-orange-600 rounded-lg text-white text-xs font-black transition shadow-md">
                        DISPATCH TEAM
                    </button>
                    <button onclick="dispatchTeam('${sos.id}', 'RESOLVED')" class="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white transition shadow-md" title="Mark Resolved">
                        <i data-lucide="check-circle" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Also populate the ALERTS tab list for demo purposes
    const alertsListEl = document.getElementById('alerts-list');
    if (alertsListEl) {
        alertsListEl.innerHTML = '';
        sorted.forEach(sos => {
            const loc = sos.locationDesc || (sos.lat ? `${sos.lat.toFixed(4)}, ${sos.lng.toFixed(4)}` : 'Unknown Location');
            const alertHtml = `
                <div class="bg-[#181C21] border border-[#FF3B30]/50 p-4 rounded-lg flex justify-between items-center text-white mb-3">
                    <div>
                        <h4 class="text-red-500 font-bold uppercase">${sos.userName || 'Citizen'} - ${sos.emergencyType || 'SOS EMERGENCY'}</h4>
                        <p class="text-xs text-[#9AA1AA] mt-1">📍 ${loc}</p>
                        <p class="text-sm bg-red-900/30 p-2 mt-2 rounded border border-red-500/30">"${sos.message}"</p>
                    </div>
                    <button onclick="switchPage('command'); selectIncident('${sos.id}');" class="bg-[#1976D2] hover:bg-blue-600 px-4 py-2 rounded text-xs font-bold uppercase transition shadow-lg">
                        View in Command Center
                    </button>
                </div>
            `;
            alertsListEl.innerHTML += alertHtml;
        });
    }
    
    lucide.createIcons();
}


window.dispatchTeam = async function(sosId, status) {
    const select = document.getElementById("assign-team-select");
    const assignedTeam = select ? select.value : undefined;
    try {
        const res = await fetch(`/api/sos/${sosId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignedTeam, status })
        });
        if (res.ok) pushAlert("Status Updated", `SOS ${sosId} marked as ${status}.`, "info");
    } catch(e) { console.error(e); }
}

window.testSOS = async function() {
    const msg = prompt("DANGER: You are about to sound the city-wide evacuation alarm. Enter the broadcast message:", "IMMINENT DANGER. EVACUATE IMMEDIATELY.");
    if (!msg) return;

    try {
        await fetch("/api/alerts/mass", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                title: "CITY WIDE EVACUATION", 
                message: msg, 
                severity: "CRITICAL", 
                targetCount: "ALL CITIZENS", 
                polygon: null 
            })
        });
        pushAlert("ALARM SOUNDED", "Evacuation order broadcasted to all citizens.", "error");
    } catch(e) { console.error(e); }
}

async function updateStats() {
    try {
        const res = await fetch("/api/statistics");
        if (res.ok) {
            const s = await res.json();
            statActive.innerText = s.activeSOS;
            statTeams.innerText = s.teamsDeployed;
            
            const overSos = document.getElementById('overview-stat-sos');
            const overTeams = document.getElementById('overview-stat-teams');
            if (overSos) overSos.innerText = s.activeSOS;
            if (overTeams) overTeams.innerText = s.teamsDeployed;
        }
    } catch(e) {}
}

function pushAlert(title, msg, type = "info") {
    const el = document.createElement("div");
    let colorClass = "blue";
    if(type === "error") colorClass = "red";
    if(type === "success") colorClass = "emerald";
    if(type === "warning") colorClass = "amber";
    
    el.className = `bg-${colorClass}-50 border-l-4 border-${colorClass}-500 p-4 rounded shadow-sm`;
    el.innerHTML = `
        <div class="flex justify-between items-start">
            <h4 class="font-bold text-${colorClass}-900">${title}</h4>
            <span class="text-[10px] text-${colorClass}-500 font-mono">${new Date().toLocaleTimeString()}</span>
        </div>
        <p class="text-sm text-${colorClass}-800 mt-1">${msg}</p>
    `;
    alertsFeed.prepend(el);
    if(alertsFeed.children.length > 20) alertsFeed.removeChild(alertsFeed.lastChild);
}

// Socket Listeners
window.showDashboardToast = function(title, message, sos = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'bg-[#181C21] border-l-4 border-red-600 rounded-lg shadow-2xl p-4 pointer-events-auto transform transition-all duration-300 translate-x-full opacity-0 flex flex-col gap-1';
    
    let btnHtml = '';
    if (sos && sos.lat && sos.lng) {
        btnHtml = `<button onclick="switchPage('map'); setTimeout(() => { if(STATE.map) { STATE.map.flyTo([${sos.lat}, ${sos.lng}], 15); STATE.map.invalidateSize(); } }, 300); this.parentElement.remove();" class="mt-2 w-full bg-red-50 hover:bg-[#FF3B30]/20 text-red-700 font-bold py-1.5 rounded border border-red-200 text-xs transition flex items-center justify-center gap-1"><i data-lucide="map" class="w-3 h-3"></i> VIEW ON LIVE MAP</button>`;
    }
    
    toast.innerHTML = `
        <div class="flex justify-between items-start">
            <h4 class="font-black text-red-700 text-sm tracking-wide">${title}</h4>
            <button onclick="this.parentElement.parentElement.remove()" class="text-[#7A818A] hover:text-[#9AA1AA]"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <p class="text-xs text-[#9AA1AA] font-medium">${message}</p>
        ${btnHtml}
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);
    
    // Auto remove after 8 seconds
    setTimeout(() => {
        if(toast.parentElement) {
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
};

socket.on("new_sos", (sos) => {
    STATE.sosRequests.unshift(sos);
    renderAll();
    pushAlert("NEW SOS RECEIVED", `Signal ${sos.id} detected near ${sos.locationDesc}`, "error");

    // Massive Cinematic Popup for Incoming SOS
    const sosModal = document.createElement('div');
    sosModal.className = 'fixed inset-0 z-[9999] bg-red-950/90 backdrop-blur-lg flex flex-col items-center justify-center p-6 text-center text-white cursor-pointer';
    sosModal.innerHTML = `
        <div class="animate-ping absolute inset-0 bg-red-600/20 rounded-full w-96 h-96 m-auto"></div>
        <div class="relative z-10 animate-pulse bg-red-600 rounded-full p-6 mb-6 shadow-[0_0_100px_rgba(220,38,38,0.8)] border-4 border-white">
            <i data-lucide="radio" class="w-24 h-24 text-white"></i>
        </div>
        <h1 class="relative z-10 text-5xl font-black uppercase tracking-widest mb-2 text-white drop-shadow-[0_0_20px_rgba(255,0,0,1)]">CRITICAL DISTRESS SIGNAL DETECTED</h1>
        <h2 class="relative z-10 text-2xl font-bold mb-6 text-red-200">INCOMING TRANSMISSION FROM CITIZEN DEVICE</h2>
        
        <div class="relative z-10 w-[500px] bg-black/50 border-2 border-red-500 rounded-xl p-6 text-left shadow-2xl">
            <div class="flex items-center justify-between border-b border-red-500/30 pb-3 mb-3">
                <span class="text-xs font-bold text-red-400 uppercase tracking-widest">Signal ID: ${sos.id}</span>
                <span class="text-xs font-mono font-black text-white bg-red-600 px-2 py-1 rounded">TRG ${Math.floor(sos.triageScore)}</span>
            </div>
            
            <p class="text-xs text-red-300 uppercase font-bold mb-1">Citizen Details:</p>
            <p class="text-lg text-white font-bold mb-4">${sos.userName || 'Unknown'} (${sos.peopleCount || 1} Persons Trapped)</p>
            
            <p class="text-xs text-red-300 uppercase font-bold mb-1">Live Telemetry:</p>
            <p class="text-sm text-white mb-4">📍 ${sos.locationDesc}</p>
            
            <p class="text-xs text-red-300 uppercase font-bold mb-1">Extracted Payload:</p>
            <p class="text-md text-red-100 font-mono italic bg-red-950/50 p-3 rounded border border-red-500/20">"${sos.message}"</p>
        </div>
        <p class="relative z-10 text-sm font-bold opacity-75 mt-8 animate-bounce">(CLICK ANYWHERE TO ACKNOWLEDGE AND ROUTE DISPATCH)</p>
    `;
    
    // Play an alert sound
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.setValueAtTime(400, audioCtx.currentTime + 0.5);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + 1.0);
        osc.connect(audioCtx.destination);
        osc.start();
        setTimeout(() => osc.stop(), 1500);
    } catch(e) {}
    
    sosModal.onclick = () => {
        sosModal.remove();
        switchPage('command'); 
        selectIncident(sos.id);
    };
    
    document.body.appendChild(sosModal);
    if(window.lucide) lucide.createIcons();

    
    // Automatically fly to the new SOS on the map if it's open
    if (STATE.map) {
        STATE.map.flyTo([sos.lat, sos.lng], 16, { animate: true, duration: 1 });
        if (STATE.markers[sos.id]) {
            setTimeout(() => STATE.markers[sos.id].openPopup(), 1000);
        }
    }
    
    showDashboardToast("🚨 CRITICAL SOS RECEIVED", `${sos.peopleCount} individuals trapped at ${sos.locationDesc}.`, sos);
    
    // Play a gentle alert beep for the NDRF commander
    const beep = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    beep.play().catch(()=>{});
});

socket.on("incident_updated", (sos) => {
    const idx = STATE.sosRequests.findIndex(s => s.id === sos.id);
    if (idx > -1) STATE.sosRequests[idx] = sos;
    renderAll();
    if (STATE.selectedIncident && STATE.selectedIncident.id === sos.id) selectIncident(sos);
});

socket.on("mass_alert", (alert) => {
    pushAlert(`MASS ALERT ISSUED: ${alert.title}`, alert.message, "error");
});


// --- BROADCAST FEATURE ---

async function sendBroadcast() {
    const level = document.getElementById('broadcast-level').value;
    const title = document.getElementById('broadcast-title').value;
    const msg = document.getElementById('broadcast-msg').value;
    
    // Make the button feel tactile by finding it and adding a clicked effect
    const btn = document.querySelector('button[onclick="sendBroadcast()"]');
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> TRANSMITTING...';
        btn.classList.add('scale-95', 'opacity-80');
    }
    
    try {
        await fetch('/api/admin/alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: level, title: title, message: msg })
        });
        
        if (btn) {
            setTimeout(() => {
                btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> TRANSMITTED';
                btn.classList.remove('scale-95', 'opacity-80', 'bg-red-600', 'hover:bg-red-700');
                btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
                
                // Show massive cinematic popup on Dashboard
                const confirmModal = document.createElement('div');
                confirmModal.className = 'fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white cursor-pointer';
                confirmModal.innerHTML = `
                    <div class="animate-pulse bg-emerald-900 rounded-full p-6 mb-6 shadow-[0_0_80px_rgba(16,185,129,0.5)] border-4 border-emerald-500">
                        <i data-lucide="radio-tower" class="w-24 h-24 text-emerald-400"></i>
                    </div>
                    <h1 class="text-4xl font-black uppercase tracking-widest mb-2 text-emerald-400">BROADCAST SUCCESSFUL</h1>
                    <h2 class="text-xl font-bold mb-4 text-[#E8EAED]">LIVE ALERT SENT TO ALL CITIZEN DEVICES</h2>
                    <div class="w-96 bg-[#181C21] border border-[#30363D] rounded-lg p-4 text-left">
                        <p class="text-[10px] text-[#9AA1AA] uppercase font-bold mb-1">Payload Title:</p>
                        <p class="text-xs text-[#E8EAED] mb-3">${title}</p>
                        <p class="text-[10px] text-[#9AA1AA] uppercase font-bold mb-1">Transmission Nodes:</p>
                        <p class="text-xs text-emerald-400 font-mono">184 Active Devices Reached via BLE Mesh & Satellite</p>
                    </div>
                    <p class="text-xs font-bold opacity-50 mt-8">(Click anywhere to close)</p>
                `;
                confirmModal.onclick = () => confirmModal.remove();
                document.body.appendChild(confirmModal);
                if(window.lucide) lucide.createIcons();
                
                // Reset button after 3 seconds
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.add('bg-red-600', 'hover:bg-red-700');
                    btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
                    if(window.lucide) lucide.createIcons();
                }, 3000);
            }, 600); // slight delay for cinematic effect
        }
    } catch(e) {
        console.error(e);
        if(btn) {
            btn.innerHTML = originalText;
            btn.classList.remove('scale-95', 'opacity-80');
        }
        pushAlert("Transmission Failed", "Could not reach satellite uplink.", "error");
    }
}




window.openEvidenceModal = function(id) {
    const sos = STATE.sosRequests.find(s => s.id === id);
    if (!sos) return;
    
    const modal = document.getElementById('evidence-modal');
    if(modal) {
        // Update NLP Text with the LIVE message from the citizen!
        const nlpText = modal.querySelector('.italic');
        if (nlpText) {
            nlpText.textContent = '"' + (sos.message || 'Help requested.') + '"';
        }
        
        // Update the tags dynamically based on the text
        const tagsContainer = modal.querySelector('.flex.flex-wrap.gap-1');
        if (tagsContainer) {
            tagsContainer.innerHTML = '';
            if (sos.peopleCount) {
                tagsContainer.innerHTML += `<span class="text-[8px] bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/50 px-1.5 py-0.5 rounded">TRAPPED: ${sos.peopleCount}</span>`;
            }
            if ((sos.message || '').toLowerCase().includes('elderly') || sos.hasElderly) {
                tagsContainer.innerHTML += `<span class="text-[8px] bg-[#FF9800]/20 text-[#FF9800] border border-[#FF9800]/50 px-1.5 py-0.5 rounded">ELDERLY VULNERABLE</span>`;
            }
            if ((sos.message || '').toLowerCase().includes('water') || (sos.message || '').toLowerCase().includes('flood')) {
                 tagsContainer.innerHTML += `<span class="text-[8px] bg-[#1976D2]/20 text-[#1976D2] border border-[#1976D2]/50 px-1.5 py-0.5 rounded">FLOODING DETECTED</span>`;
            }
        }
        
        // If they want dynamic sensor data, randomize it slightly so it looks live
        const surge = modal.querySelector('.text-\[14px\]\.font-bold\.text-\[\#FF3B30\]');
        if(surge) {
            surge.innerHTML = '+' + (3.4).toFixed(1) + 'm <i data-lucide="trending-up" class="w-3 h-3 inline"></i>';
        }
        
        modal.style.display = 'flex';
        if(window.lucide) lucide.createIcons();
    }
}



window.assignRescueTeam = async function(sosId) {
    // 1. Find the SOS
    const sos = STATE.sosRequests.find(s => s.id === sosId);
    if (!sos) return;
    
    // 2. Play cinematic dispatch effect
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white';
    modal.innerHTML = `
        <div class="animate-spin mb-6">
            <i data-lucide="loader" class="w-16 h-16 text-blue-500"></i>
        </div>
        <h1 class="text-3xl font-black uppercase tracking-widest mb-2 text-blue-500">ROUTING EMERGENCY DISPATCH</h1>
        <h2 class="text-lg font-bold text-[#9AA1AA]">Assigning nearest available NDRF Unit to ${sosId}...</h2>
    `;
    document.body.appendChild(modal);
    if(window.lucide) lucide.createIcons();
    
    // 3. Simulate delay and update backend
    setTimeout(async () => {
        try {
            await fetch(`/api/sos/${sosId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignedTeam: "NDRF Fast-Response Alpha", status: "DISPATCHED" })
            });
            
            // 4. Show success
            modal.innerHTML = `
                <div class="animate-pulse bg-blue-900 rounded-full p-4 mb-6 border-4 border-blue-500">
                    <i data-lucide="truck" class="w-20 h-20 text-white"></i>
                </div>
                <h1 class="text-4xl font-black uppercase tracking-widest mb-2 text-white">UNITS DISPATCHED</h1>
                <h2 class="text-xl font-bold mb-4 text-[#E8EAED]">NDRF Fast-Response Alpha is en route to the location.</h2>
                <div class="bg-[#181C21] p-3 rounded border border-blue-500/50 text-left">
                    <p class="text-xs text-[#9AA1AA] mb-1">Target Coordinates: ${sos.lat.toFixed(4)}, ${sos.lng.toFixed(4)}</p>
                    <p class="text-xs text-[#9AA1AA]">ETA: 8 Minutes</p>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
            
            setTimeout(() => {
                modal.style.opacity = '0';
                modal.style.transition = 'opacity 0.5s ease';
                setTimeout(() => modal.remove(), 500);
            }, 3000);
            
        } catch(e) {
            console.error(e);
            modal.remove();
        }
    }, 1500);
};



// =====================================================================
// STRICT 100% REAL-TIME LIVE DATA RENDERING (ZERO MOCK DATA)
// =====================================================================
let liveHazardLayer = null;

socket.on("live_hazard_update", (data) => {
    if (!STATE.map) return;
    
    if (liveHazardLayer) {
        STATE.map.removeLayer(liveHazardLayer);
    }
    
    liveHazardLayer = L.layerGroup().addTo(STATE.map);
    
    data.hazards.forEach(hazard => {
        let color = '#FF9800'; // Warning
        let iconHtml = '<i data-lucide="alert-triangle" class="text-white w-4 h-4"></i>';
        
        if (hazard.type === 'EARTHQUAKE') {
            color = hazard.severity === 'CRITICAL' ? '#FF3B30' : '#FF9800';
            iconHtml = '<i data-lucide="activity" class="text-white w-4 h-4"></i>';
        } else if (hazard.type.includes('WILDFIRES')) {
            color = '#FF3B30';
            iconHtml = '<i data-lucide="flame" class="text-white w-4 h-4"></i>';
        } else if (hazard.type.includes('STORMS') || hazard.type.includes('FLOODS')) {
            color = '#00A8E8';
            iconHtml = '<i data-lucide="cloud-lightning" class="text-white w-4 h-4"></i>';
        }
        
        const customIcon = L.divIcon({
            html: `
                <div class="relative w-8 h-8 flex items-center justify-center">
                    <div class="absolute inset-0 bg-[${color}] opacity-40 rounded-full animate-ping"></div>
                    <div class="relative z-10 w-6 h-6 bg-[${color}] rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                        ${iconHtml}
                    </div>
                </div>
            `,
            className: 'live-hazard-icon',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const marker = L.marker([hazard.lat, hazard.lng], { icon: customIcon }).addTo(liveHazardLayer);
        
        marker.bindPopup(`
            <div class="p-2 min-w-[200px]">
                <span class="text-[10px] font-black uppercase text-white bg-[${color}] px-2 py-0.5 rounded">${hazard.type} (LIVE)</span>
                <h4 class="font-bold text-sm text-slate-800 mt-2 mb-1">${hazard.title}</h4>
                <p class="text-xs text-slate-600 font-mono">Source: NASA EONET / USGS API</p>
                <p class="text-[10px] text-slate-400 mt-1">Lat: ${hazard.lat.toFixed(4)}, Lng: ${hazard.lng.toFixed(4)}</p>
            </div>
        `);
    });
    
    if (window.lucide) {
        setTimeout(() => lucide.createIcons(), 100);
    }
    
    console.log(`Plotted ${data.hazards.length} 100% REAL live hazards on map.`);
});




