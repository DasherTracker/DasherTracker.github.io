/* ==========================================================================
   DASHER TRACKER HQ — MULTI-YEAR VAULT & COMMAND ENGINE (v6.1.1)
   ========================================================================== */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoAqn4EkIAKojVQfFSHV5X09dbVGDnAGtogqspyJYimWfsLr6XjQr_wDp3P8E7sOfjPNLsyor4ugdR/pub?gid=1708220782&single=true&output=csv';
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbxycgz669MUb1b9HNAB4Zj7LDs2rfJWYC-wFdGNl1nDoCAbmjCLh4BWRsC7ZNWTl9Q/exec';
const EXPENSES_API_URL = `${API_BASE_URL}?action=getExpenses`;
const VAULT_API_URL = `${API_BASE_URL}?action=getVaultData`;
const FIREBASE_DB_URL = 'https://dasher-tracker-hq-default-rtdb.firebaseio.com';
const VISITOR_API_URL = `${FIREBASE_DB_URL}/telemetry`;
const CACHE_KEY = 'dasher_tracker_data_v15';
const CACHE_TIME_KEY = 'dasher_tracker_time_v15';
const VAULT_CACHE_KEY = 'dasher_tracker_vault_v15';
const ADMIN_AUTH_STORAGE_KEY = 'dasher_hq_admin_auth_v2';
const ADMIN_IDENTITY_HASH = '9788f516fc5ba1be1edb34d62bceceb51ad979343df7d64d144b66e5293703e7';
const IRS_MILEAGE_RATE = 0.67; // 2024-2026 IRS Standard Business Mileage Rate ($0.67/mi)

// Dedicated Dasher Tracker Firebase Project Config (dasher-tracker-hq DB + Hosting)
const DASHER_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAG37Lqje4w_GAXj4hp6Tg9td2CZvAmFfc",
    authDomain: "dasher-tracker-hq.firebaseapp.com",
    databaseURL: FIREBASE_DB_URL,
    projectId: "dasher-tracker-hq",
    storageBucket: "dasher-tracker-hq.firebasestorage.app",
    messagingSenderId: "1093952301206",
    appId: "1:1093952301206:web:9b9e6824a2cbc866813ab7"
};

// Active Google OAuth Identity Provider Config (bdc-vault with dashertracker.web.app authorized)
const DASHER_AUTH_CONFIG = {
    apiKey: "AIzaSyDd-YKspjMz-lWUWCdBe1zplzNCDWsM1mA",
    authDomain: "bdc-vault.firebaseapp.com",
    projectId: "bdc-vault",
    storageBucket: "bdc-vault.firebasestorage.app",
    messagingSenderId: "119058571389",
    appId: "1:119058571389:web:107cafd0ea4c19823cd114"
};
const GOOGLE_OAUTH_CLIENT_ID = "119058571389-1lamgkkr458n3haarhctrdp89ocg4q5e.apps.googleusercontent.com";

let dasherAuthApp = null;
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps || firebase.apps.length === 0) {
            firebase.initializeApp(DASHER_FIREBASE_CONFIG);
        }
        dasherAuthApp = firebase.initializeApp(DASHER_AUTH_CONFIG, 'dasherAuth');
    }
} catch (e) {}

function getDasherAuthInstance() {
    if (typeof firebase === 'undefined' || !firebase.auth) return null;
    try {
        if (!dasherAuthApp) {
            const existing = (firebase.apps || []).find(a => a.name === 'dasherAuth');
            dasherAuthApp = existing || firebase.initializeApp(DASHER_AUTH_CONFIG, 'dasherAuth');
        }
        return firebase.auth(dasherAuthApp);
    } catch (e) {
        return firebase.auth();
    }
}

// Fallback Starter Gear & Upkeep Data
const DASHER_GEAR_ITEMS = [
    { name: "Commercial Insulated Catering Bag", desc: "Heavy duty thermal pack for large pizza & catering orders", cost: 45.00, icon: "🛍️" },
    { name: "6-Cup Heavy Duty Drink Carrier Caddy", desc: "Spill-proof insulated multi-beverage organizer", cost: 24.99, icon: "🥤" },
    { name: "MagSafe Wireless Auto-Clamping Phone Mount", desc: "Fast 15W Qi wireless charging cockpit cradle", cost: 29.99, icon: "📱" },
    { name: "Dual Dash Cam (Front 4K + Cabin 1080p)", desc: "Dispute protection, night vision & parking guard", cost: 79.99, icon: "📹" },
    { name: "Braided Fast Charge Cables & 12V Car Hub", desc: "USB-C PD high-durability charging bundle", cost: 14.99, icon: "🔌" }
];

const VEHICLE_MAINTENANCE_ITEMS = [
    { name: "All-Season Delivery Tires (Pair + Balance)", desc: "High-mileage tread life & wet weather traction", cost: 480.00, icon: "🛞" },
    { name: "Full Synthetic Oil Change & Filter", desc: "Mobil 1 0W-20 & OEM multipoint vehicle safety inspection", cost: 65.00, icon: "🛢️" },
    { name: "Ceramic Brake Pads & Rotor Resurfacing", desc: "Front brake pad replacement for stop-and-go city routes", cost: 160.00, icon: "🛑" },
    { name: "Silicone Heavy Weather Wiper Blades", desc: "All-weather streak-free beam wiper blade pair", cost: 35.00, icon: "🌧️" }
];

const MONTH_ORDER = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

let cachedChartData = null;
let currentChartType = 'line';
let earningsChartInstance = null;
let liveExpensesData = null;
let cachedSummaryEarnings = null;
let cachedSummaryGas = null;
let cachedRawCsvData = null;
let liveVaultData = { years: [2026], shifts: [], gas: [], expenses: [] };
let currentVaultYear = 'all';
let expandedMonths = {};
let currentAdminUser = null;
let latestRatingsState = {
    lifetime: 1114,
    customerRating: 5.0,
    overallRating: 100,
    stars5: 100,
    stars4: 0,
    stars3: 0,
    stars2: 0,
    stars1: 0,
    communication: 18,
    orderHandling: 19,
    instructions: 19,
    friendliness: 20,
    aboveBeyond: 16
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
    // 0. Initialize Admin Auth State, Live Visitor Telemetry & Fetch Vault + Expenses
    initAdminAuthState();
    initVisitorCounter();
    fetchLiveExpenses();
    fetchLiveVaultData();

    // 1. Immediately render cached data if available (0ms instant paint)
    const hasCached = loadFromLocalStorage();
    
    // 2. Fetch fresh data if cache is empty or older than 5 minutes
    const lastFetch = localStorage.getItem(CACHE_TIME_KEY) || 0;
    const isCacheStale = (Date.now() - parseInt(lastFetch)) > 300000;
    
    if (!hasCached || isCacheStale) {
        fetchDashboardData();
    }
});

async function initVisitorCounter() {
    const visitorEl = document.getElementById('valVisitorCount');
    if (!visitorEl) return;
    
    try {
        const hasCountedSession = sessionStorage.getItem('dasher_counted_session');
        
        // Fetch current views count
        const getRes = await fetch(`${VISITOR_API_URL}/dasherViews.json`);
        let currentViews = await getRes.json();
        if (typeof currentViews !== 'number' || isNaN(currentViews)) {
            currentViews = 1042;
        }

        // Increment if new unique session
        if (!hasCountedSession) {
            sessionStorage.setItem('dasher_counted_session', 'true');
            currentViews++;
            fetch(`${VISITOR_API_URL}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dasherViews: currentViews })
            }).catch(() => {});
        }

        // Smooth roll-up animation
        animateValue('valVisitorCount', currentViews, false, '', '', 800);
    } catch (e) {
        console.warn("Visitor counter offline:", e);
        if (visitorEl) visitorEl.textContent = '1,043';
    }
}

async function fetchLiveExpenses() {
    try {
        const fetchUrl = `${EXPENSES_API_URL}&_t=${Date.now()}`;
        const res = await fetch(fetchUrl);
        const json = await res.json();
        if (json && json.success && Array.isArray(json.items)) {
            liveExpensesData = json.items;
            try {
                localStorage.setItem('dasher_live_expenses_cache', JSON.stringify(json.items));
            } catch (e) {}
            if (cachedSummaryEarnings !== null && cachedSummaryGas !== null) {
                renderItemizedLedger(cachedSummaryEarnings, cachedSummaryGas);
            }
        }
    } catch (e) {
        console.warn("Could not load live expenses from Google Sheet, checking offline cache:", e);
        const offline = localStorage.getItem('dasher_live_expenses_cache');
        if (offline) {
            try {
                liveExpensesData = JSON.parse(offline);
            } catch (err) {}
        }
    }
}

async function fetchLiveVaultData() {
    try {
        // 1. Primary: Read from Dedicated Dasher Tracker Firebase Realtime Database
        const fbRes = await fetch(`${FIREBASE_DB_URL}/vault.json?_t=${Date.now()}`);
        const fbJson = await fbRes.json();
        if (fbJson && Array.isArray(fbJson.shifts) && fbJson.shifts.length > 0) {
            liveVaultData = {
                years: Array.isArray(fbJson.years) && fbJson.years.length > 0 ? fbJson.years : [2026],
                shifts: fbJson.shifts,
                gas: Array.isArray(fbJson.gas) ? fbJson.gas : [],
                expenses: Array.isArray(fbJson.expenses) ? fbJson.expenses : [],
                ratings: fbJson.ratings || null
            };
            try { localStorage.setItem(VAULT_CACHE_KEY, JSON.stringify(liveVaultData)); } catch (e) {}
            renderVaultYearSelectorPills();
            if (cachedRawCsvData) processData(cachedRawCsvData);
        }

        // 2. Sync latest from Google Sheets Vault endpoint & mirror to Firebase
        const fetchUrl = `${VAULT_API_URL}&_t=${Date.now()}`;
        const res = await fetch(fetchUrl);
        const json = await res.json();
        if (json && json.success) {
            liveVaultData = {
                years: Array.isArray(json.years) && json.years.length > 0 ? json.years : [2026],
                shifts: Array.isArray(json.shifts) ? json.shifts : [],
                gas: Array.isArray(json.gas) ? json.gas : [],
                expenses: Array.isArray(json.expenses) ? json.expenses : [],
                ratings: json.ratings || null
            };
            if (Array.isArray(json.expenses)) {
                liveExpensesData = json.expenses;
                try {
                    localStorage.setItem('dasher_live_expenses_cache', JSON.stringify(json.expenses));
                } catch (e) {}
            }
            try {
                localStorage.setItem(VAULT_CACHE_KEY, JSON.stringify(liveVaultData));
                fetch(`${FIREBASE_DB_URL}/vault.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...liveVaultData, lastSynced: Date.now() })
                }).catch(() => {});
            } catch (e) {}
            renderVaultYearSelectorPills();
            if (cachedRawCsvData) {
                processData(cachedRawCsvData);
            }
        }
    } catch (e) {
        console.warn("Could not load live Vault data, checking offline cache:", e);
        const offlineVault = localStorage.getItem(VAULT_CACHE_KEY);
        if (offlineVault) {
            try {
                liveVaultData = JSON.parse(offlineVault);
                renderVaultYearSelectorPills();
            } catch (err) {}
        }
    }
}

function loadFromLocalStorage() {
    try {
        const offlineExp = localStorage.getItem('dasher_live_expenses_cache');
        if (offlineExp) {
            try { liveExpensesData = JSON.parse(offlineExp); } catch (e) {}
        }
        const offlineVault = localStorage.getItem(VAULT_CACHE_KEY);
        if (offlineVault) {
            try {
                liveVaultData = JSON.parse(offlineVault);
                renderVaultYearSelectorPills();
            } catch (e) {}
        }
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
            const data = JSON.parse(cachedRaw);
            if (data && data.length > 0) {
                cachedRawCsvData = data;
                processData(data);
                updateLastUpdatedTag(parseInt(localStorage.getItem(CACHE_TIME_KEY) || Date.now()));
                return true;
            }
        }
    } catch (e) {
        console.warn("Error reading localStorage cache:", e);
    }
    return false;
}

function updateLastUpdatedTag(timestamp) {
    const tag = document.getElementById('lastUpdatedTag');
    if (!tag) return;
    const minsAgo = Math.floor((Date.now() - timestamp) / 60000);
    tag.textContent = minsAgo < 1 ? '• Updated just now' : `• Updated ${minsAgo}m ago`;
}

async function fetchDashboardData() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.classList.add('loading');
    fetchLiveExpenses();
    fetchLiveVaultData();
    
    try {
        const fetchUrl = `${CSV_URL}&_cb=${Date.now()}`;
        Papa.parse(fetchUrl, {
            download: true,
            header: false,
            skipEmptyLines: false,
            complete: function(results) {
                if (results.data && results.data.length > 0) {
                    cachedRawCsvData = results.data;
                    try {
                        localStorage.setItem(CACHE_KEY, JSON.stringify(results.data));
                        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
                    } catch (e) {}
                    
                    processData(results.data);
                    updateLastUpdatedTag(Date.now());
                } else {
                    handleFetchFailure("CSV data received was empty.");
                }
            },
            error: function(err) {
                console.error("PapaParse download error:", err);
                handleFetchFailure("Unable to parse CSV.");
            }
        });
    } catch (error) {
        console.warn("Fetch error:", error);
        handleFetchFailure("Network error.");
    } finally {
        if (refreshBtn) {
            setTimeout(() => refreshBtn.classList.remove('loading'), 400);
        }
    }
}

function handleFetchFailure(msg) {
    const loadedFromCache = loadFromLocalStorage();
    if (!loadedFromCache) {
        console.warn("Unable to fetch fresh data and no cache found:", msg);
    } else {
        console.info("Using cached dashboard data seamlessly.");
    }
}

/* Parse time strings like '126 hrs 57 mins', '546:12:00', or decimal hours */
function parseHoursToNumber(hourStr) {
    if (!hourStr) return 0;
    const clean = hourStr.replace(/^"|"$/g, '').trim();
    
    if (clean.includes(':')) {
        const parts = clean.split(':');
        const h = parseFloat(parts[0]) || 0;
        const m = parseFloat(parts[1]) || 0;
        return h + (m / 60);
    }
    
    const hrMatch = clean.match(/(\d+)\s*hrs?/i);
    const minMatch = clean.match(/(\d+)\s*mins?/i);
    if (hrMatch || minMatch) {
        const h = hrMatch ? parseFloat(hrMatch[1]) : 0;
        const m = minMatch ? parseFloat(minMatch[1]) : 0;
        return h + (m / 60);
    }
    
    return parseFloat(clean.replace(/[^0-9.]/g, '')) || 0;
}

