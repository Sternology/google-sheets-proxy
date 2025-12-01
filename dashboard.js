const { useState, useMemo, useEffect, useCallback } = React;

// --- HELPERS ---

// Robust Date Parser: Handles the formats seen in your Excel file
const parseSheetDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).trim();
    
    // Format 1: 2025-01-01 (ISO - seen in your file)
    const isoMatch = cleanStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (isoMatch) {
        return new Date(isoMatch[1], isoMatch[2] - 1, isoMatch[3]);
    }

    // Format 2: 01/01/2025 (UK)
    const ukMatch = cleanStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (ukMatch) {
        return new Date(ukMatch[3], ukMatch[2] - 1, ukMatch[1]);
    }

    const d = new Date(cleanStr);
    return isNaN(d.getTime()) ? null : d;
};

// Date Range Checker
const isDateInRange = (dateObj, startDate, endDate) => {
    if (!dateObj || isNaN(dateObj.getTime())) return false;
    const check = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return check >= start && check <= end;
};

// --- DATA MAPPING ---

const mapRow = (headers, row) => {
    const rowObj = {
        Date: null,
        Cost: 0,
        CTR: 0,
        DailyBudget: 0,
        CareApps: 0,
        NurseApps: 0,
        SupportApps: 0,
        Adset: ''
    };

    headers.forEach((h, i) => {
        if (!h || !row[i]) return;
        const header = h.trim();
        const headerLower = header.toLowerCase();
        const val = row[i];

        // 1. DATE
        if (headerLower === 'date' || headerLower === 'day') {
            rowObj.Date = parseSheetDate(val);
        }
        // 2. ADSET (for deduplication)
        else if (headerLower === 'adset name') {
            rowObj.Adset = val;
        }
        // 3. METRICS (Parse numbers)
        else {
            const num = parseFloat(String(val).replace(/[%£$,]/g, ''));
            if (!isNaN(num)) {
                
                // SPEND
                if (header === 'Amount spent (GBP)' || header === 'Cost') {
                    rowObj.Cost = num;
                }
                // BUDGET
                else if (header === 'Adset daily budget' || header === 'Budget Amount') {
                    rowObj.DailyBudget = num;
                }
                // CTR
                else if (headerLower.includes('ctr')) {
                    rowObj.CTR = num;
                }
                // CONVERSIONS (Specific Logic for your columns)
                // Looks for "Care" and "Application" or specific exact headers
                else if (headerLower.includes('application') || headerLower.includes('conversion')) {
                    
                    // Exclude "Cost per" columns
                    if (!headerLower.includes('cost') && !headerLower.includes('rate')) {
                        
                        if (headerLower.includes('nurse') || header.includes('Nursing')) {
                            rowObj.NurseApps = num;
                        } else if (header.includes('Support Worker')) {
                            rowObj.SupportApps = num;
                        } else if (header.includes('Care') || headerLower.includes('care')) {
                            rowObj.CareApps = num;
                        }
                    }
                }
            }
        }
    });
    return rowObj;
};

// --- COMPONENTS ---

