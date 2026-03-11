let countyData = [];
let historyData = [];

// Load CSV data
async function loadData() {
    try {
        const [dashResponse, histResponse] = await Promise.all([
            fetch('./data.csv'),
            fetch('./history.csv')
        ]);
        const dashCsv = await dashResponse.text();
        const histCsv = await histResponse.text();

        countyData = parseCSV(dashCsv);
        historyData = parseCSV(histCsv);

        console.log(`Loaded data for ${countyData.length} counties`);
        console.log(`Loaded history for ${historyData.length} records`);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((header, index) => {
            // Try to convert to number if possible
            const value = values[index];
            obj[header] = isNaN(value) ? value : parseFloat(value);
        });
        return obj;
    });
}

// Search functionality
const searchInput = document.getElementById('countySearch');
const suggestionsDiv = document.getElementById('suggestions');
const cardContainer = document.getElementById('cardContainer');

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (query.length === 0) {
        suggestionsDiv.classList.remove('active');
        return;
    }

    const matches = countyData
        .filter(county => county.county.toLowerCase().includes(query))
        .slice(0, 5);

    if (matches.length === 0) {
        suggestionsDiv.classList.remove('active');
        return;
    }

    suggestionsDiv.innerHTML = matches.map(county =>
        `<div class="suggestion-item" data-county="${county.county}">
            ${county.county}
        </div>`
    ).join('');
    suggestionsDiv.classList.add('active');

    // Add click handlers to suggestions
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const countyName = item.dataset.county;
            selectCounty(countyName);
        });
    });
});

// Handle Enter key in search
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query.length > 0) {
            selectCounty(query);
        }
    }
});

function selectCounty(countyName) {
    const county = countyData.find(c => c.county.toUpperCase() === countyName.toUpperCase());

    if (county) {
        searchInput.value = county.county;
        suggestionsDiv.classList.remove('active');
        displayCountyCard(county);
    } else {
        // Show error message for non-existent county
        showNotFoundError(countyName);
    }
}

