const { useState, useMemo, useEffect, useCallback } = React;

// --- HELPERS ---

// FIX: Helper to parse UK dates (DD/MM/YYYY) correctly
const parseSheetDate = (dateStr) => {
    if (!dateStr) return null;
    // Check for DD/MM/YYYY format
    const ukDatePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/; 
    const match = String(dateStr).match(ukDatePattern);
    if (match) {
        return new Date(match[3], match[2] - 1, match[1]);
    }
    // Fallback for standard ISO or US dates
    return new Date(dateStr);
};

const isDateInRange = (dateStr, startDate, endDate) => {
    const checkDate = parseSheetDate(dateStr);
    if (!checkDate || isNaN(checkDate.getTime())) return false;
    
    // Normalize time to midnight for fair comparison
    const check = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    return check >= start && check <= end;
};

// --- COMPONENTS ---

const MonthSelector = ({ selectedMonth, onMonthChange, availableMonths }) => {
    return (
        <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">View Period:</label>
            <select
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
                {availableMonths.map(month => (
                    <option key={month.value} value={month.value}>
                        {month.label} {month.isCurrent ? '(Current)' : ''}
                    </option>
                ))}
            </select>
            {selectedMonth !== 'current' && (
                <span className="text-xs text-gray-500 italic">Viewing historical data</span>
            )}
        </div>
    );
};

const KPIScorecard = ({ label, value, unit, trend, performance, icon, invertTrend = false, previousValue = null }) => {
    const getPerformanceColor = () => {
        switch(performance) {
            case 'excellent': return 'text-green-600 bg-green-50 border-green-200';
            case 'good': return 'text-blue-600 bg-blue-50 border-blue-200';
            case 'average': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'poor': return 'text-red-600 bg-red-50 border-red-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };
    const getTrendColor = () => {
        if (!trend) return 'text-gray-400';
        const isPositive = invertTrend ? trend < 0 : trend > 0;
        return isPositive ? 'text-green-600 trend-positive' : 'text-red-600 trend-negative';
    };
    const getTrendIcon = () => (!trend ? '→' : trend > 0 ? '↑' : '↓');
    
    return (
        <div className={`kpi-badge p-3 rounded-lg border ${getPerformanceColor()} transition-all hover:shadow-md`}>
            <div className="flex items-start justify-between mb-1">
                <div className="flex items-center">
                    <span className="text-lg mr-2">{icon}</span>
                    <div className="text-xs font-medium opacity-75">{label}</div>
                </div>
                {trend != null && (
                    <span className={`text-sm font-bold ${getTrendColor()}`}>
                        <span className={`trend-arrow ${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}`}>{getTrendIcon()}</span>
                        {Math.abs(trend).toFixed(0)}%
                    </span>
                )}
            </div>
            <div className="flex items-baseline">
                <span className="text-xl font-bold">{value}</span>
                {unit && <span className="text-xs ml-1 opacity-75">{unit}</span>}
            </div>
            {previousValue && <div className="text-xs opacity-60 mt-1">vs {previousValue} prev</div>}
        </div>
    );
};

const GaugeChart = ({ value, maxValue, color, label, displayValue }) => {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const percentage = Math.min(value / maxValue, 1);
    const strokeDashoffset = circumference - (percentage * circumference);

    return (
        <div className="relative bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-center mb-2"><div className="text-xs font-medium text-gray-600">{label}</div></div>
            <div className="gauge-chart mx-auto">
                <svg className="gauge-svg" width="120" height="120">
                    <circle cx="60" cy="60" r={radius} className="gauge-bg" />
                    <circle cx="60" cy="60" r={radius} className="gauge-fill"
                        style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: strokeDashoffset }} />
                </svg>
                <div className="gauge-text">
                    <div className="text-lg font-bold" style={{ color }}>{displayValue}</div>
                    <div className="text-xs text-gray-500">{label.split(' ')[0]}</div>
                </div>
            </div>
        </div>
    );
};

