const CSV_URL = 'https://docs.google.com/spreadsheets/d/1Fe7D2-0TQFHLdwy3mfTwyr-EXODkOdeIFhYxZOyB2MQ/gviz/tq?tqx=out:csv&gid=1708220782';
const CACHE_KEY = 'dasher_tracker_data_v1';
const CACHE_TIME_KEY = 'dasher_tracker_time_v1';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Immediately load cached data if available (0ms instant render)
    const hasCached = loadFromLocalStorage();
    
    // 2. Fetch fresh data if no cache or cache older than 10 minutes (600,000 ms)
    const lastFetch = localStorage.getItem(CACHE_TIME_KEY) || 0;
    const isCacheStale = (Date.now() - parseInt(lastFetch)) > 600000;
    
    if (!hasCached || isCacheStale) {
        fetchDashboardData();
    }
});

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
    let tag = document.getElementById('lastUpdatedTag');
    if (!tag) {
        tag = document.createElement('span');
        tag.id = 'lastUpdatedTag';
        tag.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.8rem; vertical-align: middle;';
        const header = document.querySelector('.dashboard-header p');
        if (header) header.appendChild(tag);
    }
    const minsAgo = Math.floor((Date.now() - timestamp) / 60000);
    tag.textContent = minsAgo < 1 ? '• Updated just now' : `• Updated ${minsAgo}m ago`;
}

async function fetchDashboardData() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.classList.add('loading');
    
    const existingError = document.getElementById('errorBanner');
    if (existingError) existingError.remove();

    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        
        // Rate-Limit check: If Google returned HTML instead of CSV
        if (csvText.trim().toLowerCase().startsWith('<!doctype') || csvText.trim().toLowerCase().startsWith('<html')) {
            throw new Error("Google Sheets rate limited request.");
        }

        Papa.parse(csvText, {
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
                    handleFetchFailure("CSV data is empty.");
                }
            },
            error: function(err) {
                console.error("PapaParse error:", err);
                handleFetchFailure("Failed to parse sheet data.");
            }
        });
    } catch (error) {
        console.warn("Direct fetch failed or rate limited:", error);
        
        Papa.parse(CSV_URL, {
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
                    handleFetchFailure("Unable to fetch CSV data.");
                }
            },
            error: function(err) {
                console.error("PapaParse download error:", err);
                handleFetchFailure("Google Sheets rate limit active. Showing cached data.");
            }
        });
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('loading');
    }
}

function handleFetchFailure(msg) {
    const loadedFromCache = loadFromLocalStorage();
    if (!loadedFromCache) {
        renderError(msg);
    } else {
        console.info("Rate limit active, displaying cached data seamlessly.");
    }
}

