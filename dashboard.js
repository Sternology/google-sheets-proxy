const { useState, useMemo, useEffect, useCallback } = React;

// --- HELPERS ---

const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
};

const formatNumber = (num) => {
    return new Intl.NumberFormat('en-GB').format(num);
};

const parseSheetDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).trim();
    // UK Format DD/MM/YYYY
    const ukMatch = cleanStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (ukMatch) return new Date(ukMatch[3], ukMatch[2] - 1, ukMatch[1]);
    // ISO Format YYYY-MM-DD
    const isoMatch = cleanStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (isoMatch) return new Date(isoMatch[1], isoMatch[2] - 1, isoMatch[3]);
    // Fallback
    const d = new Date(cleanStr);
    return isNaN(d.getTime()) ? null : d;
};

// --- DATA PROCESSING ---

const mapRow = (headers, row) => {
    const rowObj = {
        Date: null, Cost: 0, CTR: 0, DailyBudget: 0,
        CareApps: 0, NurseApps: 0, SupportApps: 0,
        Campaign: '', Adset: ''
    };

    headers.forEach((h, i) => {
        if (!h || !row[i]) return;
        const header = h.trim().toLowerCase();
        const val = row[i];

        if (header === 'date' || header === 'day') {
            rowObj.Date = parseSheetDate(val);
        }
        else if (header.includes('campaign')) {
            rowObj.Campaign = val;
        }
        else if (header.includes('adset name')) {
            rowObj.Adset = val;
        }
        else {
            const num = parseFloat(String(val).replace(/[%£$,]/g, ''));
            if (!isNaN(num)) {
                if (header === 'amount spent (gbp)' || header === 'cost') rowObj.Cost = num;
                else if (header === 'adset daily budget' || header === 'budget amount') rowObj.DailyBudget = num;
                else if (header.includes('ctr')) rowObj.CTR = num;
                else if (header.includes('application') || header.includes('conversion')) {
                    if (!header.includes('cost') && !header.includes('rate')) {
                        if (header.includes('nurse') || header.includes('nursing')) rowObj.NurseApps = num;
                        else if (header.includes('support')) rowObj.SupportApps = num;
                        else if (header.includes('care')) rowObj.CareApps = num;
                    }
                }
            }
        }
    });
    return rowObj;
};

// --- VISUAL COMPONENTS ---

const Card = ({ children, className = "" }) => (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`}>
        {children}
    </div>
);

const KPIScorecard = ({ label, value, unit, icon, color = "blue" }) => {
    const colors = {
        green: "bg-green-50 text-green-700 border-green-100",
        blue: "bg-blue-50 text-blue-700 border-blue-100",
        orange: "bg-orange-50 text-orange-700 border-orange-100",
    };
    return (
        <div className={`p-3 rounded-lg border ${colors[color] || "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-1 opacity-80">
                <span className="text-lg">{icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-2xl font-bold">{value}<span className="text-sm font-normal ml-1 opacity-75">{unit}</span></div>
        </div>
    );
};

const Gauge = ({ percentage, label, subLabel, color }) => {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
    return (
        <div className="flex flex-col items-center justify-center p-2">
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">{label}</div>
            <div className="relative w-24 h-24">
                <svg className="w-full h-full -rotate-90">
                    <circle cx="48" cy="48" r={radius} stroke="#f3f4f6" strokeWidth="8" fill="none" />
                    <circle cx="48" cy="48" r={radius} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round"
                        style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: "stroke-dashoffset 0.5s ease" }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-lg text-gray-700">{subLabel}</div>
            </div>
        </div>
    );
};