function showNotFoundError(countyName) {
    const card = document.createElement('div');
    card.className = 'county-card not-found';
    card.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
            <h2 style="color: #d32f2f; margin-bottom: 10px;">County Not Found</h2>
            <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
                "<strong>${countyName}</strong>" is not a recognized California county.
            </p>
            <p style="color: #999; font-size: 14px;">
                Try searching from the list of 58 California counties, or check the <strong>Rankings</strong> tab to see all counties.
            </p>
        </div>
    `;

    cardContainer.innerHTML = '';
    cardContainer.appendChild(card);
}

function displayCountyCard(county) {
    const card = document.createElement('div');
    card.className = 'county-card';

    const clearanceVsAvg = county.clearance_vs_avg;
    const dispositionVsAvg = county.disposition_vs_avg;

    // Generate alerts
    const alerts = [];
    if (county.disposition_gap > 25) {
        alerts.push({
            type: 'warning',
            message: `High disposition gap (${county.disposition_gap.toFixed(1)}%) - Above 25% threshold`
        });
    }

    // Calculate racial disparities
    const totalArrests = county.arrests_black + county.arrests_hispanic + county.arrests_white + county.arrests_other;
    const demographicsData = {
        Black: county.arrests_black,
        Hispanic: county.arrests_hispanic,
        White: county.arrests_white,
        Other: county.arrests_other
    };

    // Find disparities (groups with >50% higher than population average)
    const avgRate = totalArrests / 4;
    Object.entries(demographicsData).forEach(([group, count]) => {
        const rate = count / totalArrests;
        if (rate > 0.35) {  // Over 35% of arrests suggests overrepresentation
            alerts.push({
                type: 'info',
                message: `${group} arrests: ${(rate * 100).toFixed(1)}% of total (${formatNumber(count)})`
            });
        }
    });

    const alertsHtml = alerts.length > 0 ? `
        <div class="alerts-section">
            ${alerts.map(alert => `
                <div class="alert alert-${alert.type}">
                    <span class="alert-icon">${alert.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                    <span class="alert-text">${alert.message}</span>
                </div>
            `).join('')}
        </div>
    ` : '';

    // Get historical data for this county
    const countyHistory = historyData
        .filter(h => h.county.toUpperCase() === county.county.toUpperCase())
        .sort((a, b) => a.year - b.year);

    const demographicsHtml = `
        <div class="demographics-section">
            <h3 class="section-title">Arrests by Race/Ethnicity</h3>
            <div class="demographics-grid">
                ${Object.entries(demographicsData).map(([group, count]) => {
                    const percentage = (count / totalArrests * 100).toFixed(1);
                    const isOverrepresented = percentage > 35;
                    return `
                        <div class="demographic-item ${isOverrepresented ? 'overrepresented' : ''}">
                            <div class="demographic-label">${group}</div>
                            <div class="demographic-value">${percentage}%</div>
                            <div class="demographic-count">${formatNumber(count)} arrests</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    // Calculate offense rankings
    const offenseRankings = {
        felony_total: countyData.map((c, i) => ({ county: c.county, value: c.felony_total, index: i })).sort((a, b) => b.value - a.value).map((c, i) => ({ ...c, rank: i + 1 })),
        misdemeanor_total: countyData.map((c, i) => ({ county: c.county, value: c.misdemeanor_total, index: i })).sort((a, b) => b.value - a.value).map((c, i) => ({ ...c, rank: i + 1 })),
        violent: countyData.map((c, i) => ({ county: c.county, value: c.violent, index: i })).sort((a, b) => b.value - a.value).map((c, i) => ({ ...c, rank: i + 1 })),
        property: countyData.map((c, i) => ({ county: c.county, value: c.property, index: i })).sort((a, b) => b.value - a.value).map((c, i) => ({ ...c, rank: i + 1 })),
        drug: countyData.map((c, i) => ({ county: c.county, value: c.drug, index: i })).sort((a, b) => b.value - a.value).map((c, i) => ({ ...c, rank: i + 1 }))
    };

    const felonyRank = offenseRankings.felony_total.find(r => r.county === county.county).rank;
    const misdemeanorRank = offenseRankings.misdemeanor_total.find(r => r.county === county.county).rank;
    const violentRank = offenseRankings.violent.find(r => r.county === county.county).rank;
    const propertyRank = offenseRankings.property.find(r => r.county === county.county).rank;
    const drugRank = offenseRankings.drug.find(r => r.county === county.county).rank;

    const offenseBreakdownHtml = `
        <div class="offense-section">
            <h3 class="section-title">Offense Category Breakdown</h3>
            <div class="offense-chart-container">
                <canvas id="offenseChart" style="max-height: 300px;"></canvas>
            </div>
            <div class="offense-rankings-grid">
                <div class="offense-ranking-item">
                    <div class="ranking-label">Felony</div>
                    <div class="ranking-count">${formatNumber(county.felony_total)}</div>
                    <div class="ranking-position">Rank #${felonyRank} of 58</div>
                </div>
                <div class="offense-ranking-item">
                    <div class="ranking-label">Misdemeanor</div>
                    <div class="ranking-count">${formatNumber(county.misdemeanor_total)}</div>
                    <div class="ranking-position">Rank #${misdemeanorRank} of 58</div>
                </div>
                <div class="offense-ranking-item">
                    <div class="ranking-label">Violent Crime</div>
                    <div class="ranking-count">${formatNumber(county.violent)}</div>
                    <div class="ranking-position">Rank #${violentRank} of 58</div>
                </div>
                <div class="offense-ranking-item">
                    <div class="ranking-label">Property Crime</div>
                    <div class="ranking-count">${formatNumber(county.property)}</div>
                    <div class="ranking-position">Rank #${propertyRank} of 58</div>
                </div>
                <div class="offense-ranking-item">
                    <div class="ranking-label">Drug Offense</div>
                    <div class="ranking-count">${formatNumber(county.drug)}</div>
                    <div class="ranking-position">Rank #${drugRank} of 58</div>
                </div>
            </div>
        </div>
    `;

    const trendHtml = countyHistory.length > 0 ? `
        <div class="trends-section">
            <h3 class="section-title">Year-over-Year Progress</h3>
            <div class="trends-chart-container">
                <canvas id="trendsChart" style="max-height: 400px;"></canvas>
            </div>
            <div class="trends-table">
                <table>
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Arrests Cleared</th>
                            <th>Convictions Cleared</th>
                            <th>Disposition Gap</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${countyHistory.map(year => `
                            <tr>
                                <td>${year.year}</td>
                                <td>${formatNumber(year.arrests_cleared)}</td>
                                <td>${formatNumber(year.convictions_cleared)}</td>
                                <td>${year.disposition_gap.toFixed(1)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    ` : '';

    card.innerHTML = `
        <h2 class="county-name">${county.county}</h2>

        ${alertsHtml}

        <div class="stats-grid">
            <div class="stat ${clearanceVsAvg > 0 ? 'positive' : 'negative'}">
                <div class="stat-label">Clearance Rate</div>
                <div class="stat-value">${county.clearance_rate.toFixed(1)}%</div>
                <div class="stat-secondary">
                    ${clearanceVsAvg > 0 ? '+' : ''}${clearanceVsAvg.toFixed(2)}% vs state avg
                </div>
                <span class="stat-badge">Rank #${county.rank_clearance}</span>
            </div>

            <div class="stat ${dispositionVsAvg > 0 ? 'negative' : 'positive'}">
                <div class="stat-label">Disposition Gap</div>
                <div class="stat-value">${county.disposition_gap.toFixed(1)}%</div>
                <div class="stat-secondary">
                    ${dispositionVsAvg > 0 ? '+' : ''}${dispositionVsAvg.toFixed(2)}% vs state avg
                </div>
                <span class="stat-badge">Rank #${county.rank_disposition}</span>
            </div>

            <div class="stat">
                <div class="stat-label">Records Cleared</div>
                <div class="stat-value">${formatNumber(county.total_records_cleared)}</div>
                <div class="stat-secondary">
                    ${formatNumber(county.arrests_cleared)} arrests, ${formatNumber(county.convictions_cleared)} convictions
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">Total Arrests</div>
                <div class="stat-value">${formatNumber(county.total_arrests)}</div>
                <div class="stat-secondary">on record</div>
            </div>
        </div>

        ${demographicsHtml}

        ${offenseBreakdownHtml}

        ${trendHtml}
    `;

    cardContainer.innerHTML = '';
    cardContainer.appendChild(card);

    // Draw offense chart
    setTimeout(() => {
        drawOffenseChart(county);
    }, 100);

    // Draw trends chart if data exists
    if (countyHistory.length > 0) {
        setTimeout(() => {
            drawTrendsChart(countyHistory);
        }, 150);
    }
}

function drawTrendsChart(historyData) {
    const ctx = document.getElementById('trendsChart');
    if (!ctx) return;

    // Prepare data
    const years = historyData.map(h => h.year);
    const arrestsCleared = historyData.map(h => h.arrests_cleared);
    const convictionsCleared = historyData.map(h => h.convictions_cleared);

    // Destroy existing chart if it exists
    if (window.trendsChartInstance) {
        window.trendsChartInstance.destroy();
    }

    // Create new chart
    window.trendsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Arrests Cleared',
                    data: arrestsCleared,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 8
                },
                {
                    label: 'Convictions Cleared',
                    data: convictionsCleared,
                    borderColor: '#764ba2',
                    backgroundColor: 'rgba(118, 75, 162, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#764ba2',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 12, weight: '600' },
                        padding: 15,
                        usePointStyle: true,
                        color: '#333'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 12,
                    borderRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatNumber(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#666',
                        font: { size: 11 },
                        callback: function(value) {
                            return formatNumber(value);
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#666',
                        font: { size: 11 }
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            }
        }
    });
}

function drawOffenseChart(county) {
    const ctx = document.getElementById('offenseChart');
    if (!ctx) return;

    const categories = ['Felony', 'Misdemeanor', 'Violent Crime', 'Property Crime', 'Drug Offense'];
    const values = [county.felony_total, county.misdemeanor_total, county.violent, county.property, county.drug];

    // Destroy existing chart if it exists
    if (window.offenseChartInstance) {
        window.offenseChartInstance.destroy();
    }

    // Create new chart
    window.offenseChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                {
                    label: 'Total Records',
                    data: values,
                    backgroundColor: '#000',
                    borderColor: '#000',
                    borderWidth: 1,
                    borderRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 12,
                    borderRadius: 0,
                    callbacks: {
                        label: function(context) {
                            return formatNumber(context.parsed.x) + ' records';
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value);
                        },
                        color: '#666',
                        font: { size: 11 }
                    }
                },
                y: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#333',
                        font: { size: 12, weight: '600' }
                    }
                }
            }
        }
    });
}