function renderError(msg = "Failed to load data. Make sure the Google Sheet is published to the web.") {
    let banner = document.getElementById('errorBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'errorBanner';
        banner.style.cssText = 'background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); color: #f87171; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; text-align: center; font-weight: 500;';
        const container = document.querySelector('.dashboard-container');
        if (container) container.insertBefore(banner, container.children[1]);
    }
    banner.textContent = msg;
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
        let totalMonthsWorked = 0;
        let totalGas = 0;
        let totalBasePay = 0;
        let totalTips = 0;
        let totalCashTips = 0;
        let totalTaxes = 0;
        
        const chartLabels = [];
        const chartEarnings = [];
        const chartGas = [];

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
                
                totalEarnings += totalPayNum;
                totalDeliveries += deliveries;
                totalGas += gasNum;
                totalBasePay += basePayNum;
                totalTips += tipsNum;
                totalCashTips += cashTipsNum;
                totalTaxes += taxesNum;
                
                if (totalPayNum > 0 || deliveries > 0) {
                    totalMonthsWorked++;
                }

                monthlyRows.push({
                    month: col0,
                    hours: (row[1] || '0').replace(/^"|"$/g, '').trim(),
                    activeHours: (row[2] || '0').replace(/^"|"$/g, '').trim(),
                    miles: (row[3] || '0.00').replace(/^"|"$/g, '').trim(),
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
                    hourlyRateNum
                });
            }
        }

        // Fallbacks for ratings & feedback if header row not in gviz CSV export
        if (!ratingsHeaders) {
            ratingsHeaders = ['LifeTime Deliveries', 'Customer Rating', 'Overall Dasher Rating', '5 stars', '4 stars', '3 stars', '2 stars', '1 star\'s', 'No Reviews', '% No reviews'];
        }
        if (!ratingsValues && data.length > 14) {
            ratingsValues = data[14].map(c => (c || '').replace(/^"|"$/g, '').trim()).filter(c => c !== '');
            // If row index 14 didn't have values, look for row with numbers
            if (ratingsValues.length < 2) {
                for (let k = 13; k < data.length; k++) {
                    const rowClean = data[k].map(c => (c || '').replace(/^"|"$/g, '').trim()).filter(c => c !== '');
                    if (rowClean.some(c => /^\d+/.test(c))) {
                        ratingsValues = rowClean;
                        break;
                    }
                }
            }
        }
        if (!feedbackHeaders) {
            feedbackHeaders = ['Communication', 'order handling', 'followed delivery instuctions', 'Friendliness', 'Above & Beyond'];
        }
        if (!feedbackValues && data.length > 15) {
            feedbackValues = data[15].map(c => (c || '').replace(/^"|"$/g, '').trim()).filter(c => c !== '');
            if (feedbackValues.length < 2 && data.length > 16) {
                feedbackValues = data[16].map(c => (c || '').replace(/^"|"$/g, '').trim()).filter(c => c !== '');
            }
        }

        // Chart datasets
        monthlyRows.forEach(r => {
            chartLabels.push(r.month);
            chartEarnings.push(r.totalPayNum);
            chartGas.push(r.gasNum);
        });

        cachedChartData = {
            labels: chartLabels,
            earnings: chartEarnings,
            gas: chartGas,
            breakdown: {
                basePay: totalBasePay,
                tips: totalTips,
                cashTips: totalCashTips,
                gas: totalGas,
                taxes: totalTaxes
            }
        };

        renderSummary(totalEarnings, totalDeliveries, totalMonthsWorked, totalGas);
        renderTable(monthlyRows);
        renderTotalRow(totalRow);
        renderRatings(ratingsHeaders, ratingsValues);
        renderFeedback(feedbackHeaders, feedbackValues);
        renderChart(currentChartType);
    } catch (err) {
        console.error("Error in processData:", err);
        renderError();
    }
}

function animateValue(elementId, targetValue, isCurrency = false, prefix = '', suffix = '', duration = 1000) {
    const obj = document.getElementById(elementId);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // easeOutCubic
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
                obj.textContent = '$' + targetValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix;
            } else {
                obj.textContent = targetValue.toLocaleString('en-US') + suffix;
            }
        }
    };
    window.requestAnimationFrame(step);
}

function renderSummary(totalEarnings, totalDeliveries, totalShifts, totalGas) {
    const summaryContainer = document.getElementById('summaryCards');
    
    const netProfit = totalEarnings - totalGas;
    const gasRoi = totalGas > 0 ? (totalEarnings / totalGas) : 0;
    const avgPerDelivery = totalDeliveries > 0 ? (totalEarnings / totalDeliveries) : 0;

    const cardsHtml = `
        <div class="card">
            <div class="card-title">Total Earnings</div>
            <div class="card-value success" id="cardValEarnings">$0.00</div>
        </div>
        <div class="card">
            <div class="card-title">Net Profit (After Gas)</div>
            <div class="card-value success" id="cardValNetProfit" style="color: #38bdf8;">$0.00</div>
        </div>
        <div class="card">
            <div class="card-title">Total Deliveries</div>
            <div class="card-value" id="cardValDeliveries">0</div>
        </div>
        <div class="card">
            <div class="card-title">Gas Efficiency (ROI)</div>
            <div class="card-value" id="cardValGasRoi" style="color: #a78bfa;">$0.00 / $1 Gas</div>
        </div>
        <div class="card">
            <div class="card-title">Total Gas Spent</div>
            <div class="card-value" id="cardValGas" style="color: #f87171;">$0.00</div>
        </div>
        <div class="card">
            <div class="card-title">Avg per Delivery</div>
            <div class="card-value success" id="cardValAvg">$0.00</div>
        </div>
    `;
    
    summaryContainer.innerHTML = cardsHtml;
    
    // Animate summary cards
    animateValue('cardValEarnings', totalEarnings, true);
    animateValue('cardValNetProfit', netProfit, true);
    animateValue('cardValDeliveries', totalDeliveries, false);
    animateValue('cardValGas', totalGas, true);
    animateValue('cardValAvg', avgPerDelivery, true);
    
    // Gas ROI custom format
    const roiObj = document.getElementById('cardValGasRoi');
    if (roiObj) roiObj.textContent = `$${gasRoi.toFixed(2)} / $1 Gas`;
}

