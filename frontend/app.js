let globalDatabase = [];
let watchlist = JSON.parse(localStorage.getItem('user_watchlist_dalio_v6')) || ["RELIANCE.NS", "GALP.LS", "NVDA", "PETR4.SA"];
let recentSearches = JSON.parse(localStorage.getItem('recent_searches_v1')) || [];
let globalActiveProfile = 'HDL';
let stockAnalystOverrides = {};
let selectedAnalystDetail = 'HDL';

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
    
    // Atualização automática a cada 30 segundos do P/E e cotações em tempo real
    setInterval(() => {
        refreshLiveQuotes();
    }, 30000);
});

// Função para buscar o P/E e cotação em tempo real através do Proxy do Backend
async function fetchRealTimePE(symbol) {
    try {
        const res = await fetch(`/api/realtime-pe?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            price: data.price,
            eps: 0,
            peRatio: data.pe
        };
    } catch (error) {
        console.error(`Erro ao atualizar P/E em tempo real para ${symbol}:`, error);
        return null;
    }
}

async function refreshLiveQuotes() {
    let updated = false;
    for (let stock of globalDatabase) {
        const live = await fetchRealTimePE(stock.ticker);
        if (live && live.price > 0) {
            stock.price = live.price;
            if (live.peRatio > 0) {
                stock.pe = live.peRatio;
            }
            updated = true;
        }
    }
    if (updated) {
        renderScreenerTable(getScreenerStocks());
        renderWatchlistTable();
    }
}

async function loadBaseStocks() {
    try {
        const res = await fetch('/api/stocks');
        if (res.ok) {
            let baseStocks = await res.json();
            
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

            // Sincronizar dados ao vivo iniciais
            await refreshLiveQuotes();
        }
    } catch (e) {
        console.error("Erro ao carregar ações base:", e);
    }
}

function getScreenerStocks() {
    if (recentSearches.length > 0) {
        return recentSearches.slice(0, 10);
    }
    return globalDatabase.slice(0, 10);
}

let searchTimeout;
function handleSearchInput(e) {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    const dropdown = document.getElementById('searchResultsDropdown');

    if (!dropdown) return;

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
    const dropdown = document.getElementById('searchResultsDropdown');
    if (dropdown) dropdown.classList.add('hidden');
    try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (res.ok) {
            const stock = await res.json();
            
            // Integrar cálculo ao vivo para o stock selecionado
            const live = await fetchRealTimePE(stock.ticker);
            if (live && live.price > 0) {
                stock.price = live.price;
                if (live.peRatio > 0) stock.pe = live.peRatio;
            }
            
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
    const btnScreener = document.getElementById('tabBtnScreener');
    const btnWatchlist = document.getElementById('tabBtnWatchlist');

    if (btnScreener) btnScreener.className = "px-4 py-2 rounded-lg font-bold text-sm transition text-slate-400 hover:text-white";
    if (btnWatchlist) btnWatchlist.className = "px-4 py-2 rounded-lg font-bold text-sm transition text-slate-400 hover:text-white";

    if (tabName === 'screener') {
        const tab = document.getElementById('tabScreener');
        if (tab) tab.classList.add('active');
        if (btnScreener) btnScreener.className = "px-4 py-2 rounded-lg font-bold text-sm transition bg-blue-600 text-white shadow";
    } else {
        const tab = document.getElementById('tabWatchlist');
        if (tab) tab.classList.add('active');
        if (btnWatchlist) btnWatchlist.className = "px-4 py-2 rounded-lg font-bold text-sm transition bg-blue-600 text-white shadow";
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
    const badgeS = document.getElementById('activeProfileBadgeScreener');
    const badgeW = document.getElementById('activeProfileBadgeWatchlist');
    if (badgeS) badgeS.innerText = `Analista: ${profile}`;
    if (badgeW) badgeW.innerText = `Analista: ${profile}`;
    renderScreenerTable(getScreenerStocks());
    renderWatchlistTable();
}

function changeStockAnalyst(ticker, newProfile) {
    stockAnalystOverrides[ticker] = newProfile;
    renderScreenerTable(getScreenerStocks());
    renderWatchlistTable();
}

function evaluateSignal(stock, profile) {
    const peVal = stock.pe || 0;
    const ret1YVal = stock.ret1Y || 0;
    const isTechVal = stock.isTech || false;

    if (profile === 'HDL') {
        const pass = ret1YVal <= -30.0 && peVal < (isTechVal ? 25 : 15);
        return { pass, text: pass ? "APROVADO HDL" : "REPROVADO HDL", detail: `Queda 1A: ${ret1YVal}% (Req: ≤ -30%) | P/E: ${peVal} (Req: < ${isTechVal ? 25 : 15})` };
    }
    if (profile === 'Buffett') {
        const pass = peVal < 20 && ret1YVal > -20;
        return { pass, text: pass ? "APROVADO BUFFETT" : "REPROVADO BUFFETT", detail: `P/E: ${peVal} (Req: < 20) | Queda 1A: ${ret1YVal}% (Req: > -20%)` };
    }
    if (profile === 'Graham') {
        const pass = peVal < 15 && ret1YVal < 0;
        return { pass, text: pass ? "APROVADO GRAHAM" : "REPROVADO GRAHAM", detail: `P/E Value: ${peVal} (Req: < 15) | Queda 1A: ${ret1YVal}%` };
    }
    if (profile === 'Simons') {
        const pass = (stock.ret1D || 0) > 0 || (stock.ret1M || 0) > 0;
        return { pass, text: pass ? "COMPRA QUANT" : "NEUTRO QUANT", detail: `Retorno 1D: ${stock.ret1D || 0}% | Retorno 1M: ${stock.ret1M || 0}% (Req: > 0)` };
    }
    if (profile === 'Burry') {
        const pass = ret1YVal <= -25.0 && peVal < 18;
        return { pass, text: pass ? "APROVADO BURRY" : "REPROVADO BURRY", detail: `Queda Contrarian: ${ret1YVal}% (Req: ≤ -25%) | P/E: ${peVal} (Req: < 18)` };
    }
    if (profile === 'Dalio') {
        const sectorStr = stock.sector || '';
        const pass = peVal < 22 && (sectorStr.includes('Energia') || sectorStr.includes('Utilidades') || sectorStr.includes('Consumo') || ret1YVal > -10);
        return { pass, text: pass ? "APROVADO DALIO" : "REPROVADO DALIO", detail: `Setor: ${sectorStr} | P/E: ${peVal} (Req: < 22)` };
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
                    const live = await fetchRealTimePE(stockData.ticker);
                    if (live && live.price > 0) {
                        stockData.price = live.price;
                        if (live.peRatio > 0) stockData.pe = live.peRatio;
                    }
                    globalDatabase.push(stockData);
                }
            } catch (e) {}
        }
    }
    localStorage.setItem('user_watchlist_dalio_v6', JSON.stringify(watchlist));
    const badge1 = document.getElementById('watchlistCountBadge');
    const badge2 = document.getElementById('watchlistCountHeader');
    if (badge1) badge1.innerText = watchlist.length;
    if (badge2) badge2.innerText = watchlist.length;
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
                        <span class="font-bold text-blue-400 block mb-1">Estratégia de ${selectedAnalystDetail}:</span>
                        ${analystDescriptions[selectedAnalystDetail]}
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
        
        const peVal = stock.pe && stock.pe > 0 ? stock.pe.toFixed(1) : 'N/A';

        tr.innerHTML = `
            <td class="p-3 text-center">
                <button onclick="toggleWatchlist('${stock.ticker}')" class="text-lg focus:outline-none">
                    <i class="fa-solid fa-star ${isStarred ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}"></i>
                </button>
            </td>
            <td class="p-3 font-bold text-white">${stock.ticker}<span class="block text-xs font-normal text-slate-400">${stock.name}</span></td>
            <td class="p-3 text-xs text-slate-300">${stock.market}</td>
            <td class="p-3 text-xs text-slate-400 font-semibold text-blue-300">${stock.sector || 'Geral'}</td>
            <td class="p-3 font-semibold text-emerald-400">€${stock.price ? stock.price.toFixed(2) : '-'}</td>
            <td class="p-3 text-xs text-slate-400">${stock.origPrice ? stock.origPrice.toFixed(2) : ''} ${stock.origCurrency || ''}</td>
            <td class="p-3 font-bold ${stock.ret1D >= 0 ? 'positive' : 'negative'}">${stock.ret1D}%</td>
            <td class="p-3 font-semibold text-slate-300">${peVal}</td>
            <td class="p-3">${generateSparklineSVG(stock.spark)}</td>
            <td class="p-3">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${signal.pass ? 'badge-pass' : 'badge-fail'}">
                            ${signal.text}
                        </span>
                        <div class="relative group inline-block">
                            <i class="fa-solid fa-circle-info text-slate-400 hover:text-white cursor-pointer text-xs"></i>
                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2.5 bg-slate-900 border border-slate-700 text-slate-200 text-[10px] rounded shadow-xl z-50 pointer-events-none">
                                <span class="font-bold text-blue-400 block mb-0.5">Justificação (${activeProf}):</span>
                                ${signal.detail}
                            </div>
                        </div>
                        <select onchange="changeStockAnalyst('${stock.ticker}', this.value)" class="bg-slate-900 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500">
                            <option value="HDL" ${activeProf === 'HDL' ? 'selected' : ''}>HDL</option>
                            <option value="Buffett" ${activeProf === 'Buffett' ? 'selected' : ''}>Buffett</option>
                            <option value="Graham" ${activeProf === 'Graham' ? 'selected' : ''}>Graham</option>
                            <option value="Simons" ${activeProf === 'Simons' ? 'selected' : ''}>Simons</option>
                            <option value="Burry" ${activeProf === 'Burry' ? 'selected' : ''}>Burry</option>
                            <option value="Dalio" ${activeProf === 'Dalio' ? 'selected' : ''}>Dalio</option>
                        </select>
                    </div>
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
    if (!tbody) return;
    tbody.innerHTML = '';

    const starredStocks = globalDatabase.filter(s => watchlist.includes(s.ticker));

    const badge1 = document.getElementById('watchlistCountBadge');
    const badge2 = document.getElementById('watchlistCountHeader');
    if (badge1) badge1.innerText = watchlist.length;
    if (badge2) badge2.innerText = watchlist.length;

    if (starredStocks.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (wrapper) wrapper.classList.add('hidden');
        return;
    } else {
        if (emptyState) emptyState.classList.add('hidden');
        if (wrapper) wrapper.classList.remove('hidden');
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
                        <div class="relative group inline-block">
                            <i class="fa-solid fa-circle-info text-slate-400 hover:text-white cursor-pointer text-xs"></i>
                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2.5 bg-slate-900 border border-slate-700 text-slate-200 text-[10px] rounded shadow-xl z-50 pointer-events-none">
                                <span class="font-bold text-blue-400 block mb-0.5">Justificação (${activeProf}):</span>
                                ${signal.detail}
                            </div>
                        </div>
                        <select onchange="changeStockAnalyst('${stock.ticker}', this.value)" class="bg-slate-900 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500">
                            <option value="HDL" ${activeProf === 'HDL' ? 'selected' : ''}>HDL</option>
                            <option value="Buffett" ${activeProf === 'Buffett' ? 'selected' : ''}>Buffett</option>
                            <option value="Graham" ${activeProf === 'Graham' ? 'selected' : ''}>Graham</option>
                            <option value="Simons" ${activeProf === 'Simons' ? 'selected' : ''}>Simons</option>
                            <option value="Burry" ${activeProf === 'Burry' ? 'selected' : ''}>Burry</option>
                            <option value="Dalio" ${activeProf === 'Dalio' ? 'selected' : ''}>Dalio</option>
                        </select>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}