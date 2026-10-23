/* ==========================================================================
   DASHER TRACKER — MODERN SCRIPT ENGINE (v3.4.0)
   ========================================================================== */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoAqn4EkIAKojVQfFSHV5X09dbVGDnAGtogqspyJYimWfsLr6XjQr_wDp3P8E7sOfjPNLsyor4ugdR/pub?gid=1708220782&single=true&output=csv';
const CACHE_KEY = 'dasher_tracker_data_v9';
const CACHE_TIME_KEY = 'dasher_tracker_time_v9';
const VISITOR_API_URL = 'https://livecounters-8eaa8-default-rtdb.firebaseio.com/labData';
const IRS_MILEAGE_RATE = 0.67; // 2024-2026 IRS Standard Business Mileage Rate ($0.67/mi)

// Itemized Gear, Supplies & Vehicle Upkeep Data
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

let cachedChartData = null;
let currentChartType = 'line';
let earningsChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // 0. Initialize Live Visitor Telemetry
    initVisitorCounter();

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

function loadFromLocalStorage() {
    try {
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
            const data = JSON.parse(cachedRaw);
            if (data && data.length > 0) {
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
    
    try {
        const fetchUrl = `${CSV_URL}&_cb=${Date.now()}`;
        Papa.parse(fetchUrl, {
            download: true,
            header: false,
            skipEmptyLines: false,
            complete: function(results) {
                if (results.data && results.data.length > 0) {
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
function renderItemizedLedger(totalEarnings, totalGas) {
    const gearSubtotal = DASHER_GEAR_ITEMS.reduce((sum, item) => sum + item.cost, 0);
    const maintSubtotal = VEHICLE_MAINTENANCE_ITEMS.reduce((sum, item) => sum + item.cost, 0);
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
        
        let icon = '⭐';
        if (lower.includes('communication')) icon = '💬';
        else if (lower.includes('handling')) icon = '🛍️';
        else if (lower.includes('instructions')) icon = '📝';
        else if (lower.includes('friendliness')) icon = '😊';
        else if (lower.includes('above')) icon = '🚀';

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
   MONTHLY DATA TABLE
   ========================================================================== */
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

        html += `
            <tr>
                <td><strong>${r.month}</strong>${monthBadge}</td>
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
