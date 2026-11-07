/* ==========================================================================
   DASHER TRACKER HQ — MULTI-YEAR VAULT & COMMAND ENGINE (v4.2.0)
   ========================================================================== */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoAqn4EkIAKojVQfFSHV5X09dbVGDnAGtogqspyJYimWfsLr6XjQr_wDp3P8E7sOfjPNLsyor4ugdR/pub?gid=1708220782&single=true&output=csv';
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycby-OPzWiYMwIObo-tVhbOXJ95r47ohn_aZUn-7AZz54dueFQqJY6ZTHtJaAcrExZ2g/exec';
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
                expenses: Array.isArray(fbJson.expenses) ? fbJson.expenses : []
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
                expenses: Array.isArray(json.expenses) ? json.expenses : []
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
            
            // 4. Monthly Rows
            const validMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            if (validMonths.includes(col0.toLowerCase())) {
                const rawHours = (row[1] || '0').replace(/^"|"$/g, '').trim();
                const hoursNum = parseHoursToNumber(rawHours);
                
                const rawMiles = (row[3] || '0').replace(/^"|"$/g, '').replace(/,/g, '').trim();
                const milesNum = parseFloat(rawMiles) || 0;
                
                const deliveries = parseInt((row[4] || '0').replace(/[^0-9]/g, "")) || 0;
                
                const basePayStr = (row[5] || '$0').replace(/^"|"$/g, '').trim();
                const basePayNum = parseFloat(basePayStr.replace(/[^0-9.-]+/g, "")) || 0;
                
                const tipsStr = (row[6] || '$0').replace(/^"|"$/g, '').trim();
                const tipsNum = parseFloat(tipsStr.replace(/[^0-9.-]+/g, "")) || 0;
                
                const cashTipsStr = (row[7] || '$0').replace(/^"|"$/g, '').trim();
                const cashTipsNum = parseFloat(cashTipsStr.replace(/[^0-9.-]+/g, "")) || 0;
                
                const taxesStr = (row[8] || '$0').replace(/^"|"$/g, '').trim();
                const taxesNum = parseFloat(taxesStr.replace(/[^0-9.-]+/g, "")) || 0;

                const totalPayStr = (row[9] || '$0').replace(/^"|"$/g, '').trim();
                const totalPayNum = parseFloat(totalPayStr.replace(/[^0-9.-]+/g, "")) || 0;
                
                const hourlyRateStr = (row[10] || '$0.00').replace(/^"|"$/g, '').trim();
                const hourlyRateNum = parseFloat(hourlyRateStr.replace(/[^0-9.-]+/g, "")) || 0;
                
                const gasStr = (row[13] || '$0.00').replace(/^"|"$/g, '').trim();
                const gasNum = parseFloat(gasStr.replace(/[^0-9.-]+/g, "")) || 0;
                
                const noTipCount = parseInt((row[11] || '0').replace(/[^0-9]/g, '')) || 0;
                const tippedCount = Math.max(0, deliveries - noTipCount);
                
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
                
                if (totalPayNum > 0 || deliveries > 0) {
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
                    activeHours: (row[2] || '0').replace(/^"|"$/g, '').trim(),
                    miles: (row[3] || '0').replace(/^"|"$/g, '').trim(),
                    deliveries,
                    basePay: basePayStr,
                    tips: tipsStr,
                    cashTips: cashTipsStr,
                    taxes: taxesStr,
                    gas: gasStr,
                    totalPay: totalPayStr,
                    hourlyRate: hourlyRateStr,
                    noTipping: (row[11] || '0').replace(/^"|"$/g, '').trim(),
                    pctNoTipping: (row[12] || '0.00%').replace(/^"|"$/g, '').trim(),
                    totalPayNum,
                    gasNum,
                    hourlyRateNum,
                    milesNum,
                    noTipCount,
                    tippedCount
                });
            }
        }

        // Parse total row overrides if available for total miles, hours, and no tipping
        if (totalRow) {
            const rowMiles = (totalRow[3] || '').replace(/[^0-9.]/g, '');
            if (rowMiles) totalMiles = parseFloat(rowMiles) || totalMiles;
            
            const rowHours = totalRow[1] || '';
            if (rowHours) totalDashHoursNum = parseHoursToNumber(rowHours) || totalDashHoursNum;

            const rowNoTip = (totalRow[11] || '').replace(/[^0-9]/g, '');
            if (rowNoTip) totalNoTipping = parseInt(rowNoTip) || totalNoTipping;
        }

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
        renderExecutiveBento(totalEarnings, totalGas, totalDashHoursNum, totalMiles);
        renderTippingIntelligence(totalDeliveries, totalNoTipping, totalTips + totalCashTips, totalEarnings);
        renderDeductionsIntelligence(totalMiles, totalGas, totalDeliveries);
        renderItemizedLedger(totalEarnings, totalGas);
        renderSecondaryKpis(totalEarnings, totalBasePay, totalTips + totalCashTips, totalGas);
        renderChart(currentChartType);
        renderRatings(ratingsHeaders, ratingsValues);
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
    animateValue('cardValTippedOrders', totalTippedCount, false);
    animateValue('cardValNoTipOrders', totalNoTipCount, false);

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
function renderRatings(headers, values) {
    const custRatingEl = document.getElementById('valCustomerRating');
    const overallRatingEl = document.getElementById('valOverallRating');
    const lifetimeEl = document.getElementById('valLifetimeDeliveries');
    const starContainer = document.getElementById('starBreakdownRows');
    
    if (!headers || !values) return;
    
    const map = {};
    for (let i = 0; i < headers.length; i++) {
        if (headers[i]) {
            map[headers[i].toLowerCase().trim()] = (values[i] || '0').trim();
        }
    }
    
    const lifetime = map['lifetime deliveries'] || map['lifetime'] || '1,114';
    const customerRating = map['customer rating'] || '5.0';
    const overallRating = map['overall dasher rating'] || '100';
    
    if (custRatingEl) custRatingEl.textContent = `★ ${customerRating}`;
    if (overallRatingEl) overallRatingEl.textContent = `${overallRating}%`;
    if (lifetimeEl) lifetimeEl.textContent = lifetime;

    const fiveStars = parseInt(map['5 stars'] || '0') || 100;
    const fourStars = parseInt(map['4 stars'] || '0') || 0;
    const threeStars = parseInt(map['3 stars'] || '0') || 0;
    const twoStars = parseInt(map['2 stars'] || '0') || 0;
    const oneStar = parseInt(map["1 star's"] || map['1 star'] || '0') || 0;

    latestRatingsState.lifetime = parseInt(String(lifetime).replace(/[^0-9]/g, '')) || 1114;
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
    
    let html = '';
    for (let i = 0; i < headers.length; i++) {
        const rawTitle = (headers[i] || '').trim();
        const val = (values[i] || '0').trim();
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

function toggleMonthDrilldown(monthName) {
    const key = String(monthName || '').trim();
    expandedMonths[key] = !expandedMonths[key];
    const rowEl = document.querySelector(`tr.month-clickable-row[data-month="${key}"]`);
    const drawerEl = document.getElementById(`drilldown-${key}`);
    if (rowEl && drawerEl) {
        if (expandedMonths[key]) {
            rowEl.classList.add('expanded');
            drawerEl.style.display = 'table-row';
        } else {
            rowEl.classList.remove('expanded');
            drawerEl.style.display = 'none';
        }
    }
}

function buildDrilldownDrawerHtml(monthName) {
    const { shifts, gas } = getVaultRecordsForMonth(monthName);

    let shiftsHtml = '';
    if (shifts.length === 0) {
        shiftsHtml = `<div style="padding:0.75rem; color:#64748b; font-size:0.8rem;">No individual shifts logged in Vault for ${escapeHtml(monthName)} yet. Use <strong>+ Log Shift / Add Data</strong> to add one!</div>`;
    } else {
        shiftsHtml = `
            <div class="drilldown-mini-table-wrap">
                <table class="drilldown-mini-table">
                    <thead>
                        <tr>
                            <th>Start</th>
                            <th>End</th>
                            <th>Hrs</th>
                            <th>Active</th>
                            <th>Miles</th>
                            <th>Deliv</th>
                            <th>Base</th>
                            <th>Tips</th>
                            <th>Misc / Bonus</th>
                            <th>Total</th>
                            <th>Rate</th>
                            <th>Misc Reason / Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shifts.map(s => {
                            const miscBadge = s.miscCategory ? `<span class="misc-pill-badge">${escapeHtml(s.miscCategory)}</span>` : '';
                            const noteText = s.miscNote ? escapeHtml(s.miscNote) : (s.miscAmount > 0 ? 'Bonus / Extra Pay' : '—');
                            return `
                                <tr>
                                    <td>${escapeHtml(s.start)}</td>
                                    <td>${escapeHtml(s.end)}</td>
                                    <td>${escapeHtml(s.hours)}</td>
                                    <td>${escapeHtml(s.activeHours)}</td>
                                    <td>${Number(s.miles || 0).toFixed(1)}</td>
                                    <td>${s.deliveries}</td>
                                    <td>$${Number(s.basePay || 0).toFixed(2)}</td>
                                    <td class="positive-val">$${Number((s.tips || 0) + (s.cashTips || 0)).toFixed(2)}</td>
                                    <td style="color:#fbbf24;">$${Number(s.miscAmount || 0).toFixed(2)}</td>
                                    <td class="positive-val"><strong>$${Number(s.total || 0).toFixed(2)}</strong></td>
                                    <td>$${Number(s.hourlyRate || 0).toFixed(2)}/hr</td>
                                    <td>${miscBadge}${noteText}</td>
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
                            <th>Station (Where)</th>
                            <th>Price/Gal</th>
                            <th>Gallons</th>
                            <th>Total $</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${gas.map(g => `
                            <tr>
                                <td>${escapeHtml(g.date)}</td>
                                <td><strong>${escapeHtml(g.station)}</strong></td>
                                <td>$${Number(g.price || 0).toFixed(2)}</td>
                                <td>${Number(g.gallons || 0).toFixed(3)}</td>
                                <td class="gas-val"><strong>$${Number(g.total || 0).toFixed(2)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    return `
        <tr id="drilldown-${escapeHtml(monthName)}" class="month-drilldown-row" style="display: ${expandedMonths[monthName] ? 'table-row' : 'none'};">
            <td colspan="15" class="month-drilldown-cell">
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
            </td>
        </tr>
    `;
}

function renderTable(rows) {
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

        html += `
            <tr class="month-clickable-row ${isExp ? 'expanded' : ''}" data-month="${escapeHtml(r.month)}" onclick="toggleMonthDrilldown('${escapeHtml(r.month)}')">
                <td><span class="month-expand-chevron">▶</span><strong>${r.month}</strong>${shiftCountTag}${monthBadge}</td>
                <td>${r.hours}</td>
                <td>${r.activeHours}</td>
                <td>${r.miles}</td>
                <td><strong class="deduction-val">$${(r.milesNum * IRS_MILEAGE_RATE).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                <td>${r.deliveries.toLocaleString('en-US')}</td>
                <td>${r.basePay}</td>
                <td class="positive-val">${r.tips}</td>
                <td>${r.cashTips}</td>
                <td>${r.taxes}</td>
                <td class="gas-val">${r.gas}</td>
                <td class="positive-val"><strong>${r.totalPay}</strong></td>
                <td>${r.hourlyRate}</td>
                <td>${r.noTipping}</td>
                <td>${r.pctNoTipping}</td>
            </tr>
            ${buildDrilldownDrawerHtml(r.month)}
        `;
    });
    
    tbody.innerHTML = html;
}

function renderTotalRow(row, totalMiles) {
    const tfoot = document.getElementById('dashTableFoot');
    if (!tfoot || !row) return;
    
    const milesTotal = totalMiles || parseFloat((row[3] || '0').replace(/[^0-9.]/g, '')) || 8986;
    const totalDeductionVal = milesTotal * IRS_MILEAGE_RATE;

    tfoot.innerHTML = `
        <tr>
            <td><strong>${row[0] || 'Total'}</strong></td>
            <td>${row[1] || '0'}</td>
            <td>${row[2] || '0'}</td>
            <td>${row[3] || '0'}</td>
            <td><strong class="deduction-val">$${totalDeductionVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            <td>${row[4] || '0'}</td>
            <td>${row[5] || '$0'}</td>
            <td class="positive-val">${row[6] || '$0'}</td>
            <td>${row[7] || '$0'}</td>
            <td>${row[8] || '$0'}</td>
            <td class="gas-val">${row[13] || '$0.00'}</td>
            <td class="positive-val"><strong>${row[9] || '$0'}</strong></td>
            <td>${row[10] || '$0'}</td>
            <td>${row[11] || '0'}</td>
            <td>${row[12] || '0%'}</td>
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
    renderChart(currentChartType);
    renderTable(monthlyRows);
    renderTotalRow(syntheticTotalRow, totalMiles);

    const countBadge = document.getElementById('tableMonthCountBadge');
    if (countBadge) countBadge.textContent = `${targetYear} Vault • ${activeMonthsCount} Active Months`;
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
    if (form) form.reset();

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
                if (sel) sel.value = '';
                if (amt) amt.value = '0.00';
                if (note) note.value = '';
            } else {
                r.remove();
            }
        });
    }
    recalcShiftPreview();
}

function resetGasFormClean() {
    const form = document.getElementById('hqFormGas');
    if (form) form.reset();

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
    if (form) form.reset();

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

async function openAddDataModal(defaultTab = 'shift') {
    if (!currentAdminUser || !(await isAuthorizedAdminEmail(currentAdminUser.email))) {
        openAdminAuthModal();
        return;
    }

    const overlay = document.getElementById('addDataModalOverlay');
    if (overlay) overlay.style.display = 'flex';

    // Always provide a fresh, clean Add Data form so the user can immediately enter a new shift, gas fill-up, or expense
    resetShiftFormClean();
    resetGasFormClean();
    resetExpenseFormClean();
    prefillRatingsFormInputs();
    switchAddDataTab(defaultTab);
}

function closeAddDataModal() {
    const overlay = document.getElementById('addDataModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function switchAddDataTab(tabName) {
    const tabs = ['shift', 'gas', 'expense', 'ratings'];
    tabs.forEach(t => {
        const cap = t.charAt(0).toUpperCase() + t.slice(1);
        const btn = document.getElementById(`hqTabBtn${cap}`);
        const pane = document.getElementById(`hqForm${cap}`);
        if (btn) {
            if (t === tabName) btn.classList.add('active');
            else btn.classList.remove('active');
        }
        if (pane) {
            pane.style.display = (t === tabName) ? 'block' : 'none';
        }
    });
}

function addMiscPayRow() {
    const container = document.getElementById('miscPayRowsContainer');
    if (!container) return;
    const idx = container.children.length;
    const row = document.createElement('div');
    row.className = 'misc-pay-row';
    row.setAttribute('data-row-idx', idx);
    row.innerHTML = `
        <div class="hq-field-group">
            <label>Misc Type Dropdown</label>
            <select class="hq-select misc-type-select" onchange="recalcShiftPreview()">
                <option value="💵 Reimbursement">💵 Reimbursement (Closed Store / Half-Pay)</option>
                <option value="⚡ Peak Pay / Bonus">⚡ Peak Pay / Challenge Bonus</option>
                <option value="📦 Extra Delivery Fee">📦 Extra Delivery Fee</option>
                <option value="🎉 Other Misc Pay">🎉 Other Misc Pay</option>
            </select>
        </div>
        <div class="hq-field-group">
            <label>Misc Amount ($)</label>
            <input type="number" step="0.01" min="0" class="hq-input misc-amount-input" value="0.00" placeholder="0.00" oninput="recalcShiftPreview()">
        </div>
        <div class="hq-field-group misc-note-group">
            <label>Misc Reason / Note</label>
            <input type="text" class="hq-input misc-note-input" placeholder="e.g. Extra delivery fee ($3.78)" oninput="recalcShiftPreview()">
        </div>
        <button type="button" class="remove-misc-row-btn" onclick="this.parentElement.remove(); recalcShiftPreview();" title="Remove Misc Row">&times;</button>
    `;
    container.appendChild(row);
    recalcShiftPreview();
}

function collectMiscPaySummary() {
    const rows = document.querySelectorAll('#miscPayRowsContainer .misc-pay-row');
    let totalMiscAmount = 0;
    const categories = [];
    const notesParts = [];

    rows.forEach(r => {
        const typeEl = r.querySelector('.misc-type-select');
        const amtEl = r.querySelector('.misc-amount-input');
        const noteEl = r.querySelector('.misc-note-input');

        const typeVal = typeEl ? typeEl.value.trim() : '';
        const amtVal = amtEl ? (parseFloat(amtEl.value) || 0) : 0;
        const noteVal = noteEl ? noteEl.value.trim() : '';

        if (amtVal > 0 || noteVal) {
            totalMiscAmount += amtVal;
            const cleanCat = typeVal ? typeVal.replace(/^[^\w]+/, '').trim() : 'Misc Pay';
            if (cleanCat && !categories.includes(cleanCat)) {
                categories.push(cleanCat);
            }
            if (noteVal && amtVal > 0) {
                notesParts.push(`${cleanCat} ($${amtVal.toFixed(2)}): ${noteVal}`);
            } else if (noteVal) {
                notesParts.push(`${cleanCat}: ${noteVal}`);
            } else if (amtVal > 0) {
                notesParts.push(`${cleanCat}: $${amtVal.toFixed(2)}`);
            }
        }
    });

    return {
        miscAmount: parseFloat(totalMiscAmount.toFixed(2)),
        miscCategory: categories.join(' + '),
        miscNote: notesParts.join(' | ')
    };
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

    return {
        year: targetYear,
        month: targetMonth,
        hours: calcHoursFormatted,
        grossTotal,
        hourlyRate,
        taxSetAside
    };
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

    rows.forEach(r => {
        const cat = ((r.querySelector('.exp-category-input') || {}).value || 'Gear').trim();
        const cost = parseFloat((r.querySelector('.exp-cost-input') || {}).value) || 0;
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

/* --- 4. Vault API Submit Handlers (Single & Bulk) --- */
async function submitShiftForm(event) {
    event.preventDefault();
    if (!currentAdminUser) return openAdminAuthModal();

    const btn = document.getElementById('submitShiftBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving to Vault...'; }

    try {
        const calc = recalcShiftPreview();
        const { miscAmount, miscCategory, miscNote } = collectMiscPaySummary();

        const params = new URLSearchParams({
            action: 'addShift',
            adminEmail: currentAdminUser.email,
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
        });

        const res = await fetch(`${API_BASE_URL}?${params.toString()}`);
        const json = await res.json();

        if (json && json.success && json.shift) {
            liveVaultData.shifts.push(json.shift);
            if (!liveVaultData.years.includes(json.shift.year)) {
                liveVaultData.years.push(json.shift.year);
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
            expandedMonths[json.shift.month] = true;

            if (currentVaultYear !== 'all' && Number(currentVaultYear) === Number(json.shift.year) && Number(json.shift.year) !== 2026) {
                renderVaultYearFromRecords(json.shift.year);
            } else if (cachedRawCsvData) {
                processData(cachedRawCsvData);
            }

            showHqToast(`Shift ($${Number(json.shift.total).toFixed(2)}) saved to ${json.shift.month} ${json.shift.year} Vault!`);
            // Reset Shift form completely clean and keep modal ready or close cleanly
            resetShiftFormClean();
            closeAddDataModal();
        } else {
            showHqToast((json && json.error) || 'Could not save shift.', true);
        }
    } catch (err) {
        console.error('Error submitting shift:', err);
        showHqToast('Network error while saving shift.', true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Save Shift to Vault'; }
    }
}

async function submitGasForm(event) {
    event.preventDefault();
    if (!currentAdminUser) return openAdminAuthModal();

    const rows = Array.from(document.querySelectorAll('#gasRowsContainer .gas-entry-row'));
    const entries = rows.map(r => ({
        date: (r.querySelector('.gas-date-input') || {}).value || '',
        station: ((r.querySelector('.gas-station-input') || {}).value || '').trim(),
        price: (r.querySelector('.gas-price-input') || {}).value || '0',
        gallons: (r.querySelector('.gas-gallons-input') || {}).value || '0',
        total: (r.querySelector('.gas-total-input') || {}).value || '0'
    })).filter(e => e.station && (parseFloat(e.total) > 0 || parseFloat(e.gallons) > 0));

    if (entries.length === 0) {
        showHqToast('Please enter at least one valid gas fill-up.', true);
        return;
    }

    const btn = document.getElementById('submitGasBtn');
    if (btn) { btn.disabled = true; btn.textContent = `Saving ${entries.length} Fill-Up(s)...`; }

    try {
        const params = new URLSearchParams({
            action: entries.length > 1 ? 'addGasBulk' : 'addGas',
            adminEmail: currentAdminUser.email,
            date: entries[0].date,
            station: entries[0].station,
            price: entries[0].price,
            gallons: entries[0].gallons,
            total: entries[0].total,
            entriesJson: JSON.stringify(entries)
        });

        const res = await fetch(`${API_BASE_URL}?${params.toString()}`);
        const json = await res.json();

        const savedList = (json && Array.isArray(json.gasItems))
            ? json.gasItems
            : (json && json.gas ? [json.gas] : []);

        if (json && json.success && savedList.length > 0) {
            savedList.forEach(g => {
                liveVaultData.gas.push(g);
                if (!liveVaultData.years.includes(g.year)) {
                    liveVaultData.years.push(g.year);
                }
                expandedMonths[g.month] = true;
            });

            try {
                localStorage.setItem(VAULT_CACHE_KEY, JSON.stringify(liveVaultData));
                fetch(`${FIREBASE_DB_URL}/vault.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...liveVaultData, lastSynced: Date.now() })
                }).catch(() => {});
            } catch (e) {}
            renderVaultYearSelectorPills();

            if (cachedRawCsvData) processData(cachedRawCsvData);
            const totalSavedDollar = savedList.reduce((acc, g) => acc + (Number(g.total) || 0), 0);
            showHqToast(`${savedList.length} Gas Fill-Up(s) ($${totalSavedDollar.toFixed(2)}) saved to Vault!`);
            resetGasFormClean();
            closeAddDataModal();
        } else {
            showHqToast((json && json.error) || 'Could not save gas fill-up(s).', true);
        }
    } catch (err) {
        console.error('Error submitting gas:', err);
        showHqToast('Network error while saving gas fill-up(s).', true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⛽ Save Gas Fill-Up(s) to Vault'; }
    }
}

async function submitExpenseForm(event) {
    event.preventDefault();
    if (!currentAdminUser) return openAdminAuthModal();

    const rows = Array.from(document.querySelectorAll('#expenseRowsContainer .expense-entry-row'));
    const entries = rows.map(r => ({
        date: (r.querySelector('.exp-date-input') || {}).value || '',
        category: (r.querySelector('.exp-category-input') || {}).value || 'Gear',
        name: ((r.querySelector('.exp-name-input') || {}).value || '').trim(),
        desc: ((r.querySelector('.exp-desc-input') || {}).value || '').trim(),
        cost: (r.querySelector('.exp-cost-input') || {}).value || '0'
    })).filter(e => e.name && parseFloat(e.cost) >= 0);

    if (entries.length === 0) {
        showHqToast('Please enter at least one valid expense item.', true);
        return;
    }

    const btn = document.getElementById('submitExpenseBtn');
    if (btn) { btn.disabled = true; btn.textContent = `Saving ${entries.length} Expense(s)...`; }

    try {
        const params = new URLSearchParams({
            action: entries.length > 1 ? 'addExpenseBulk' : 'addExpense',
            adminEmail: currentAdminUser.email,
            date: entries[0].date,
            category: entries[0].category,
            name: entries[0].name,
            desc: entries[0].desc,
            cost: entries[0].cost,
            entriesJson: JSON.stringify(entries)
        });

        const res = await fetch(`${API_BASE_URL}?${params.toString()}`);
        const json = await res.json();

        const savedItems = (json && Array.isArray(json.items))
            ? json.items
            : (json && json.item ? [json.item] : []);

        if (json && json.success && savedItems.length > 0) {
            if (!Array.isArray(liveExpensesData)) liveExpensesData = [];
            savedItems.forEach(it => liveExpensesData.push(it));
            liveVaultData.expenses = liveExpensesData;
            try {
                localStorage.setItem('dasher_live_expenses_cache', JSON.stringify(liveExpensesData));
                fetch(`${FIREBASE_DB_URL}/vault/expenses.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(liveExpensesData)
                }).catch(() => {});
            } catch (e) {}
            renderItemizedLedger(cachedSummaryEarnings || 0, cachedSummaryGas || 0);
            const totalSavedDollar = savedItems.reduce((acc, it) => acc + (Number(it.cost) || 0), 0);
            showHqToast(`${savedItems.length} Expense(s) ($${totalSavedDollar.toFixed(2)}) added to Ledger!`);
            resetExpenseFormClean();
            closeAddDataModal();
        } else {
            showHqToast((json && json.error) || 'Could not save expense(s).', true);
        }
    } catch (err) {
        console.error('Error submitting expense:', err);
        showHqToast('Network error while saving expense(s).', true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🎒 Save Expense(s) to Ledger'; }
    }
}

async function submitRatingsForm(event) {
    event.preventDefault();
    if (!currentAdminUser) return openAdminAuthModal();

    const btn = document.getElementById('submitRatingsBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Updating Ratings...'; }

    try {
        const payload = {
            action: 'updateRatings',
            adminEmail: currentAdminUser.email,
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

        const params = new URLSearchParams(payload);
        const res = await fetch(`${API_BASE_URL}?${params.toString()}`);
        const json = await res.json();

        if (json && json.success) {
            renderRatings(
                ['LifeTime Deliveries', 'Customer Rating', 'Overall Dasher Rating', '5 stars', '4 stars', '3 stars', '2 stars', '1 star'],
                [payload.lifetime, payload.customerRating, payload.overallRating, payload.stars5, payload.stars4, payload.stars3, payload.stars2, payload.stars1]
            );
            renderFeedback(
                ['Communication', 'order handling', 'followed delivery instuctions', 'Friendliness', 'Above & Beyond'],
                [payload.communication, payload.orderHandling, payload.instructions, payload.friendliness, payload.aboveBeyond]
            );
            showHqToast('Platinum Dasher Ratings & Compliments updated!');
            closeAddDataModal();
        } else {
            showHqToast((json && json.error) || 'Could not update ratings.', true);
        }
    } catch (err) {
        console.error('Error updating ratings:', err);
        showHqToast('Network error while updating ratings.', true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⭐ Save Ratings & Compliments'; }
    }
}

