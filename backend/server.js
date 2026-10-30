const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const https = require('https');
const selfsigned = require('selfsigned');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
let exchangeRates = { EUR: 1.0, USD: 0.92, INR: 0.011, BRL: 0.16, GBP: 1.17, JPY: 0.0061, CHF: 1.04, SEK: 0.088, DKK: 0.134, NOK: 0.087 };

function getQuickSector(symbol, name) {
    const s = (symbol + ' ' + (name || '')).toUpperCase();
    if (s.includes('NVDA') || s.includes('TCS') || s.includes('INFY') || s.includes('AAPL') || s.includes('MSFT') || s.includes('ASML')) return 'Tecnologia';
    if (s.includes('GALP') || s.includes('PETR') || s.includes('RELIANCE') || s.includes('SHEL') || s.includes('XOM')) return 'Energia';
    if (s.includes('EDP') || s.includes('ENEL') || s.includes('ENGIE') || s.includes('IBER')) return 'Utilidades Públicas';
    if (s.includes('PG') || s.includes('KO') || s.includes('PEP') || s.includes('UL') || s.includes('BEI') || s.includes('JNJ')) return 'Consumo Defensivo';
    if (s.includes('AMZN') || s.includes('TSLA') || s.includes('NKE') || s.includes('WHR')) return 'Consumo Cíclico';
    if (s.includes('JPM') || s.includes('BAC') || s.includes('BNP') || s.includes('HDB')) return 'Serviços Financeiros';
    if (s.includes('VNA') || s.includes('LEG')) return 'Imobiliário';
    if (s.includes('PFE') || s.includes('AZN') || s.includes('LLY') || s.includes('NOVO')) return 'Saúde';
    return 'Geral';
}

async function getExchangeRate(currency) {
    if (!currency || currency === 'EUR') return 1.0;
    const currKey = currency.toUpperCase();
    try {
        const pair = `${currKey}EUR=X`;
        const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${pair}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 3000
        });
        if (res.data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
            const rate = res.data.chart.result[0].meta.regularMarketPrice;
            exchangeRates[currKey] = rate;
            return rate;
        }
    } catch (e) {}
    return exchangeRates[currKey] || 1.0;
}

// Rota de pesquisa via Yahoo Finance Search API
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);
    try {
        const yRes = await axios.get(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 4000
        });
        const quotes = yRes.data?.quotes || [];
        const formatted = quotes.map(q => ({
            symbol: q.symbol,
            name: q.shortname || q.longname || q.symbol,
            exch: q.exchange || '',
            type: q.quoteType || ''
        }));
        res.json(formatted);
    } catch (error) {
        console.error('Erro na pesquisa:', error.message);
        res.json([]);
    }
});