function formatNumber(num) {
    return num.toLocaleString();
}

// No subtab switching - single page layout

// Populate rankings table
function populateRankingsTable() {
    const sortBy = document.getElementById('sortBy').value;
    let sorted = [...countyData];

    switch(sortBy) {
        case 'rank_clearance':
            sorted.sort((a, b) => a.rank_clearance - b.rank_clearance);
            break;
        case 'clearance_rate_desc':
            sorted.sort((a, b) => b.clearance_rate - a.clearance_rate);
            break;
        case 'disposition_gap':
            sorted.sort((a, b) => a.disposition_gap - b.disposition_gap);
            break;
        case 'total_records_cleared':
            sorted.sort((a, b) => b.total_records_cleared - a.total_records_cleared);
            break;
    }

    const tableHtml = `
        <table class="rankings-table">
            <thead>
                <tr>
                    <th>County</th>
                    <th>Clearance Rate</th>
                    <th>Rank</th>
                    <th>Disposition Gap</th>
                    <th>Alerts</th>
                    <th>Records Cleared</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map((county, idx) => {
                    const hasHighGap = county.disposition_gap > 25;
                    const alertBadge = hasHighGap ? '<span class="badge-warning">⚠️ High Gap</span>' : '';
                    return `
                        <tr class="county-row ${hasHighGap ? 'row-alert' : ''}" onclick="searchForCounty('${county.county}')">
                            <td class="county-cell">${county.county}</td>
                            <td>${county.clearance_rate.toFixed(1)}%</td>
                            <td>#${county.rank_clearance}</td>
                            <td>${county.disposition_gap.toFixed(1)}%</td>
                            <td>${alertBadge}</td>
                            <td>${formatNumber(county.total_records_cleared)}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('rankingsTable').innerHTML = tableHtml;
}