function processData(data) {
    try {
        const monthlyRows = [];
        let totalRow = null;
        let ratingsHeaders = null;
        let ratingsValues = null;
        let feedbackHeaders = null;
        let feedbackValues = null;
        
        let totalEarnings = 0;
        let totalDeliveries = 0;
        let totalGas = 0;
        let totalBasePay = 0;
        let totalTips = 0;
        let totalCashTips = 0;
        let totalTaxes = 0;
        let totalMiles = 0;
        let totalDashHoursNum = 0;
        let totalNoTipping = 0;
        let activeMonthsCount = 0;
        
        const chartLabels = [];
        const chartEarnings = [];
        const chartGas = [];
        const chartEfficiency = [];
        const chartTippedOrders = [];
        const chartNoTipOrders = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 1) continue;
            
            const col0 = (row[0] || '').trim().replace(/^"|"$/g, '');
            
            // 1. Total Row
            if (col0.toLowerCase() === 'total') {
                totalRow = row.map(c => (c || '').replace(/^"|"$/g, '').trim());
                continue;
            }
            
            // 2. Ratings Headers & Values
            const isRatingsHeaderRow = row.some(c => {
                const s = (c || '').trim().toLowerCase();
                return s.includes('lifetime') || s.includes('customer rating') || s.includes('overall dasher rating') || s.includes('5 stars');
            });
            if (isRatingsHeaderRow && !ratingsHeaders) {
                ratingsHeaders = row.map(c => (c || '').replace(/^"|"$/g, '').trim());
                for (let j = i + 1; j < data.length; j++) {
                    if (data[j] && data[j].some(c => /^\d+/.test((c || '').replace(/^"|"$/g, '').trim()))) {
                        ratingsValues = data[j].map(c => (c || '').replace(/^"|"$/g, '').trim());
                        break;
                    }
                }
                continue;
            }
            
            // 3. Customer Feedback Headers & Values
            const isFeedbackHeaderRow = row.some(c => {
                const s = (c || '').trim().toLowerCase();
                return s.includes('communication') || s.includes('order handling') || s.includes('friendliness');
            });
            if (isFeedbackHeaderRow && !feedbackHeaders) {
                feedbackHeaders = row.map(c => (c || '').replace(/^"|"$/g, '').trim());
                for (let j = i + 1; j < data.length; j++) {
                    if (data[j] && data[j].some(c => /^\d+/.test((c || '').replace(/^"|"$/g, '').trim()))) {
                        feedbackValues = data[j].map(c => (c || '').replace(/^"|"$/g, '').trim());
                        break;
                    }
                }
                continue;
            }
            
            // 4. Monthly Rows (Merged with Live Vault Records so newly logged shifts & gas update 100% in real time!)
            const validMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            if (validMonths.includes(col0.toLowerCase())) {
                const { shifts: mShifts, gas: mGas } = getVaultRecordsForMonth(col0);

                let rawHours = (row[1] || '0').replace(/^"|"$/g, '').trim();
                let hoursNum = parseHoursToNumber(rawHours);
                let activeHoursStr = (row[2] || '0').replace(/^"|"$/g, '').trim();
                let activeHoursNum = parseHoursToNumber(activeHoursStr);

                const rawMiles = (row[3] || '0').replace(/^"|"$/g, '').replace(/,/g, '').trim();
                let milesNum = parseFloat(rawMiles) || 0;

                let deliveries = parseInt((row[4] || '0').replace(/[^0-9]/g, "")) || 0;

                const basePayStr = (row[5] || '$0').replace(/^"|"$/g, '').trim();
                let basePayNum = parseFloat(basePayStr.replace(/[^0-9.-]+/g, "")) || 0;

                const tipsStr = (row[6] || '$0').replace(/^"|"$/g, '').trim();
                let tipsNum = parseFloat(tipsStr.replace(/[^0-9.-]+/g, "")) || 0;

                const cashTipsStr = (row[7] || '$0').replace(/^"|"$/g, '').trim();
                let cashTipsNum = parseFloat(cashTipsStr.replace(/[^0-9.-]+/g, "")) || 0;

                const taxesStr = (row[8] || '$0').replace(/^"|"$/g, '').trim();
                let taxesNum = parseFloat(taxesStr.replace(/[^0-9.-]+/g, "")) || 0;

                const totalPayStr = (row[9] || '$0').replace(/^"|"$/g, '').trim();
                let totalPayNum = parseFloat(totalPayStr.replace(/[^0-9.-]+/g, "")) || 0;

                const hourlyRateStr = (row[10] || '$0.00').replace(/^"|"$/g, '').trim();
                let hourlyRateNum = parseFloat(hourlyRateStr.replace(/[^0-9.-]+/g, "")) || 0;

                const gasStr = (row[13] || '$0.00').replace(/^"|"$/g, '').trim();
                let gasNum = parseFloat(gasStr.replace(/[^0-9.-]+/g, "")) || 0;

                let noTipCount = parseInt((row[11] || '0').replace(/[^0-9]/g, '')) || 0;

                // Live Vault Override: If liveVaultData has newer/more shift records for this month than cached CSV, use live Vault math!
                if (mShifts.length > 0) {
                    let vHrs = 0, vActHrs = 0, vMiles = 0, vDeliv = 0, vBase = 0, vTips = 0, vCash = 0, vTotal = 0, vTaxes = 0, vNoTip = 0;
                    mShifts.forEach(s => {
                        vHrs += parseHoursToNumber(String(s.hours || '0'));
                        vActHrs += parseHoursToNumber(String(s.activeHours || '0'));
                        vMiles += Number(s.miles || 0);
                        vDeliv += Number(s.deliveries || 0);
                        vBase += Number(s.basePay || 0);
                        vTips += Number(s.tips || 0);
                        vCash += Number(s.cashTips || 0);
                        vTotal += Number(s.total || 0);
                        vTaxes += Number(s.taxes || 0);
                        vNoTip += Number(s.noTips || 0);
                    });
                    if (vDeliv >= deliveries || vTotal >= totalPayNum) {
                        hoursNum = Math.max(hoursNum, vHrs);
                        rawHours = formatHrsMinsFromFloat(hoursNum);
                        activeHoursNum = Math.max(activeHoursNum, vActHrs);
                        activeHoursStr = formatHrsMinsFromFloat(activeHoursNum);
                        milesNum = Math.max(milesNum, vMiles);
                        deliveries = Math.max(deliveries, vDeliv);
                        basePayNum = Math.max(basePayNum, vBase);
                        tipsNum = Math.max(tipsNum, vTips);
                        cashTipsNum = Math.max(cashTipsNum, vCash);
                        totalPayNum = Math.max(totalPayNum, vTotal);
                        taxesNum = Math.max(taxesNum, vTaxes);
                        noTipCount = Math.max(noTipCount, vNoTip);
                        if (activeHoursNum > 0) {
                            hourlyRateNum = parseFloat((totalPayNum / activeHoursNum).toFixed(2));
                        }
                    }
                }

                if (mGas.length > 0) {
                    const vGas = mGas.reduce((sum, g) => sum + Number(g.total || 0), 0);
                    if (vGas >= gasNum) {
                        gasNum = vGas;
                    }
                }

                const tippedCount = Math.max(0, deliveries - noTipCount);
                const pctNoTipVal = deliveries > 0 ? `${((noTipCount / deliveries) * 100).toFixed(2)}%` : '0.00%';

                totalEarnings += totalPayNum;
                totalDeliveries += deliveries;
                totalGas += gasNum;
                totalBasePay += basePayNum;
                totalTips += tipsNum;
                totalCashTips += cashTipsNum;
                totalTaxes += taxesNum;
                totalMiles += milesNum;
                totalDashHoursNum += hoursNum;
                totalNoTipping += noTipCount;

                if (totalPayNum > 0 || deliveries > 0 || gasNum > 0) {
                    activeMonthsCount++;
                    chartLabels.push(col0);
                    chartEarnings.push(totalPayNum);
                    chartGas.push(gasNum);
                    const perMile = milesNum > 0 ? (totalPayNum / milesNum) : 0;
                    chartEfficiency.push(parseFloat(perMile.toFixed(2)));
                    chartTippedOrders.push(tippedCount);
                    chartNoTipOrders.push(noTipCount);
                }

                monthlyRows.push({
                    month: col0,
                    hours: rawHours,
                    activeHours: activeHoursStr,
                    miles: Math.round(milesNum).toLocaleString('en-US'),
                    deliveries,
                    basePay: `$${basePayNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    tips: `$${tipsNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    cashTips: `$${cashTipsNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    taxes: `$${taxesNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    gas: `$${gasNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    totalPay: `$${totalPayNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    hourlyRate: `$${hourlyRateNum.toFixed(2)}`,
                    noTipping: String(noTipCount),
                    pctNoTipping: pctNoTipVal,
                    totalPayNum,
                    gasNum,
                    hourlyRateNum,
                    milesNum,
                    noTipCount,
                    tippedCount
                });
            }
        }

        // Build live Total Row from the dynamically merged monthly totals so the footer Total Row always matches 100%
        const liveTotalRow = [
            'Total',
            formatHrsMinsFromFloat(totalDashHoursNum),
            totalRow && totalRow[2] ? totalRow[2] : formatHrsMinsFromFloat(totalDashHoursNum * 0.81),
            Math.round(totalMiles).toLocaleString('en-US'),
            totalDeliveries.toLocaleString('en-US'),
            `$${totalBasePay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `$${totalTips.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `$${totalCashTips.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `$${totalTaxes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `$${totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `$${(totalDashHoursNum > 0 ? (totalEarnings / totalDashHoursNum) : 0).toFixed(2)}`,
            totalNoTipping.toLocaleString('en-US'),
            totalDeliveries > 0 ? `${((totalNoTipping / totalDeliveries) * 100).toFixed(2)}%` : '0.00%',
            `$${totalGas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ];
        totalRow = liveTotalRow;

        // Fallbacks for ratings & feedback if header row not in gviz CSV export
        if (!ratingsHeaders) {
            ratingsHeaders = ['LifeTime Deliveries', 'Customer Rating', 'Overall Dasher Rating', '5 stars', '4 stars', '3 stars', '2 stars', '1 star\'s', 'No Reviews', '% No reviews'];
        }
        if (!ratingsValues && data.length > 14) {
            for (let k = 13; k < data.length; k++) {
                const rowClean = data[k].map(c => (c || '').replace(/^"|"$/g, '').trim()).filter(c => c !== '');
                if (rowClean.some(c => /^\d+/.test(c))) {
                    ratingsValues = rowClean;
                    break;
                }
            }
        }
        if (!feedbackHeaders) {
            feedbackHeaders = ['Communication', 'order handling', 'followed delivery instuctions', 'Friendliness', 'Above & Beyond'];
        }
        if (!feedbackValues && data.length > 15) {
            for (let k = 14; k < data.length; k++) {
                const rowClean = data[k].map(c => (c || '').replace(/^"|"$/g, '').trim()).filter(c => c !== '');
                if (rowClean.some(c => /^\d+/.test(c)) && rowClean !== ratingsValues) {
                    feedbackValues = rowClean;
                    break;
                }
            }
        }

        cachedChartData = {
            labels: chartLabels,
            earnings: chartEarnings,
            gas: chartGas,
            efficiency: chartEfficiency,
            tippedOrders: chartTippedOrders,
            noTipOrders: chartNoTipOrders,
            breakdown: {
                basePay: totalBasePay,
                tips: totalTips,
                cashTips: totalCashTips,
                gas: totalGas,
                taxes: totalTaxes
            }
        };

        // Render all UI sections
        renderRatings(ratingsHeaders, ratingsValues, totalDeliveries);
        const displayTotalDeliveries = (currentVaultYear === 'all' && latestRatingsState.lifetime > totalDeliveries)
            ? latestRatingsState.lifetime
            : totalDeliveries;

        renderExecutiveBento(totalEarnings, totalGas, totalDashHoursNum, totalMiles);
        renderTippingIntelligence(displayTotalDeliveries, totalNoTipping, totalTips + totalCashTips, totalEarnings);
        renderDeductionsIntelligence(totalMiles, totalGas, displayTotalDeliveries);
        renderItemizedLedger(totalEarnings, totalGas);
        renderSecondaryKpis(totalEarnings, totalBasePay, totalTips + totalCashTips, totalGas);
        renderRecentShiftsSnapshot();
        renderChart(currentChartType);
        renderFeedback(feedbackHeaders, feedbackValues);
        renderTable(monthlyRows);
        renderTotalRow(totalRow, totalMiles);
        
        const countBadge = document.getElementById('tableMonthCountBadge');
        if (countBadge) countBadge.textContent = `${activeMonthsCount} Active Months`;

    } catch (err) {
        console.error("Error in processData:", err);
    }
}

/* ==========================================================================
   ANIMATED NUMBER COUNTERS (easeOutCubic)
   ========================================================================== */
function animateValue(elementId, targetValue, isCurrency = false, prefix = '', suffix = '', duration = 1200) {
    const obj = document.getElementById(elementId);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const currentValue = easedProgress * targetValue;
        
        let formatted = '';
        if (isCurrency) {
            formatted = '$' + currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            formatted = Math.floor(currentValue).toLocaleString('en-US');
        }
        
        obj.textContent = `${prefix}${formatted}${suffix}`;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            if (isCurrency) {
                obj.textContent = `${prefix}$` + targetValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix;
            } else {
                obj.textContent = `${prefix}` + targetValue.toLocaleString('en-US') + suffix;
            }
        }
    };
    window.requestAnimationFrame(step);
}

/* ==========================================================================
   BENTO KPI RENDERERS
   ========================================================================== */
function renderExecutiveBento(totalEarnings, totalGas, totalHours, totalMiles) {
    const netProfit = totalEarnings - totalGas;
    const profitMargin = totalEarnings > 0 ? ((netProfit / totalEarnings) * 100).toFixed(1) : '0.0';
    const hourlyRate = totalHours > 0 ? (totalEarnings / totalHours) : 0;
    const gasRoi = totalGas > 0 ? (totalEarnings / totalGas) : 0;

    // 1. Hero Net Profit
    animateValue('cardValNetProfit', netProfit, true);
    const marginChip = document.getElementById('cardProfitMarginChip');
    if (marginChip) marginChip.textContent = `⚡ ${profitMargin}% Profit Margin`;

    // 2. Hourly Rate
    animateValue('cardValHourly', hourlyRate, true, '', ' / hr');
    const hoursChip = document.getElementById('cardTotalHoursChip');
    if (hoursChip) hoursChip.textContent = `${Math.round(totalHours)} Dash Hrs`;

    // 3. Gas ROI Efficiency
    const roiObj = document.getElementById('cardValGasRoi');
    if (roiObj) roiObj.textContent = `$${gasRoi.toFixed(2)}`;
    const milesChip = document.getElementById('cardTotalMilesChip');
    if (milesChip) milesChip.textContent = `${Math.round(totalMiles || 8986).toLocaleString()} Miles Tracked`;
}

/* ==========================================================================
   TAX DEDUCTIONS & EXPENSE INTELLIGENCE RENDERER
   ========================================================================== */
function renderDeductionsIntelligence(totalMiles, totalGas, totalDeliveries) {
    const totalDeduction = totalMiles * IRS_MILEAGE_RATE;
    const advantageOverGas = Math.max(0, totalDeduction - totalGas);
    const taxSavings = totalDeduction * 0.25; // Estimated ~25% self-employment & income tax shield
    const deductionPerOrder = totalDeliveries > 0 ? (totalDeduction / totalDeliveries) : 0;

    // Animate Deduction Metric Cards
    animateValue('cardValTotalDeduction', totalDeduction, true);
    animateValue('cardValTaxSavings', taxSavings, true);
    animateValue('cardValDeductionPerOrder', deductionPerOrder, true, '', ' / order');

    const milesEl = document.getElementById('cardValDeductionMiles');
    if (milesEl) milesEl.textContent = `${Math.round(totalMiles).toLocaleString()} mi`;

    const advChip = document.getElementById('cardDeductionAdvantageChip');
    if (advChip) advChip.textContent = `+ $${advantageOverGas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} over gas`;

    // Comparison Bar Math
    const totalBasis = totalDeduction + totalGas;
    const deductionPct = totalBasis > 0 ? (totalDeduction / totalBasis) * 100 : 76.3;
    const gasPct = totalBasis > 0 ? (totalGas / totalBasis) * 100 : 23.7;

    const compSegmentDeduction = document.getElementById('compSegmentDeduction');
    const compSegmentGas = document.getElementById('compSegmentGas');
    if (compSegmentDeduction) compSegmentDeduction.style.width = `${deductionPct.toFixed(1)}%`;
    if (compSegmentGas) compSegmentGas.style.width = `${gasPct.toFixed(1)}%`;

    const compDeductionText = document.getElementById('compDeductionText');
    if (compDeductionText) compDeductionText.textContent = `$${totalDeduction.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${deductionPct.toFixed(1)}%)`;

    const compGasText = document.getElementById('compGasText');
    if (compGasText) compGasText.textContent = `$${totalGas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${gasPct.toFixed(1)}%)`;
}

/* ==========================================================================
   ITEMIZED GEAR, SUPPLIES & VEHICLE UPKEEP LEDGER RENDERER
   ========================================================================== */
function renderLedgerItemList(containerId, items, defaultIcon, emptyMessage = 'items') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="ledger-empty-state">
                <span class="empty-icon">${defaultIcon}</span>
                <div class="empty-text">
                    <strong>No ${emptyMessage} logged yet</strong>
                    <p>Add rows in your Google Sheet's <strong>Expenses</strong> tab to see them appear here in real time.</p>
                </div>
            </div>
        `;
        return;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'ledger-item-row';
        row.innerHTML = `
            <div class="ledger-item-left">
                <span class="ledger-item-icon">${item.icon || defaultIcon}</span>
                <div class="ledger-item-info">
                    <span class="ledger-item-name">${escapeHtml(item.name || 'Expense Item')}</span>
                    <span class="ledger-item-desc">${escapeHtml(item.desc || '')}</span>
                </div>
            </div>
            <span class="ledger-item-cost">$${parseFloat(item.cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        `;
        container.appendChild(row);
    });
}

function renderItemizedLedger(totalEarnings, totalGas) {
    cachedSummaryEarnings = totalEarnings;
    cachedSummaryGas = totalGas;

    let gearItems = [];
    let maintItems = [];

    if (Array.isArray(liveExpensesData)) {
        gearItems = liveExpensesData.filter(i => {
            const c = (i.category || '').toLowerCase();
            return c.includes('gear') || c.includes('suppl') || (!c.includes('maint') && !c.includes('repair') && !c.includes('vehic') && !c.includes('tire') && !c.includes('oil') && !c.includes('brake'));
        });
        maintItems = liveExpensesData.filter(i => {
            const c = (i.category || '').toLowerCase();
            return c.includes('maint') || c.includes('repair') || c.includes('vehic') || c.includes('auto') || c.includes('tire') || c.includes('oil') || c.includes('brake');
        });
    }

    renderLedgerItemList('gearItemsList', gearItems, '🎒', 'gear or delivery supplies');
    renderLedgerItemList('maintItemsList', maintItems, '🛞', 'maintenance or upkeep expenses');

    const gearSubtotal = gearItems.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
    const maintSubtotal = maintItems.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
    const totalUpkeep = gearSubtotal + maintSubtotal;
    const trueNetProfit = Math.max(0, totalEarnings - totalGas - totalUpkeep);
    const netMarginPct = totalEarnings > 0 ? ((trueNetProfit / totalEarnings) * 100) : 0;

    // Subtotal Badges
    const gearBadge = document.getElementById('gearSubtotalBadge');
    if (gearBadge) gearBadge.textContent = `$${gearSubtotal.toFixed(2)} Subtotal`;

    const maintBadge = document.getElementById('maintSubtotalBadge');
    if (maintBadge) maintBadge.textContent = `$${maintSubtotal.toFixed(2)} Subtotal`;

    // Grand Summary Strip
    animateValue('ledgerTotalUpkeep', totalUpkeep, true);
    animateValue('ledgerTotalGas', totalGas, true);
    animateValue('ledgerTrueNetProfit', trueNetProfit, true);

    const netMarginSub = document.getElementById('ledgerNetMarginSub');
    if (netMarginSub) {
        netMarginSub.textContent = `${netMarginPct.toFixed(1)}% Net Margin of Gross ($${totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    }
}

/* ==========================================================================
   TIPPING & ORDER INTELLIGENCE RENDERER
   ========================================================================== */
function renderTippingIntelligence(totalDeliveries, totalNoTipping, totalTips, totalEarnings) {
    const totalNoTipCount = totalNoTipping;
    const totalTippedCount = Math.max(0, totalDeliveries - totalNoTipCount);
    const tippedPct = totalDeliveries > 0 ? ((totalTippedCount / totalDeliveries) * 100) : 0;
    const noTipPct = totalDeliveries > 0 ? ((totalNoTipCount / totalDeliveries) * 100) : 0;
    const avgTipPerOrder = totalTippedCount > 0 ? (totalTips / totalTippedCount) : 0;
    const avgGrossPayout = totalDeliveries > 0 ? (totalEarnings / totalDeliveries) : 0;

    // Animate Deliveries & Tip Counts
    animateValue('cardValDeliveries', totalDeliveries, false);
    animateValue('cardValOverviewDeliveries', totalDeliveries, false);
    animateValue('cardValTippedOrders', totalTippedCount, false);
    animateValue('cardValNoTipOrders', totalNoTipCount, false);

    // Update Overview Deliveries Card Chips
    const ovTippedChip = document.getElementById('cardOverviewTippedChip');
    if (ovTippedChip) ovTippedChip.textContent = `🎁 ${tippedPct.toFixed(1)}% Tipped`;
    const ovPerOrderText = document.getElementById('cardOverviewPerOrderText');
    if (ovPerOrderText) ovPerOrderText.textContent = `$${avgGrossPayout.toFixed(2)} / order`;

    // Update Chips & Context
    const avgGrossChip = document.getElementById('cardAvgPerOrderChip');
    if (avgGrossChip) avgGrossChip.textContent = `$${avgGrossPayout.toFixed(2)} / order`;

    const tippedRateChip = document.getElementById('cardTippedRateChip');
    if (tippedRateChip) tippedRateChip.textContent = `⚡ ${tippedPct.toFixed(1)}% Generosity`;

    const avgTipAmountChip = document.getElementById('cardAvgTipAmountChip');
    if (avgTipAmountChip) avgTipAmountChip.textContent = `Avg $${avgTipPerOrder.toFixed(2)} / tip`;

    const noTipRateChip = document.getElementById('cardNoTipRateChip');
    if (noTipRateChip) noTipRateChip.textContent = `🚫 ${noTipPct.toFixed(1)}% Stiff Rate`;

    // Update Segmented Ratio Bar
    const segmentTipped = document.getElementById('ratioSegmentTipped');
    const segmentNoTip = document.getElementById('ratioSegmentNoTip');
    if (segmentTipped) segmentTipped.style.width = `${tippedPct.toFixed(1)}%`;
    if (segmentNoTip) segmentNoTip.style.width = `${noTipPct.toFixed(1)}%`;

    const ratioTippedText = document.getElementById('ratioTippedText');
    if (ratioTippedText) ratioTippedText.textContent = `${totalTippedCount.toLocaleString()} (${tippedPct.toFixed(1)}%)`;

    const ratioNoTipText = document.getElementById('ratioNoTipText');
    if (ratioNoTipText) ratioNoTipText.textContent = `${totalNoTipCount.toLocaleString()} (${noTipPct.toFixed(1)}%)`;
}

function renderSecondaryKpis(gross, basePay, totalTips, gas) {
    animateValue('kpiGrossEarnings', gross, true);
    animateValue('kpiBasePay', basePay, true);
    animateValue('kpiTotalTips', totalTips, true);
    animateValue('kpiTotalGas', gas, true);
}

/* ==========================================================================
   RATINGS & PRESTIGE SHOWCASE
   ========================================================================== */
function renderRatings(headers, values, liveTotalDeliveries = 0) {
    const custRatingEl = document.getElementById('valCustomerRating');
    const overallRatingEl = document.getElementById('valOverallRating');
    const lifetimeEl = document.getElementById('valLifetimeDeliveries');
    const starContainer = document.getElementById('starBreakdownRows');
    
    if (!headers || !values) return;

    // Align headers and values if header row has an empty leading Column A cell (e.g. ["", "LifeTime Deliveries", ...] vs ["1318", "5", ...])
    const cleanHeaders = headers.map(h => (h || '').trim()).filter(h => h !== '');
    const cleanValues = values.map(v => (v || '').trim()).filter(v => v !== '');

    const map = {};
    for (let i = 0; i < cleanHeaders.length; i++) {
        if (cleanHeaders[i]) {
            map[cleanHeaders[i].toLowerCase().trim()] = (cleanValues[i] || '0').trim();
        }
    }

    let lifetimeNum = parseInt(String(map['lifetime deliveries'] || map['lifetime'] || '1349').replace(/[^0-9]/g, ''), 10) || 1349;
    // Also incorporate live Vault ratings or newly added shift deliveries beyond baseline 1224 (1,224 + 125 prior lifetime = 1,349)
    if (liveVaultData && liveVaultData.ratings && Number(liveVaultData.ratings.lifetime) > lifetimeNum) {
        lifetimeNum = Number(liveVaultData.ratings.lifetime);
    }
    if (liveTotalDeliveries >= 1224) {
        const expectedMinLifetime = 125 + liveTotalDeliveries;
        if (expectedMinLifetime > lifetimeNum) {
            lifetimeNum = expectedMinLifetime;
        }
    }

    const lifetimeFormatted = lifetimeNum.toLocaleString('en-US');
    const customerRating = (liveVaultData && liveVaultData.ratings && liveVaultData.ratings.customerRating)
        ? Number(liveVaultData.ratings.customerRating).toFixed(1)
        : (map['customer rating'] || '5.0');
    const overallRating = (liveVaultData && liveVaultData.ratings && liveVaultData.ratings.overallRating)
        ? String(liveVaultData.ratings.overallRating)
        : (map['overall dasher rating'] || '100');

    if (custRatingEl) custRatingEl.textContent = `★ ${customerRating}`;
    if (overallRatingEl) overallRatingEl.textContent = `${String(overallRating).replace(/%/g, '')}%`;
    if (lifetimeEl) lifetimeEl.textContent = lifetimeFormatted;

    const fiveStars = parseInt(map['5 stars'] || '0') || 100;
    const fourStars = parseInt(map['4 stars'] || '0') || 0;
    const threeStars = parseInt(map['3 stars'] || '0') || 0;
    const twoStars = parseInt(map['2 stars'] || '0') || 0;
    const oneStar = parseInt(map["1 star's"] || map['1 star'] || '0') || 0;

    latestRatingsState.lifetime = lifetimeNum;
    latestRatingsState.customerRating = parseFloat(customerRating) || 5.0;
    latestRatingsState.overallRating = parseInt(String(overallRating).replace(/[^0-9]/g, '')) || 100;
    latestRatingsState.stars5 = fiveStars;
    latestRatingsState.stars4 = fourStars;
    latestRatingsState.stars3 = threeStars;
    latestRatingsState.stars2 = twoStars;
    latestRatingsState.stars1 = oneStar;
    
    const totalRated = (fiveStars + fourStars + threeStars + twoStars + oneStar) || 1;

    const starsData = [
        { label: '5 Stars', count: fiveStars, pct: (fiveStars / totalRated) * 100 },
        { label: '4 Stars', count: fourStars, pct: (fourStars / totalRated) * 100 },
        { label: '3 Stars', count: threeStars, pct: (threeStars / totalRated) * 100 },
        { label: '2 Stars', count: twoStars, pct: (twoStars / totalRated) * 100 },
        { label: '1 Star', count: oneStar, pct: (oneStar / totalRated) * 100 }
    ];

    if (starContainer) {
        starContainer.innerHTML = starsData.map(s => `
            <div class="star-bar-row">
                <span class="star-label">${s.label}</span>
                <div class="star-track">
                    <div class="star-fill" style="width: ${s.pct}%;"></div>
                </div>
                <span class="star-num">${s.count}</span>
            </div>
        `).join('');
    }
}

function formatTitle(title) {
    if (!title) return '';
    let clean = title.replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const lower = clean.toLowerCase();
    if (lower.includes("communication")) return "Great Communication";
    if (lower.includes("order handling")) return "Careful Handling";
    if (lower.includes("instuctions") || lower.includes("instructions")) return "Followed Instructions";
    if (lower.includes("friendliness")) return "Friendliness";
    if (lower.includes("above") && lower.includes("beyond")) return "Above & Beyond";
    return clean;
}

function renderFeedback(headers, values) {
    const grid = document.getElementById('feedbackGrid');
    if (!grid || !headers || !values) return;

    const cleanHeaders = headers.map(h => (h || '').trim()).filter(h => h !== '');
    const cleanValues = values.map(v => (v || '').trim()).filter(v => v !== '');

    let html = '';
    for (let i = 0; i < cleanHeaders.length; i++) {
        const rawTitle = cleanHeaders[i];
        const val = cleanValues[i] || '0';
        if (!rawTitle) continue;

        const title = formatTitle(rawTitle);
        const lower = title.toLowerCase();
        const numVal = parseInt(val.replace(/[^0-9]/g, '')) || 0;
        
        let icon = '⭐';
        if (lower.includes('communication')) { icon = '💬'; latestRatingsState.communication = numVal; }
        else if (lower.includes('handling')) { icon = '🛍️'; latestRatingsState.orderHandling = numVal; }
        else if (lower.includes('instructions')) { icon = '📝'; latestRatingsState.instructions = numVal; }
        else if (lower.includes('friendliness')) { icon = '😊'; latestRatingsState.friendliness = numVal; }
        else if (lower.includes('above')) { icon = '🚀'; latestRatingsState.aboveBeyond = numVal; }

        html += `
            <div class="feedback-chip">
                <div class="feedback-left">
                    <span class="feedback-icon">${icon}</span>
                    <span class="feedback-name">${title}</span>
                </div>
                <span class="feedback-count-badge">${val}</span>
            </div>
        `;
    }
    grid.innerHTML = html;
}

/* ==========================================================================
   MONTHLY DATA TABLE & CLICK-TO-EXPAND VAULT DRILL-DOWN
   ========================================================================== */
function getVaultRecordsForMonth(monthName) {
    const mLower = String(monthName || '').toLowerCase().trim();
    const shifts = (liveVaultData.shifts || []).filter(s => {
        const matchM = String(s.month || '').toLowerCase().trim() === mLower;
        const matchY = (currentVaultYear === 'all') || (Number(s.year) === Number(currentVaultYear));
        return matchM && matchY;
    });
    const gas = (liveVaultData.gas || []).filter(g => {
        const matchM = String(g.month || '').toLowerCase().trim() === mLower;
        const matchY = (currentVaultYear === 'all') || (Number(g.year) === Number(currentVaultYear));
        return matchM && matchY;
    });
    return { shifts, gas };
}

let currentMonthlyViewMode = 'table'; // 'table' | 'cards'
let lastRenderedMonthlyRows = [];

function parseMoneyVal(v) {
    return parseFloat(String(v || '0').replace(/[^0-9.-]/g, '')) || 0;
}

function fmtMoneyVal(n) {
    return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function switchMonthlyViewMode(mode) {
    currentMonthlyViewMode = (mode === 'cards') ? 'cards' : 'table';
    const tblWrap = document.getElementById('monthlyTableViewWrap');
    const cardsEl = document.getElementById('monthlyCardsGrid');
    const btnTbl = document.getElementById('monthlyViewBtnTable');
    const btnCards = document.getElementById('monthlyViewBtnCards');
    if (btnTbl) btnTbl.classList.toggle('active', currentMonthlyViewMode === 'table');
    if (btnCards) btnCards.classList.toggle('active', currentMonthlyViewMode === 'cards');
    if (tblWrap) tblWrap.style.display = currentMonthlyViewMode === 'table' ? '' : 'none';
    if (cardsEl) cardsEl.style.display = currentMonthlyViewMode === 'cards' ? 'grid' : 'none';
    if (currentMonthlyViewMode === 'cards' && lastRenderedMonthlyRows.length > 0) {
        renderMonthlyCards(lastRenderedMonthlyRows);
    }
}

function renderMonthDrilldown() {
    if (lastRenderedMonthlyRows.length > 0) renderTable(lastRenderedMonthlyRows);
}

function toggleMonthDrilldown(monthName) {
    const key = String(monthName || '').trim();
    expandedMonths[key] = !expandedMonths[key];
    const rowEl = document.querySelector(`tr.month-clickable-row[data-month="${key}"]`);
    const drawerEl = document.getElementById(`drilldown-${key}`);
    if (rowEl && drawerEl) {
        rowEl.classList.toggle('expanded', !!expandedMonths[key]);
        drawerEl.style.display = expandedMonths[key] ? 'table-row' : 'none';
    }
}

function buildDrilldownInnerHtml(monthName) {
    const { shifts, gas } = getVaultRecordsForMonth(monthName);

    let shiftsHtml = '';
    if (shifts.length === 0) {
        shiftsHtml = `<div style="padding:0.75rem; color:#64748b; font-size:0.8rem;">No individual shifts logged in Vault for ${escapeHtml(monthName)} yet. Use <strong>＋ End-of-Shift Log</strong> to add one!</div>`;
    } else {
        shiftsHtml = `
            <div class="drilldown-mini-table-wrap">
                <table class="drilldown-mini-table">
                    <thead>
                        <tr>
                            <th>Date &amp; Time</th>
                            <th>Hours</th>
                            <th>Miles &amp; Orders</th>
                            <th>Base &amp; Tips</th>
                            <th>Reimb. &amp; Notes</th>
                            <th>Total &amp; Rate</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shifts.map(s => {
                            const miscAmt = Number(s.miscAmount || 0);
                            const miscBadge = s.miscCategory ? `<span class="misc-pill-badge">${escapeHtml(s.miscCategory)}</span>` : '';
                            const noteText = s.miscNote ? escapeHtml(s.miscNote) : (miscAmt > 0 ? 'Bonus / Extra Pay' : '—');
                            const sId = escapeHtml(s.id || '');
                            const sStart = escapeHtml(s.start || '');
                            const cashTxt = Number(s.cashTips || 0) > 0 ? ` + $${Number(s.cashTips).toFixed(2)} cash` : '';
                            return `
                                <tr>
                                    <td>
                                        <div class="mcell-stack">
                                            <span class="mcell-primary">${escapeHtml(s.start)}</span>
                                            <span class="mcell-sub">→ ${escapeHtml(s.end)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="mcell-stack">
                                            <span class="mcell-primary">${escapeHtml(s.activeHours)} act</span>
                                            <span class="mcell-sub">${escapeHtml(s.hours)} dash</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="mcell-stack">
                                            <span class="mcell-primary">${Number(s.miles || 0).toFixed(1)} mi</span>
                                            <span class="mcell-sub">${s.deliveries} ord • ${Number(s.noTips || 0)} no-tip</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="mcell-stack">
                                            <span class="mcell-primary">Base $${Number(s.basePay || 0).toFixed(2)}</span>
                                            <span class="mcell-sub positive-val">Tips $${Number(s.tips || 0).toFixed(2)}${cashTxt}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="mcell-stack">
                                            <span>${miscAmt > 0 ? `<strong style="color:#fbbf24;">+$${miscAmt.toFixed(2)}</strong> ` : ''}${miscBadge}</span>
                                            <span class="mcell-sub">${noteText}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="mcell-stack">
                                            <span class="mcell-primary positive-val">$${Number(s.total || 0).toFixed(2)}</span>
                                            <span class="mcell-sub" style="color:#38bdf8;">$${Number(s.hourlyRate || 0).toFixed(2)}/hr • Tax $${Number(s.taxes || 0).toFixed(2)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <button type="button" class="btn-shift-edit btn-shift-edit-sm" onclick="openEditShiftModal('${sId}', '${sStart}')" title="Edit Shift & Reimbursements">✏️ Edit</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    let gasHtml = '';
    if (gas.length === 0) {
        gasHtml = `<div style="padding:0.75rem; color:#64748b; font-size:0.8rem;">No gas fill-ups logged in Vault for ${escapeHtml(monthName)}.</div>`;
    } else {
        gasHtml = `
            <div class="drilldown-mini-table-wrap">
                <table class="drilldown-mini-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Station</th>
                            <th>$/Gal &amp; Gal</th>
                            <th>Total $</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${gas.map(g => `
                            <tr>
                                <td>${escapeHtml(g.date)}</td>
                                <td><strong>${escapeHtml(g.station)}</strong></td>
                                <td>$${Number(g.price || 0).toFixed(2)} • ${Number(g.gallons || 0).toFixed(3)} gal</td>
                                <td class="gas-val"><strong>$${Number(g.total || 0).toFixed(2)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    return { shiftsCount: shifts.length, gasCount: gas.length, html: `
        <div class="drilldown-drawer-grid">
            <div class="drilldown-subcard">
                <div class="drilldown-subcard-header">
                    <h4>🚗 ${escapeHtml(monthName)} Shift Vault Log</h4>
                    <span class="drilldown-count-pill">${shifts.length} Shifts</span>
                </div>
                ${shiftsHtml}
            </div>
            <div class="drilldown-subcard">
                <div class="drilldown-subcard-header">
                    <h4>⛽ ${escapeHtml(monthName)} Gas Fill-Ups</h4>
                    <span class="drilldown-count-pill">${gas.length} Fill-Ups</span>
                </div>
                ${gasHtml}
            </div>
        </div>
    ` };
}

function buildDrilldownDrawerHtml(monthName) {
    const inner = buildDrilldownInnerHtml(monthName);
    return `
        <tr id="drilldown-${escapeHtml(monthName)}" class="month-drilldown-row" style="display: ${expandedMonths[monthName] ? 'table-row' : 'none'};">
            <td colspan="8" class="month-drilldown-cell">
                ${inner.html}
            </td>
        </tr>
    `;
}

function renderMonthlyCards(rows) {
    const grid = document.getElementById('monthlyCardsGrid');
    if (!grid) return;

    let maxPay = 0;
    let maxRate = 0;
    rows.forEach(r => {
        if (r.totalPayNum > maxPay) maxPay = r.totalPayNum;
        if (r.hourlyRateNum > maxRate) maxRate = r.hourlyRateNum;
    });

    grid.innerHTML = rows.map(r => {
        const irsVal = fmtMoneyVal((r.milesNum || 0) * IRS_MILEAGE_RATE);
        const taxNum = parseMoneyVal(r.taxes);
        const gasNum = r.gasNum !== undefined ? r.gasNum : parseMoneyVal(r.gas);
        const netVal = fmtMoneyVal((r.totalPayNum || 0) - taxNum - gasNum);
        const { shifts } = getVaultRecordsForMonth(r.month);

        let badges = '';
        if (shifts.length > 0) badges += `<span class="badge-tag" style="background:rgba(56,189,248,0.14);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);">${shifts.length} shifts</span>`;
        if (r.totalPayNum > 0 && r.totalPayNum === maxPay) badges += `<span class="badge-tag badge-best-income">🏆 Top Pay</span>`;
        if (r.hourlyRateNum > 0 && r.hourlyRateNum === maxRate) badges += `<span class="badge-tag badge-best-rate">⚡ Peak Rate</span>`;

        return `
            <article class="month-bento-card" data-month="${escapeHtml(r.month)}">
                <div class="mbc-header">
                    <div class="mbc-title-row">
                        <div class="mbc-title">${escapeHtml(r.month)}</div>
                        <div style="display:flex;gap:0.25rem;flex-wrap:wrap;">${badges}</div>
                    </div>
                    <span class="mcell-rate-pill">${escapeHtml(r.hourlyRate)}/hr</span>
                </div>
                <div class="mbc-hero">
                    <span class="mbc-hero-gross">${escapeHtml(r.totalPay)}</span>
                    <span class="mbc-hero-net">Net ${netVal}</span>
                </div>
                <div class="mbc-grid">
                    <div class="mbc-stat">
                        <div class="mbc-stat-label">Hours</div>
                        <div class="mcell-stack">
                            <span class="mcell-primary">${escapeHtml(r.activeHours)} act</span>
                            <span class="mcell-sub">${escapeHtml(r.hours)} dash</span>
                        </div>
                    </div>
                    <div class="mbc-stat">
                        <div class="mbc-stat-label">Miles &amp; IRS</div>
                        <div class="mcell-stack">
                            <span class="mcell-primary">${escapeHtml(r.miles)} mi</span>
                            <span class="mcell-sub deduction-val">${irsVal} IRS</span>
                        </div>
                    </div>
                    <div class="mbc-stat">
                        <div class="mbc-stat-label">Orders &amp; No-Tip</div>
                        <div class="mcell-stack">
                            <span class="mcell-primary">${Number(r.deliveries || 0).toLocaleString('en-US')} ord</span>
                            <span class="mcell-sub">${escapeHtml(r.noTipping)} no-tip (${escapeHtml(r.pctNoTipping)})</span>
                        </div>
                    </div>
                    <div class="mbc-stat">
                        <div class="mbc-stat-label">Pay Split</div>
                        <div class="mcell-stack">
                            <span class="mcell-primary">Base ${escapeHtml(r.basePay)}</span>
                            <span class="mcell-sub positive-val">Tips ${escapeHtml(r.tips)} • Cash ${escapeHtml(r.cashTips)}</span>
                        </div>
                    </div>
                    <div class="mbc-stat" style="grid-column: 1 / -1;">
                        <div class="mbc-stat-label">Taxes &amp; Gas</div>
                        <div style="display:flex;justify-content:space-between;gap:0.5rem;">
                            <span class="mcell-sub">Tax ${escapeHtml(r.taxes)}</span>
                            <span class="mcell-sub gas-val">Gas ${escapeHtml(r.gas)}</span>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function renderTable(rows) {
    lastRenderedMonthlyRows = Array.isArray(rows) ? rows : [];
    const tbody = document.getElementById('dashTableBody');
    if (!tbody) return;
    let html = '';

    let maxPay = 0;
    let maxRate = 0;
    rows.forEach(r => {
        if (r.totalPayNum > maxPay) maxPay = r.totalPayNum;
        if (r.hourlyRateNum > maxRate) maxRate = r.hourlyRateNum;
    });

    rows.forEach(r => {
        let monthBadge = '';
        if (r.totalPayNum > 0 && r.totalPayNum === maxPay) {
            monthBadge += `<span class="badge-tag badge-best-income">🏆 Top Pay</span>`;
        }
        if (r.hourlyRateNum > 0 && r.hourlyRateNum === maxRate) {
            monthBadge += `<span class="badge-tag badge-best-rate">⚡ Peak Rate</span>`;
        }

        const isExp = !!expandedMonths[r.month];
        const { shifts } = getVaultRecordsForMonth(r.month);
        const shiftCountTag = shifts.length > 0 ? `<span class="badge-tag" style="background:rgba(56,189,248,0.14);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);">${shifts.length} shifts</span>` : '';

        const irsVal = fmtMoneyVal((r.milesNum || 0) * IRS_MILEAGE_RATE);
        const taxNum = parseMoneyVal(r.taxes);
        const gasNum = r.gasNum !== undefined ? r.gasNum : parseMoneyVal(r.gas);
        const netVal = fmtMoneyVal((r.totalPayNum || 0) - taxNum - gasNum);

        html += `
            <tr class="month-clickable-row ${isExp ? 'expanded' : ''}" data-month="${escapeHtml(r.month)}" onclick="toggleMonthDrilldown('${escapeHtml(r.month)}')">
                <td>
                    <div class="mcell-month-wrap">
                        <div class="mcell-month-top">
                            <span class="month-expand-chevron">▶</span>
                            <strong>${r.month}</strong>
                            ${shiftCountTag}
                        </div>
                        ${monthBadge ? `<div class="mcell-badges">${monthBadge}</div>` : ''}
                    </div>
                </td>
                <td>
                    <div class="mcell-stack">
                        <span class="mcell-primary">${r.activeHours} act</span>
                        <span class="mcell-sub">${r.hours} dash</span>
                    </div>
                </td>
                <td>
                    <div class="mcell-stack">
                        <span class="mcell-primary">${r.miles} mi</span>
                        <span class="mcell-sub deduction-val">${irsVal} IRS</span>
                    </div>
                </td>
                <td>
                    <div class="mcell-stack">
                        <span class="mcell-primary">${Number(r.deliveries || 0).toLocaleString('en-US')} ord</span>
                        <span class="mcell-sub">${r.noTipping} no-tip (${r.pctNoTipping})</span>
                    </div>
                </td>
                <td>
                    <div class="mcell-stack">
                        <span class="mcell-primary">Base ${r.basePay}</span>
                        <span class="mcell-sub positive-val">Tips ${r.tips} • Cash ${r.cashTips}</span>
                    </div>
                </td>
                <td>
                    <div class="mcell-stack">
                        <span class="mcell-primary">Tax ${r.taxes}</span>
                        <span class="mcell-sub gas-val">Gas ${r.gas}</span>
                    </div>
                </td>
                <td>
                    <div class="mcell-stack">
                        <span class="mcell-primary positive-val">${r.totalPay}</span>
                        <span class="mcell-sub">Net ${netVal}</span>
                    </div>
                </td>
                <td><span class="mcell-rate-pill">${r.hourlyRate}/hr</span></td>
            </tr>
            ${buildDrilldownDrawerHtml(r.month)}
        `;
    });

    tbody.innerHTML = html;
    renderMonthlyCards(lastRenderedMonthlyRows);
}

function renderTotalRow(row, totalMiles) {
    const tfoot = document.getElementById('dashTableFoot');
    if (!tfoot || !row) return;

    const milesTotal = totalMiles || parseMoneyVal(row[3]) || 8986;
    const totalDeductionVal = fmtMoneyVal(milesTotal * IRS_MILEAGE_RATE);
    const grossNum = parseMoneyVal(row[9]);
    const taxNum = parseMoneyVal(row[8]);
    const gasNum = parseMoneyVal(row[13]);
    const netTotalVal = fmtMoneyVal(grossNum - taxNum - gasNum);

    tfoot.innerHTML = `
        <tr>
            <td><strong>${row[0] || 'Total'}</strong></td>
            <td>
                <div class="mcell-stack">
                    <span class="mcell-primary">${row[2] || '0'} act</span>
                    <span class="mcell-sub">${row[1] || '0'} dash</span>
                </div>
            </td>
            <td>
                <div class="mcell-stack">
                    <span class="mcell-primary">${row[3] || '0'} mi</span>
                    <span class="mcell-sub deduction-val">${totalDeductionVal} IRS</span>
                </div>
            </td>
            <td>
                <div class="mcell-stack">
                    <span class="mcell-primary">${row[4] || '0'} ord</span>
                    <span class="mcell-sub">${row[11] || '0'} no-tip (${row[12] || '0%'})</span>
                </div>
            </td>
            <td>
                <div class="mcell-stack">
                    <span class="mcell-primary">Base ${row[5] || '$0'}</span>
                    <span class="mcell-sub positive-val">Tips ${row[6] || '$0'} • Cash ${row[7] || '$0'}</span>
                </div>
            </td>
            <td>
                <div class="mcell-stack">
                    <span class="mcell-primary">Tax ${row[8] || '$0'}</span>
                    <span class="mcell-sub gas-val">Gas ${row[13] || '$0.00'}</span>
                </div>
            </td>
            <td>
                <div class="mcell-stack">
                    <span class="mcell-primary positive-val">${row[9] || '$0'}</span>
                    <span class="mcell-sub">Net ${netTotalVal}</span>
                </div>
            </td>
            <td><span class="mcell-rate-pill">${row[10] || '$0'}/hr</span></td>
        </tr>
    `;
}

/* ==========================================================================
   ADVANCED CHART.JS VISUALIZER
   ========================================================================== */
function switchChart(type) {
    currentChartType = type;
    
    ['line', 'bar', 'tipSplit', 'donut', 'efficiency'].forEach(t => {
        const btn = document.getElementById('chartBtn' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) {
            if (t === type) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    const badge = document.getElementById('chartSubtitleBadge');
    if (badge) {
        if (type === 'line') badge.textContent = 'Earnings Trend Over Time';
        else if (type === 'bar') badge.textContent = 'Monthly Pay vs. Gas Expenses';
        else if (type === 'tipSplit') badge.textContent = 'Monthly Tipped vs. No-Tip Deliveries';
        else if (type === 'donut') badge.textContent = 'Revenue & Expense Distribution';
        else if (type === 'efficiency') badge.textContent = 'Earnings Generated Per Mile Driven';
    }

    if (cachedChartData) {
        renderChart(type);
    }
}

function renderChart(type = 'line') {
    if (!cachedChartData) return;
    const canvas = document.getElementById('earningsChart');
    if (!canvas) return;

    try {
        if (typeof Chart === 'undefined') {
            console.warn("Chart.js is not loaded.");
            return;
        }

        const ctx = canvas.getContext('2d');
        if (earningsChartInstance) {
            earningsChartInstance.destroy();
        }

        const { labels, earnings, gas, efficiency, tippedOrders, noTipOrders, breakdown } = cachedChartData;

        const crimsonGradient = ctx.createLinearGradient(0, 0, 0, 320);
        crimsonGradient.addColorStop(0, 'rgba(255, 48, 8, 0.45)');
        crimsonGradient.addColorStop(0.6, 'rgba(255, 48, 8, 0.12)');
        crimsonGradient.addColorStop(1, 'rgba(255, 48, 8, 0.0)');

        const cyanGradient = ctx.createLinearGradient(0, 0, 0, 320);
        cyanGradient.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
        cyanGradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

        let chartConfig = {};

        if (type === 'line') {
            chartConfig = {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Gross Earnings ($)',
                        data: earnings,
                        borderColor: '#ff3008',
                        backgroundColor: crimsonGradient,
                        borderWidth: 3.5,
                        fill: true,
                        tension: 0.38,
                        pointBackgroundColor: '#ff6542',
                        pointBorderColor: '#090d16',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            titleFont: { family: 'Plus Jakarta Sans', size: 13, weight: '700' },
                            bodyFont: { family: 'Outfit', size: 13 },
                            borderColor: 'rgba(255, 48, 8, 0.4)',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: false,
                            callbacks: {
                                label: (ctx) => `Earnings: $${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { 
                            ticks: { 
                                color: '#94a3b8', 
                                font: { family: 'Outfit', size: 11 },
                                callback: (v) => '$' + v.toLocaleString()
                            }, 
                            grid: { color: 'rgba(255,255,255,0.04)' } 
                        }
                    }
                }
            };
        } else if (type === 'bar') {
            chartConfig = {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Total Pay ($)',
                            data: earnings,
                            backgroundColor: 'rgba(16, 185, 129, 0.85)',
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 8
                        },
                        {
                            label: 'Gas Spent ($)',
                            data: gas,
                            backgroundColor: 'rgba(244, 63, 94, 0.85)',
                            borderColor: '#f43f5e',
                            borderWidth: 1,
                            borderRadius: 8
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#cbd5e1', font: { family: 'Plus Jakarta Sans', weight: '600' } } },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderWidth: 1,
                            padding: 12
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { 
                            ticks: { 
                                color: '#94a3b8',
                                callback: (v) => '$' + v.toLocaleString()
                            }, 
                            grid: { color: 'rgba(255,255,255,0.04)' } 
                        }
                    }
                }
            };
        } else if (type === 'tipSplit') {
            chartConfig = {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Tipped Orders',
                            data: tippedOrders,
                            backgroundColor: 'rgba(16, 185, 129, 0.85)',
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 8
                        },
                        {
                            label: 'No-Tip Orders',
                            data: noTipOrders,
                            backgroundColor: 'rgba(244, 63, 94, 0.85)',
                            borderColor: '#f43f5e',
                            borderWidth: 1,
                            borderRadius: 8
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#cbd5e1', font: { family: 'Plus Jakarta Sans', weight: '600' } } },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                                label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} orders`
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { 
                            ticks: { 
                                color: '#94a3b8',
                                stepSize: 20
                            }, 
                            grid: { color: 'rgba(255,255,255,0.04)' } 
                        }
                    }
                }
            };
        } else if (type === 'donut') {
            chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['Base Pay', 'App Tips', 'Cash Tips', 'Gas Spent', 'Taxes'],
                    datasets: [{
                        data: [
                            breakdown.basePay,
                            breakdown.tips,
                            breakdown.cashTips,
                            breakdown.gas,
                            breakdown.taxes
                        ],
                        backgroundColor: [
                            '#38bdf8', // Base Pay
                            '#10b981', // Tips
                            '#f59e0b', // Cash Tips
                            '#f43f5e', // Gas
                            '#a855f7'  // Taxes
                        ],
                        borderWidth: 2,
                        borderColor: '#080c14'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: '#cbd5e1', font: { family: 'Plus Jakarta Sans', size: 12, weight: '500' }, padding: 14 }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: $${ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            }
                        }
                    }
                }
            };
        } else if (type === 'efficiency') {
            chartConfig = {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Earnings Per Mile ($/mi)',
                        data: efficiency,
                        borderColor: '#38bdf8',
                        backgroundColor: cyanGradient,
                        borderWidth: 3.5,
                        fill: true,
                        tension: 0.38,
                        pointBackgroundColor: '#38bdf8',
                        pointBorderColor: '#090d16',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: 'rgba(56, 189, 248, 0.4)',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                                label: (ctx) => `Efficiency: $${ctx.parsed.y.toFixed(2)} per mile`
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { 
                            ticks: { 
                                color: '#94a3b8',
                                callback: (v) => '$' + v.toFixed(2) + '/mi'
                            }, 
                            grid: { color: 'rgba(255,255,255,0.04)' } 
                        }
                    }
                }
            };
        }

        earningsChartInstance = new Chart(ctx, chartConfig);
    } catch (chartErr) {
        console.error("Error building Chart:", chartErr);
    }
}

