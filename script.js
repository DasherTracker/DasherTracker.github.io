const CSV_URL = 'https://docs.google.com/spreadsheets/d/1Fe7D2-0TQFHLdwy3mfTwyr-EXODkOdeIFhYxZOyB2MQ/export?format=csv&gid=1708220782';

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
    // Poll for updates every 60 seconds to avoid rate limits
    setInterval(fetchDashboardData, 60000);
});

async function fetchDashboardData() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.classList.add('loading');
    
    try {
        Papa.parse(CSV_URL, {
            download: true,
            header: false,
            complete: function(results) {
                processData(results.data);
            },
            error: function(err) {
                console.error("Error fetching CSV:", err);
                renderError();
            }
        });
    } catch (error) {
        console.error("Fetch error:", error);
        renderError();
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('loading');
    }
}

function renderError() {
    document.getElementById('summaryCards').innerHTML = '<div style="color: #ef4444;">Failed to load data. Make sure the Google Sheet is published to the web.</div>';
}

function processData(data) {
    const monthlyRows = [];
    let totalRow = null;
    let ratingsHeaders = null;
    let ratingsValues = null;
    let feedbackHeaders = null;
    let feedbackValues = null;
    
    let totalEarnings = 0;
    let totalDeliveries = 0;
    let totalMonthsWorked = 0;
    
    const chartLabels = [];
    const chartEarnings = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 1) continue;
        
        const col0 = (row[0] || '').trim();
        
        // 1. Total Row
        if (col0.toLowerCase() === 'total') {
            totalRow = row;
            continue;
        }
        
        // 2. Ratings Headers & Values (detect 'lifetime' anywhere in row)
        const isRatingsHeaderRow = row.some(c => (c || '').trim().toLowerCase() === 'lifetime');
        if (isRatingsHeaderRow && !ratingsHeaders) {
            ratingsHeaders = row.map(c => (c || '').trim());
            for (let j = i + 1; j < data.length; j++) {
                if (data[j] && data[j].some(c => (c || '').trim() !== '')) {
                    ratingsValues = data[j].map(c => (c || '').trim());
                    break;
                }
            }
            continue;
        }
        
        // 3. Customer Feedback Headers & Values (detect 'communication' anywhere in row)
        const isFeedbackHeaderRow = row.some(c => (c || '').trim().toLowerCase() === 'communication');
        if (isFeedbackHeaderRow && !feedbackHeaders) {
            feedbackHeaders = row.map(c => (c || '').trim());
            for (let j = i + 1; j < data.length; j++) {
                if (data[j] && data[j].some(c => (c || '').trim() !== '')) {
                    feedbackValues = data[j].map(c => (c || '').trim());
                    break;
                }
            }
            continue;
        }
        
        // 4. Monthly Rows
        const validMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        if (validMonths.includes(col0.toLowerCase())) {
            const deliveries = parseInt((row[4] || '0').replace(/[^0-9]/g, "")) || 0;
            const totalPayStr = row[9] || '$0';
            const totalPayNum = parseFloat(totalPayStr.replace(/[^0-9.-]+/g, "")) || 0;
            
            totalEarnings += totalPayNum;
            totalDeliveries += deliveries;
            
            if (totalPayNum > 0 || deliveries > 0) {
                totalMonthsWorked++;
            }

            monthlyRows.push({
                month: col0,
                hours: row[1] || '0',
                activeHours: row[2] || '0',
                miles: row[3] || '0.00',
                deliveries,
                basePay: row[5] || '$0.00',
                tips: row[6] || '$0.00',
                cashTips: row[7] || '$0.00',
                taxes: row[8] || '$0.00',
                totalPay: totalPayStr,
                hourlyRate: row[10] || '$0.00',
                noTipping: row[11] || '0',
                pctNoTipping: row[12] || '0.00%',
                totalPayNum
            });
        }
    }

    // Chart takes chronological months
    monthlyRows.forEach(r => {
        chartLabels.push(r.month);
        chartEarnings.push(r.totalPayNum);
    });

    renderSummary(totalEarnings, totalDeliveries, totalMonthsWorked);
    renderTable(monthlyRows);
    renderTotalRow(totalRow);
    renderRatings(ratingsHeaders, ratingsValues, totalRow);
    renderFeedback(feedbackHeaders, feedbackValues);
    renderChart(chartLabels, chartEarnings);
}

function renderSummary(totalEarnings, totalDeliveries, totalShifts) {
    const summaryContainer = document.getElementById('summaryCards');
    
    // Create card HTML
    const formattedEarnings = totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedDeliveries = totalDeliveries.toLocaleString('en-US');
    const formattedAvg = totalDeliveries > 0 ? (totalEarnings / totalDeliveries).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

    const cardsHtml = `
        <div class="card">
            <div class="card-title">Total Earnings</div>
            <div class="card-value success">$${formattedEarnings}</div>
        </div>
        <div class="card">
            <div class="card-title">Total Deliveries</div>
            <div class="card-value">${formattedDeliveries}</div>
        </div>
        <div class="card">
            <div class="card-title">Months Active</div>
            <div class="card-value">${totalShifts}</div>
        </div>
        <div class="card">
            <div class="card-title">Avg per Delivery</div>
            <div class="card-value success">$${formattedAvg}</div>
        </div>
    `;
    
    summaryContainer.innerHTML = cardsHtml;
}