// Handle sort change
document.getElementById('sortBy').addEventListener('change', () => {
    populateRankingsTable();
});

// Click on county to view details
function searchForCounty(countyName) {
    selectCounty(countyName);
    // Show the county details section
    document.getElementById('countyDetailsSection').style.display = 'block';
    // Scroll to the details section
    document.getElementById('countyDetailsSection').scrollIntoView({ behavior: 'smooth' });
}

// Initialize home page
function initializeHome() {
    // Calculate statewide statistics
    const totalRecordsCleared = countyData.reduce((sum, c) => sum + c.total_records_cleared, 0);
    const avgClearanceRate = (countyData.reduce((sum, c) => sum + c.clearance_rate, 0) / countyData.length).toFixed(2);

    // Top performing counties (highest clearance rate) - top 10
    const topCounties = [...countyData]
        .sort((a, b) => b.clearance_rate - a.clearance_rate)
        .slice(0, 10);

    // Worst performing counties (highest disposition gap) - top 10
    const worstCounties = [...countyData]
        .sort((a, b) => b.disposition_gap - a.disposition_gap)
        .slice(0, 10);

    const homeHtml = `
        <div class="home-section">
            <!-- California's Clean Slate Progress - Simple Row -->
            <div style="margin-bottom: 60px;">
                <h3 class="section-title" style="font-size: 1.1rem; margin-bottom: 25px;">California's Clean Slate Progress</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px;">
                    <div style="padding: 20px; background: #f9f9f9; border: 1px solid #e5e5e5;">
                        <div style="font-size: 0.85rem; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;">Total Records Cleared Statewide</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #000; margin-bottom: 4px;">${formatNumber(totalRecordsCleared)}</div>
                        <div style="font-size: 0.85rem; color: #999;">Across all 58 counties</div>
                    </div>
                    <div style="padding: 20px; background: #f9f9f9; border: 1px solid #e5e5e5;">
                        <div style="font-size: 0.85rem; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;">Average Clearance Rate</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #000; margin-bottom: 4px;">${avgClearanceRate}%</div>
                        <div style="font-size: 0.85rem; color: #999;">Of eligible arrests</div>
                    </div>
                    <div style="padding: 20px; background: #f9f9f9; border: 1px solid #e5e5e5;">
                        <div style="font-size: 0.85rem; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;">Counties Tracked</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #000; margin-bottom: 4px;">58</div>
                        <div style="font-size: 0.85rem; color: #999;">Full coverage</div>
                    </div>
                </div>
            </div>

            <!-- Two-Column Layout: Top Performing & Highest Gaps -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
                <!-- Top Performing Counties - Left Column -->
                <div>
                    <h3 class="section-title">Top Performing Counties</h3>
                    <p style="color: #666; margin-bottom: 20px; font-size: 0.95rem;">Highest clearance rates</p>
                    <div class="home-rows-list">
                        ${topCounties.map((county, idx) => `
                            <div class="home-row-item" onclick="searchForCounty('${county.county}')" style="cursor: pointer;">
                                <div style="display: grid; grid-template-columns: 35px 1fr; gap: 12px; align-items: center; padding: 12px 14px; background: white; border: 1px solid #e5e5e5; border-bottom: none; font-size: 0.9rem;">
                                    <div style="font-weight: 900; font-size: 1rem; text-align: center; color: #000;">${idx + 1}</div>
                                    <div>
                                        <div style="font-weight: 700; color: #000; margin-bottom: 3px;">${county.county}</div>
                                        <div style="font-size: 0.8rem; color: #666;">Clearance: <span style="font-weight: 600; color: #000;">${county.clearance_rate.toFixed(1)}%</span></div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        <div style="border: 1px solid #e5e5e5; border-top: none;"></div>
                    </div>
                </div>

                <!-- Counties with Highest Disposition Gaps - Right Column -->
                <div>
                    <h3 class="section-title">Highest Disposition Gaps</h3>
                    <p style="color: #666; margin-bottom: 20px; font-size: 0.95rem;">Longest case delays</p>
                    <div class="home-rows-list">
                        ${worstCounties.map((county, idx) => `
                            <div class="home-row-item" onclick="searchForCounty('${county.county}')" style="cursor: pointer;">
                                <div style="display: grid; grid-template-columns: 35px 1fr; gap: 12px; align-items: center; padding: 12px 14px; background: white; border: 1px solid #e5e5e5; border-bottom: none; font-size: 0.9rem;">
                                    <div style="font-weight: 900; font-size: 1rem; text-align: center; color: #000;">${idx + 1}</div>
                                    <div>
                                        <div style="font-weight: 700; color: #000; margin-bottom: 3px;">${county.county}</div>
                                        <div style="font-size: 0.8rem; color: #666;">Gap: <span style="font-weight: 600; color: #c00;">${county.disposition_gap.toFixed(1)}%</span></div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        <div style="border: 1px solid #e5e5e5; border-top: none;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const homeContentElement = document.getElementById('homeContent');
    if (homeContentElement) {
        homeContentElement.innerHTML = homeHtml;
    } else {
        console.error('homeContent element not found');
    }
}

// Initialize on page load
async function initializeApp() {
    await loadData();
    // Initialize the overview and rankings on load
    initializeHome();
    populateRankingsTable();
    // Scroll to top to show overview
    window.scrollTo(0, 0);
}

initializeApp();

// Subtab navigation
const subtabButtons = document.querySelectorAll('.subtab-btn');
const subtabContents = document.querySelectorAll('.subtab-content');

subtabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const subtab = btn.dataset.subtab;

        // Update active button
        subtabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active content
        subtabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(subtab + 'Subtab').classList.add('active');

        // Scroll to top
        window.scrollTo(0, 0);
    });
});