function renderTable(rows) {
    const tbody = document.getElementById('dashTableBody');
    let html = '';
    
    // Find Max Pay and Max Hourly Rate
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
                <td>${r.deliveries.toLocaleString('en-US')}</td>
                <td>${r.basePay}</td>
                <td class="positive-val">${r.tips}</td>
                <td>${r.cashTips}</td>
                <td>${r.taxes}</td>
                <td style="color: #f87171;">${r.gas}</td>
                <td class="positive-val"><strong>${r.totalPay}</strong></td>
                <td>${r.hourlyRate}</td>
                <td>${r.noTipping}</td>
                <td>${r.pctNoTipping}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function renderTotalRow(row) {
    const tfoot = document.getElementById('dashTableFoot');
    if (!row) {
        tfoot.innerHTML = '';
        return;
    }
    
    tfoot.innerHTML = `
        <tr>
            <td><strong>${row[0] || 'Total'}</strong></td>
            <td>${row[1] || '0'}</td>
            <td>${row[2] || '0'}</td>
            <td>${row[3] || '0'}</td>
            <td>${row[4] || '0'}</td>
            <td>${row[5] || '$0'}</td>
            <td class="positive-val">${row[6] || '$0'}</td>
            <td>${row[7] || '$0'}</td>
            <td>${row[8] || '$0'}</td>
            <td style="color: #f87171;">${row[13] || '$0.00'}</td>
            <td class="positive-val"><strong>${row[9] || '$0'}</strong></td>
            <td>${row[10] || '$0'}</td>
            <td>${row[11] || '0'}</td>
            <td>${row[12] || '0%'}</td>
        </tr>
    `;
}

function formatTitle(title) {
    if (!title) return '';
    let clean = title.replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    const lower = clean.toLowerCase();
    if (lower === "1 star's" || lower === "1 star") return "1 Star";
    if (lower === "2 stars") return "2 Stars";
    if (lower === "3 stars") return "3 Stars";
    if (lower === "4 stars") return "4 Stars";
    if (lower === "5 stars") return "5 Stars ★";
    if (lower === "lifetime deliveries") return "Lifetime Deliveries";
    if (lower === "% no reviews") return "% No Reviews";
    if (lower === "order handling") return "Order Handling";
    if (lower.includes("instuctions") || lower.includes("instructions")) return "Followed Instructions";
    if (lower.includes("above") && lower.includes("beyond")) return "Above & Beyond";
    
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function renderRatings(headers, values) {
    const grid = document.getElementById('ratingsGrid');
    if (!headers || !values) {
        grid.innerHTML = '<p style="color: var(--text-secondary);">No ratings data found.</p>';
        return;
    }
    
    // Header to value mapping
    const map = {};
    for (let i = 0; i < headers.length; i++) {
        if (headers[i]) {
            map[headers[i].toLowerCase().trim()] = (values[i] || '0').trim();
        }
    }
    
    const lifetime = map['lifetime deliveries'] || map['lifetime'] || '0';
    const customerRating = map['customer rating'] || '0';
    const overallRating = map['overall dasher rating'] || '0';
    
    const fiveStars = parseInt(map['5 stars'] || '0') || 0;
    const fourStars = parseInt(map['4 stars'] || '0') || 0;
    const threeStars = parseInt(map['3 stars'] || '0') || 0;
    const twoStars = parseInt(map['2 stars'] || '0') || 0;
    const oneStar = parseInt(map["1 star's"] || map['1 star'] || '0') || 0;
    
    const totalRated = (fiveStars + fourStars + threeStars + twoStars + oneStar) || 1;
    
    const noReviews = map['no reviews'] || '0';
    const pctNoReviews = map['% no reviews'] || '0%';

    grid.innerHTML = `
        <div class="ratings-hero-row">
            <div class="hero-rating-card">
                <div class="hero-label">Lifetime Deliveries</div>
                <div class="hero-val">${lifetime}</div>
            </div>
            <div class="hero-rating-card highlight-gold">
                <div class="hero-label">Customer Rating</div>
                <div class="hero-val gold">★ ${customerRating}</div>
            </div>
            <div class="hero-rating-card highlight-green">
                <div class="hero-label">Overall Rating</div>
                <div class="hero-val green">${overallRating}%</div>
            </div>
            <div class="hero-rating-card">
                <div class="hero-label">Unreviewed Orders</div>
                <div class="hero-val">${noReviews} <span class="sub-pct">(${pctNoReviews})</span></div>
            </div>
        </div>

        <div class="star-breakdown-container">
            <div class="star-breakdown-header">
                <h3>Star Rating Breakdown</h3>
                <span class="total-reviews-count">${totalRated.toLocaleString('en-US')} Total Reviews</span>
            </div>
            <div class="star-rows-grid">
                <div class="star-rank-card star-5">
                    <div class="star-stars">★★★★★</div>
                    <div class="star-count">${fiveStars}</div>
                    <div class="star-bar-bg"><div class="star-bar-fill" style="width: ${(fiveStars/totalRated)*100}%;"></div></div>
                </div>
                <div class="star-rank-card star-4">
                    <div class="star-stars">★★★★☆</div>
                    <div class="star-count">${fourStars}</div>
                    <div class="star-bar-bg"><div class="star-bar-fill" style="width: ${(fourStars/totalRated)*100}%;"></div></div>
                </div>
                <div class="star-rank-card star-3">
                    <div class="star-stars">★★★☆☆</div>
                    <div class="star-count">${threeStars}</div>
                    <div class="star-bar-bg"><div class="star-bar-fill" style="width: ${(threeStars/totalRated)*100}%;"></div></div>
                </div>
                <div class="star-rank-card star-2">
                    <div class="star-stars">★★☆☆☆</div>
                    <div class="star-count">${twoStars}</div>
                    <div class="star-bar-bg"><div class="star-bar-fill" style="width: ${(twoStars/totalRated)*100}%;"></div></div>
                </div>
                <div class="star-rank-card star-1">
                    <div class="star-stars">★☆☆☆☆</div>
                    <div class="star-count">${oneStar}</div>
                    <div class="star-bar-bg"><div class="star-bar-fill" style="width: ${(oneStar/totalRated)*100}%;"></div></div>
                </div>
            </div>
        </div>
    `;
}

function renderFeedback(headers, values) {
    const grid = document.getElementById('feedbackGrid');
    if (!headers || !values) {
        grid.innerHTML = '<p style="color: var(--text-secondary);">No feedback data found.</p>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < headers.length; i++) {
        const rawTitle = (headers[i] || '').trim();
        const val = (values[i] || '0').trim();
        if (!rawTitle) continue;

        const title = formatTitle(rawTitle);
        const lower = title.toLowerCase();
        
        let icon = '🏅';
        if (lower.includes('communication')) icon = '💬';
        else if (lower.includes('order')) icon = '🛍️';
        else if (lower.includes('instructions')) icon = '📝';
        else if (lower.includes('friendliness')) icon = '😊';
        else if (lower.includes('above')) icon = '⭐';

        html += `
            <div class="feedback-card">
                <div class="badge-title">${icon} ${title}</div>
                <div class="badge-count">${val}</div>
            </div>
        `;
    }
    grid.innerHTML = html;
}

function switchChart(type) {
    currentChartType = type;
    
    // Update active button state
    ['line', 'bar', 'donut'].forEach(t => {
        const btn = document.getElementById('chartBtn' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) {
            if (t === type) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    if (cachedChartData) {
        renderChart(type);
    }
}

let earningsChartInstance = null;

function renderChart(type = 'line') {
    if (!cachedChartData) return;
    
    const canvas = document.getElementById('earningsChart');
    if (!canvas) return;

    try {
        if (typeof Chart === 'undefined') {
            console.warn("Chart.js library is not loaded.");
            return;
        }

        const ctx = canvas.getContext('2d');
        if (earningsChartInstance) {
            earningsChartInstance.destroy();
        }

        const { labels, earnings, gas, breakdown } = cachedChartData;

        let chartConfig = {};

        if (type === 'line') {
            chartConfig = {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Total Earnings ($)',
                        data: earnings,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#60a5fa',
                        pointHoverRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#94a3b8' } }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
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
                            backgroundColor: 'rgba(16, 185, 129, 0.75)',
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 6
                        },
                        {
                            label: 'Gas Spent ($)',
                            data: gas,
                            backgroundColor: 'rgba(248, 113, 113, 0.75)',
                            borderColor: '#f87171',
                            borderWidth: 1,
                            borderRadius: 6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#94a3b8' } }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                }
            };
        } else if (type === 'donut') {
            chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['Base Pay', 'Tips', 'Cash Tips', 'Gas Spent', 'Taxes'],
                    datasets: [{
                        data: [
                            breakdown.basePay,
                            breakdown.tips,
                            breakdown.cashTips,
                            breakdown.gas,
                            breakdown.taxes
                        ],
                        backgroundColor: [
                            '#3b82f6',
                            '#10b981',
                            '#f59e0b',
                            '#f87171',
                            '#8b5cf6'
                        ],
                        borderWidth: 2,
                        borderColor: '#0f172a'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: '#94a3b8', font: { size: 12 } }
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