/* ==========================================================================
   DASHER TRACKER HQ (v4.0.0) — MULTI-YEAR VAULT, ADMIN GATE & MODAL LOGIC
   ========================================================================== */
function showHqToast(message, isError = false) {
    const container = document.getElementById('hqToastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `hq-toast ${isError ? 'error' : ''}`;
    toast.innerHTML = `<span>${isError ? '⚠️' : '✅'}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4500);
}

/* --- 1. Multi-Year Vault Selector --- */
function renderVaultYearSelectorPills() {
    const pillsContainer = document.getElementById('vaultYearPills');
    if (!pillsContainer) return;

    const yearSet = new Set([2026, 2027]);
    if (Array.isArray(liveVaultData.years)) {
        liveVaultData.years.forEach(y => { if (y) yearSet.add(Number(y)); });
    }
    (liveVaultData.shifts || []).forEach(s => { if (s.year) yearSet.add(Number(s.year)); });
    (liveVaultData.gas || []).forEach(g => { if (g.year) yearSet.add(Number(g.year)); });

    const sortedYears = Array.from(yearSet).sort((a, b) => a - b);

    let html = `<button type="button" class="vault-year-btn ${currentVaultYear === 'all' ? 'active' : ''}" data-year="all" onclick="selectVaultYear('all')">All-Time</button>`;
    sortedYears.forEach(yr => {
        const isActive = Number(currentVaultYear) === Number(yr);
        html += `<button type="button" class="vault-year-btn ${isActive ? 'active' : ''}" data-year="${yr}" onclick="selectVaultYear(${yr})">${yr}</button>`;
    });
    pillsContainer.innerHTML = html;
}

function formatHrsMinsFromFloat(hrsFloat) {
    const totalMins = Math.round((hrsFloat || 0) * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}:${m < 10 ? '0' + m : m}`;
}

function selectVaultYear(yearVal) {
    currentVaultYear = yearVal === 'all' ? 'all' : Number(yearVal);
    renderVaultYearSelectorPills();

    if (currentVaultYear === 'all' || currentVaultYear === 2026) {
        if (cachedRawCsvData) {
            processData(cachedRawCsvData);
        }
        return;
    }

    // Dynamic Future Year Vault Aggregation (e.g., 2027, 2028...)
    renderVaultYearFromRecords(currentVaultYear);
}

function renderVaultYearFromRecords(targetYear) {
    const yearShifts = (liveVaultData.shifts || []).filter(s => Number(s.year) === Number(targetYear));
    const yearGas = (liveVaultData.gas || []).filter(g => Number(g.year) === Number(targetYear));

    let totalEarnings = 0;
    let totalDeliveries = 0;
    let totalGas = 0;
    let totalBasePay = 0;
    let totalTips = 0;
    let totalCashTips = 0;
    let totalTaxes = 0;
    let totalMiles = 0;
    let totalDashHoursNum = 0;
    let totalActiveHoursNum = 0;
    let totalNoTipping = 0;
    let activeMonthsCount = 0;

    const monthlyRows = [];
    const chartLabels = [];
    const chartEarnings = [];
    const chartGas = [];
    const chartEfficiency = [];
    const chartTippedOrders = [];
    const chartNoTipOrders = [];

    MONTH_ORDER.forEach(monthName => {
        const mShifts = yearShifts.filter(s => String(s.month || '').toLowerCase() === monthName.toLowerCase());
        const mGas = yearGas.filter(g => String(g.month || '').toLowerCase() === monthName.toLowerCase());

        let mHrs = 0;
        let mActHrs = 0;
        let mMiles = 0;
        let mDeliv = 0;
        let mBase = 0;
        let mTips = 0;
        let mCash = 0;
        let mTotal = 0;
        let mTaxes = 0;
        let mNoTip = 0;

        mShifts.forEach(s => {
            mHrs += parseHoursToNumber(String(s.hours || '0'));
            mActHrs += parseHoursToNumber(String(s.activeHours || '0'));
            mMiles += Number(s.miles || 0);
            mDeliv += Number(s.deliveries || 0);
            mBase += Number(s.basePay || 0);
            mTips += Number(s.tips || 0);
            mCash += Number(s.cashTips || 0);
            mTotal += Number(s.total || 0);
            mTaxes += Number(s.taxes || 0);
            mNoTip += Number(s.noTips || 0);
        });

        const mGasVal = mGas.reduce((sum, g) => sum + Number(g.total || 0), 0);
        const mRate = mActHrs > 0 ? (mTotal / mActHrs) : (mHrs > 0 ? (mTotal / mHrs) : 0);
        const mTipped = Math.max(0, mDeliv - mNoTip);
        const pctNoTip = mDeliv > 0 ? ((mNoTip / mDeliv) * 100).toFixed(2) + '%' : '0.00%';

        totalEarnings += mTotal;
        totalDeliveries += mDeliv;
        totalGas += mGasVal;
        totalBasePay += mBase;
        totalTips += mTips;
        totalCashTips += mCash;
        totalTaxes += mTaxes;
        totalMiles += mMiles;
        totalDashHoursNum += mHrs;
        totalActiveHoursNum += mActHrs;
        totalNoTipping += mNoTip;

        if (mTotal > 0 || mDeliv > 0 || mGasVal > 0) {
            activeMonthsCount++;
            chartLabels.push(monthName);
            chartEarnings.push(mTotal);
            chartGas.push(mGasVal);
            chartEfficiency.push(mMiles > 0 ? parseFloat((mTotal / mMiles).toFixed(2)) : 0);
            chartTippedOrders.push(mTipped);
            chartNoTipOrders.push(mNoTip);
        }

        monthlyRows.push({
            month: monthName,
            hours: formatHrsMinsFromFloat(mHrs),
            activeHours: formatHrsMinsFromFloat(mActHrs),
            miles: mMiles.toFixed(1),
            deliveries: mDeliv,
            basePay: `$${mBase.toFixed(2)}`,
            tips: `$${mTips.toFixed(2)}`,
            cashTips: `$${mCash.toFixed(2)}`,
            taxes: `$${mTaxes.toFixed(2)}`,
            gas: `$${mGasVal.toFixed(2)}`,
            totalPay: `$${mTotal.toFixed(2)}`,
            hourlyRate: `$${mRate.toFixed(2)}`,
            noTipping: String(mNoTip),
            pctNoTipping: pctNoTip,
            totalPayNum: mTotal,
            gasNum: mGasVal,
            hourlyRateNum: mRate,
            milesNum: mMiles,
            noTipCount: mNoTip,
            tippedCount: mTipped
        });
    });

    cachedChartData = {
        labels: chartLabels.length > 0 ? chartLabels : ['Jan', 'Feb', 'Mar'],
        earnings: chartEarnings.length > 0 ? chartEarnings : [0, 0, 0],
        gas: chartGas.length > 0 ? chartGas : [0, 0, 0],
        efficiency: chartEfficiency.length > 0 ? chartEfficiency : [0, 0, 0],
        tippedOrders: chartTippedOrders.length > 0 ? chartTippedOrders : [0, 0, 0],
        noTipOrders: chartNoTipOrders.length > 0 ? chartNoTipOrders : [0, 0, 0],
        breakdown: {
            basePay: totalBasePay,
            tips: totalTips,
            cashTips: totalCashTips,
            gas: totalGas,
            taxes: totalTaxes
        }
    };

    const syntheticTotalRow = [
        `${targetYear} Total`,
        formatHrsMinsFromFloat(totalDashHoursNum),
        formatHrsMinsFromFloat(totalActiveHoursNum),
        totalMiles.toFixed(1),
        String(totalDeliveries),
        `$${totalBasePay.toFixed(2)}`,
        `$${totalTips.toFixed(2)}`,
        `$${totalCashTips.toFixed(2)}`,
        `$${totalTaxes.toFixed(2)}`,
        `$${totalEarnings.toFixed(2)}`,
        `$${(totalDashHoursNum > 0 ? (totalEarnings / totalDashHoursNum) : 0).toFixed(2)}`,
        String(totalNoTipping),
        totalDeliveries > 0 ? `${((totalNoTipping / totalDeliveries) * 100).toFixed(2)}%` : '0.00%',
        `$${totalGas.toFixed(2)}`
    ];

    renderExecutiveBento(totalEarnings, totalGas, totalDashHoursNum, totalMiles);
    renderTippingIntelligence(totalDeliveries, totalNoTipping, totalTips + totalCashTips, totalEarnings);
    renderDeductionsIntelligence(totalMiles, totalGas, totalDeliveries);
    renderItemizedLedger(totalEarnings, totalGas);
    renderSecondaryKpis(totalEarnings, totalBasePay, totalTips + totalCashTips, totalGas);
    renderRecentShiftsSnapshot();
    renderChart(currentChartType);
    renderTable(monthlyRows);
    renderTotalRow(syntheticTotalRow, totalMiles);

    const countBadge = document.getElementById('tableMonthCountBadge');
    if (countBadge) countBadge.textContent = `${targetYear} Vault • ${activeMonthsCount} Active Months`;
}

/* --- 1b. Clean 4-Tab Workspace Navigation & Recent Shift Snapshot (v5.0.0) --- */
let currentWorkspaceTab = 'overview';

function switchWorkspaceTab(tabName) {
    currentWorkspaceTab = tabName || 'overview';
    document.querySelectorAll('#workspaceNavDock .workspace-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-ws-tab') === currentWorkspaceTab);
    });
    document.querySelectorAll('.workspace-view-pane').forEach(pane => {
        const isMatch = pane.getAttribute('data-ws-pane') === currentWorkspaceTab;
        pane.style.display = isMatch ? 'block' : 'none';
        pane.classList.toggle('active', isMatch);
    });
    if (currentWorkspaceTab === 'overview' && earningsChartInstance) {
        setTimeout(() => {
            try { earningsChartInstance.resize(); } catch (e) {}
        }, 60);
    }
}

