let globalDatabase = [];
let watchlist = JSON.parse(localStorage.getItem('user_watchlist_dalio_v6')) || ["RELIANCE.NS", "GALP.LS", "NVDA", "PETR4.SA"];
let recentSearches = JSON.parse(localStorage.getItem('recent_searches_v1')) || [];
let globalActiveProfile = 'HDL';
let stockAnalystOverrides = {};

document.addEventListener('DOMContentLoaded', () => {
    loadBaseStocks();
});

async function loadBaseStocks() {
    try {
        const res = await fetch('/api/stocks');
        if (res.ok) {
            const baseStocks = await res.json();
            
            // Unir base com pesquisas recentes guardadas
            recentSearches.forEach(recent => {
                if (!baseStocks.some(s => s.ticker === recent.ticker)) {
                    baseStocks.unshift(recent);
                }
            });

            globalDatabase = baseStocks;

            // CARREGAMENTO AUTOMÁTICO DA WATCHLIST:
            // Procura dados para qualquer ticker na Watchlist que não esteja na globalDatabase
            const missingTickers = watchlist.filter(ticker => !globalDatabase.some(s => s.ticker === ticker));
            if (missingTickers.length > 0) {
                await Promise.all(missingTickers.map(async (ticker) => {
                    try {
                        const qRes = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
                        if (qRes.ok) {
                            const stockData = await qRes.json();
                            if (!globalDatabase.some(s => s.ticker === stockData.ticker)) {
                                globalDatabase.push(stockData);
                            }
                        }
                    } catch (e) {}
                }));
            }

            renderScreenerTable(getScreenerStocks());
            renderWatchlistTable();
        }
    } catch (e) {
        console.error("Erro ao carregar ações base:", e);
    }
}

// Retorna as últimas 10 ações para a tabela do Screener
function getScreenerStocks() {
    if (recentSearches.length > 0) {
        // Se houver histórico de pesquisas, mostra até 10 recentes
        return recentSearches.slice(0, 10);
    }
    // Caso contrário, mostra as primeiras 10 da base
    return globalDatabase.slice(0, 10);
}

let searchTimeout;
function handleSearchInput(e) {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    const dropdown = document.getElementById('searchResultsDropdown');

    if (query.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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
            
            // Atualizar base global
            const idx = globalDatabase.findIndex(s => s.ticker === stock.ticker);
            if (idx >= 0) globalDatabase[idx] = stock;
            else globalDatabase.unshift(stock);

            // Gerir Histórico das últimas 10 pesquisas
            recentSearches = recentSearches.filter(s => s.ticker !== stock.ticker);
            recentSearches.unshift(stock);
            if (recentSearches.length > 10) {
                recentSearches = recentSearches.slice(0, 10);
            }
            localStorage.setItem('recent_searches_v1', JSON.stringify(recentSearches));

            renderScreenerTable(getScreenerStocks());
            renderWatchlistTable();
            alert(`Ação ${symbol} (${stock.name}) selecionada!\nPreço em EUR: €${stock.price}`);
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
        const btn = document.getElementById(`btn-${p}`);
        if (btn) {
            btn.className = p === profile ? "p-3 rounded-lg border text-center font-bold transition border-blue-500 bg-blue-900/40 text-blue-400 text-xs" : "p-3 rounded-lg border text-center font-bold transition border-slate-700 bg-slate-800 text-slate-300 text-xs";
        }
    });
    document.getElementById('activeProfileBadgeScreener').innerText = `Analista: ${profile}`;
    document.getElementById('activeProfileBadgeWatchlist').innerText = `Analista: ${profile}`;
    renderScreenerTable(getScreenerStocks());
    renderWatchlistTable();
}

function changeStockAnalyst(ticker, newProfile) {
    stockAnalystOverrides[ticker] = newProfile;
    renderScreenerTable(getScreenerStocks());
    renderWatchlistTable();
}

