const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, "../public");

// Database initialization
const dbPath = path.join(__dirname, "rakshacast.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS sosRequests (
        id TEXT PRIMARY KEY,
        userName TEXT,
        phone TEXT,
        emergencyType TEXT,
        peopleCount INTEGER,
        lat REAL,
        lng REAL,
        locationDesc TEXT,
        hasInfant BOOLEAN,
        hasElderly BOOLEAN,
        hasMedical BOOLEAN,
        message TEXT,
        status TEXT,
        priority TEXT,
        triageScore REAL,
        assignedTeam TEXT,
        submittedAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS rescueTeams (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        personnel INTEGER,
        status TEXT,
        currentTask TEXT,
        lat REAL,
        lng REAL,
        equipment TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        title TEXT,
        severity TEXT,
        area TEXT,
        message TEXT,
        targetCount INTEGER,
        timestamp TEXT,
        polygon TEXT
    )`);

    // Seed Teams if empty
    db.get("SELECT COUNT(*) AS count FROM rescueTeams", (err, row) => {
        if (!err && row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO rescueTeams VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            stmt.run("TM-01", "NDRF Bravo Alpha (Motor Boat #4)", "Inflatable Rescue Boat (IRB)", 6, "DISPATCHED", "Responding to SOS-9081", 30.0870, 78.2690, JSON.stringify(["40HP OBM Engine", "Oxygen Cylinder"]));
            stmt.run("TM-02", "SDRF Amphibious Unit 2", "All-Terrain Amphibious Vehicle", 4, "AVAILABLE", "Patrolling High Ridge", 30.0910, 78.2630, JSON.stringify(["Winch Cable", "Life Jackets"]));
            stmt.finalize();
        }
    });
});

// Helper for DB queries
const dbAll = (query, params = []) => new Promise((resolve, reject) => db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows)));
const dbRun = (query, params = []) => new Promise((resolve, reject) => db.run(query, params, function(err) { err ? reject(err) : resolve(this) }));
const dbGet = (query, params = []) => new Promise((resolve, reject) => db.get(query, params, (err, row) => err ? reject(err) : resolve(row)));

// In-Memory Data for compatibility
let LIVE_WEATHER_CACHE = {
    "Uttarakhand (Haridwar-Rishikesh)": { lat: 30.0869, lng: 78.2676, elevation: 325, state: "Uttarakhand", river: "Ganga Basin" }
};
let DB = {
    selectedRegion: "Uttarakhand (Haridwar-Rishikesh)",
    telemetry: {
        isLive: true,
        source: "Live India Open-Meteo & IMD Doppler Radar Feed",
        stationName: "India National Meteorological Observation Grid",
        temperature: 27.5,
        rainfall: 42.0,
        humidity: 86,
        windSpeed: 24,
        windDirection: "ENE (65°)",
        pressure: 996.2,
        waterLevel: 2.45,
        dangerMark: 2.20,
        elevation: 325,
        leadTimeHours: 3.5,
        riskScore: 84,
        riskLevel: "CRITICAL",
        confidence: 96.8,
        recommendedAction: "Mandatory evacuation along high ridges.",
        lastUpdated: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"
    },
    shelters: [
        { id: "SH-01", name: "Temple Hill Community Relief Center", lat: 30.0780, lng: 78.2520, elevation: 445, distance: "1.4 km", capacity: 600, occupied: 185, available: 415, status: "OPEN" }
    ],
    incidents: [],
    recoveryRequests: []
};
let ALERT_HISTORY = [];
let OTP_STORE = {};

function fetchLiveIndiaWeather(regionName) {
    const r = LIVE_WEATHER_CACHE[regionName] || LIVE_WEATHER_CACHE["Uttarakhand (Haridwar-Rishikesh)"];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lng}&current=temperature_2m,relative_humidity_2m,precipitation,rain,surface_pressure,wind_speed_10m,wind_direction_10m`;
    https.get(url, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
            try {
                const cur = JSON.parse(data).current;
                if (cur) {
                    DB.telemetry.temperature = cur.temperature_2m;
                    DB.telemetry.rainfall = Math.max(cur.precipitation || 0, cur.rain || 0, DB.telemetry.rainfall);
                    DB.telemetry.lastUpdated = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";
                }
            } catch(e) {}
        });
    }).on('error', (err) => {
        console.warn("[Weather Sync] Failed to fetch live weather:", err.message);
    });
}
fetchLiveIndiaWeather(DB.selectedRegion);
setInterval(() => fetchLiveIndiaWeather(DB.selectedRegion), 300000);

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.writeHead(204), res.end();

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
        res.setHeader("Content-Type", "application/json");

        // Helper to parse body
        const getBody = () => new Promise(resolve => {
            let body = "";
            req.on("data", chunk => body += chunk);
            req.on("end", () => resolve(JSON.parse(body || "{}")));
        });

        try {
            if (pathname === "/api/weather/live" && req.method === "GET") {
                return res.writeHead(200), res.end(JSON.stringify({ success: true, telemetry: DB.telemetry }));
            }

            if (pathname === "/api/state" && req.method === "GET") {
                const sosRequests = await dbAll("SELECT * FROM sosRequests ORDER BY submittedAt DESC");
                const rescueTeams = await dbAll("SELECT * FROM rescueTeams");
                const alerts = await dbAll("SELECT * FROM alerts ORDER BY timestamp DESC");
                const sosMapped = sosRequests.map(s => ({...s, hasInfant: !!s.hasInfant, hasElderly: !!s.hasElderly, hasMedical: !!s.hasMedical}));
                
                // Keep backward compatibility
                const fullState = {
                    ...DB,
                    sosRequests: sosMapped,
                    rescueTeams,
                    alerts
                };
                return res.writeHead(200), res.end(JSON.stringify(fullState));
            }

            if (pathname === "/api/sos" && req.method === "POST") {
                const data = await getBody();
                let triageScore = 35;
                if (data.hasMedical) triageScore += 35;
                if (data.hasInfant) triageScore += 20;
                if (data.hasElderly) triageScore += 15;
                triageScore = Math.min(100, triageScore);
                
                const newSOS = {
                    id: `SOS-${Date.now().toString().slice(-4)}`,
                    userName: data.userName || "Citizen",
                    phone: data.phone || "+91 98765 00000",
                    emergencyType: data.emergencyType || "Flash Flood",
                    peopleCount: parseInt(data.peopleCount) || 1,
                    lat: data.lat || 30.0855,
                    lng: data.lng || 78.2705,
                    locationDesc: data.locationDesc || "Unknown",
                    hasInfant: data.hasInfant ? 1 : 0,
                    hasElderly: data.hasElderly ? 1 : 0,
                    hasMedical: data.hasMedical ? 1 : 0,
                    message: data.message || "Rescue extraction requested",
                    status: "NEW", // For triage board: NEW, TRIAGED, DISPATCHED, IN_PROGRESS, RESOLVED
                    priority: triageScore >= 80 ? "CRITICAL" : (triageScore >= 60 ? "HIGH" : "MEDIUM"),
                    triageScore: triageScore,
                    assignedTeam: "Pending",
                    submittedAt: new Date().toISOString()
                };

                await dbRun(`INSERT INTO sosRequests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [newSOS.id, newSOS.userName, newSOS.phone, newSOS.emergencyType, newSOS.peopleCount, newSOS.lat, newSOS.lng, newSOS.locationDesc, newSOS.hasInfant, newSOS.hasElderly, newSOS.hasMedical, newSOS.message, newSOS.status, newSOS.priority, newSOS.triageScore, newSOS.assignedTeam, newSOS.submittedAt]);
                
                newSOS.hasInfant = !!newSOS.hasInfant;
                newSOS.hasElderly = !!newSOS.hasElderly;
                newSOS.hasMedical = !!newSOS.hasMedical;

                io.emit("new_sos", newSOS);
                return res.writeHead(201), res.end(JSON.stringify({ success: true, entry: newSOS }));
            }

            // Command Center Dashboard APIs
            if (pathname.startsWith("/api/sos/") && req.method === "PATCH") {
                const id = pathname.split("/")[3];
                const data = await getBody();
                const current = await dbGet("SELECT * FROM sosRequests WHERE id = ?", [id]);
                if (!current) return res.writeHead(404), res.end(JSON.stringify({ error: "Not found" }));
                
                const status = data.status || current.status;
                const assignedTeam = data.assignedTeam || current.assignedTeam;
                
                await dbRun("UPDATE sosRequests SET status = ?, assignedTeam = ? WHERE id = ?", [status, assignedTeam, id]);
                
                const updated = await dbGet("SELECT * FROM sosRequests WHERE id = ?", [id]);
                updated.hasInfant = !!updated.hasInfant;
                updated.hasElderly = !!updated.hasElderly;
                updated.hasMedical = !!updated.hasMedical;
                
                io.emit("incident_updated", updated);
                return res.writeHead(200), res.end(JSON.stringify({ success: true, entry: updated }));
            }

            if (pathname === "/api/alerts/mass" && req.method === "POST") {
                const data = await getBody();
                const newAlert = {
                    id: `ALT-MASS-${Date.now().toString().slice(-4)}`,
                    title: data.title || "EMERGENCY ALERT",
                    severity: data.severity || "CRITICAL",
                    area: "Selected Polygon Area",
                    message: data.message || "",
                    targetCount: data.targetCount || 0,
                    timestamp: new Date().toISOString(),
                    polygon: JSON.stringify(data.polygon || [])
                };
                await dbRun("INSERT INTO alerts VALUES (?, ?, ?, ?, ?, ?, ?, ?)", Object.values(newAlert));
                io.emit("mass_alert", newAlert);
                return res.writeHead(201), res.end(JSON.stringify({ success: true, entry: newAlert }));
            }

            if (pathname === "/api/statistics" && req.method === "GET") {
                const sosStats = await dbGet("SELECT COUNT(*) as total, SUM(CASE WHEN status='NEW' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN priority='CRITICAL' THEN 1 ELSE 0 END) as critical, SUM(CASE WHEN status='RESOLVED' THEN 1 ELSE 0 END) as resolved FROM sosRequests");
                const teamStats = await dbGet("SELECT COUNT(*) as total, SUM(CASE WHEN status='DISPATCHED' THEN 1 ELSE 0 END) as deployed FROM rescueTeams");
                
                return res.writeHead(200), res.end(JSON.stringify({ 
                    activeSOS: sosStats.active || 0, 
                    criticalSOS: sosStats.critical || 0, 
                    resolvedSOS: sosStats.resolved || 0,
                    teamsDeployed: teamStats.deployed || 0,
                    totalTeams: teamStats.total || 0
                }));
            }
            
            return res.writeHead(404), res.end(JSON.stringify({ error: "Endpoint not found" }));

        } catch (err) {
            console.error(err);
            return res.writeHead(500), res.end(JSON.stringify({ error: err.message }));
        }
    }

    // Static file serving
    let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
    if (!fs.existsSync(filePath)) filePath = path.join(PUBLIC_DIR, "index.html");
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

    fs.readFile(filePath, (err, content) => {
        if (err) return res.writeHead(500), res.end("Error");
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        res.end(content);
    });
});

const io = new Server(server, { cors: { origin: "*" } });
io.on("connection", (socket) => {
    console.log("Client connected", socket.id);
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