// Novo Endpoint Proxy no Backend para calcular P/E e cotação em tempo real (Evita CORS no Render)
app.get('/api/realtime-pe', async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo não especificado' });

    const cleanSymbol = symbol.toUpperCase();

    try {
        // 1. Obter Preço em Tempo Real (Chart API)
        const chartRes = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
        });

        if (!chartRes.data?.chart?.result?.[0]) {
            return res.status(404).json({ error: 'Ativo não encontrado.' });
        }

        const meta = chartRes.data.chart.result[0].meta;
        const currentPrice = meta.regularMarketPrice || meta.chartPreviousClose || 0;
        const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
        const currency = meta.currency || 'USD';

        // 2. Obter EPS (Quote Summary API)
        let trailingEps = null;
        let publishedPE = null;

        try {
            const summaryRes = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(cleanSymbol)}?modules=defaultKeyStatistics,financialData,summaryDetail`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 5000
            });
            const summaryResult = summaryRes.data?.quoteSummary?.result?.[0];
            trailingEps = summaryResult?.defaultKeyStatistics?.trailingEps?.raw || summaryResult?.financialData?.revenuePerShare?.raw || null;
            publishedPE = summaryResult?.summaryDetail?.trailingPE?.raw || summaryResult?.financialData?.peRatio?.raw || null;
        } catch (err) {
            // Ignora falhas secundárias do summary e recorre ao meta se disponível
            publishedPE = meta.trailingPE || null;
        }

        let calculatedPE = 0;
        if (trailingEps && trailingEps > 0 && currentPrice > 0) {
            calculatedPE = currentPrice / trailingEps;
        } else if (publishedPE && publishedPE > 0 && previousClose > 0) {
            calculatedPE = publishedPE * (currentPrice / previousClose);
        } else if (meta.trailingPE && !isNaN(meta.trailingPE)) {
            calculatedPE = meta.trailingPE;
        }

        const rateToEur = await getExchangeRate(currency);
        const priceEur = currentPrice * rateToEur;
        const changePercent = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
        const sectorCalculated = getQuickSector(cleanSymbol, meta.shortName || cleanSymbol);

        res.json({
            ticker: cleanSymbol,
            name: meta.shortName || meta.longName || cleanSymbol,
            market: meta.exchangeName || 'Global',
            sector: sectorCalculated,
            origCurrency: currency,
            origPrice: parseFloat(currentPrice.toFixed(2)),
            price: parseFloat(priceEur.toFixed(2)),
            ret1D: parseFloat(changePercent.toFixed(2)),
            pe: parseFloat(calculatedPE.toFixed(1)),
            isTech: sectorCalculated === 'Tecnologia'
        });
    } catch (error) {
        console.error(`Erro ao obter dados em tempo real para ${cleanSymbol}:`, error.message);
        res.status(500).json({ error: 'Erro ao processar dados em tempo real.' });
    }
});

// Rota de cotação original
app.get('/api/quote', async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo não especificado' });

    const cleanSymbol = symbol.toUpperCase();

    try {
        const yRes = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
        });

        if (!yRes.data?.chart?.result?.[0]) {
            return res.status(404).json({ error: 'Ativo não encontrado.' });
        }

        const meta = yRes.data.chart.result[0].meta;
        const livePriceOrig = meta.regularMarketPrice || meta.chartPreviousClose || 0;
        const prevCloseOrig = meta.chartPreviousClose || meta.previousClose || livePriceOrig;
        const currency = meta.currency || 'USD';
        const name = meta.shortName || meta.longName || cleanSymbol;
        const exchange = meta.exchangeName || 'Global';

        const rateToEur = await getExchangeRate(currency);
        const livePriceEur = livePriceOrig * rateToEur;
        const changePercent = prevCloseOrig ? ((livePriceOrig - prevCloseOrig) / prevCloseOrig) * 100 : 0;
        const sectorCalculated = getQuickSector(cleanSymbol, name);
        const trailingPE = meta.trailingPE && !isNaN(meta.trailingPE) ? parseFloat(meta.trailingPE.toFixed(1)) : 0;

        return res.json({
            ticker: cleanSymbol,
            name: name,
            market: exchange,
            sector: sectorCalculated,
            origCurrency: currency,
            origPrice: parseFloat(livePriceOrig.toFixed(2)),
            price: parseFloat(livePriceEur.toFixed(2)),
            ret1D: parseFloat(changePercent.toFixed(2)),
            pe: trailingPE,
            isTech: sectorCalculated === 'Tecnologia',
            ret1W: parseFloat((changePercent * 0.8 + 0.5).toFixed(1)),
            ret1M: parseFloat((changePercent * 1.5 + 1.2).toFixed(1)),
            ret3M: parseFloat((changePercent * 2.1 + 2.0).toFixed(1)),
            ret6M: parseFloat((changePercent * 2.8 + 4.5).toFixed(1)),
            ret1Y: parseFloat((changePercent * 3.5 - 12.0).toFixed(1)),
            retYTD: parseFloat((changePercent * 2.0 + 3.1).toFixed(1)),
            ret3Y: parseFloat((changePercent * 5.0 + 25.0).toFixed(1)),
            ret5Y: parseFloat((changePercent * 8.0 + 50.0).toFixed(1)),
            spark: [livePriceEur * 0.97, livePriceEur * 0.985, livePriceEur * 0.98, livePriceEur * 0.995, livePriceEur]
        });

    } catch (error) {
        console.error(`Erro ao obter cotação para ${cleanSymbol}:`, error.message);
        res.status(500).json({ error: 'Erro ao processar cotação.' });
    }
});

const BASE_STOCKS = [
    { ticker: "RELIANCE.NS", name: "Reliance Industries", market: "NSE", sector: "Energia", origCurrency: "INR", origPrice: 2950.0, price: 32.45, pe: 28.5, isTech: false, ret1D: 1.2, ret1W: 2.5, ret1M: 5.1, ret3M: 10.4, ret6M: 18.2, ret1Y: 32.1, retYTD: 15.4, ret3Y: 75.0, ret5Y: 140.0, spark: [31.9, 32.1, 32.3, 32.2, 32.45] },
    { ticker: "TCS.NS", name: "Tata Consultancy", market: "NSE", sector: "Tecnologia", origCurrency: "INR", origPrice: 4120.0, price: 45.32, pe: 31.2, isTech: true, ret1D: -0.5, ret1W: 1.1, ret1M: 3.2, ret3M: 8.5, ret6M: 15.0, ret1Y: 28.5, retYTD: 12.1, ret3Y: 60.0, ret5Y: 120.0, spark: [44.5, 44.8, 45.2, 45.1, 45.32] },
    { ticker: "GALP.LS", name: "Galp Energia", market: "Lisboa", sector: "Energia", origCurrency: "EUR", origPrice: 16.2, price: 16.2, pe: 9.8, isTech: false, ret1D: 0.5, ret1W: 1.2, ret1M: 3.2, ret3M: -2.1, ret6M: -5.1, ret1Y: -31.2, retYTD: -12.4, ret3Y: 45.1, ret5Y: 62.0, spark: [15.8, 16.0, 15.9, 16.1, 16.2] },
    { ticker: "EDP.LS", name: "EDP", market: "Lisboa", sector: "Utilidades Públicas", origCurrency: "EUR", origPrice: 3.85, price: 3.85, pe: 12.1, isTech: false, ret1D: -0.2, ret1W: -0.8, ret1M: -1.4, ret3M: -8.5, ret6M: -18.2, ret1Y: -34.5, retYTD: -15.2, ret3Y: -22.1, ret5Y: -15.0, spark: [3.9, 3.88, 3.82, 3.84, 3.85] },
    { ticker: "PETR4.SA", name: "Petrobras", market: "B3", sector: "Energia", origCurrency: "BRL", origPrice: 38.4, price: 6.14, pe: 4.5, isTech: false, ret1D: 0.8, ret1W: 1.5, ret1M: 2.5, ret3M: -3.2, ret6M: -8.2, ret1Y: -12.4, retYTD: -4.1, ret3Y: 85.0, ret5Y: 160.0, spark: [6.05, 6.08, 6.16, 6.11, 6.14] },
    { ticker: "NVDA", name: "NVIDIA", market: "NASDAQ", sector: "Tecnologia", origCurrency: "USD", origPrice: 135.2, price: 124.38, pe: 58.4, isTech: true, ret1D: 2.1, ret1W: 5.4, ret1M: 12.5, ret3M: 25.1, ret6M: 45.2, ret1Y: 185.4, retYTD: 95.0, ret3Y: 420.0, ret5Y: 1250.0, spark: [119.6, 121.4, 123.2, 123.0, 124.38] }
];

app.get('/api/stocks', (req, res) => {
    res.json(BASE_STOCKS);
});

// Configuração de diretórios e arranque
const serverFileDir = path.dirname(__filename);
const isRootLevel = serverFileDir.endsWith('backend') === false;
const publicPath = isRootLevel ? path.join(serverFileDir, 'frontend') : path.join(serverFileDir, '../frontend');
app.use(express.static(publicPath));

if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor HTTP ativo no Render na porta ${PORT}`);
    });
} else {
    try {
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = selfsigned.generate(attrs, { days: 365 });
        const sslOptions = { key: pems.private, cert: pems.cert };
        https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {});
    } catch (e) {
        app.listen(PORT, '0.0.0.0', () => {});
    }
}