function renderRecentShiftsSnapshot() {
    const listEl = document.getElementById('recentShiftsMiniList');
    const badgeEl = document.getElementById('recentShiftsCountBadge');
    if (!listEl) return;

    const allShifts = Array.isArray(liveVaultData.shifts) ? liveVaultData.shifts : [];
    const filteredShifts = currentVaultYear === 'all'
        ? allShifts
        : allShifts.filter(s => Number(s.year || 2026) === Number(currentVaultYear));

    if (badgeEl) {
        badgeEl.textContent = `${filteredShifts.length} Logged Shifts`;
    }

    if (filteredShifts.length === 0) {
        listEl.innerHTML = `
            <div class="recent-shift-mini-row">
                <div class="rs-mini-left">
                    <span class="rs-mini-date">No shifts logged for this year yet</span>
                    <span class="rs-mini-meta">Click "+ Log Shift / Add Data" to record a shift</span>
                </div>
            </div>
        `;
        return;
    }

    const latestFive = filteredShifts.slice(-5).reverse();
    listEl.innerHTML = latestFive.map(s => {
        const pay = Number(s.total || 0);
        const rate = Number(s.hourlyRate || 0);
        const deliv = Number(s.deliveries || 0);
        const miles = Number(s.miles || 0);
        const startLabel = escapeHtml(String(s.start || s.month || 'Shift').replace(/:00$/, ''));
        const sId = escapeHtml(s.id || '');
        const sStart = escapeHtml(s.start || '');
        return `
            <div class="recent-shift-mini-row">
                <div class="rs-mini-left">
                    <span class="rs-mini-date">${startLabel}</span>
                    <span class="rs-mini-meta">🛍️ ${deliv} orders • 🚗 ${miles} mi • ⏱️ ${escapeHtml(String(s.activeHours || s.hours || '0:00'))}</span>
                </div>
                <div class="rs-mini-right">
                    <span class="rs-mini-pay">$${pay.toFixed(2)}</span>
                    <span class="rs-mini-rate">$${rate.toFixed(2)}/hr</span>
                </div>
                <button type="button" class="btn-shift-edit" onclick="openEditShiftModal('${sId}', '${sStart}')" title="Edit Shift & Reimbursements">✏️ Edit</button>
            </div>
        `;
    }).join('');
}