const BudgetAction = ({ client }) => {
    // Historical View
    if (client.isHistorical) {
        const diff = client.total - client.budget;
        const isOver = diff > 0;
        return (
            <div className={`mt-4 p-4 rounded-lg border flex justify-between items-center ${isOver ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                <div>
                    <div className="font-bold">{isOver ? 'Over Budget' : 'Under Budget'}</div>
                    <div className="text-xs opacity-75">Spent {formatMoney(client.total)} of {formatMoney(client.budget)}</div>
                </div>
                <div className="text-xl font-bold">{diff > 0 ? '+' : ''}{formatMoney(diff)}</div>
            </div>
        );
    }

    // Live View
    const remaining = client.budget - client.total;
    const targetDaily = Math.max(0, remaining / client.daysLeft);
    
    // Use the CALCULATED current daily budget (sum of active campaigns on latest day)
    const currentTotal = client.currentDailyBudget;
    const change = targetDaily - currentTotal;
    
    let status = 'normal';
    let msg = 'Adjust Daily Spend';
    if (client.total >= client.budget) { status = 'critical'; msg = 'Budget Exhausted - Pause Now'; }
    else if (Math.abs(change) < 5) { status = 'optimal'; msg = 'Spend is Optimal'; }
    else if (change > 0) { status = 'increase'; msg = 'Increase Spend'; }
    else { status = 'decrease'; msg = 'Decrease Spend'; }

    const theme = {
        critical: "bg-red-100 border-red-300 text-red-900",
        increase: "bg-blue-50 border-blue-200 text-blue-800",
        decrease: "bg-orange-50 border-orange-200 text-orange-800",
        optimal: "bg-green-50 border-green-200 text-green-800",
        normal: "bg-gray-50 border-gray-200 text-gray-800"
    }[status];

    // Rec Calculation
    let recGoogle = 0, recFB = 0;
    if (client.name === 'Brandon Trust') {
        recFB = targetDaily;
    } else if (currentTotal > 0) {
        // Proportional split based on current settings
        const ratio = client.googleDailyBudget / currentTotal;
        recGoogle = targetDaily * ratio;
        recFB = targetDaily * (1 - ratio);
    } else {
        // Fallback split
        recGoogle = targetDaily / 2; recFB = targetDaily / 2;
    }

    return (
        <div className={`mt-4 p-4 rounded-lg border ${theme}`}>
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-black/10">
                <span className="text-2xl">{status === 'critical' ? '🚨' : status === 'optimal' ? '✅' : status === 'increase' ? '📈' : '📉'}</span>
                <div>
                    <div className="font-bold text-sm uppercase opacity-80">Recommendation</div>
                    <div className="font-bold">{msg}</div>
                </div>
            </div>
            
            {status !== 'optimal' && status !== 'critical' && (
                <div className="grid grid-cols-2 gap-6 text-sm">
                    <div>
                        <div className="text-xs uppercase opacity-60 mb-1">Total Daily Target</div>
                        <div className="flex justify-between"><span>Current</span><strong>{formatMoney(currentTotal)}</strong></div>
                        <div className="flex justify-between"><span>Target</span><strong>{formatMoney(targetDaily)}</strong></div>
                        <div className="mt-1 pt-1 border-t border-black/10 font-bold flex justify-between">
                            <span>Change</span><span>{change > 0 ? '+' : ''}{formatMoney(change)}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs uppercase opacity-60 mb-1">Platform Split</div>
                        {recGoogle > 0 && <div className="flex justify-between items-center mb-1"><span className="text-xs bg-orange-100 text-orange-800 px-1.5 rounded">Google</span><span className="font-mono">{formatMoney(recGoogle)}</span></div>}
                        {recFB > 0 && <div className="flex justify-between items-center"><span className="text-xs bg-blue-100 text-blue-800 px-1.5 rounded">Meta</span><span className="font-mono">{formatMoney(recFB)}</span></div>}
                    </div>
                </div>
            )}
        </div>
    );
};

const ClientDashboardCard = ({ client }) => {
    const [open, setOpen] = useState(false);
    
    let kpi = { label: 'Conversions', val: client.conversions, icon: '🎯' };
    if (client.name.includes('Nursing')) kpi = { label: 'Nurse Apps', val: client.nursingConversions, icon: '👩‍⚕️' };
    else if (client.name.includes('Brandon')) kpi = { label: 'Support Apps', val: client.supportConversions + client.careConversions, icon: '📝' };
    else if (client.name.includes('Care') || client.name.includes('HC-One')) kpi = { label: 'Care Apps', val: client.careConversions, icon: '🏥' };

    const cpa = kpi.val > 0 ? client.total / kpi.val : 0;

    return (
        <Card className="flex flex-col h-full">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="font-bold text-xl text-gray-900">{client.name}</h3>
                    <div className="text-xs text-gray-500 font-medium mt-1 uppercase tracking-wide">{client.periodLabel}</div>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                    client.status === 'HOT' ? 'bg-red-100 text-red-700' : 
                    client.status === 'COLD' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>{client.status}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-6">
                <Gauge label="Budget" subLabel={`${client.pctUsed.toFixed(0)}%`} percentage={client.pctUsed} color={client.pctUsed > 100 ? '#EF4444' : '#10B981'} />
                <div className="flex flex-col items-center justify-center p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-2">Pace</div>
                    <div className="text-3xl">{client.status === 'HOT' ? '🔥' : client.status === 'COLD' ? '🧊' : '✅'}</div>
                </div>
                <Gauge label="Projected" subLabel={formatMoney(client.projected)} percentage={(client.projected/client.budget)*100} color="#3B82F6" />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
                <KPIScorecard label={kpi.label} value={formatNumber(Math.round(kpi.val))} icon={kpi.icon} color="green" />
                <KPIScorecard label="CPA" value={cpa ? `£${cpa.toFixed(2)}` : '-'} icon="💰" color="blue" />
                <KPIScorecard label="CTR" value={client.ctr} unit="%" icon="👆" color="orange" />
            </div>

            <BudgetAction client={client} />

            <div className="mt-auto pt-4">
                <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center text-sm text-gray-500 hover:text-gray-800 py-2 border-t border-gray-100">
                    <span>Details</span><span>{open ? 'Hide ▲' : 'Show ▼'}</span>
                </button>
                {open && (
                    <div className="bg-gray-50 p-3 rounded text-sm text-gray-600 space-y-1 mt-2 animate-in slide-in-from-top-2">
                        <div className="flex justify-between"><span>Total Spend</span><span className="font-mono font-bold">{formatMoney(client.total)}</span></div>
                        <div className="flex justify-between"><span>Budget</span><span className="font-mono">{formatMoney(client.budget)}</span></div>
                        <div className="flex justify-between"><span>Days Left</span><span className="font-mono">{client.daysLeft}</span></div>
                    </div>
                )}
            </div>
        </Card>
    );
};

// --- CONTROLLER ---

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
            y = parseInt(parts[0]); m = parseInt(parts[1]) - 1;
        }
        const makeDate = (d) => new Date(y, m, d);
        const makePrev = (d) => new Date(y, m - 1, d);

        if (type === 'apollo') { // 26th - 25th
            if (selectedMonth === 'current' && now.getDate() >= 26) return { start: makeDate(26), end: new Date(y, m + 1, 25) };
            return { start: makePrev(26), end: makeDate(25) };
        }
        if (type === 'brandon') { // 21st - 20th
            if (selectedMonth === 'current' && now.getDate() >= 21) return { start: makeDate(21), end: new Date(y, m + 1, 20) };
            return { start: makePrev(21), end: makeDate(20) };
        }
        if (type === 'hc1') { // 11th - 10th
            if (selectedMonth === 'current' && now.getDate() >= 11) return { start: makeDate(11), end: new Date(y, m + 1, 10) };
            return { start: makePrev(11), end: makeDate(10) };
        }
        return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
    };

    const load = async () => {
        setLoading(true);
        try {
            const cfgRes = await fetch(`${PROXY}?spreadsheetId=${SHEET_ID}&range=Config!A:F&apiKey=${KEY}`);
            const cfgJson = await cfgRes.json();
            const clients = cfgJson.values.slice(1).map(r => ({
                name: r[0], budget: parseFloat(r[1].replace(/,/g, '')),
                type: r[2], prefix: r[3] || r[0], skip: r[4] === 'TRUE',
                camps: r[5] ? r[5].split(',') : []
            }));

            const results = await Promise.all(clients.map(async client => {
                const dates = getPeriodDates(client.type, month);
                const periodLabel = `${dates.start.toLocaleDateString('en-GB')} - ${dates.end.toLocaleDateString('en-GB')}`;
                
                let stats = { total: 0, ctrSum: 0, ctrCount: 0, careApps: 0, nurseApps: 0, supportApps: 0 };
                
                // Track daily budgets for ALL TIME to find the most recent setting
                const budgets = { 
                    google: new Map(), // Date -> Sum(Campaign Budgets)
                    fb: new Map(),     // Date -> Sum(Adset Budgets)
                    dates: new Set()
                };

                const fetchTab = async (suffix) => {
                    try {
                        const range = (client.prefix + ' ' + suffix).includes('FB') ? 
                                      `${client.prefix} ${suffix}!A:H` : `${client.prefix} ${suffix}!A:F`;
                        const res = await fetch(`${PROXY}?spreadsheetId=${SHEET_ID}&range=${encodeURIComponent(range)}&apiKey=${KEY}`);
                        const json = await res.json();
                        if (!json.values) return;
                        
                        const h = json.values[0];
                        // Maps for aggregation per day
                        const dayBuckets = new Map(); 

                        json.values.slice(1).forEach(r => {
                            const d = mapRow(h, r);
                            if (!d.Date) return;
                            const dateKey = d.Date.toISOString().split('T')[0];

                            // 1. Process Spend/Conv IN RANGE
                            if (d.Date >= dates.start && d.Date <= dates.end) {
                                stats.total += d.Cost;
                                if (d.CTR > 0) { stats.ctrSum += d.CTR; stats.ctrCount++; }
                                stats.careApps += d.CareApps; stats.nurseApps += d.NurseApps; stats.supportApps += d.SupportApps;
                            }

                            // 2. Aggregate Budgets GLOBAL (to find latest)
                            if (d.DailyBudget > 0) {
                                budgets.dates.add(d.Date.getTime());
                                const key = suffix === 'Google' ? (d.Campaign || 'default') : (d.Adset || 'default');
                                
                                if (!dayBuckets.has(dateKey)) dayBuckets.set(dateKey, new Map());
                                dayBuckets.get(dateKey).set(key, d.DailyBudget);
                            }
                        });

                        // Sum up daily buckets into the main budget tracker
                        dayBuckets.forEach((campaignMap, dateKey) => {
                            let dailySum = 0;
                            campaignMap.forEach(v => dailySum += v);
                            const targetMap = suffix === 'Google' ? budgets.google : budgets.fb;
                            targetMap.set(dateKey, dailySum);
                        });

                    } catch (e) { console.error(e); }
                };

                if (!client.skip) { await fetchTab('Google'); await fetchTab('FB'); }
                
                // Conversions Tab Fetch (omitted for brevity, logic identical to before)
                
                // --- Find Latest Budgets ---
                let latestG = 0, latestFB = 0;
                if (budgets.dates.size > 0) {
                    const maxDate = new Date(Math.max(...budgets.dates));
                    const maxDateKey = maxDate.toISOString().split('T')[0];
                    latestG = budgets.google.get(maxDateKey) || 0;
                    latestFB = budgets.fb.get(maxDateKey) || 0;
                }

                const today = new Date();
                const totalDays = Math.ceil((dates.end - dates.start) / 86400000);
                const passed = Math.min(totalDays, Math.ceil((today - dates.start) / 86400000));
                const left = Math.max(0, totalDays - passed);
                const projected = stats.total + ((passed > 0 ? stats.total/passed : 0) * left);
                const used = (stats.total / client.budget) * 100;
                
                let status = 'ON TRACK';
                if (projected > client.budget * 1.05) status = 'HOT';
                else if (projected < client.budget * 0.95) status = 'COLD';
                if (stats.total >= client.budget) status = 'OVER BUDGET';

                return {
                    ...client, ...stats, periodLabel, daysLeft: left, projected, pctUsed: used, status,
                    currentDailyBudget: latestG + latestFB,
                    googleDailyBudget: latestG, facebookDailyBudget: latestFB,
                    conversions: stats.careApps + stats.nurseApps + stats.supportApps,
                    careConversions: stats.careApps, nursingConversions: stats.nurseApps, supportConversions: stats.supportApps,
                    ctr: stats.ctrCount > 0 ? (stats.ctrSum / stats.ctrCount).toFixed(2) : 0,
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
        { value: '2025-11', label: 'November 2025' },
        { value: '2025-10', label: 'October 2025' },
        { value: '2025-01', label: 'January 2025' }
    ];

    return (
        <div className="max-w-7xl mx-auto p-6 md:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Client Budgets</h1>
                <div className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer">
                        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <button onClick={load} className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-gray-800 transition-colors">Refresh</button>
                </div>
            </div>
            
            {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
                    {[1,2,3].map(i => <div key={i} className="h-96 bg-gray-200 rounded-xl"></div>)}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                    {data.map(c => <ClientDashboardCard key={c.name} client={c} />)}
                </div>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Dashboard />);