function renderTable(rows) {
    const tbody = document.getElementById('dashTableBody');
    let html = '';
    
    rows.forEach(r => {
        html += `
            <tr>
                <td><strong>${r.month}</strong></td>
                <td>${r.hours}</td>
                <td>${r.activeHours}</td>
                <td>${r.miles}</td>
                <td>${r.deliveries.toLocaleString('en-US')}</td>
                <td>${r.basePay}</td>
                <td class="positive-val">${r.tips}</td>
                <td>${r.cashTips}</td>
                <td>${r.taxes}</td>
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
            <td class="positive-val"><strong>${row[9] || '$0'}</strong></td>
            <td>${row[10] || '$0'}</td>
            <td>${row[11] || '0'}</td>
            <td>${row[12] || '0%'}</td>
        </tr>
    `;
}

function renderRatings(headers, values, totalRow) {
    const grid = document.getElementById('ratingsGrid');
    if (!headers || !values) {
        grid.innerHTML = '<p style="color: var(--text-secondary);">No ratings data found.</p>';
        return;
    }
    
    // Create header-value map
    const map = {};
    for (let i = 0; i < headers.length; i++) {
        const title = headers[i];
        if (title) {
            map[title.toLowerCase().trim()] = (values[i] || '0').trim();
        }
    }
    
    // Extracted values
    const lifetime = map['lifetime'] || '0';
    const customerRating = map['customer rating'] || '0';
    const overallRating = map['overall dasher rating'] || '0';
    const fiveStars = map['5 stars'] || '0';
    const fourStars = map['4 stars'] || '0';
    const threeStars = map['3 stars'] || '0';
    const twoStars = map['2 stars'] || '0';
    const oneStar = map["1 star's"] || map['1 star'] || '0';
    const noReviews = map['no reviews'] || '0';
    const pctNoReviews = map['% no reviews'] || '0%';

    // Tip stats from totalRow
    const noTipCount = totalRow ? (totalRow[11] || '0') : '0';
    const noTipPct = totalRow ? (totalRow[12] || '0%') : '0%';
    const totalTips = totalRow ? (totalRow[6] || '$0') : '$0';
    const cashTips = totalRow ? (totalRow[7] || '$0') : '$0';

    grid.innerHTML = `
        <div class="rating-card">
            <div class="title">LifeTime</div>
            <div class="val">${lifetime}</div>
        </div>
        <div class="rating-card highlight-gold">
            <div class="title">Customer Rating</div>
            <div class="val">${customerRating}</div>
        </div>
        <div class="rating-card highlight-green">
            <div class="title">Overall Rating</div>
            <div class="val">${overallRating}</div>
        </div>
        <div class="rating-card highlight-gold">
            <div class="title">5 Stars</div>
            <div class="val">${fiveStars}</div>
        </div>
        <div class="rating-card">
            <div class="title">4 Stars</div>
            <div class="val">${fourStars}</div>
        </div>
        <div class="rating-card">
            <div class="title">3 Stars</div>
            <div class="val">${threeStars}</div>
        </div>
        <div class="rating-card">
            <div class="title">2 Stars</div>
            <div class="val">${twoStars}</div>
        </div>
        <div class="rating-card">
            <div class="title">1 Star</div>
            <div class="val">${oneStar}</div>
        </div>
        <div class="rating-card">
            <div class="title">No Reviews</div>
            <div class="val">${noReviews} <span style="font-size: 0.9rem; color: var(--text-secondary);">(${pctNoReviews})</span></div>
        </div>
        <div class="rating-card highlight-green">
            <div class="title">Total Tips</div>
            <div class="val">${totalTips} <span style="font-size: 0.85rem; color: var(--text-secondary);">(${cashTips} cash)</span></div>
        </div>
        <div class="rating-card">
            <div class="title">No-Tip Orders</div>
            <div class="val">${noTipCount} <span style="font-size: 0.85rem; color: var(--text-secondary);">(${noTipPct})</span></div>
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
        const title = headers[i];
        const val = values[i] || '0';
        if (!title) continue;

        // Clean up title (e.g. "Above \n& \nBeyond" -> "Above & Beyond")
        const cleanTitle = title.replace(/\n/g, ' ').replace(/\s+/g, ' ');

        html += `
            <div class="feedback-card">
                <div class="badge-title">${cleanTitle}</div>
                <div class="badge-count">${val}</div>
            </div>
        `;
    }
    grid.innerHTML = html;
}

let earningsChartInstance = null;

function renderChart(labels, data) {
    const ctx = document.getElementById('earningsChart').getContext('2d');
    
    if (earningsChartInstance) {
        earningsChartInstance.destroy();
    }
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    earningsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Earnings ($)',
                data: data,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#10b981',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#f8fafc',
                    padding: 12,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(value, index, values) {
                            return '$' + value;
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        }
    });
}