/* --- 2. Minimalist Google Account Security Gate (Zero Exposed Emails) --- */
async function computeSha256Hex(text) {
    const clean = String(text || '').toLowerCase().trim();
    if (!clean) return '';
    if (window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(clean);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return '';
}

async function isAuthorizedAdminEmail(email) {
    if (!email) return false;
    const h = await computeSha256Hex(email);
    return h === ADMIN_IDENTITY_HASH;
}

async function initAdminAuthState() {
    try {
        const saved = localStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.email && (await isAuthorizedAdminEmail(parsed.email))) {
                applyAdminUnlockedState(parsed.email, false);
                return;
            }
        }
    } catch (e) {}

    // Also listen for active Firebase OAuth session or redirect result
    try {
        const authInst = getDasherAuthInstance();
        if (authInst) {
            authInst.getRedirectResult().then(async (res) => {
                if (res && res.user && res.user.email) {
                    if (await isAuthorizedAdminEmail(res.user.email)) {
                        applyAdminUnlockedState(res.user.email, true);
                    } else {
                        authInst.signOut().catch(() => {});
                    }
                }
            }).catch(() => {});

            authInst.onAuthStateChanged(async (user) => {
                if (user && user.email) {
                    if (await isAuthorizedAdminEmail(user.email)) {
                        applyAdminUnlockedState(user.email, false);
                    }
                }
            });
        }
    } catch (e) {}

    applyAdminLockedState();
}

function applyAdminUnlockedState(email, showToastFlag = true) {
    currentAdminUser = { email: String(email).toLowerCase().trim(), verifiedAt: Date.now() };
    try {
        localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify(currentAdminUser));
    } catch (e) {}

    const lockBtn = document.getElementById('adminLockBtn');
    const unlockedWrap = document.getElementById('adminUnlockedControls');
    const emailLabel = document.getElementById('adminVerifiedEmailLabel');

    if (lockBtn) lockBtn.style.display = 'none';
    if (unlockedWrap) unlockedWrap.style.display = 'flex';
    if (emailLabel) emailLabel.textContent = '🔓 Admin Verified';

    closeAdminAuthModal();
    if (showToastFlag) {
        showHqToast('Admin HQ Unlocked');
    }
}

function applyAdminLockedState() {
    currentAdminUser = null;
    try {
        localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
        const authInst = getDasherAuthInstance();
        if (authInst) {
            authInst.signOut().catch(() => {});
        }
    } catch (e) {}

    const lockBtn = document.getElementById('adminLockBtn');
    const unlockedWrap = document.getElementById('adminUnlockedControls');
    if (lockBtn) lockBtn.style.display = 'inline-flex';
    if (unlockedWrap) unlockedWrap.style.display = 'none';
}

function signOutAdmin() {
    applyAdminLockedState();
    closeAddDataModal();
    showHqToast('Admin HQ Locked');
}

function openAdminAuthModal() {
    const overlay = document.getElementById('adminAuthModalOverlay');
    const errEl = document.getElementById('adminAuthErrorMsg');
    if (errEl) errEl.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
}

function closeAdminAuthModal() {
    const overlay = document.getElementById('adminAuthModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function signInWithGisTokenFallback(errEl) {
    return new Promise((resolve) => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_OAUTH_CLIENT_ID,
                scope: 'email profile openid',
                prompt: 'select_account',
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        try {
                            const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                            });
                            const info = await r.json();
                            const email = (info && info.email) ? info.email : '';
                            if (await isAuthorizedAdminEmail(email)) {
                                applyAdminUnlockedState(email, true);
                                resolve(true);
                                return;
                            } else {
                                if (errEl) {
                                    errEl.textContent = '🚫 Access Denied: Unauthorized Google account.';
                                    errEl.style.display = 'block';
                                }
                                resolve(false);
                                return;
                            }
                        } catch (e) {}
                    }
                    resolve(false);
                }
            });
            tokenClient.requestAccessToken();
        } else {
            resolve(false);
        }
    });
}

async function handleAdminGoogleSignIn(event) {
    if (event) event.preventDefault();
    const errEl = document.getElementById('adminAuthErrorMsg');
    if (errEl) errEl.style.display = 'none';

    const authInst = getDasherAuthInstance();
    try {
        if (authInst && typeof firebase !== 'undefined' && firebase.auth) {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await authInst.signInWithPopup(provider);
            const email = (result && result.user && result.user.email) ? result.user.email : '';
            if (await isAuthorizedAdminEmail(email)) {
                applyAdminUnlockedState(email, true);
                return;
            } else {
                await authInst.signOut().catch(() => {});
                if (errEl) {
                    errEl.textContent = '🚫 Access Denied: Unauthorized Google account.';
                    errEl.style.display = 'block';
                }
                return;
            }
        }
    } catch (popupErr) {
        if (popupErr && (popupErr.code === 'auth/popup-closed-by-user' || popupErr.code === 'auth/cancelled-popup-request')) {
            return;
        }
        // Fallback 1: Google Identity Services OAuth2 popup if Firebase popup is blocked
        const gisHandled = await signInWithGisTokenFallback(errEl);
        if (gisHandled) return;

        // Fallback 2: Full-page Google OAuth redirect if browser blocks all popups
        if (authInst && popupErr && (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/operation-not-supported-in-this-environment')) {
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                await authInst.signInWithRedirect(provider);
                return;
            } catch (e) {}
        }

        console.warn('Google Auth popup notice:', popupErr);
        if (errEl) {
            errEl.textContent = '🚫 Google Sign-In failed or was blocked by browser popup settings.';
            errEl.style.display = 'block';
        }
    }
}

/* --- 3. + Add Data to Vault Modal, Clean Resets & Live Bulk Calculators --- */
let activeGasStationInputEl = null;

function getCurrentLocalDateAndIso() {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    const localIso = new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
    const localDate = localIso.slice(0, 10);
    return { localIso, localDate };
}

function resetShiftFormClean() {
    const form = document.getElementById('hqFormShift');
    if (form && typeof form.reset === 'function') form.reset();

    const { localIso } = getCurrentLocalDateAndIso();
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v;
    };
    setVal('shiftStartInput', localIso);
    setVal('shiftEndInput', localIso);
    setVal('shiftActiveHoursInput', '');
    setVal('shiftMilesInput', '');
    setVal('shiftDeliveriesInput', '');
    setVal('shiftNoTipsInput', '0');
    setVal('shiftBasePayInput', '');
    setVal('shiftTipsInput', '');
    setVal('shiftCashTipsInput', '0.00');

    // Reset Misc Pay rows back to 1 clean row
    const miscContainer = document.getElementById('miscPayRowsContainer');
    if (miscContainer) {
        const rows = Array.from(miscContainer.querySelectorAll('.misc-pay-row'));
        rows.forEach((r, idx) => {
            if (idx === 0) {
                const sel = r.querySelector('.misc-type-select');
                const amt = r.querySelector('.misc-amount-input');
                const note = r.querySelector('.misc-note-input');
                const dateEl = r.querySelector('.misc-date-input');
                if (sel) sel.value = '';
                if (amt) amt.value = '0.00';
                if (note) note.value = '';
                if (dateEl) { delete dateEl.dataset.touched; dateEl.value = getShiftFormDefaultIsoDate(); }
            } else {
                r.remove();
            }
        });
    }
    recalcShiftPreview();
}

function resetGasFormClean() {
    const form = document.getElementById('hqFormGas');
    if (form && typeof form.reset === 'function') form.reset();

    const { localDate } = getCurrentLocalDateAndIso();
    const container = document.getElementById('gasRowsContainer');
    if (container) {
        const rows = Array.from(container.querySelectorAll('.gas-entry-row'));
        rows.forEach((r, idx) => {
            if (idx === 0) {
                const d = r.querySelector('.gas-date-input');
                const s = r.querySelector('.gas-station-input');
                const p = r.querySelector('.gas-price-input');
                const g = r.querySelector('.gas-gallons-input');
                const t = r.querySelector('.gas-total-input');
                if (d) d.value = localDate;
                if (s) s.value = '';
                if (p) p.value = '';
                if (g) g.value = '';
                if (t) t.value = '';
            } else {
                r.remove();
            }
        });
    }
    activeGasStationInputEl = null;
    recalcGasPreview();
}

function resetExpenseFormClean() {
    const form = document.getElementById('hqFormExpense');
    if (form && typeof form.reset === 'function') form.reset();

    const { localDate } = getCurrentLocalDateAndIso();
    const container = document.getElementById('expenseRowsContainer');
    if (container) {
        const rows = Array.from(container.querySelectorAll('.expense-entry-row'));
        rows.forEach((r, idx) => {
            if (idx === 0) {
                const d = r.querySelector('.exp-date-input');
                const c = r.querySelector('.exp-category-input');
                const n = r.querySelector('.exp-name-input');
                const desc = r.querySelector('.exp-desc-input');
                const cost = r.querySelector('.exp-cost-input');
                if (d) d.value = localDate;
                if (c) c.value = 'Gear';
                if (n) n.value = '';
                if (desc) desc.value = '';
                if (cost) cost.value = '';
            } else {
                r.remove();
            }
        });
    }
    recalcExpensePreview();
}

let currentEosMode = 'shift'; // 'shift' | 'gas' | 'edit'
let activeRailSec = 'time';
let isRestoringEosDraft = false;
const EOS_DRAFT_KEY = 'dasher_eos_draft_v6';

function setEosMode(mode) {
    currentEosMode = mode || 'shift';
    const card = document.querySelector('.eos-modal-card');
    if (card) card.setAttribute('data-eos-mode', currentEosMode);

    const titleEl = document.getElementById('addDataModalTitle');
    const subEl = document.getElementById('eosModalSub');
    const iconEl = document.getElementById('eosModalIcon');
    const submitBtn = document.getElementById('submitShiftBtn');
    const draftBtn = document.getElementById('saveDraftBtn');
    const clearBtn = document.getElementById('clearShiftFormBtn');
    const badgeEl = document.getElementById('eosModeBadge');

    const toggleRailStep = (sec, visible) => {
        const btn = document.querySelector(`.eos-rail-step[data-target="${sec}"]`);
        if (btn) btn.style.display = visible ? '' : 'none';
    };

    if (currentEosMode === 'gas') {
        ['time', 'earn', 'misc', 'expense', 'ratings', 'all'].forEach(s => toggleRailStep(s, false));
        toggleRailStep('gas', true);
        if (titleEl) titleEl.textContent = 'Log Gas Fill-Up(s)';
        if (subEl) subEl.textContent = 'Quick gas entry for non-shift days';
        if (iconEl) iconEl.textContent = '⛽';
        if (submitBtn) submitBtn.textContent = '⛽ Save Gas Fill-Up(s)';
        if (draftBtn) draftBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = '';
        if (badgeEl) badgeEl.textContent = '🔓 Gas Quick Log';
        onEosToggleSection('gas', true);
        eosJumpTo('gas');
    } else if (currentEosMode === 'edit') {
        ['time', 'earn', 'misc', 'all'].forEach(s => toggleRailStep(s, true));
        ['gas', 'expense', 'ratings'].forEach(s => toggleRailStep(s, false));
        if (titleEl) titleEl.textContent = 'Edit Shift & Reimbursements';
        if (subEl) subEl.textContent = 'Update shift details, reimbursements, and sync to Vault';
        if (iconEl) iconEl.textContent = '✏️';
        if (submitBtn) submitBtn.textContent = '💾 Save Shift Changes';
        if (draftBtn) draftBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        eosJumpTo('time');
    } else {
        ['time', 'earn', 'misc', 'gas', 'expense', 'ratings', 'all'].forEach(s => toggleRailStep(s, true));
        if (titleEl) titleEl.textContent = 'End-of-Shift Log';
        if (subEl) subEl.textContent = 'Fill in what you have — everything saves together in one tap';
        if (iconEl) iconEl.textContent = '⚡';
        if (submitBtn) submitBtn.textContent = '🚀 Save Everything';
        if (draftBtn) draftBtn.style.display = '';
        if (clearBtn) clearBtn.style.display = '';
        if (badgeEl) badgeEl.textContent = '🔓 Admin Verified';
        eosJumpTo('time');
    }
}

function eosSetActiveRail(sec) {
    document.querySelectorAll('.eos-rail-step').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-target') === sec);
    });
}

function eosSectionId(sec) {
    const map = { time: 'eosSecTime', earn: 'eosSecEarn', misc: 'eosSecMisc', gas: 'eosSecGas', expense: 'eosSecExpense', ratings: 'eosSecRatings' };
    return map[sec] || '';
}

function setEosCardCollapsed(sec, collapsed) {
    const el = document.getElementById(eosSectionId(sec));
    if (el) el.classList.toggle('collapsed', !!collapsed);
}

function toggleEosCard(sec) {
    const el = document.getElementById(eosSectionId(sec));
    if (!el) return;
    el.classList.toggle('collapsed');
    if (activeRailSec !== 'all') eosSetActiveRail(sec);
}

function eosJumpTo(sec) {
    const allSecs = ['time', 'earn', 'misc', 'gas', 'expense', 'ratings'];
    const allowed = currentEosMode === 'gas'
        ? ['gas']
        : (currentEosMode === 'edit' ? ['time', 'earn', 'misc'] : allSecs);

    activeRailSec = sec;
    eosSetActiveRail(sec);

    const shiftWrap = document.getElementById('hqFormShift');
    if (shiftWrap) {
        const showShiftWrap = (currentEosMode !== 'gas') && (sec === 'all' || sec === 'time' || sec === 'earn' || sec === 'misc');
        shiftWrap.style.display = showShiftWrap ? 'flex' : 'none';
    }

    if (sec === 'all') {
        allSecs.forEach(s => {
            const el = document.getElementById(eosSectionId(s));
            if (el) el.style.display = allowed.includes(s) ? '' : 'none';
            if (allowed.includes(s) && (s === 'time' || s === 'earn' || s === 'misc')) {
                setEosCardCollapsed(s, false);
            }
        });
    } else {
        allSecs.forEach(s => {
            const el = document.getElementById(eosSectionId(s));
            if (el) el.style.display = (s === sec && allowed.includes(s)) ? '' : 'none';
        });
        setEosCardCollapsed(sec, false);
        if (sec === 'gas' || sec === 'expense' || sec === 'ratings') {
            const defDate = getShiftFormDefaultIsoDate();
            if (sec === 'gas') {
                document.querySelectorAll('#gasRowsContainer .gas-date-input').forEach(el => { if (!el.value) el.value = defDate; });
            } else if (sec === 'expense') {
                document.querySelectorAll('#expenseRowsContainer .exp-date-input').forEach(el => { if (!el.value) el.value = defDate; });
            }
        }
    }

    const body = document.getElementById('eosBody');
    if (body) body.scrollTop = 0;
    updateEosStepNavButtons();

    if (arguments[1]) {
        const targetScope = sec === 'all' ? body : document.getElementById(eosSectionId(sec));
        if (targetScope) {
            const firstField = Array.from(targetScope.querySelectorAll('input, select')).find(f =>
                f.type !== 'hidden' && f.type !== 'checkbox' && !f.disabled && f.offsetParent !== null
            );
            if (firstField) firstField.focus();
        }
    }
}

const EOS_STEP_LABELS = {
    time: 'Time & Distance',
    earn: 'Earnings',
    misc: 'Reimb. & Bonuses',
    gas: 'Gas',
    expense: 'Expenses',
    ratings: 'Ratings',
    all: 'All Sections'
};

function getAllowedEosSteps() {
    if (currentEosMode === 'gas') return ['gas'];
    if (currentEosMode === 'edit') return ['time', 'earn', 'misc', 'all'];
    return ['time', 'earn', 'misc', 'gas', 'expense', 'ratings', 'all'];
}

function updateEosStepNavButtons() {
    const prevBtn = document.getElementById('eosPrevStepBtn');
    const nextBtn = document.getElementById('eosNextStepBtn');
    if (!prevBtn || !nextBtn) return;

    if (currentEosMode === 'gas') {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        return;
    }

    prevBtn.style.display = '';
    nextBtn.style.display = '';
    const steps = getAllowedEosSteps();
    const idx = Math.max(0, steps.indexOf(activeRailSec));

    prevBtn.disabled = idx <= 0;
    if (idx < steps.length - 1) {
        nextBtn.disabled = false;
        nextBtn.textContent = `Next: ${EOS_STEP_LABELS[steps[idx + 1]] || 'Next'} →`;
    } else {
        nextBtn.disabled = true;
        nextBtn.textContent = '✓ All Steps Viewed';
    }
}

function eosStepRelative(delta) {
    const steps = getAllowedEosSteps();
    const cur = Math.max(0, steps.indexOf(activeRailSec));
    const nextIdx = Math.max(0, Math.min(steps.length - 1, cur + delta));
    if (nextIdx !== cur || steps.length === 1) {
        eosJumpTo(steps[nextIdx], true);
    }
}