const BudgetAdjustmentCard = ({ client }) => {
    if (client.isHistorical) {
        const hitTarget = client.used <= 105 && client.used >= 95;
        const underBudget = client.used < 95;
        return (
            <div className={`mt-4 p-4 rounded-lg border ${hitTarget ? 'bg-green-50 border-green-200' : underBudget ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-bold text-sm">{hitTarget ? '✅ Target Hit' : underBudget ? '📉 Under Budget' : '📈 Over Budget'}</div>
                        <div className="text-xs opacity-75">Final spend: £{client.total.toFixed(0)} of £{client.budget}</div>
                    </div>
                    <div className="text-lg font-bold">{underBudget ? `-£${(client.budget - client.total).toFixed(0)}` : hitTarget ? 'On Target' : `+£${(client.total - client.budget).toFixed(0)}`}</div>
                </div>
            </div>
        );
    }
    
    // Budget Logic
    const calculateLogic = () => {
        if (client.daysLeft <= 0) return { recommended: 0, change: 0, urgency: "normal", message: "Period ended" };
        
        const remaining = client.budget - client.total;
        const targetDaily = Math.max(0, remaining / client.daysLeft);
        const change = targetDaily - client.currentDailyBudget;
        
        // Critical check: If already over budget
        if (client.total >= client.budget) {
            return { recommended: 0, change: -client.currentDailyBudget, urgency: "critical", message: "Over budget - Pause campaigns" };
        }

        const pctChange = client.currentDailyBudget > 0 ? (change / client.currentDailyBudget) * 100 : 0;
        let urgency = Math.abs(pctChange) < 5 ? "good" : change > 0 ? "increase" : "decrease";
        let message = urgency === "good" ? "Budget close to optimal" : 
                      urgency === "increase" ? `Increase to hit target` : `Decrease to avoid overspend`;

        return { recommended: targetDaily, change, pctChange, urgency, message };
    };
    
    const adj = calculateLogic();
    const totalCurrent = client.googleDailyBudget + client.facebookDailyBudget;
    
    // Platform split logic
    let recGoogle = 0, recFB = 0;
    if (totalCurrent > 0) {
        recGoogle = adj.recommended * (client.googleDailyBudget / totalCurrent);
        recFB = adj.recommended * (client.facebookDailyBudget / totalCurrent);
    } else {
        // Fallback if no current budget detected
        if (client.name === 'Brandon Trust') recFB = adj.recommended;
        else { recGoogle = adj.recommended / 2; recFB = adj.recommended / 2; }
    }

    if (client.status === 'ON TRACK') {
        return (
            <div className="mt-4 p-4 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center text-green-800">
                <span className="text-lg mr-2">✅</span>
                <div><div className="font-bold">On Track</div><div className="text-sm">Daily spend is optimal</div></div>
            </div>
        );
    }

    const urgencyColors = { critical: 'bg-red-50 text-red-900', increase: 'bg-blue-50 text-blue-900', decrease: 'bg-orange-50 text-orange-900', good: 'bg-gray-50' };
    
    return (
        <div className={`mt-4 p-4 rounded-lg border-2 ${urgencyColors[adj.urgency] || 'bg-gray-50'}`}>
            <div className="flex justify-between mb-3">
                <div className="flex items-center">
                    <span className="text-xl mr-2">{adj.urgency === 'critical' ? '🚨' : adj.urgency === 'increase' ? '📈' : '📉'}</span>
                    <div><div className="font-bold text-sm">Adjustment Needed</div><div className="text-xs opacity-75">{adj.message}</div></div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div className="text-xs opacity-75 mb-1">TOTAL DAILY</div>
                    <div className="flex justify-between"><span>Current:</span><span className="font-bold">£{client.currentDailyBudget.toFixed(0)}/day</span></div>
                    <div className="flex justify-between"><span>Rec:</span><span className="font-bold">£{adj.recommended.toFixed(0)}/day</span></div>
                    <div className="flex justify-between border-t pt-1 mt-1"><span>Change:</span><span className="font-bold text-blue-700">{adj.change > 0 ? '+' : ''}£{adj.change.toFixed(0)}</span></div>
                </div>
                <div>
                    <div className="text-xs opacity-75 mb-1">PLATFORMS</div>
                    {(recGoogle > 0 || client.googleDailyBudget > 0) && (
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-orange-600">Google:</span>
                            <div className="text-right">
                                <div>£{recGoogle.toFixed(0)}/day</div>
                                <div className="opacity-75">({(recGoogle - client.googleDailyBudget) > 0 ? '+' : ''}£{(recGoogle - client.googleDailyBudget).toFixed(0)})</div>
                            </div>
                        </div>
                    )}
                    {(recFB > 0 || client.facebookDailyBudget > 0) && (
                        <div className="flex justify-between text-xs">
                            <span className="text-purple-600">Meta:</span>
                            <div className="text-right">
                                <div>£{recFB.toFixed(0)}/day</div>
                                <div className="opacity-75">({(recFB - client.facebookDailyBudget) > 0 ? '+' : ''}£{(recFB - client.facebookDailyBudget).toFixed(0)})</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ClientCard = ({ client }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    const getKPIData = () => {
        let label = 'Conversions', val = client.conversions || 0, icon = '🎯';
        
        if (client.name.includes('HC-One')) {
            if (client.name.includes('Nursing')) { label = 'Nurse Apps'; val = client.nursingConversions; icon = '👩‍⚕️'; }
            else { label = 'Care Apps'; val = client.careConversions; icon = '🏥'; }
        } else if (client.name === 'Brandon Trust') {
            label = 'Support Worker Apps'; val = client.careConversions; icon = '📝';
        }
        
        const cpa = val > 0 ? (client.total / val).toFixed(2) : 'N/A';
        const ctr = client.ctr || '0.00';
        
        // Performance Logic
        const getPerf = (v, type) => {
            if (type === 'conv') return v > 50 ? 'excellent' : v > 15 ? 'good' : 'poor';
            if (type === 'ctr') return v > 2 ? 'excellent' : v > 1 ? 'good' : 'poor';
            if (type === 'cpa') return v !== 'N/A' && parseFloat(v) < 50 ? 'good' : 'poor';
            return 'average';
        };

        return {
            conv: { label, value: val, icon, performance: getPerf(val, 'conv') },
            cpa: { label: 'Cost Per App', value: cpa === 'N/A' ? cpa : `£${cpa}`, icon: '💰', performance: getPerf(cpa, 'cpa') },
            ctr: { label: 'CTR', value: ctr, unit: '%', icon: '👆', performance: getPerf(parseFloat(ctr), 'ctr') }
        };
    };

    const kpis = getKPIData();

    return (
        <div className={`border-2 rounded-xl p-6 transition-all hover:shadow-lg ${client.status === 'HOT' ? 'border-red-200' : 'border-green-200 bg-white'}`}>
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="font-bold text-lg text-gray-900">{client.name}</h3>
                    <div className="text-sm text-gray-500">{client.period}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold ${client.status === 'HOT' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {client.status}
                </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
                <GaugeChart value={client.used} maxValue={100} color={client.used > 90 ? '#EF4444' : '#10B981'} label="Budget Usage" displayValue={`${client.used.toFixed(0)}%`} />
                <div className="relative bg-white p-4 rounded-lg border border-gray-200 text-center flex flex-col justify-center">
                   <div className="text-xs text-gray-500 mb-2">Spending Pace</div>
                   <div className="text-2xl font-bold">{client.status === 'COLD' ? '🧊' : client.status === 'HOT' ? '🔥' : '✅'}</div>
                   <div className="text-xs font-bold mt-1 text-gray-400">{client.status}</div>
                </div>
                <GaugeChart value={(client.projectedSpend / client.budget) * 100} maxValue={130} color="#3B82F6" label="Projected" displayValue={`£${client.projectedSpend.toFixed(0)}`} />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
                <KPIScorecard {...kpis.conv} />
                <KPIScorecard {...kpis.cpa} />
                <KPIScorecard {...kpis.ctr} />
            </div>

            <BudgetAdjustmentCard client={client} />

            <div className="mt-4 pt-4 border-t">
                <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center text-sm text-gray-500 hover:text-gray-900">
                    <span className="mr-2">Details</span>
                    <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {isExpanded && (
                    <div className="mt-3 space-y-2 text-sm text-gray-600 animate-in fade-in">
                        <div className="flex justify-between"><span>Total Spend:</span><span className="font-bold">£{client.total.toFixed(0)}</span></div>
                        <div className="flex justify-between"><span>Days Left:</span><span>{client.daysLeft}</span></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ClientBudgetTable = () => {
    const [rawData, setRawData] = useState({});
    const [conversionData, setConversionData] = useState({});
    const [configData, setConfigData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState('current');

    const PROXY_URL = 'https://sheets-proxy-ria9.vercel.app/api/sheets-proxy';
    const SPREADSHEET_ID = '1nbVrRxhIh2RLa5qtOsaM1N_UmqljztVwxPbQRCnkBcs';
    const API_KEY = 'AIzaSyDffl5VtZDXxAMJ-Cnbay7CbO-PPfF42fI';

    // --- DATE & CONFIG HELPERS ---
    const getDates = (type, monthStr) => {
        const today = new Date();
        const isCurrent = monthStr === 'current';
        let year = today.getFullYear();
        let month = today.getMonth(); // 0-11
        
        if (!isCurrent) {
            const parts = monthStr.split('-');
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
        }

        const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Calculations for specific client periods
        if (type === 'apollo') {
            // 26th of previous month to 25th of current
            // If current day >= 26, we are in current month period. If < 26, we are in prev month period
            // Logic for historical is straightforward
            let startM = month - 1, endM = month;
            let startY = year, endY = year;
            
            if (isCurrent && today.getDate() >= 26) {
                 startM = month; endM = month + 1;
            } else if (isCurrent) {
                 // default logic holds (prev 26 to curr 25)
            }
            
            if (startM < 0) { startM = 11; startY--; }
            if (endM > 11) { endM = 0; endY++; }
            
            return {
                label: `${mNames[startM]} 26 - ${mNames[endM]} 25`,
                start: new Date(startY, startM, 26),
                end: new Date(endY, endM, 25)
            };
        } 
        else if (type === 'hc1') {
            // 11th to 10th
            let startM = month - 1, endM = month;
            let startY = year, endY = year;
            
            if (isCurrent && today.getDate() >= 11) {
                startM = month; endM = month + 1;
            }
            
            if (startM < 0) { startM = 11; startY--; }
            if (endM > 11) { endM = 0; endY++; }

            return {
                label: `${mNames[startM]} 11 - ${mNames[endM]} 10`,
                start: new Date(startY, startM, 11),
                end: new Date(endY, endM, 10)
            };
        }
        else if (type === 'brandon') {
            // 21st to 20th
            let startM = month - 1, endM = month;
            let startY = year, endY = year;

            if (isCurrent && today.getDate() >= 21) {
                startM = month; endM = month + 1;
            }

            if (startM < 0) { startM = 11; startY--; }
            if (endM > 11) { endM = 0; endY++; }

            return {
                label: `${mNames[startM]} 21 - ${mNames[endM]} 20`,
                start: new Date(startY, startM, 21),
                end: new Date(endY, endM, 20)
            };
        }
        
        // Standard (1st to last)
        const lastDay = new Date(year, month + 1, 0).getDate();
        return {
            label: `${mNames[month]} 1 - ${mNames[month]} ${lastDay}`,
            start: new Date(year, month, 1),
            end: new Date(year, month, lastDay)
        };
    };

    // Load Configuration
    const loadConfig = async () => {
        try {
            const url = `${PROXY_URL}?spreadsheetId=${SPREADSHEET_ID}&range=Config!A:F&apiKey=${API_KEY}`;
            const res = await fetch(url);
            const json = await res.json();
            
            const newConfig = {};
            json.values.slice(1).forEach(row => {
                const [name, budget, type, prefix, skip, camps] = row;
                const dateInfo = getDates(type, selectedMonth);
                
                newConfig[name] = {
                    name,
                    budget: parseFloat(budget.replace(/,/g, '')),
                    tabPrefix: prefix || name,
                    skipTabs: skip === 'TRUE',
                    campaigns: camps ? camps.split(',').map(c=>c.trim()) : [],
                    ...dateInfo
                };
            });
            setConfigData(newConfig);
            return newConfig;
        } catch (e) { setError("Config Error"); setConfigLoading(false); return null; }
    };

    // Load Data
    const loadData = async (cfg) => {
        if (!cfg) return;
        setLoading(true);
        const allData = {}, allConv = {};
        
        // Build tab list
        const tabs = new Set();
        const convTabs = new Set();
        Object.values(cfg).forEach(c => {
            if (!c.skipTabs) {
                tabs.add(`${c.tabPrefix} Google`);
                tabs.add(`${c.tabPrefix} FB`);
                convTabs.add(`${c.tabPrefix} Google Conversions`);
            }
        });

        // Fetch helper
        const fetchTab = async (tab, isConv = false) => {
            try {
                const range = isConv ? `${tab}!A:E` : (tab.includes('FB') ? `${tab}!A:H` : `${tab}!A:F`);
                const res = await fetch(`${PROXY_URL}?spreadsheetId=${SPREADSHEET_ID}&range=${encodeURIComponent(range)}&apiKey=${API_KEY}`);
                const json = await res.json();
                if (json.values) {
                    const headers = json.values[0];
                    return json.values.slice(1).map(r => {
                        const obj = {};
                        headers.forEach((h, i) => obj[h] = r[i]);
                        return obj;
                    });
                }
            } catch (e) { console.log(e); }
            return [];
        };

        // Execute fetches
        await Promise.all([...tabs].map(async t => allData[t] = await fetchTab(t)));
        await Promise.all([...convTabs].map(async t => allConv[t] = await fetchTab(t, true)));

        setRawData(allData);
        setConversionData(allConv);
        setLoading(false);
        setConfigLoading(false);
    };

    useEffect(() => { loadConfig().then(c => loadData(c)); }, [selectedMonth]);

    // Process Data
    const processed = useMemo(() => {
        if (!configData || !rawData) return [];
        const today = new Date();

        return Object.values(configData).map(client => {
            let total = 0, gSpend = 0, fbSpend = 0, careApps = 0, nurseApps = 0, totalCTR = 0, ctrCount = 0;
            let gDaily = 0, fbDaily = 0;

            // Process Google
            const gRows = rawData[`${client.tabPrefix} Google`] || [];
            let lastGDate = null;
            
            gRows.forEach(row => {
                const d = row.Date;
                if (isDateInRange(d, client.start, client.end)) {
                    // Spend
                    const cost = parseFloat(row.Cost || 0);
                    gSpend += cost;
                    
                    // CTR
                    const ctr = parseFloat((row.CTR || '0').replace('%',''));
                    if (ctr > 0) { totalCTR += ctr; ctrCount++; }

                    // Capture Latest Daily Budget
                    const rDate = parseSheetDate(d);
                    const daily = parseFloat(row.DailyBudget || row['Budget Amount'] || 0);
                    if (rDate && daily > 0) {
                        if (!lastGDate || rDate >= lastGDate) {
                             lastGDate = rDate;
                             gDaily = Math.max(gDaily, daily); // Assume max of active campaigns on last day
                        }
                    }
                }
            });

            // Process FB
            const fbRows = rawData[`${client.tabPrefix} FB`] || [];
            let lastFBDate = null;
            let fbDailyMap = new Map();

            fbRows.forEach(row => {
                const d = row.Date;
                if (isDateInRange(d, client.start, client.end)) {
                    // Spend
                    const cost = parseFloat(row['Amount spent (GBP)'] || row['Amount spent'] || row.Cost || 0);
                    fbSpend += cost;

                    // CTR
                    const ctr = parseFloat((row['CTR (Link click-through rate)'] || row.CTR || '0').replace('%',''));
                    if (ctr > 0) { totalCTR += ctr; ctrCount++; }

                    // Conversions (Support Worker included here)
                    const care = parseFloat(row['Event conversion Care Application'] || row.CareApplications || 0);
                    const support = parseFloat(row['Event conversion Support Worker Application'] || 0);
                    const nurse = parseFloat(row['Event conversion Nurse Application'] || row.NursingApplications || 0);
                    
                    careApps += (care + support);
                    nurseApps += nurse;

                    // Capture Latest Daily Budget (Sum of adsets)
                    const rDate = parseSheetDate(d);
                    const daily = parseFloat(row['Adset daily budget'] || row.DailyBudget || 0);
                    if (rDate && daily > 0) {
                        if (!lastFBDate || rDate > lastFBDate) {
                            lastFBDate = rDate;
                            fbDailyMap.clear();
                            fbDailyMap.set(row['Adset name'], daily);
                        } else if (rDate.getTime() === lastFBDate.getTime()) {
                            fbDailyMap.set(row['Adset name'], daily);
                        }
                    }
                }
            });
            
            // Sum FB Daily Budgets
            fbDailyMap.forEach(v => fbDaily += v);

            // Process Google Conversions separately
            const gConvRows = conversionData[`${client.tabPrefix} Google Conversions`] || [];
            gConvRows.forEach(row => {
                 if (isDateInRange(row.Date, client.start, client.end)) {
                      // Heuristic to sum conversions
                      Object.keys(row).forEach(k => {
                          const val = parseFloat(row[k] || 0);
                          if (val > 0) {
                              if (k.toLowerCase().includes('nurse')) nurseApps += val;
                              else careApps += val; 
                          }
                      });
                 }
            });

            total = gSpend + fbSpend;
            const daysTotal = Math.ceil((client.end - client.start) / 86400000);
            const daysElapsed = Math.min(daysTotal, Math.ceil((today - client.start) / 86400000));
            const daysLeft = Math.max(0, daysTotal - daysElapsed);

            // Projection
            const dailyAvg = daysElapsed > 0 ? total / daysElapsed : 0;
            const projected = total + (dailyAvg * daysLeft);
            
            // Status
            const usedPct = (total / client.budget) * 100;
            const projPct = (projected / client.budget) * 100;
            let status = 'ON TRACK';
            if (projPct > 105) status = 'HOT';
            else if (projPct < 95) status = 'COLD';
            if (total >= client.budget) status = 'OVER BUDGET';

            return {
                ...client,
                total,
                used: usedPct,
                status,
                projectedSpend: projected,
                daysLeft,
                googleDailyBudget: gDaily,
                facebookDailyBudget: fbDaily,
                currentDailyBudget: gDaily + fbDaily,
                careConversions: careApps,
                nursingConversions: nurseApps,
                conversions: careApps + nurseApps,
                ctr: ctrCount > 0 ? (totalCTR / ctrCount).toFixed(2) : "0.00"
            };
        });
    }, [configData, rawData, conversionData]);

    return (
        <div className="w-full min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Client Budget Dashboard</h1>
                    <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} availableMonths={[{value:'current', label:'Current'}]} />
                </div>
                {loading && <div className="text-center text-blue-600 animate-pulse">Loading data...</div>}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {processed.map(c => <ClientCard key={c.name} client={c} />)}
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ClientBudgetTable />);
