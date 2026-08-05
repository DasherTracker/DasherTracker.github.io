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
    const rows = [];
    let totalEarnings = 0;
    let totalDeliveries = 0;
    let totalMonthsWorked = 0;
    
    // For Chart
    const chartLabels = [];
    const chartEarnings = [];

    // The data array contains arrays like ["January ", "0", "0", ...]
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 10) continue;
        
        const monthStr = row[0];
        // Skip header rows or empty rows
        if (!monthStr || monthStr.trim() === '' || monthStr.trim().toLowerCase() === 'month') continue;
        
        // Skip the "Total" row (and we can break since it's at the bottom)
        if (monthStr.trim().toLowerCase() === 'total') break;
        
        const deliveries = parseInt((row[4] || '0').replace(/[^0-9]/g, "")) || 0;
        
        const totalPayStr = row[9] || '$0';
        const totalPayNum = parseFloat(totalPayStr.replace(/[^0-9.-]+/g, "")) || 0;
        
        totalEarnings += totalPayNum;
        totalDeliveries += deliveries;
        
        if (totalPayNum > 0 || deliveries > 0) {
            totalMonthsWorked++;
        }

        rows.push({
            dateStr: monthStr.trim(),
            hours: row[1] || '0',
            activeHours: row[2] || '0',
            deliveries,
            hourlyRate: row[10] || '$0.00',
            tips: row[6] || '$0.00',
            totalPay: totalPayStr,
            totalPayNum
        });
    }

    // Chart takes the months in chronological order
    rows.forEach(r => {
        chartLabels.push(r.dateStr);
        chartEarnings.push(r.totalPayNum);
    });

    renderSummary(totalEarnings, totalDeliveries, totalMonthsWorked);
    renderTable(rows);
    renderChart(chartLabels, chartEarnings);
}

// parseDateStr removed as we're not parsing timestamps

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
                <td>${r.dateStr}</td>
                <td>${r.hours}</td>
                <td>${r.activeHours}</td>
                <td>${r.deliveries.toLocaleString('en-US')}</td>
                <td>${r.hourlyRate}</td>
                <td class="positive-val">${r.tips}</td>
                <td class="positive-val">${r.totalPay}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
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