function onEosFormKeyDown(event) {
    if (!event || event.key !== 'Enter') return;
    const t = event.target;
    if (!t || !t.closest || !t.closest('#eosBody')) return;
    if (t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA') return;

    event.preventDefault();
    const scope = activeRailSec === 'all'
        ? document.getElementById('eosBody')
        : document.getElementById(eosSectionId(activeRailSec));
    if (!scope) return;

    const fields = Array.from(scope.querySelectorAll('input, select')).filter(f =>
        f.type !== 'hidden' && f.type !== 'checkbox' && !f.disabled && f.offsetParent !== null
    );
    const pos = fields.indexOf(t);
    if (pos !== -1 && pos < fields.length - 1) {
        fields[pos + 1].focus();
    } else if (activeRailSec !== 'all') {
        eosStepRelative(1);
    }
}

function onEosToggleSection(sec, checked) {
    const toggleId = sec === 'gas' ? 'eosToggleGas' : (sec === 'expense' ? 'eosToggleExpense' : 'eosToggleRatings');
    const cb = document.getElementById(toggleId);
    if (cb) cb.checked = !!checked;
    // Keep the currently viewed tab expanded even if toggled off
    if (activeRailSec === sec) {
        setEosCardCollapsed(sec, false);
    } else {
        setEosCardCollapsed(sec, !checked);
    }
    if (checked) {
        const defDate = getShiftFormDefaultIsoDate();
        if (sec === 'gas') {
            document.querySelectorAll('#gasRowsContainer .gas-date-input').forEach(el => { if (!el.value) el.value = defDate; });
        } else if (sec === 'expense') {
            document.querySelectorAll('#expenseRowsContainer .exp-date-input').forEach(el => { if (!el.value) el.value = defDate; });
        }
    }
    recalcShiftPreview();
    if (!isRestoringEosDraft && currentEosMode === 'shift') {
        const ov = document.getElementById('addDataModalOverlay');
        if (ov && ov.style.display === 'flex') saveEosDraft(false);
    }
}

async function openAddDataModal(defaultTab = 'shift') {
    if (!currentAdminUser || !(await isAuthorizedAdminEmail(currentAdminUser.email))) {
        openAdminAuthModal();
        return;
    }

    const overlay = document.getElementById('addDataModalOverlay');
    if (overlay) overlay.style.display = 'flex';

    isRestoringEosDraft = true;
    try {
        clearEosValidation();
        resetShiftFormClean();
        resetGasFormClean();
        resetExpenseFormClean();
        prefillRatingsFormInputs();

        const gasCb = document.getElementById('eosToggleGas');
        const expCb = document.getElementById('eosToggleExpense');
        const ratCb = document.getElementById('eosToggleRatings');
        if (gasCb) gasCb.checked = false;
        if (expCb) expCb.checked = false;
        if (ratCb) ratCb.checked = false;

        ['time', 'earn', 'misc'].forEach(s => setEosCardCollapsed(s, false));
        ['gas', 'expense', 'ratings'].forEach(s => setEosCardCollapsed(s, true));
    } finally {
        isRestoringEosDraft = false;
    }

    if (defaultTab === 'gas') {
        setEosMode('gas');
    } else {
        setEosMode('shift');
        restoreEosDraft();
        if (defaultTab === 'expense') {
            onEosToggleSection('expense', true);
            eosJumpTo('expense');
        } else if (defaultTab === 'ratings') {
            onEosToggleSection('ratings', true);
            eosJumpTo('ratings');
        } else {
            eosJumpTo('time');
        }
    }
    recalcShiftPreview();
}

function closeAddDataModal() {
    const overlay = document.getElementById('addDataModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function switchAddDataTab(tabName) {
    if (tabName === 'gas') {
        setEosMode('gas');
    } else {
        setEosMode('shift');
        if (tabName === 'expense' || tabName === 'ratings') {
            onEosToggleSection(tabName, true);
            eosJumpTo(tabName);
        } else {
            eosJumpTo('time');
        }
    }
}

function addMiscPayRow(initialType = '', initialAmount = 0, initialNote = '', initialIsoDate = '') {
    const container = document.getElementById('miscPayRowsContainer');
    if (!container) return;
    const idx = container.children.length;
    const row = document.createElement('div');
    row.className = 'misc-pay-row';
    row.setAttribute('data-row-idx', idx);
    const typeVal = String(initialType || '');
    const amtNum = Number(initialAmount || 0);
    const amtVal = (initialAmount !== undefined && initialAmount !== null && !isNaN(amtNum)) ? amtNum.toFixed(2) : '0.00';
    const noteVal = String(initialNote || '');
    const hasOwnDate = /^\d{4}-\d{2}-\d{2}$/.test(String(initialIsoDate || ''));
    const dateVal = hasOwnDate ? initialIsoDate : getShiftFormDefaultIsoDate();

    const selReimb = typeVal.indexOf('Reimbursement') !== -1 ? 'selected' : '';
    const selPeak = (typeVal.indexOf('Peak') !== -1 || typeVal.indexOf('Bonus') !== -1) ? 'selected' : '';
    const selExtra = typeVal.indexOf('Extra') !== -1 ? 'selected' : '';
    const selOther = typeVal.indexOf('Other') !== -1 ? 'selected' : '';

    row.innerHTML = `
        <div class="hq-field-group">
            <label>Misc Type Dropdown</label>
            <select class="hq-select misc-type-select" onchange="recalcShiftPreview()">
                <option value="">None ($0.00)</option>
                <option value="💵 Reimbursement" ${selReimb}>💵 Reimbursement (Closed Store / Half-Pay)</option>
                <option value="⚡ Peak Pay / Bonus" ${selPeak}>⚡ Peak Pay / Challenge Bonus</option>
                <option value="📦 Extra Delivery Fee" ${selExtra}>📦 Extra Delivery Fee</option>
                <option value="🎉 Other Misc Pay" ${selOther}>🎉 Other Misc Pay</option>
            </select>
        </div>
        <div class="hq-field-group">
            <label>📅 Date</label>
            <input type="date" class="hq-input misc-date-input" value="${dateVal}" ${hasOwnDate ? 'data-touched="1"' : ''} oninput="this.dataset.touched='1'; recalcShiftPreview()">
        </div>
        <div class="hq-field-group">
            <label>Misc Amount ($)</label>
            <input type="number" step="0.01" min="0" class="hq-input misc-amount-input" value="${amtVal}" placeholder="0.00" oninput="recalcShiftPreview()">
        </div>
        <div class="hq-field-group misc-note-group">
            <label>Misc Reason / Note</label>
            <input type="text" class="hq-input misc-note-input" value="${escapeHtml(noteVal)}" placeholder="e.g. Extra delivery fee ($3.78)" oninput="recalcShiftPreview()">
        </div>
        <button type="button" class="remove-misc-row-btn" onclick="this.parentElement.remove(); recalcShiftPreview(); saveEosDraft(false);" title="Remove Misc Row">&times;</button>
    `;
    container.appendChild(row);
    recalcShiftPreview();
}

function collectMiscPaySummary() {
    return collectMiscRowsSummary('#miscPayRowsContainer', 'Misc Pay');
}

/* --- v5.2.0: Dated Reimbursement / Bonus Helpers --- */
function isoDateToDisplay(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}` : '';
}

function displayDateToIso(disp) {
    const m = String(disp || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

function todayIsoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getShiftFormDefaultIsoDate() {
    const el = document.getElementById('shiftStartInput');
    const v = el ? String(el.value || '') : '';
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : todayIsoDate();
}

function getEditFormDefaultIsoDate() {
    const el = document.getElementById('editShiftStartInput');
    const v = el ? String(el.value || '') : '';
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : todayIsoDate();
}

// Keeps untouched misc date pickers synced with the shift start date
function syncUntouchedMiscDates(containerSelector, isoDate) {
    if (!isoDate) return;
    document.querySelectorAll(`${containerSelector} .misc-date-input`).forEach(el => {
        if (el.dataset.touched !== '1') el.value = isoDate;
    });
}

function collectMiscRowsSummary(containerSelector, fallbackCat) {
    const rows = document.querySelectorAll(`${containerSelector} .misc-pay-row`);
    let totalMiscAmount = 0;
    const categories = [];
    const notesParts = [];

    rows.forEach(r => {
        const typeEl = r.querySelector('.misc-type-select');
        const amtEl = r.querySelector('.misc-amount-input');
        const noteEl = r.querySelector('.misc-note-input');
        const dateEl = r.querySelector('.misc-date-input');

        const typeVal = typeEl ? typeEl.value.trim() : '';
        const amtVal = amtEl ? (parseFloat(amtEl.value) || 0) : 0;
        const noteVal = noteEl ? noteEl.value.trim() : '';
        const dateDisp = dateEl ? isoDateToDisplay(dateEl.value) : '';
        const datePrefix = dateDisp ? `[${dateDisp}] ` : '';

        if (amtVal > 0 || noteVal) {
            totalMiscAmount += amtVal;
            const cleanCat = typeVal ? typeVal.replace(/^[^\w]+/, '').trim() : fallbackCat;
            if (cleanCat && !categories.includes(cleanCat)) {
                categories.push(cleanCat);
            }
            if (noteVal && amtVal > 0) {
                notesParts.push(`${datePrefix}${cleanCat} ($${amtVal.toFixed(2)}): ${noteVal}`);
            } else if (noteVal) {
                notesParts.push(`${datePrefix}${cleanCat}: ${noteVal}`);
            } else if (amtVal > 0) {
                notesParts.push(`${datePrefix}${cleanCat}: $${amtVal.toFixed(2)}`);
            }
        }
    });

    return {
        miscAmount: parseFloat(totalMiscAmount.toFixed(2)),
        miscCategory: categories.join(' + '),
        miscNote: notesParts.join(' | ')
    };
}

// Parses stored miscNote back into structured rows (date, category, amount, note)
function parseMiscNoteToRows(miscNote, miscCategory, miscAmount) {
    const note = String(miscNote || '').trim();
    const total = Number(miscAmount || 0);
    if (!note) {
        return (total > 0 || miscCategory) ? [{ date: '', cat: String(miscCategory || ''), amount: total, note: '' }] : [];
    }
    const re = /^(?:\[(\d{1,2}\/\d{1,2}\/\d{4})\]\s*)?(?:([A-Za-z][A-Za-z /+&-]*?)\s*(?:\(\$([\d.]+)\))?:\s*)?(.*)$/;
    const parts = note.split(' | ').map(p => {
        const m = p.trim().match(re) || [];
        let txt = (m[4] || '').trim();
        let amt = m[3] !== undefined ? parseFloat(m[3]) : null;
        // "Category: $12.00" form (amount only, no note)
        const amtOnly = txt.match(/^\$([\d.]+)$/);
        if (amtOnly && m[2]) { amt = parseFloat(amtOnly[1]); txt = ''; }
        return { date: m[1] || '', cat: (m[2] || '').trim(), amount: amt, note: txt };
    });
    // If only one part, or amounts don't itemize, put the full total on the first row
    const itemized = parts.every(p => p.amount !== null);
    if (!itemized || parts.length === 1) {
        parts.forEach((p, i) => { p.amount = (i === 0) ? total : (p.amount || 0); });
        if (parts.length > 1 && !itemized) {
            parts[0].note = parts.map(p => p.note).filter(Boolean).join(' | ');
            parts[0].cat = parts[0].cat || String(miscCategory || '');
            return [parts[0]];
        }
    }
    if (!parts[0].cat) parts[0].cat = String(miscCategory || '');
    return parts;
}

function recalcShiftPreview() {
    const startVal = (document.getElementById('shiftStartInput') || {}).value || '';
    const endVal = (document.getElementById('shiftEndInput') || {}).value || '';
    const activeStr = (document.getElementById('shiftActiveHoursInput') || {}).value || '';
    const miles = parseFloat((document.getElementById('shiftMilesInput') || {}).value) || 0;
    const basePay = parseFloat((document.getElementById('shiftBasePayInput') || {}).value) || 0;
    const tips = parseFloat((document.getElementById('shiftTipsInput') || {}).value) || 0;
    const cashTips = parseFloat((document.getElementById('shiftCashTipsInput') || {}).value) || 0;

    let calcHoursFormatted = '0:00';
    let totalHrsFloat = 0;
    let targetYear = 2026;
    let targetMonth = 'November';

    if (startVal) {
        const sDate = new Date(startVal);
        if (!isNaN(sDate.getTime())) {
            targetYear = sDate.getFullYear();
            targetMonth = MONTH_ORDER[sDate.getMonth()] || 'November';
            if (endVal) {
                const eDate = new Date(endVal);
                if (!isNaN(eDate.getTime()) && eDate > sDate) {
                    totalHrsFloat = (eDate.getTime() - sDate.getTime()) / 3600000;
                    calcHoursFormatted = formatHrsMinsFromFloat(totalHrsFloat);
                }
            }
        }
    }

    const hintEl = document.getElementById('shiftTotalHrsHint');
    if (hintEl) hintEl.textContent = `Total: ${calcHoursFormatted}`;
    syncUntouchedMiscDates('#miscPayRowsContainer', getShiftFormDefaultIsoDate());

    const targetBadge = document.getElementById('shiftVaultTargetBadge');
    if (targetBadge) targetBadge.textContent = `🏛️ Target: ${targetMonth} ${targetYear} Vault`;

    const { miscAmount } = collectMiscPaySummary();
    const grossTotal = basePay + tips + cashTips + miscAmount;
    const activeHrsFloat = parseHoursToNumber(activeStr) || totalHrsFloat || 0;
    const hourlyRate = activeHrsFloat > 0 ? (grossTotal / activeHrsFloat) : 0;
    const taxSetAside = grossTotal * 0.30;
    const irsDeduction = miles * IRS_MILEAGE_RATE;

    const pTotal = document.getElementById('previewShiftTotal');
    const pHourly = document.getElementById('previewShiftHourly');
    const pTaxes = document.getElementById('previewShiftTaxes');
    const pDed = document.getElementById('previewShiftDeduction');

    if (pTotal) pTotal.textContent = `$${grossTotal.toFixed(2)}`;
    if (pHourly) pHourly.textContent = `$${hourlyRate.toFixed(2)} / hr`;
    if (pTaxes) pTaxes.textContent = `$${taxSetAside.toFixed(2)}`;
    if (pDed) pDed.textContent = `$${irsDeduction.toFixed(2)}`;

    updateEosChipsAndFooter({
        startVal, endVal, activeStr, miles, grossTotal, taxSetAside, basePay, tips, cashTips, miscAmount
    });

    return {
        year: targetYear,
        month: targetMonth,
        hours: calcHoursFormatted,
        grossTotal,
        hourlyRate,
        taxSetAside
    };
}

function getGasRowsSummaryFromDom() {
    const rows = document.querySelectorAll('#gasRowsContainer .gas-entry-row');
    let totalCost = 0;
    let validCount = 0;
    rows.forEach(r => {
        const g = parseFloat((r.querySelector('.gas-gallons-input') || {}).value) || 0;
        const t = parseFloat((r.querySelector('.gas-total-input') || {}).value) || 0;
        const s = ((r.querySelector('.gas-station-input') || {}).value || '').trim();
        totalCost += t;
        if (s && (t > 0 || g > 0)) validCount++;
    });
    return { totalCost, validCount, rowCount: rows.length };
}

function getExpenseRowsSummaryFromDom() {
    const rows = document.querySelectorAll('#expenseRowsContainer .expense-entry-row');
    let totalCost = 0;
    let validCount = 0;
    rows.forEach(r => {
        const name = ((r.querySelector('.exp-name-input') || {}).value || '').trim();
        const cost = parseFloat((r.querySelector('.exp-cost-input') || {}).value) || 0;
        totalCost += cost;
        if (name && cost >= 0) validCount++;
    });
    return { totalCost, validCount, rowCount: rows.length };
}

function fmtShortChipTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtShortChipDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function updateEosChipsAndFooter(shiftInfo) {
    const info = shiftInfo || (() => {
        const basePay = parseFloat((document.getElementById('shiftBasePayInput') || {}).value) || 0;
        const tips = parseFloat((document.getElementById('shiftTipsInput') || {}).value) || 0;
        const cashTips = parseFloat((document.getElementById('shiftCashTipsInput') || {}).value) || 0;
        const miles = parseFloat((document.getElementById('shiftMilesInput') || {}).value) || 0;
        const { miscAmount } = collectMiscPaySummary();
        const grossTotal = basePay + tips + cashTips + miscAmount;
        return {
            startVal: (document.getElementById('shiftStartInput') || {}).value || '',
            endVal: (document.getElementById('shiftEndInput') || {}).value || '',
            activeStr: (document.getElementById('shiftActiveHoursInput') || {}).value || '',
            miles,
            grossTotal,
            taxSetAside: grossTotal * 0.30,
            basePay, tips, cashTips, miscAmount
        };
    })();

    const gasOn = currentEosMode === 'gas' || !!(document.getElementById('eosToggleGas') || {}).checked;
    const expOn = !!(document.getElementById('eosToggleExpense') || {}).checked;
    const ratOn = !!(document.getElementById('eosToggleRatings') || {}).checked;

    const gasSum = getGasRowsSummaryFromDom();
    const expSum = getExpenseRowsSummaryFromDom();
    const activeGasCost = gasOn ? gasSum.totalCost : 0;
    const netKeep = info.grossTotal - info.taxSetAside - activeGasCost;

    const fGas = document.getElementById('eosFooterGas');
    const fNet = document.getElementById('eosFooterNet');
    if (fGas) fGas.textContent = activeGasCost > 0 ? `-$${activeGasCost.toFixed(2)}` : '$0.00';
    if (fNet) fNet.textContent = `$${netKeep.toFixed(2)}`;

    // Chips
    const deliv = (document.getElementById('shiftDeliveriesInput') || {}).value;
    const timeParts = [];
    const dTxt = fmtShortChipDate(info.startVal);
    const sTxt = fmtShortChipTime(info.startVal);
    const eTxt = fmtShortChipTime(info.endVal);
    if (dTxt) timeParts.push(dTxt);
    if (sTxt && eTxt) timeParts.push(`${sTxt} – ${eTxt}`);
    if (info.activeStr) timeParts.push(`${info.activeStr} active`);
    if (info.miles > 0) timeParts.push(`${info.miles} mi`);
    if (deliv !== '' && deliv !== undefined) timeParts.push(`${deliv} orders`);

    const setChip = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setChip('eosChipTime', timeParts.join(' • ') || 'Required');
    setChip('eosChipEarn', (info.basePay > 0 || info.tips > 0 || info.cashTips > 0)
        ? `Base $${info.basePay.toFixed(2)} • Tips $${info.tips.toFixed(2)} • Cash $${info.cashTips.toFixed(2)}`
        : 'Required');

    const miscRows = document.querySelectorAll('#miscPayRowsContainer .misc-pay-row');
    let miscFilled = 0;
    miscRows.forEach(r => {
        const a = parseFloat((r.querySelector('.misc-amount-input') || {}).value) || 0;
        const n = ((r.querySelector('.misc-note-input') || {}).value || '').trim();
        if (a > 0 || n) miscFilled++;
    });
    setChip('eosChipMisc', miscFilled > 0 ? `${miscFilled} item${miscFilled === 1 ? '' : 's'} • +$${info.miscAmount.toFixed(2)}` : 'None — $0.00');
    setChip('eosChipGas', gasOn ? `${gasSum.validCount || gasSum.rowCount} fill-up(s) • $${gasSum.totalCost.toFixed(2)}` : 'Optional — off');
    setChip('eosChipExpense', expOn ? `${expSum.validCount || expSum.rowCount} item(s) • $${expSum.totalCost.toFixed(2)}` : 'Optional — off');
    setChip('eosChipRatings', ratOn ? 'Included' : 'Optional — off');

    // Rail step completion indicators
    const setDone = (sec, done) => {
        const b = document.querySelector(`.eos-rail-step[data-target="${sec}"]`);
        if (b) b.classList.toggle('done', !!done);
    };
    const timeDone = !!(info.startVal && info.endVal && info.activeStr && (document.getElementById('shiftMilesInput') || {}).value !== '' && deliv !== '');
    const earnDone = ((document.getElementById('shiftBasePayInput') || {}).value !== '' && (document.getElementById('shiftTipsInput') || {}).value !== '');
    setDone('time', timeDone);
    setDone('earn', earnDone);
    setDone('misc', miscFilled > 0);
    setDone('gas', gasOn && gasSum.validCount > 0);
    setDone('expense', expOn && expSum.validCount > 0);
    setDone('ratings', ratOn);
}

/* --- Multi-Row Bulk Gas Entry Builders & Calculators --- */
function setActiveGasRow(inputEl) {
    activeGasStationInputEl = inputEl;
}

function setGasStation(name) {
    if (activeGasStationInputEl && document.body.contains(activeGasStationInputEl)) {
        activeGasStationInputEl.value = name;
        recalcGasPreview();
        return;
    }
    const allStationInputs = document.querySelectorAll('#gasRowsContainer .gas-station-input');
    for (let i = 0; i < allStationInputs.length; i++) {
        if (!allStationInputs[i].value.trim()) {
            allStationInputs[i].value = name;
            recalcGasPreview();
            return;
        }
    }
    if (allStationInputs.length > 0) {
        allStationInputs[allStationInputs.length - 1].value = name;
        recalcGasPreview();
    }
}

function addGasEntryRow() {
    const container = document.getElementById('gasRowsContainer');
    if (!container) return;
    const idx = container.children.length;
    const { localDate } = getCurrentLocalDateAndIso();
    // Inherit date from previous row if available
    const prevDateInputs = container.querySelectorAll('.gas-date-input');
    const defaultDate = (prevDateInputs.length > 0 && prevDateInputs[prevDateInputs.length - 1].value)
        ? prevDateInputs[prevDateInputs.length - 1].value
        : localDate;

    const row = document.createElement('div');
    row.className = 'bulk-entry-row gas-entry-row';
    row.setAttribute('data-row-idx', idx);
    row.innerHTML = `
        <div class="hq-field-group">
            <label>Fill-Up Date</label>
            <input type="date" class="hq-input gas-date-input" value="${defaultDate}" required oninput="recalcGasPreview()">
        </div>
        <div class="hq-field-group">
            <label>Station / Where</label>
            <input type="text" class="hq-input gas-station-input" placeholder="e.g. Costco, Astro 239" required onfocus="setActiveGasRow(this)">
        </div>
        <div class="hq-field-group">
            <label>Price / Gal ($)</label>
            <input type="number" step="0.001" min="0" class="hq-input gas-price-input" placeholder="e.g. 4.50" required oninput="recalcGasRow(this, 'price')">
        </div>
        <div class="hq-field-group">
            <label>Gallons (#)</label>
            <input type="number" step="0.001" min="0" class="hq-input gas-gallons-input" placeholder="e.g. 13.672" required oninput="recalcGasRow(this, 'gallons')">
        </div>
        <div class="hq-field-group">
            <label>Total Cost ($)</label>
            <input type="number" step="0.01" min="0" class="hq-input gas-total-input" placeholder="Auto-calc" required oninput="recalcGasRow(this, 'total')">
        </div>
        <button type="button" class="remove-misc-row-btn" onclick="this.parentElement.remove(); recalcGasPreview();" title="Remove Gas Row">&times;</button>
    `;
    container.appendChild(row);
    recalcGasPreview();
}

function addBulkGasRows(count = 5) {
    for (let i = 0; i < count; i++) {
        addGasEntryRow();
    }
}

function recalcGasRow(inputEl, changedField) {
    const row = inputEl ? inputEl.closest('.gas-entry-row') : document.querySelector('#gasRowsContainer .gas-entry-row');
    if (row) {
        const priceEl = row.querySelector('.gas-price-input');
        const galsEl = row.querySelector('.gas-gallons-input');
        const totalEl = row.querySelector('.gas-total-input');
        if (priceEl && galsEl && totalEl) {
            const price = parseFloat(priceEl.value) || 0;
            const gals = parseFloat(galsEl.value) || 0;
            const total = parseFloat(totalEl.value) || 0;

            if ((changedField === 'price' || changedField === 'gallons') && price > 0 && gals > 0) {
                totalEl.value = (price * gals).toFixed(2);
            } else if (changedField === 'total' && total > 0 && price > 0 && gals === 0) {
                galsEl.value = (total / price).toFixed(3);
            }
        }
    }
    recalcGasPreview();
}

function recalcGasPreview(changedField) {
    // Support legacy single-row call if changedField passed directly
    if (changedField) {
        const firstRow = document.querySelector('#gasRowsContainer .gas-entry-row');
        if (firstRow) {
            const targetInput = firstRow.querySelector(`.gas-${changedField}-input`);
            if (targetInput) {
                recalcGasRow(targetInput, changedField);
                return;
            }
        }
    }

    const rows = document.querySelectorAll('#gasRowsContainer .gas-entry-row');
    let totalGallons = 0;
    let totalCost = 0;
    let validCount = 0;

    rows.forEach(r => {
        const g = parseFloat((r.querySelector('.gas-gallons-input') || {}).value) || 0;
        const t = parseFloat((r.querySelector('.gas-total-input') || {}).value) || 0;
        const s = ((r.querySelector('.gas-station-input') || {}).value || '').trim();
        totalGallons += g;
        totalCost += t;
        if (t > 0 || g > 0 || s) validCount++;
    });

    const displayCount = Math.max(rows.length, validCount);
    const countEl = document.getElementById('previewGasCount');
    const galsEl = document.getElementById('previewGasGallons');
    const costEl = document.getElementById('previewGasTotalCost');

    if (countEl) countEl.textContent = `${displayCount} Fill-Up${displayCount === 1 ? '' : 's'}`;
    if (galsEl) galsEl.textContent = `${totalGallons.toFixed(3)} gal`;
    if (costEl) costEl.textContent = `$${totalCost.toFixed(2)}`;
    if (!isRestoringEosDraft && (totalCost > 0 || totalGallons > 0)) {
        const gCb = document.getElementById('eosToggleGas');
        if (gCb && !gCb.checked) gCb.checked = true;
    }
    updateEosChipsAndFooter();
    if (!isRestoringEosDraft && currentEosMode === 'shift') {
        const ov = document.getElementById('addDataModalOverlay');
        if (ov && ov.style.display === 'flex') saveEosDraft(false);
    }
}

/* --- Multi-Row Bulk Expense Entry Builders & Calculators --- */
function addExpenseEntryRow() {
    const container = document.getElementById('expenseRowsContainer');
    if (!container) return;
    const idx = container.children.length;
    const { localDate } = getCurrentLocalDateAndIso();
    const prevDateInputs = container.querySelectorAll('.exp-date-input');
    const defaultDate = (prevDateInputs.length > 0 && prevDateInputs[prevDateInputs.length - 1].value)
        ? prevDateInputs[prevDateInputs.length - 1].value
        : localDate;

    const row = document.createElement('div');
    row.className = 'bulk-entry-row expense-entry-row';
    row.setAttribute('data-row-idx', idx);
    row.innerHTML = `
        <div class="hq-field-group">
            <label>Date</label>
            <input type="date" class="hq-input exp-date-input" value="${defaultDate}" required oninput="recalcExpensePreview()">
        </div>
        <div class="hq-field-group">
            <label>Category (Col B)</label>
            <select class="hq-select exp-category-input" required onchange="recalcExpensePreview()">
                <option value="Gear">🎒 Gear & Supplies</option>
                <option value="Vehicle Maintenance">🛞 Vehicle Maintenance</option>
            </select>
        </div>
        <div class="hq-field-group">
            <label>Item / Service Name</label>
            <input type="text" class="hq-input exp-name-input" placeholder="e.g. Insulated Bag or Oil Change" required oninput="recalcExpensePreview()">
        </div>
        <div class="hq-field-group">
            <label>Description / Notes</label>
            <input type="text" class="hq-input exp-desc-input" placeholder="e.g. Mobil 1 0W-20 & filter" oninput="recalcExpensePreview()">
        </div>
        <div class="hq-field-group">
            <label>Cost ($)</label>
            <input type="number" step="0.01" min="0" class="hq-input exp-cost-input" placeholder="e.g. 45.00" required oninput="recalcExpensePreview()">
        </div>
        <button type="button" class="remove-misc-row-btn" onclick="this.parentElement.remove(); recalcExpensePreview();" title="Remove Expense Row">&times;</button>
    `;
    container.appendChild(row);
    recalcExpensePreview();
}

function addBulkExpenseRows(count = 5) {
    for (let i = 0; i < count; i++) {
        addExpenseEntryRow();
    }
}

function recalcExpensePreview() {
    const rows = document.querySelectorAll('#expenseRowsContainer .expense-entry-row');
    let gearSub = 0;
    let maintSub = 0;

    let hasNamedItem = false;
    rows.forEach(r => {
        const cat = ((r.querySelector('.exp-category-input') || {}).value || 'Gear').trim();
        const cost = parseFloat((r.querySelector('.exp-cost-input') || {}).value) || 0;
        const nm = ((r.querySelector('.exp-name-input') || {}).value || '').trim();
        if (nm) hasNamedItem = true;
        if (cat.toLowerCase().includes('maint')) {
            maintSub += cost;
        } else {
            gearSub += cost;
        }
    });

    const combined = gearSub + maintSub;
    const count = rows.length;

    const gearEl = document.getElementById('previewExpGearTotal');
    const maintEl = document.getElementById('previewExpMaintTotal');
    const combEl = document.getElementById('previewExpCombinedTotal');

    if (gearEl) gearEl.textContent = `$${gearSub.toFixed(2)}`;
    if (maintEl) maintEl.textContent = `$${maintSub.toFixed(2)}`;
    if (combEl) combEl.textContent = `$${combined.toFixed(2)} (${count} Item${count === 1 ? '' : 's'})`;
    if (!isRestoringEosDraft && (hasNamedItem || combined > 0)) {
        const eCb = document.getElementById('eosToggleExpense');
        if (eCb && !eCb.checked) eCb.checked = true;
    }
    updateEosChipsAndFooter();
    if (!isRestoringEosDraft && currentEosMode === 'shift') {
        const ov = document.getElementById('addDataModalOverlay');
        if (ov && ov.style.display === 'flex') saveEosDraft(false);
    }
}

function prefillRatingsFormInputs() {
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el && v !== undefined) el.value = v;
    };
    setVal('ratLifetimeInput', latestRatingsState.lifetime);
    setVal('ratCustomerInput', latestRatingsState.customerRating);
    setVal('ratOverallInput', latestRatingsState.overallRating);
    setVal('rat5StarInput', latestRatingsState.stars5);
    setVal('rat4StarInput', latestRatingsState.stars4);
    setVal('rat3StarInput', latestRatingsState.stars3);
    setVal('rat2StarInput', latestRatingsState.stars2);
    setVal('rat1StarInput', latestRatingsState.stars1);
    setVal('compCommInput', latestRatingsState.communication);
    setVal('compHandlingInput', latestRatingsState.orderHandling);
    setVal('compInstrInput', latestRatingsState.instructions);
    setVal('compFriendlyInput', latestRatingsState.friendliness);
    setVal('compAboveInput', latestRatingsState.aboveBeyond);
}

/* --- 4. Unified End-of-Shift Draft, Validation & Bundle Submit (v6.0.0) --- */

function onEosFormInput(evt) {
    if (evt && evt.target && evt.target.classList) {
        evt.target.classList.remove('eos-invalid');
    } else {
        document.querySelectorAll('#eosForm .eos-invalid').forEach(el => {
            if (String(el.value || '').trim() !== '') el.classList.remove('eos-invalid');
        });
    }
    const banner = document.getElementById('eosValidationBanner');
    if (banner && banner.style.display !== 'none') banner.style.display = 'none';
    if (currentEosMode === 'shift') saveEosDraft(false);
}

function saveEosDraft(showToast = false) {
    if (currentEosMode !== 'shift') return;
    try {
        const g = id => (document.getElementById(id) || {}).value || '';
        const chk = id => !!(document.getElementById(id) || {}).checked;
        const miscRows = Array.from(document.querySelectorAll('#miscPayRowsContainer .misc-pay-row')).map(r => ({
            type: (r.querySelector('.misc-type-select') || {}).value || '',
            date: (r.querySelector('.misc-date-input') || {}).value || '',
            amount: (r.querySelector('.misc-amount-input') || {}).value || '0.00',
            note: (r.querySelector('.misc-note-input') || {}).value || ''
        }));
        const gasRows = Array.from(document.querySelectorAll('#gasRowsContainer .gas-entry-row')).map(r => ({
            date: (r.querySelector('.gas-date-input') || {}).value || '',
            station: (r.querySelector('.gas-station-input') || {}).value || '',
            price: (r.querySelector('.gas-price-input') || {}).value || '',
            gallons: (r.querySelector('.gas-gallons-input') || {}).value || '',
            total: (r.querySelector('.gas-total-input') || {}).value || ''
        }));
        const expRows = Array.from(document.querySelectorAll('#expenseRowsContainer .expense-entry-row')).map(r => ({
            date: (r.querySelector('.exp-date-input') || {}).value || '',
            category: (r.querySelector('.exp-category-input') || {}).value || 'Gear',
            name: (r.querySelector('.exp-name-input') || {}).value || '',
            desc: (r.querySelector('.exp-desc-input') || {}).value || '',
            cost: (r.querySelector('.exp-cost-input') || {}).value || ''
        }));
        const draft = {
            savedAt: Date.now(),
            shift: {
                start: g('shiftStartInput'), end: g('shiftEndInput'), activeHours: g('shiftActiveHoursInput'),
                miles: g('shiftMilesInput'), deliveries: g('shiftDeliveriesInput'), noTips: g('shiftNoTipsInput'),
                basePay: g('shiftBasePayInput'), tips: g('shiftTipsInput'), cashTips: g('shiftCashTipsInput')
            },
            miscRows,
            gasOn: chk('eosToggleGas'), gasRows,
            expOn: chk('eosToggleExpense'), expRows,
            ratOn: chk('eosToggleRatings'),
            ratings: {
                lifetime: g('ratLifetimeInput'), customerRating: g('ratCustomerInput'), overallRating: g('ratOverallInput'),
                stars5: g('rat5StarInput'), stars4: g('rat4StarInput'), stars3: g('rat3StarInput'), stars2: g('rat2StarInput'), stars1: g('rat1StarInput'),
                communication: g('compCommInput'), orderHandling: g('compHandlingInput'), instructions: g('compInstrInput'),
                friendliness: g('compFriendlyInput'), aboveBeyond: g('compAboveInput')
            }
        };
        localStorage.setItem(EOS_DRAFT_KEY, JSON.stringify(draft));
        const pill = document.getElementById('eosDraftPill');
        if (pill) pill.style.display = 'inline-flex';
        if (showToast) showHqToast('Draft saved locally.');
    } catch (e) {}
}

function restoreEosDraft() {
    isRestoringEosDraft = true;
    try {
        const raw = localStorage.getItem(EOS_DRAFT_KEY);
        if (!raw) {
            const pill = document.getElementById('eosDraftPill');
            if (pill) pill.style.display = 'none';
            return false;
        }
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object') return false;
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
        if (d.shift) {
            setVal('shiftStartInput', d.shift.start); setVal('shiftEndInput', d.shift.end);
            setVal('shiftActiveHoursInput', d.shift.activeHours); setVal('shiftMilesInput', d.shift.miles);
            setVal('shiftDeliveriesInput', d.shift.deliveries); setVal('shiftNoTipsInput', d.shift.noTips);
            setVal('shiftBasePayInput', d.shift.basePay); setVal('shiftTipsInput', d.shift.tips);
            setVal('shiftCashTipsInput', d.shift.cashTips);
        }
        if (Array.isArray(d.miscRows) && d.miscRows.length > 0) {
            const mc = document.getElementById('miscPayRowsContainer');
            if (mc) {
                mc.innerHTML = '';
                d.miscRows.forEach(m => addMiscPayRow(m.type || '', parseFloat(m.amount) || 0, m.note || '', m.date || ''));
            }
        }
        if (Array.isArray(d.gasRows) && d.gasRows.length > 0) {
            const gc = document.getElementById('gasRowsContainer');
            if (gc) {
                while (gc.children.length < d.gasRows.length) addGasEntryRow();
                const domRows = gc.querySelectorAll('.gas-entry-row');
                d.gasRows.forEach((g, i) => {
                    if (!domRows[i]) return;
                    domRows[i].querySelector('.gas-date-input').value = g.date || '';
                    domRows[i].querySelector('.gas-station-input').value = g.station || '';
                    domRows[i].querySelector('.gas-price-input').value = g.price || '';
                    domRows[i].querySelector('.gas-gallons-input').value = g.gallons || '';
                    domRows[i].querySelector('.gas-total-input').value = g.total || '';
                });
                recalcGasPreview();
            }
        }
        if (Array.isArray(d.expRows) && d.expRows.length > 0) {
            const ec = document.getElementById('expenseRowsContainer');
            if (ec) {
                while (ec.children.length < d.expRows.length) addExpenseEntryRow();
                const domRows = ec.querySelectorAll('.expense-entry-row');
                d.expRows.forEach((ex, i) => {
                    if (!domRows[i]) return;
                    domRows[i].querySelector('.exp-date-input').value = ex.date || '';
                    domRows[i].querySelector('.exp-category-input').value = ex.category || 'Gear';
                    domRows[i].querySelector('.exp-name-input').value = ex.name || '';
                    domRows[i].querySelector('.exp-desc-input').value = ex.desc || '';
                    domRows[i].querySelector('.exp-cost-input').value = ex.cost || '';
                });
                recalcExpensePreview();
            }
        }
        if (d.ratings && d.ratOn) {
            setVal('ratLifetimeInput', d.ratings.lifetime); setVal('ratCustomerInput', d.ratings.customerRating);
            setVal('ratOverallInput', d.ratings.overallRating); setVal('rat5StarInput', d.ratings.stars5);
            setVal('rat4StarInput', d.ratings.stars4); setVal('rat3StarInput', d.ratings.stars3);
            setVal('rat2StarInput', d.ratings.stars2); setVal('rat1StarInput', d.ratings.stars1);
            setVal('compCommInput', d.ratings.communication); setVal('compHandlingInput', d.ratings.orderHandling);
            setVal('compInstrInput', d.ratings.instructions); setVal('compFriendlyInput', d.ratings.friendliness);
            setVal('compAboveInput', d.ratings.aboveBeyond);
        }
        onEosToggleSection('gas', !!d.gasOn);
        onEosToggleSection('expense', !!d.expOn);
        onEosToggleSection('ratings', !!d.ratOn);
        const pill = document.getElementById('eosDraftPill');
        if (pill) pill.style.display = 'inline-flex';
        recalcShiftPreview();
        return true;
    } catch (e) { return false; }
    finally { isRestoringEosDraft = false; }
}

function clearEosDraft() {
    try { localStorage.removeItem(EOS_DRAFT_KEY); } catch (e) {}
    const pill = document.getElementById('eosDraftPill');
    if (pill) pill.style.display = 'none';
}

function resetEndOfShiftAll(clearDraft = true) {
    clearEosValidation();
    resetShiftFormClean();
    resetGasFormClean();
    resetExpenseFormClean();
    if (currentEosMode !== 'gas') {
        onEosToggleSection('gas', false);
        onEosToggleSection('expense', false);
        onEosToggleSection('ratings', false);
    }
    if (clearDraft) clearEosDraft();
    recalcShiftPreview();
}

function clearEosValidation() {
    document.querySelectorAll('#eosForm .eos-invalid').forEach(el => el.classList.remove('eos-invalid'));
    const banner = document.getElementById('eosValidationBanner');
    if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
}

function validateEosForm() {
    clearEosValidation();
    const errors = [];
    let firstInvalidSec = null;
    const markInvalid = (el, msg, sec) => {
        if (el) el.classList.add('eos-invalid');
        errors.push(msg);
        if (!firstInvalidSec) firstInvalidSec = sec;
    };

    if (currentEosMode === 'shift' || currentEosMode === 'edit') {
        const reqShift = [
            ['shiftStartInput', 'Start Date & Time', 'time'],
            ['shiftEndInput', 'End Date & Time', 'time'],
            ['shiftActiveHoursInput', 'Active Hours', 'time'],
            ['shiftMilesInput', 'Miles Driven', 'time'],
            ['shiftDeliveriesInput', 'Deliveries', 'time'],
            ['shiftBasePayInput', 'Base Pay', 'earn'],
            ['shiftTipsInput', 'In-App Tips', 'earn']
        ];
        reqShift.forEach(([id, label, sec]) => {
            const el = document.getElementById(id);
            if (!el || String(el.value || '').trim() === '') markInvalid(el, `${label} is required`, sec);
        });
        const sEl = document.getElementById('shiftStartInput');
        const eEl = document.getElementById('shiftEndInput');
        if (sEl && eEl && sEl.value && eEl.value && new Date(eEl.value) <= new Date(sEl.value)) {
            markInvalid(eEl, 'End time must be after Start time', 'time');
        }
    }

    const gasActive = currentEosMode === 'gas' || !!(document.getElementById('eosToggleGas') || {}).checked;
    if (gasActive) {
        const gRows = Array.from(document.querySelectorAll('#gasRowsContainer .gas-entry-row'));
        let hasValidGas = false;
        gRows.forEach(r => {
            const st = r.querySelector('.gas-station-input');
            const tot = r.querySelector('.gas-total-input');
            const gal = r.querySelector('.gas-gallons-input');
            const stVal = ((st || {}).value || '').trim();
            const totVal = parseFloat((tot || {}).value) || 0;
            const galVal = parseFloat((gal || {}).value) || 0;
            if (stVal && (totVal > 0 || galVal > 0)) {
                hasValidGas = true;
            } else if (stVal || totVal > 0 || galVal > 0) {
                if (!stVal) markInvalid(st, 'Gas station name is required', 'gas');
                if (!(totVal > 0 || galVal > 0)) markInvalid(tot, 'Gas total or gallons is required', 'gas');
            }
        });
        if (!hasValidGas && gRows.length > 0) {
            const r0 = gRows[0];
            if (errors.every(m => !m.includes('Gas'))) {
                markInvalid(r0.querySelector('.gas-station-input'), 'Enter at least one Gas station and cost', 'gas');
            }
        }
    }

    const expActive = currentEosMode === 'shift' && !!(document.getElementById('eosToggleExpense') || {}).checked;
    if (expActive) {
        const eRows = Array.from(document.querySelectorAll('#expenseRowsContainer .expense-entry-row'));
        let hasValidExp = false;
        eRows.forEach(r => {
            const nm = r.querySelector('.exp-name-input');
            const cs = r.querySelector('.exp-cost-input');
            const nmVal = ((nm || {}).value || '').trim();
            const csRaw = String((cs || {}).value || '').trim();
            if (nmVal && csRaw !== '' && parseFloat(csRaw) >= 0) {
                hasValidExp = true;
            } else if (nmVal || csRaw !== '') {
                if (!nmVal) markInvalid(nm, 'Expense item name is required', 'expense');
                if (csRaw === '' || parseFloat(csRaw) < 0) markInvalid(cs, 'Valid expense cost is required', 'expense');
            }
        });
        if (!hasValidExp && eRows.length > 0 && errors.every(m => !m.includes('Expense'))) {
            markInvalid(eRows[0].querySelector('.exp-name-input'), 'Enter at least one Expense item and cost', 'expense');
        }
    }

    if (errors.length > 0) {
        if (firstInvalidSec) eosJumpTo(firstInvalidSec);
        const banner = document.getElementById('eosValidationBanner');
        if (banner) {
            banner.textContent = `⚠️ Please fix: ${errors.slice(0, 3).join(' • ')}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}`;
            banner.style.display = 'block';
        }
        return { valid: false, errors };
    }
    return { valid: true, errors: [] };
}

function collectGasEntriesFromDom() {
    return Array.from(document.querySelectorAll('#gasRowsContainer .gas-entry-row')).map(r => ({
        date: (r.querySelector('.gas-date-input') || {}).value || '',
        station: ((r.querySelector('.gas-station-input') || {}).value || '').trim(),
        price: (r.querySelector('.gas-price-input') || {}).value || '0',
        gallons: (r.querySelector('.gas-gallons-input') || {}).value || '0',
        total: (r.querySelector('.gas-total-input') || {}).value || '0'
    })).filter(e => e.station && (parseFloat(e.total) > 0 || parseFloat(e.gallons) > 0));
}

function collectExpenseEntriesFromDom() {
    return Array.from(document.querySelectorAll('#expenseRowsContainer .expense-entry-row')).map(r => ({
        date: (r.querySelector('.exp-date-input') || {}).value || '',
        category: (r.querySelector('.exp-category-input') || {}).value || 'Gear',
        name: ((r.querySelector('.exp-name-input') || {}).value || '').trim(),
        desc: ((r.querySelector('.exp-desc-input') || {}).value || '').trim(),
        cost: (r.querySelector('.exp-cost-input') || {}).value || '0'
    })).filter(e => e.name && parseFloat(e.cost) >= 0);
}

function syncVaultToLocalAndFirebase() {
    try {
        localStorage.setItem(VAULT_CACHE_KEY, JSON.stringify(liveVaultData));
        fetch(`${FIREBASE_DB_URL}/vault.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...liveVaultData, lastSynced: Date.now() })
        }).catch(() => {});
    } catch (e) {}
}

