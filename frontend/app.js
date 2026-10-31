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
            <td class="p-3">
                <strong>${peVal}</strong>
                <span class="text-[10px] text-amber-400 block font-normal">ao vivo</span>
            </td>
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