const KPIScorecard = ({ label, value, unit, performance, icon }) => {
    const colors = {
        excellent: 'text-green-600 bg-green-50 border-green-200',
        good: 'text-blue-600 bg-blue-50 border-blue-200',
        average: 'text-yellow-600 bg-yellow-50 border-yellow-200',
        poor: 'text-red-600 bg-red-50 border-red-200'
    };
    const style = colors[performance] || 'text-gray-600 bg-gray-50 border-gray-200';

    return (
        <div className={`p-3 rounded-lg border ${style} shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{icon}</span>
                <span className="text-xs font-medium opacity-75 uppercase tracking-wide">{label}</span>
            </div>
            <div className="text-2xl font-bold">
                {value}<span className="text-sm font-normal ml-1 opacity-75">{unit}</span>
            </div>
        </div>
    );
};

const GaugeChart = ({ value, label, subLabel, color }) => {
    const pct = Math.min(Math.max(value, 0), 100); 
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (pct / 100) * circumference;
    
    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
            <div className="text-xs font-medium text-gray-500 mb-2 uppercase">{label}</div>
            <div className="relative w-[120px] h-[120px] mx-auto">
                <svg className="w-full h-full -rotate-90">
                    <circle cx="60" cy="60" r="45" fill="none" stroke="#f3f4f6" strokeWidth="12" />
                    <circle cx="60" cy="60" r="45" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" 
                            style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: 'stroke-dashoffset 0.8s ease-out' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-gray-800">{subLabel}</span>
                </div>
            </div>
        </div>
    );
};

const BudgetAdjustmentCard = ({ client }) => {
    if (client.isHistorical) {
        const diff = client.total - client.budget;
        const isOver = diff > 0;
        return (
            <div className={`mt-4 p-4 rounded-lg border ${isOver ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex justify-between items-center">
                    <div>
                        <div className="font-bold text-sm">{isOver ? 'Over Budget' : 'Under Budget'}</div>
                        <div className="text-xs opacity-75">Spent £{client.total.toFixed(0)} of £{client.budget}</div>
                    </div>
                    <div className={`text-lg font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                        {diff > 0 ? '+' : ''}£{diff.toFixed(0)}
                    </div>
                </div>
            </div>
        );
    }

    const remaining = client.budget - client.total;
    const targetDaily = Math.max(0, remaining / client.daysLeft);
    const change = targetDaily - client.currentDailyBudget;
    
    let status = 'normal';
    let msg = 'Adjust daily spend';
    
    if (client.total >= client.budget) {
        status = 'critical'; msg = 'Budget Exhausted - Pause Now';
    } else if (Math.abs(change) < 2) {
        status = 'optimal'; msg = 'Spend is optimal';
    } else if (change > 0) {
        status = 'increase'; msg = 'Increase spend to hit target';
    } else {
        status = 'decrease'; msg = 'Reduce spend to avoid overspend';
    }

    const styles = {
        critical: 'bg-red-50 border-red-300 text-red-900',
        optimal: 'bg-green-50 border-green-300 text-green-900',
        normal: 'bg-blue-50 border-blue-300 text-blue-900',
        increase: 'bg-blue-50 border-blue-300 text-blue-900',
        decrease: 'bg-orange-50 border-orange-300 text-orange-900'
    }[status];

    const totalDaily = client.googleDailyBudget + client.facebookDailyBudget;
    let recGoogle = 0, recFB = 0;
    
    if (client.name === 'Brandon Trust') {
        recFB = targetDaily;
    } else if (totalDaily > 0) {
        const ratio = client.googleDailyBudget / totalDaily;
        recGoogle = targetDaily * ratio;
        recFB = targetDaily * (1 - ratio);
    } else {
        recGoogle = targetDaily / 2;
        recFB = targetDaily / 2;
    }

    return (
        <div className={`mt-4 p-4 rounded-lg border-2 ${styles}`}>
            <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{status === 'critical' ? '🚨' : status === 'optimal' ? '✅' : '⚙️'}</span>
                <div>
                    <div className="font-bold text-sm">Recommendation</div>
                    <div className="text-xs opacity-75">{msg}</div>
                </div>
            </div>
            
            {status !== 'optimal' && status !== 'critical' && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <div className="text-xs opacity-75 mb-1 font-bold">TOTAL DAILY TARGET</div>
                        <div className="flex justify-between"><span>Current:</span><span className="font-mono">£{client.currentDailyBudget.toFixed(0)}</span></div>
                        <div className="flex justify-between"><span>Target:</span><span className="font-mono font-bold">£{targetDaily.toFixed(0)}</span></div>
                        <div className="flex justify-between border-t border-current pt-1 mt-1 opacity-90">
                            <span>Change:</span>
                            <span className="font-bold">{change > 0 ? '+' : ''}£{change.toFixed(0)}</span>
                        </div>
                    </div>
                    <div>
                         <div className="text-xs opacity-75 mb-1 font-bold">PLATFORM SPLIT</div>
                         {recGoogle > 0 && <div className="flex justify-between text-xs"><span className="text-orange-700 font-medium">Google:</span><span className="font-mono">£{recGoogle.toFixed(0)}</span></div>}
                         {recFB > 0 && <div className="flex justify-between text-xs"><span className="text-purple-700 font-medium">Meta:</span><span className="font-mono">£{recFB.toFixed(0)}</span></div>}
                    </div>
                </div>
            )}
        </div>
    );
};

const ClientCard = ({ client }) => {
    const [expanded, setExpanded] = useState(false);
    
    // KPI Data Assembly
    let kpiName = 'Conversions';
    let kpiVal = client.conversions;
    let kpiIcon = '🎯';

    if (client.name.includes('Nursing')) { kpiName = 'Nurse Apps'; kpiVal = client.nursingConversions; kpiIcon = '👩‍⚕️'; }
    else if (client.name.includes('Brandon')) { kpiName = 'Support Apps'; kpiVal = client.supportConversions + client.careConversions; kpiIcon = '📝'; }
    else if (client.name.includes('Care') || client.name.includes('HC-One')) { kpiName = 'Care Apps'; kpiVal = client.careConversions; kpiIcon = '🏥'; }

    const cpa = kpiVal > 0 ? client.total / kpiVal : 0;
    
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="font-bold text-lg text-gray-900">{client.name}</h3>
                    <div className="text-xs text-gray-500 mt-1">{client.periodLabel}</div>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-bold ${
                    client.status === 'HOT' ? 'bg-red-100 text-red-800' : 
                    client.status === 'COLD' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                    {client.status}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
                <GaugeChart 
                    label="Budget Usage" 
                    value={client.pctUsed} 
                    subLabel={`${client.pctUsed.toFixed(0)}%`} 
                    color={client.pctUsed > 100 ? '#EF4444' : '#10B981'} 
                />
                
                <div className="bg-white p-4 rounded-lg border border-gray-200 text-center flex flex-col justify-center">
                    <div className="text-xs text-gray-500 mb-2 uppercase">PACE</div>
                    <div className="text-3xl">{client.status === 'HOT' ? '🔥' : client.status === 'COLD' ? '🧊' : '✅'}</div>
                </div>

                <GaugeChart 
                    label="Projected" 
                    value={(client.projected / client.budget) * 100} 
                    subLabel={`£${client.projected.toFixed(0)}`} 
                    color="#3B82F6" 
                />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
                <KPIScorecard label={kpiName} value={Math.floor(kpiVal)} icon={kpiIcon} performance="average" />
                <KPIScorecard label="CPA" value={cpa ? `£${cpa.toFixed(2)}` : 'N/A'} icon="💰" performance={cpa < 50 ? 'good' : 'average'} />
                <KPIScorecard label="CTR" value={`${client.ctr.toFixed(2)}`} unit="%" icon="👆" performance={client.ctr > 1 ? 'good' : 'average'} />
            </div>

            <BudgetAdjustmentCard client={client} />
            
            <button onClick={() => setExpanded(!expanded)} className="w-full mt-4 pt-4 border-t text-sm text-gray-500 hover:text-gray-800 flex justify-between items-center group">
                <span className="group-hover:underline">View Details</span>
                <span>{expanded ? '▲' : '▼'}</span>
            </button>
            
            {expanded && (
                <div className="mt-3 space-y-2 text-sm text-gray-600 bg-gray-50 p-3 rounded border border-gray-100">
                    <div className="flex justify-between"><span>Total Spend:</span><span className="font-mono font-bold">£{client.total.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Monthly Budget:</span><span className="font-mono">£{client.budget}</span></div>
                    <div className="flex justify-between"><span>Days Left:</span><span className="font-mono">{client.daysLeft}</span></div>
                </div>
            )}
        </div>
    );
};

// --- MAIN APP ---

const Dashboard = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [month, setMonth] = useState('current');
    
    const PROXY = 'https://sheets-proxy-ria9.vercel.app/api/sheets-proxy';
    const SHEET_ID = '1nbVrRxhIh2RLa5qtOsaM1N_UmqljztVwxPbQRCnkBcs';
    const KEY = 'AIzaSyDffl5VtZDXxAMJ-Cnbay7CbO-PPfF42fI';

    const getPeriodDates = (type, selectedMonth) => {
        const now = new Date();
        let y = now.getFullYear(), m = now.getMonth();
        if (selectedMonth !== 'current') {
            const parts = selectedMonth.split('-');
            y = parseInt(parts[0]);
            m = parseInt(parts[1]) - 1;
        }

        const makeDate = (d) => new Date(y, m, d);
        const makePrevDate = (d) => new Date(y, m - 1, d); 

        if (type === 'apollo') {
            // 26th prev - 25th curr
            if (selectedMonth === 'current' && now.getDate() >= 26) {
                return { start: makeDate(26), end: new Date(y, m + 1, 25) };
            }
            return { start: makePrevDate(26), end: makeDate(25) };
        }
        if (type === 'brandon') {
             // 21st prev - 20th curr
            if (selectedMonth === 'current' && now.getDate() >= 21) {
                return { start: makeDate(21), end: new Date(y, m + 1, 20) };
            }
            return { start: makePrevDate(21), end: makeDate(20) };
        }
        if (type === 'hc1') {
            // 11th prev - 10th curr
            if (selectedMonth === 'current' && now.getDate() >= 11) {
                 return { start: makeDate(11), end: new Date(y, m + 1, 10) };
            }
            return { start: makePrevDate(11), end: makeDate(10) };
        }

        // Standard 1st - Last
        return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
    };

    const load = async () => {
        setLoading(true);
        try {
            // 1. Config
            const cfgRes = await fetch(`${PROXY}?spreadsheetId=${SHEET_ID}&range=Config!A:F&apiKey=${KEY}`);
            const cfgJson = await cfgRes.json();
            const clients = cfgJson.values.slice(1).map(r => ({
                name: r[0],
                budget: parseFloat(r[1].replace(/,/g, '')),
                type: r[2],
                prefix: r[3] || r[0],
                skip: r[4] === 'TRUE',
                camps: r[5] ? r[5].split(',') : []
            }));

            // 2. Data
            const results = await Promise.all(clients.map(async client => {
                const dates = getPeriodDates(client.type, month);
                const periodLabel = `${dates.start.toLocaleDateString()} - ${dates.end.toLocaleDateString()}`;
                
                let stats = { 
                    total: 0, 
                    ctrSum: 0, ctrCount: 0, 
                    careApps: 0, nurseApps: 0, supportApps: 0,
                    gDaily: 0, fbDaily: 0 
                };

                const fetchTab = async (suffix) => {
                    try {
                        const tName = `${client.prefix} ${suffix}`;
                        const range = tName.includes('FB') ? `${tName}!A:H` : `${tName}!A:F`;
                        const res = await fetch(`${PROXY}?spreadsheetId=${SHEET_ID}&range=${encodeURIComponent(range)}&apiKey=${KEY}`);
                        const json = await res.json();
                        if (!json.values) return;
                        
                        const headers = json.values[0];
                        const rows = json.values.slice(1);
                        
                        const fbBudgets = new Map();

                        rows.forEach(r => {
                            const d = mapRow(headers, r);
                            if (d.Date && isDateInRange(d.Date, dates.start, dates.end)) {
                                stats.total += d.Cost;
                                if (d.CTR > 0) { stats.ctrSum += d.CTR; stats.ctrCount++; }
                                stats.careApps += d.CareApps;
                                stats.nurseApps += d.NurseApps;
                                stats.supportApps += d.SupportApps;

                                // Daily Budget Capture
                                if (suffix === 'Google') stats.gDaily = Math.max(stats.gDaily, d.DailyBudget);
                                if (suffix === 'FB' && d.DailyBudget > 0) fbBudgets.set(d.Adset, d.DailyBudget);
                            }
                        });
                        
                        if (suffix === 'FB') fbBudgets.forEach(val => stats.fbDaily += val);

                    } catch (e) { console.error(`Error loading ${suffix}`, e); }
                };

                if (!client.skip) {
                    await fetchTab('Google');
                    await fetchTab('FB');
                }
                
                // Conversions Tab (Google)
                try {
                    const convRes = await fetch(`${PROXY}?spreadsheetId=${SHEET_ID}&range=${encodeURIComponent(client.prefix + ' Google Conversions!A:E')}&apiKey=${KEY}`);
                    const convJson = await convRes.json();
                    if (convJson.values) {
                        const h = convJson.values[0];
                        convJson.values.slice(1).forEach(r => {
                             const d = mapRow(h, r);
                             if (d.Date && isDateInRange(d.Date, dates.start, dates.end)) {
                                 stats.careApps += d.CareApps;
                                 stats.nurseApps += d.NurseApps;
                             }
                        });
                    }
                } catch(e) {}

                // Calculations
                const today = new Date();
                const daysTotal = Math.ceil((dates.end - dates.start) / 86400000);
                const daysElapsed = Math.min(daysTotal, Math.ceil((today - dates.start) / 86400000));
                const daysLeft = Math.max(0, daysTotal - daysElapsed);
                
                const avgSpend = daysElapsed > 0 ? stats.total / daysElapsed : 0;
                const projected = stats.total + (avgSpend * daysLeft);
                const pctUsed = (stats.total / client.budget) * 100;
                
                let status = 'ON TRACK';
                if ((projected / client.budget) > 1.05) status = 'HOT';
                else if ((projected / client.budget) < 0.95) status = 'COLD';
                if (stats.total >= client.budget) status = 'OVER BUDGET';

                return {
                    ...client,
                    ...stats,
                    periodLabel,
                    daysLeft,
                    projected,
                    pctUsed,
                    status,
                    currentDailyBudget: stats.gDaily + stats.fbDaily,
                    googleDailyBudget: stats.gDaily,
                    facebookDailyBudget: stats.fbDaily,
                    conversions: stats.careApps + stats.nurseApps + stats.supportApps,
                    careConversions: stats.careApps,
                    nursingConversions: stats.nurseApps,
                    supportConversions: stats.supportApps,
                    ctr: stats.ctrCount > 0 ? stats.ctrSum / stats.ctrCount : 0,
                    isHistorical: month !== 'current'
                };
            }));

            setData(results);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { load(); }, [month]);

    const months = [
        { value: 'current', label: 'Current Period', isCurrent: true },
        { value: '2024-11', label: 'November 2024' },
        { value: '2024-10', label: 'October 2024' }
    ];

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-900">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <h1 className="text-3xl font-bold text-gray-800">Client Budgets</h1>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700">View Period:</label>
                            <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-4 py-2 border rounded-lg text-sm bg-white">
                                {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        <button onClick={load} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm transition-colors">Refresh Data</button>
                    </div>
                </div>
                
                {loading && <div className="text-center py-12 text-gray-500 animate-pulse">Loading dashboard data...</div>}
                
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {data.map(c => <ClientCard key={c.name} client={c} />)}
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Dashboard />);