async function submitEndOfShift(event) {
    if (event) event.preventDefault();
    if (!currentAdminUser || !currentAdminUser.email) {
        showHqToast('Please unlock Admin Access with your Google Account to save.', true);
        return openAdminAuthModal();
    }

    const v = validateEosForm();
    if (!v.valid) return;

    const btn = document.getElementById('submitShiftBtn');
    const prevLabel = btn ? btn.textContent : '🚀 Save Everything';
    if (btn) {
        btn.disabled = true;
        btn.textContent = currentEosMode === 'edit' ? '⏳ Saving Changes...' : '⏳ Saving Everything...';
    }

    try {
        const calc = recalcShiftPreview();
        const { miscAmount, miscCategory, miscNote } = collectMiscPaySummary();

        if (currentEosMode === 'edit') {
            const shiftId = document.getElementById('editShiftIdInput').value;
            const year = document.getElementById('editShiftYearInput').value || String(calc.year);
            const month = document.getElementById('editShiftMonthInput').value || calc.month;
            const oldStart = document.getElementById('editShiftOldStartInput').value;

            const params = new URLSearchParams({
                action: 'editShift',
                adminEmail: currentAdminUser.email,
                id: shiftId,
                oldStart: oldStart,
                year: String(year),
                month: month,
                start: document.getElementById('shiftStartInput').value.replace('T', ' '),
                end: document.getElementById('shiftEndInput').value.replace('T', ' '),
                hours: calc.hours,
                activeHours: document.getElementById('shiftActiveHoursInput').value,
                miles: document.getElementById('shiftMilesInput').value,
                deliveries: document.getElementById('shiftDeliveriesInput').value,
                noTips: document.getElementById('shiftNoTipsInput').value || '0',
                basePay: document.getElementById('shiftBasePayInput').value,
                tips: document.getElementById('shiftTipsInput').value,
                cashTips: document.getElementById('shiftCashTipsInput').value || '0',
                miscAmount: String(miscAmount),
                miscCategory: miscCategory,
                miscNote: miscNote
            });

            const res = await fetch(`${API_BASE_URL}?${params.toString()}`);
            const json = await res.json();
            if (json && json.success && json.shift) {
                const updated = json.shift;
                const allShifts = Array.isArray(liveVaultData.shifts) ? liveVaultData.shifts : [];
                const idx = allShifts.findIndex(s =>
                    (shiftId && s.id && String(s.id).trim() === String(shiftId).trim()) ||
                    (oldStart && s.start && String(s.start).trim() === String(oldStart).trim())
                );
                if (idx !== -1) allShifts[idx] = { ...allShifts[idx], ...updated };
                else allShifts.push(updated);

                if (json.updatedLifetime) {
                    if (!liveVaultData.ratings) liveVaultData.ratings = {};
                    liveVaultData.ratings.lifetime = Number(json.updatedLifetime);
                    latestRatingsState.lifetime = Number(json.updatedLifetime);
                }
                syncVaultToLocalAndFirebase();
                if (cachedRawCsvData) processData(cachedRawCsvData);
                renderRecentShiftsSnapshot();
                if (updated.month) {
                    expandedMonths[updated.month] = true;
                    renderMonthDrilldown(updated.month);
                }
                const reimbMsg = miscAmount > 0 ? ` (Reimbursements: $${miscAmount.toFixed(2)})` : '';
                showHqToast(`Shift updated successfully!${reimbMsg}`);
                closeAddDataModal();
            } else {
                showHqToast((json && json.error) || 'Failed to update shift.', true);
            }
            return;
        }

        // NEW END-OF-SHIFT OR GAS-ONLY BUNDLE
        const bundle = {};
        if (currentEosMode === 'shift') {
            bundle.shift = {
                year: String(calc.year),
                month: calc.month,
                start: document.getElementById('shiftStartInput').value,
                end: document.getElementById('shiftEndInput').value,
                hours: calc.hours,
                activeHours: document.getElementById('shiftActiveHoursInput').value,
                miles: document.getElementById('shiftMilesInput').value,
                deliveries: document.getElementById('shiftDeliveriesInput').value,
                noTips: document.getElementById('shiftNoTipsInput').value || '0',
                basePay: document.getElementById('shiftBasePayInput').value,
                tips: document.getElementById('shiftTipsInput').value,
                cashTips: document.getElementById('shiftCashTipsInput').value || '0',
                miscAmount: String(miscAmount),
                miscCategory: miscCategory,
                miscNote: miscNote
            };
        }
        if (currentEosMode === 'gas' || (document.getElementById('eosToggleGas') || {}).checked) {
            const gEntries = collectGasEntriesFromDom();
            if (gEntries.length > 0) bundle.gas = gEntries;
        }
        if (currentEosMode === 'shift' && (document.getElementById('eosToggleExpense') || {}).checked) {
            const eEntries = collectExpenseEntriesFromDom();
            if (eEntries.length > 0) bundle.expenses = eEntries;
        }
        let ratingsPayload = null;
        if (currentEosMode === 'shift' && (document.getElementById('eosToggleRatings') || {}).checked) {
            ratingsPayload = {
                lifetime: document.getElementById('ratLifetimeInput').value,
                customerRating: document.getElementById('ratCustomerInput').value,
                overallRating: document.getElementById('ratOverallInput').value,
                stars5: document.getElementById('rat5StarInput').value,
                stars4: document.getElementById('rat4StarInput').value,
                stars3: document.getElementById('rat3StarInput').value,
                stars2: document.getElementById('rat2StarInput').value,
                stars1: document.getElementById('rat1StarInput').value,
                communication: document.getElementById('compCommInput').value,
                orderHandling: document.getElementById('compHandlingInput').value,
                instructions: document.getElementById('compInstrInput').value,
                friendliness: document.getElementById('compFriendlyInput').value,
                aboveBeyond: document.getElementById('compAboveInput').value
            };
            bundle.ratings = ratingsPayload;
        }

        const params = new URLSearchParams({
            action: 'saveShiftBundle',
            adminEmail: currentAdminUser.email,
            bundleJson: JSON.stringify(bundle)
        });
        const res = await fetch(`${API_BASE_URL}?${params.toString()}`);
        const json = await res.json();

        const summaryParts = [];
        const failedParts = [];

        if (json && json.shift && json.shift.success && json.shift.shift) {
            const sObj = json.shift.shift;
            liveVaultData.shifts.push(sObj);
            if (!liveVaultData.years.includes(sObj.year)) liveVaultData.years.push(sObj.year);
            expandedMonths[sObj.month] = true;
            if (json.shift.updatedLifetime) {
                if (!liveVaultData.ratings) liveVaultData.ratings = {};
                liveVaultData.ratings.lifetime = Number(json.shift.updatedLifetime);
                latestRatingsState.lifetime = Number(json.shift.updatedLifetime);
            } else if (Number(sObj.deliveries) > 0) {
                const newLife = (latestRatingsState.lifetime || 1318) + Number(sObj.deliveries);
                if (!liveVaultData.ratings) liveVaultData.ratings = {};
                liveVaultData.ratings.lifetime = newLife;
                latestRatingsState.lifetime = newLife;
            }
            summaryParts.push(`Shift $${Number(sObj.total).toFixed(2)}`);
        } else if (bundle.shift) {
            failedParts.push('Shift');
        }

        if (json && json.gas && json.gas.success && Array.isArray(json.gas.gasItems)) {
            json.gas.gasItems.forEach(g => {
                liveVaultData.gas.push(g);
                if (!liveVaultData.years.includes(g.year)) liveVaultData.years.push(g.year);
                expandedMonths[g.month] = true;
            });
            summaryParts.push(`${json.gas.gasItems.length} Gas`);
        } else if (bundle.gas) {
            failedParts.push('Gas');
        }

        if (json && json.expenses && json.expenses.success && Array.isArray(json.expenses.items)) {
            if (!Array.isArray(liveExpensesData)) liveExpensesData = [];
            json.expenses.items.forEach(it => liveExpensesData.push(it));
            liveVaultData.expenses = liveExpensesData;
            try { localStorage.setItem('dasher_live_expenses_cache', JSON.stringify(liveExpensesData)); } catch (e) {}
            renderItemizedLedger(cachedSummaryEarnings || 0, cachedSummaryGas || 0);
            summaryParts.push(`${json.expenses.items.length} Expense(s)`);
        } else if (bundle.expenses) {
            failedParts.push('Expenses');
        }

        if (json && json.ratings && json.ratings.success && ratingsPayload) {
            renderRatings(
                ['LifeTime Deliveries', 'Customer Rating', 'Overall Dasher Rating', '5 stars', '4 stars', '3 stars', '2 stars', '1 star'],
                [ratingsPayload.lifetime, ratingsPayload.customerRating, ratingsPayload.overallRating, ratingsPayload.stars5, ratingsPayload.stars4, ratingsPayload.stars3, ratingsPayload.stars2, ratingsPayload.stars1]
            );
            renderFeedback(
                ['Communication', 'order handling', 'followed delivery instuctions', 'Friendliness', 'Above & Beyond'],
                [ratingsPayload.communication, ratingsPayload.orderHandling, ratingsPayload.instructions, ratingsPayload.friendliness, ratingsPayload.aboveBeyond]
            );
            summaryParts.push('Ratings');
        } else if (bundle.ratings) {
            failedParts.push('Ratings');
        }

        if (summaryParts.length > 0) {
            syncVaultToLocalAndFirebase();
            renderVaultYearSelectorPills();
            if (currentVaultYear !== 'all' && bundle.shift && Number(currentVaultYear) === Number(bundle.shift.year) && Number(bundle.shift.year) !== 2026) {
                renderVaultYearFromRecords(Number(bundle.shift.year));
            } else if (cachedRawCsvData) {
                processData(cachedRawCsvData);
            }
            renderRecentShiftsSnapshot();
        }

        if (json && json.success && failedParts.length === 0) {
            showHqToast(`Saved ${summaryParts.join(' + ')} to Vault!`);
            resetEndOfShiftAll(true);
            closeAddDataModal();
        } else {
            const errTxt = (json && json.error) || `Partial or failed save (${failedParts.join(', ')})`;
            showHqToast(errTxt, true);
        }
    } catch (err) {
        console.error('Error saving End-of-Shift bundle:', err);
        showHqToast('Network error while saving.', true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = prevLabel;
        }
    }
}

