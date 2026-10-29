let globalDatabase = [];
let watchlist = JSON.parse(localStorage.getItem('user_watchlist_dalio_v6')) || ["RELIANCE.NS", "GALP.LS", "NVDA", "PETR4.SA"];
let recentSearches = JSON.parse(localStorage.getItem('recent_searches_v1')) || [];
let globalActiveProfile = 'HDL';
let stockAnalystOverrides = {};
let selectedAnalystDetail = 'HDL'; // Analista selecionado por defeito na barra inferior

const analystDescriptions = {
    HDL: "Estratégia Value Contrarian Profunda: Procura ativos em forte desvalorização (queda de 1 ano ≥ 30%) com múltiplos P/E atrativos (< 25 para tecnologia, < 15 para outros setores).",
    Buffett: "Estratégia de Qualidade e Valor Justo: Foca em empresas sólidas e consistentes, exigindo um P/E moderado (< 20) e que não estejam em colapsos extremos de mercado (queda 1A < 20%).",
    Graham: "Estratégia Clássica de Benjamín Graham: Foco estrito em margem de segurança e desconto face ao valor intrínseco, exigindo P/E abaixo de 15 e tendência de preço descontada.",
    Simons: "Estratégia Quantitativa / Momentum: Baseada em padrões estatísticos de curto prazo, aprovando ativos com momentum positivo a 1 dia ou 1 mês.",
    Burry: "Estratégia Contrarian / Deep Value: Identifica oportunidades esquecidas pelo mercado em ativos com quedas expressivas a 1 ano (≥ 25%) e P/E comprimido (< 18).",
    Dalio: "Estratégia Macro All-Weather: Foco em equilíbrio de portefólio com ativos defensivos (Energia, Utilidades, Consumo) e P/E abaixo de 22 para resiliência económica."
};

document.addEventListener('DOMContentLoaded', () => {
    loadBaseStocks();
    injectAnalystFooterBars();
});