function evaluateSignal(stock, profile) {
    if (profile === 'HDL') {
        const pass = stock.ret1Y <= -30.0 && stock.pe < (stock.isTech ? 25 : 15);
        return { pass, text: pass ? "APROVADO HDL" : "REPROVADO HDL", detail: `Queda: ${stock.ret1Y}% | P/E: ${stock.pe}` };
    }
    if (profile === 'Buffett') {
        const pass = stock.pe < 20 && stock.ret1Y > -20;
        return { pass, text: pass ? "APROVADO BUFFETT" : "REPROVADO BUFFETT", detail: `Qualidade & P/E: ${stock.pe}` };
    }
    if (profile === 'Graham') {
        const pass = stock.pe < 15 && stock.ret1Y < 0;
        return { pass, text: pass ? "APROVADO GRAHAM" : "REPROVADO GRAHAM", detail: `Desconto Value P/E: ${stock.pe}` };
    }
    if (profile === 'Simons') {
        const pass = stock.ret1D > 0 || stock.ret1M > 0;
        return { pass, text: pass ? "COMPRA QUANT" : "NEUTRO QUANT", detail: "Momentum Algorítmico" };
    }
    if (profile === 'Burry') {
        const pass = stock.ret1Y <= -25.0 && stock.pe < 18;
        return { pass, text: pass ? "APROVADO BURRY" : "REPROVADO BURRY", detail: `Contrarian Queda: ${stock.ret1Y}%` };
    }
    if (profile === 'Dalio') {
        const pass = stock.pe < 22 && (stock.sector.includes('Energia') || stock.sector.includes('Utilidades') || stock.sector.includes('Consumo') || stock.ret1Y > -10);
        return { pass, text: pass ? "APROVADO DALIO" : "REPROVADO DALIO", detail: "All-Weather / Equilíbrio Macro" };
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
        // Garantir que a ação está na globalDatabase se tiver sido adicionada diretamente
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

function renderScreenerTable(stocksToRender) {
    const tbody = document.getElementById('screenerTableBody');
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
                </button>
            </td>
            <td class="p-3 font-bold text-white">${stock.ticker}<span class="block text-xs font-normal text-slate-400">${stock.name}</span></td>
            <td class="p-3 text-xs text-slate-300">${stock.market}</td>
            <td class="p-3 text-xs text-slate-400">${stock.sector}</td>
            <td class="p-3 font-semibold text-emerald-400">€${stock.price ? stock.price.toFixed(2) : '-'}</td>
            <td class="p-3 text-xs text-slate-400">${stock.origPrice ? stock.origPrice.toFixed(2) : ''} ${stock.origCurrency || ''}</td>
            <td class="p-3 font-bold ${stock.ret1D >= 0 ? 'positive' : 'negative'}">${stock.ret1D}%</td>
            <td class="p-3 font-semibold text-slate-300">${stock.pe}</td>
            <td class="p-3">${generateSparklineSVG(stock.spark)}</td>
            <td class="p-3">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${signal.pass ? 'badge-pass' : 'badge-fail'}">
                            ${signal.text}
                        </span>
                        <select onchange="changeStockAnalyst('${stock.ticker}', this.value)" class="bg-slate-900 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500">
                            <option value="HDL" ${activeProf === 'HDL' ? 'selected' : ''}>HDL</option>
                            <option value="Buffett" ${activeProf === 'Buffett' ? 'selected' : ''}>Buffett</option>
                            <option value="Graham" ${activeProf === 'Graham' ? 'selected' : ''}>Graham</option>
                            <option value="Simons" ${activeProf === 'Simons' ? 'selected' : ''}>Simons</option>
                            <option value="Burry" ${activeProf === 'Burry' ? 'selected' : ''}>Burry</option>
                            <option value="Dalio" ${activeProf === 'Dalio' ? 'selected' : ''}>Dalio</option>
                        </select>
                    </div>
                    <span class="block text-[9px] text-slate-400">${signal.detail}</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderWatchlistTable() {
    const tbody = document.getElementById('watchlistTableBody');
    const emptyState = document.getElementById('watchlistEmptyState');
    const wrapper = document.getElementById('watchlistTableWrapper');
    tbody.innerHTML = '';

    const starredStocks = globalDatabase.filter(s => watchlist.includes(s.ticker));

    document.getElementById('watchlistCountBadge').innerText = watchlist.length;
    document.getElementById('watchlistCountHeader').innerText = watchlist.length;

    if (starredStocks.length === 0) {
        emptyState.classList.remove('hidden');
        wrapper.classList.add('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
        wrapper.classList.remove('hidden');
    }

    starredStocks.forEach(stock => {
        const activeProf = stockAnalystOverrides[stock.ticker] || globalActiveProfile;
        const signal = evaluateSignal(stock, activeProf);
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/50 transition border-b border-slate-800";
        
        tr.innerHTML = `
            <td class="p-3 text-center">
                <button onclick="toggleWatchlist('${stock.ticker}')" class="text-lg text-yellow-400 hover:text-red-400 focus:outline-none">
                    <i class="fa-solid fa-star"></i>
                </button>
            </td>
            <td class="p-3 font-bold text-white">${stock.ticker}<span class="block text-xs font-normal text-slate-400">${stock.name}</span></td>
            <td class="p-3 font-semibold text-emerald-400">€${stock.price ? stock.price.toFixed(2) : '-'}</td>
            <td class="p-3 text-xs ${stock.ret1D >= 0 ? 'positive' : 'negative'}">${stock.ret1D}%</td>
            <td class="p-3 text-xs ${stock.ret1W >= 0 ? 'positive' : 'negative'}">${stock.ret1W}%</td>
            <td class="p-3 text-xs ${stock.ret1M >= 0 ? 'positive' : 'negative'}">${stock.ret1M}%</td>
            <td class="p-3 text-xs ${stock.ret3M >= 0 ? 'positive' : 'negative'}">${stock.ret3M}%</td>
            <td class="p-3 text-xs ${stock.ret6M >= 0 ? 'positive' : 'negative'}">${stock.ret6M}%</td>
            <td class="p-3 text-xs font-bold ${stock.ret1Y <= -30 ? 'text-amber-400 underline' : (stock.ret1Y >= 0 ? 'positive' : 'negative')}">${stock.ret1Y}%</td>
            <td class="p-3 text-xs ${stock.retYTD >= 0 ? 'positive' : 'negative'}">${stock.retYTD}%</td>
            <td class="p-3 text-xs ${stock.ret3Y >= 0 ? 'positive' : 'negative'}">${stock.ret3Y}%</td>
            <td class="p-3 text-xs ${stock.ret5Y >= 0 ? 'positive' : 'negative'}">${stock.ret5Y}%</td>
            <td class="p-3">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${signal.pass ? 'badge-pass' : 'badge-fail'}">
                            ${signal.text}
                        </span>
                        <select onchange="changeStockAnalyst('${stock.ticker}', this.value)" class="bg-slate-900 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500">
                            <option value="HDL" ${activeProf === 'HDL' ? 'selected' : ''}>HDL</option>
                            <option value="Buffett" ${activeProf === 'Buffett' ? 'selected' : ''}>Buffett</option>
                            <option value="Graham" ${activeProf === 'Graham' ? 'selected' : ''}>Graham</option>
                            <option value="Simons" ${activeProf === 'Simons' ? 'selected' : ''}>Simons</option>
                            <option value="Burry" ${activeProf === 'Burry' ? 'selected' : ''}>Burry</option>
                            <option value="Dalio" ${activeProf === 'Dalio' ? 'selected' : ''}>Dalio</option>
                        </select>
                    </div>
                    <span class="block text-[9px] text-slate-400">${signal.detail}</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}