/* ==========================================================================
   UNIFIED EDIT SHIFT ENTRYPOINT (v6.0.0) — reuses #addDataModalOverlay
   ========================================================================== */

function parseToIsoDateTimeLocal(str) {
    if (!str) return '';
    const clean = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(clean)) return clean.slice(0, 16);
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(clean)) return clean.replace(' ', 'T').slice(0, 16);
    const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?/i);
    if (mdy) {
        const month = mdy[1].padStart(2, '0');
        const day = mdy[2].padStart(2, '0');
        const year = mdy[3];
        let hours = parseInt(mdy[4] || '0', 10);
        const minutes = (mdy[5] || '00').padStart(2, '0');
        const ampm = mdy[7] ? mdy[7].toUpperCase() : null;
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${minutes}`;
    }
    const d = new Date(clean.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return '';
}

function collectEditMiscPaySummary() {
    const s = collectMiscRowsSummary('#miscPayRowsContainer', 'Reimbursement');
    if (!s.miscCategory && s.miscAmount > 0) s.miscCategory = 'Reimbursement';
    return s;
}

function closeEditShiftModal() {
    closeAddDataModal();
}

function openEditShiftModal(shiftId, startStr) {
    const allShifts = Array.isArray(liveVaultData.shifts) ? liveVaultData.shifts : [];
    const shift = allShifts.find(s => {
        if (shiftId && s.id && String(s.id).trim() === String(shiftId).trim()) return true;
        if (startStr && s.start && String(s.start).trim() === String(startStr).trim()) return true;
        return false;
    });

    if (!shift) {
        showHqToast('Shift details could not be found in Vault cache.', true);
        return;
    }

    clearEosValidation();
    setEosMode('edit');

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('editShiftIdInput', shift.id || '');
    setVal('editShiftYearInput', shift.year || 2026);
    setVal('editShiftMonthInput', shift.month || '');
    setVal('editShiftOldStartInput', shift.start || '');

    setVal('shiftStartInput', parseToIsoDateTimeLocal(shift.start));
    setVal('shiftEndInput', parseToIsoDateTimeLocal(shift.end));
    setVal('shiftActiveHoursInput', shift.activeHours || shift.hours || '0:00');
    setVal('shiftMilesInput', shift.miles !== undefined ? Number(shift.miles) : '');
    setVal('shiftDeliveriesInput', shift.deliveries !== undefined ? Number(shift.deliveries) : '');
    setVal('shiftNoTipsInput', shift.noTips !== undefined ? Number(shift.noTips) : 0);

    setVal('shiftBasePayInput', shift.basePay !== undefined ? Number(shift.basePay).toFixed(2) : '');
    setVal('shiftTipsInput', shift.tips !== undefined ? Number(shift.tips).toFixed(2) : '');
    setVal('shiftCashTipsInput', shift.cashTips !== undefined ? Number(shift.cashTips).toFixed(2) : '0.00');

    const container = document.getElementById('miscPayRowsContainer');
    if (container) {
        container.innerHTML = '';
        const parsedRows = parseMiscNoteToRows(shift.miscNote, shift.miscCategory, shift.miscAmount);
        if (parsedRows.length > 0) {
            parsedRows.forEach(p => addMiscPayRow(p.cat || '💵 Reimbursement', p.amount || 0, p.note, displayDateToIso(p.date)));
        } else {
            addMiscPayRow('💵 Reimbursement', 0, '', '');
        }
    }

    const badge = document.getElementById('eosModeBadge');
    if (badge) badge.textContent = shift.id ? `ID: ${shift.id}` : `Date: ${shift.start || ''}`;

    eosJumpTo('time');
    recalcShiftPreview();

    const overlay = document.getElementById('addDataModalOverlay');
    if (overlay) overlay.style.display = 'flex';
}