async function loadBaseStocks() {
    try {
        const res = await fetch('/api/stocks');
        if (res.ok) {
            const baseStocks = await res.json();
            
            recentSearches.forEach(recent => {
                if (!baseStocks.some(s => s.ticker === recent.ticker)) {
                    baseStocks.unshift(recent);
                }
            });

            globalDatabase = baseStocks;

            const missingTickers = watchlist.filter(ticker => !globalDatabase.some(s => s.ticker === ticker));
            if (missingTickers.length > 0) {
                await Promise.all(missingTickers.map(async (ticker) => {
                    try {
                        const qRes = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`); if (qRes.ok) { const stockData = await qRes.json(); if (!globalDatabase.some(s => s.ticker === stockData.ticker)) { globalDatabase.push(stockData); } } } catch (e) {} })); }  renderScreenerTable(getScreenerStocks()); renderWatchlistTable(); } } catch (e) { console.error("Erro ao carregar ações base:", e); } }  function getScreenerStocks() { if (recentSearches.length > 0) { return recentSearches.slice(0, 10); } return globalDatabase.slice(0, 10); }  let searchTimeout; function handleSearchInput(e) { clearTimeout(searchTimeout); const query = e.target.value.trim(); const dropdown = document.getElementById('searchResultsDropdown');  if (query.length < 2) { dropdown.classList.add('hidden'); return; }  searchTimeout = setTimeout(async () => { try { const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data && data.length > 0) {
                dropdown.innerHTML = data.slice(0, 10).map(item => `
                    <div onclick="selectStock('${item.symbol}')" class="p-3 hover:bg-slate-800 cursor-pointer flex justify-between items-center border-b border-slate-800">
                        <div>
                            <span class="font-bold text-white text-sm">${item.symbol}</span>
                            <span class="text-xs text-slate-400 block">${item.name}</span>
                        </div>
                        <span class="text-[10px] bg-blue-900 text-blue-300 px-2 py-1 rounded font-bold">${item.exch}</span>
                    </div>
                `).join('');
                dropdown.classList.remove('hidden');
            } else {
                dropdown.classList.add('hidden');
            }
        } catch (err) {}
    }, 300);
}

async function selectStock(symbol) {
    document.getElementById('searchResultsDropdown').classList.add('hidden');
    try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (res.ok) {
            const stock = await res.json();
            
            const idx = globalDatabase.findIndex(s => s.ticker === stock.ticker);
            if (idx >= 0) globalDatabase[idx] = stock;
            else globalDatabase.unshift(stock);

            recentSearches = recentSearches.filter(s => s.ticker !== stock.ticker);
            recentSearches.unshift(stock);
            if (recentSearches.length > 10) {
                recentSearches = recentSearches.slice(0, 10);
            }
            localStorage.setItem('recent_searches_v1', JSON.stringify(recentSearches));

            renderScreenerTable(getScreenerStocks());
            renderWatchlistTable();
        }
    } catch (e) {
        alert("Erro ao consultar cotação.");
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tabBtnScreener').className = "px-4 py-2 rounded-lg font-bold text-sm transition text-slate-400 hover:text-white";
    document.getElementById('tabBtnWatchlist').className = "px-4 py-2 rounded-lg font-bold text-sm transition text-slate-400 hover:text-white";

    if (tabName === 'screener') {
        document.getElementById('tabScreener').classList.add('active');
        document.getElementById('tabBtnScreener').className = "px-4 py-2 rounded-lg font-bold text-sm transition bg-blue-600 text-white shadow";
    } else {
        document.getElementById('tabWatchlist').classList.add('active');
        document.getElementById('tabBtnWatchlist').className = "px-4 py-2 rounded-lg font-bold text-sm transition bg-blue-600 text-white shadow";
        renderWatchlistTable();
    }
}

function setGlobalProfile(profile) {
    globalActiveProfile = profile;
    const profiles = ['HDL', 'Buffett', 'Graham', 'Simons', 'Burry', 'Dalio'];
    profiles.forEach(p => {
        const btn = document.getElementById(`btn-${p}`); if (btn) { btn.className = p === profile ? "p-3 rounded-lg border text-center font-bold transition border-blue-500 bg-blue-900/40 text-blue-400 text-xs" : "p-3 rounded-lg border text-center font-bold transition border-slate-700 bg-slate-800 text-slate-300 text-xs"; } }); document.getElementById('activeProfileBadgeScreener').innerText = `Analista: ${profile}`;
    document.getElementById('activeProfileBadgeWatchlist').innerText = `Analista: ${profile}`; renderScreenerTable(getScreenerStocks()); renderWatchlistTable(); }  function changeStockAnalyst(ticker, newProfile) { stockAnalystOverrides[ticker] = newProfile; renderScreenerTable(getScreenerStocks()); renderWatchlistTable(); }  function evaluateSignal(stock, profile) { if (profile === 'HDL') { const pass = stock.ret1Y <= -30.0 && stock.pe < (stock.isTech ? 25 : 15); return { pass, text: pass ? "APROVADO HDL" : "REPROVADO HDL", detail: `Queda 1A: ${stock.ret1Y}% (Req: ≤ -30%) | P/E: ${stock.pe} (Req: <${stock.isTech ? 25 : 15})` };
    }
    if (profile === 'Buffett') {
        const pass = stock.pe < 20 && stock.ret1Y > -20;
        return { pass, text: pass ? "APROVADO BUFFETT" : "REPROVADO BUFFETT", detail: `P/E: ${stock.pe} (Req: < 20) \vert{} Queda 1A:${stock.ret1Y}% (Req: > -20%)` };
    }
    if (profile === 'Graham') {
        const pass = stock.pe < 15 && stock.ret1Y < 0;
        return { pass, text: pass ? "APROVADO GRAHAM" : "REPROVADO GRAHAM", detail: `P/E Value: ${stock.pe} (Req: < 15) \vert{} Queda 1A:${stock.ret1Y}%` };
    }
    if (profile === 'Simons') {
        const pass = stock.ret1D > 0 || stock.ret1M > 0;
        return { pass, text: pass ? "COMPRA QUANT" : "NEUTRO QUANT", detail: `Retorno 1D: ${stock.ret1D}\% \vert{} Retorno 1M:${stock.ret1M}% (Req: > 0)` };
    }
    if (profile === 'Burry') {
        const pass = stock.ret1Y <= -25.0 && stock.pe < 18;
        return { pass, text: pass ? "APROVADO BURRY" : "REPROVADO BURRY", detail: `Queda Contrarian: ${stock.ret1Y}\% (Req: ≤ -25\%) \vert{} P/E:${stock.pe} (Req: < 18)` };
    }
    if (profile === 'Dalio') {
        const pass = stock.pe < 22 && (stock.sector.includes('Energia') || stock.sector.includes('Utilidades') || stock.sector.includes('Consumo') || stock.ret1Y > -10);
        return { pass, text: pass ? "APROVADO DALIO" : "REPROVADO DALIO", detail: `Setor: ${stock.sector} \vert{} P/E:${stock.pe} (Req: < 22)` };
    }
}

function generateSparklineSVG(sparkArray) {
    if (!sparkArray || sparkArray.length === 0) return '';
    const min = Math.min(...sparkArray);
    const max = Math.max(...sparkArray);
    const range = max - min === 0 ? 1 : max - min;
    const width = 80;
    const height = 24;
    
    const points = sparkArray.map((val, idx) => {
        const x = (idx / (sparkArray.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    }).join(' ');

    const isUp = sparkArray[sparkArray.length - 1] >= sparkArray[0];
    const strokeColor = isUp ? '#4ade80' : '#f87171';

    return `
        <svg width="${width}" height="${height}" class="overflow-visible">
            <polyline fill="none" stroke="${strokeColor}" stroke-width="2" points="${points}" />
        </svg>
    `;
}

async function toggleWatchlist(ticker) {
    if (watchlist.includes(ticker)) {
        watchlist = watchlist.filter(t => t !== ticker);
    } else {
        watchlist.push(ticker);
        if (!globalDatabase.some(s => s.ticker === ticker)) {
            try {
                const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
                if (res.ok) {
                    const stockData = await res.json();
                    globalDatabase.push(stockData);
                }
            } catch (e) {}
        }
    }
    localStorage.setItem('user_watchlist_dalio_v6', JSON.stringify(watchlist));
    document.getElementById('watchlistCountBadge').innerText = watchlist.length;
    document.getElementById('watchlistCountHeader').innerText = watchlist.length;
    renderScreenerTable(getScreenerStocks());
    renderWatchlistTable();
}

function selectAnalystFooter(profile) {
    selectedAnalystDetail = profile;
    injectAnalystFooterBars();
}

function injectAnalystFooterBars() {
    const profiles = ['HDL', 'Buffett', 'Graham', 'Simons', 'Burry', 'Dalio'];
    
    const footerHtml = `
        <div class="mt-8 mb-6 p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
            <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Guia de Estratégias dos Analistas</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div class="flex flex-wrap gap-2 md:col-span-1">
                    ${profiles.map(p => `
                        <button onclick="selectAnalystFooter('${p}')" class="px-3 py-2 rounded-lg font-bold text-xs transition border ${selectedAnalystDetail === p ? 'bg-blue-600 border-blue-500 text-white shadow' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}">
                            ${p}
                        </button>
                    `).join('')}
                </div>
                <div class="md:col-span-2 bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-slate-300 leading-relaxed min-h-[60px] flex items-center">
                    <div>
                        <span class="font-bold text-blue-400 block mb-1">Estratégia de ${selectedAnalystDetail}:</span>${analystDescriptions[selectedAnalystDetail]}
                    </div>
                </div>
            </div>
        </div>
    `;

    const screenerTab = document.getElementById('tabScreener');
    const watchlistTab = document.getElementById('tabWatchlist');

    document.querySelectorAll('.analyst-footer-bar').forEach(el => el.remove());

    if (screenerTab) {
        const div = document.createElement('div');
        div.className = 'analyst-footer-bar';
        div.innerHTML = footerHtml;
        screenerTab.appendChild(div);
    }
    if (watchlistTab) {
        const div = document.createElement('div');
        div.className = 'analyst-footer-bar';
        div.innerHTML = footerHtml;
        watchlistTab.appendChild(div);
    }
}

function renderScreenerTable(stocksToRender) {
    const tbody = document.getElementById('screenerTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    stocksToRender.forEach(stock => {
        const isStarred = watchlist.includes(stock.ticker);
        const activeProf = stockAnalystOverrides[stock.ticker] || globalActiveProfile;
        const signal = evaluateSignal(stock, activeProf);
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/50 transition border-b border-slate-800";
        
        tr.innerHTML = `
            <td class="p-3 text-center">
                <button onclick="toggleWatchlist('${stock.ticker}')" class="text-lg focus:outline-none">
                    <i class="fa-solid fa-star ${isStarred ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}"></i>