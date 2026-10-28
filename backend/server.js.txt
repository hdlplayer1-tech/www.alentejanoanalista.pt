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
app.use(express.static(path.join(__dirname, '../frontend')));

const PORT = process.env.PORT || 3000;

// Cache de taxas de câmbio
let exchangeRates = { EUR: 1.0, USD: 0.92, INR: 0.011, BRL: 0.16, GBP: 1.17, JPY: 0.0061, CHF: 1.04, SEK: 0.088, DKK: 0.134, NOK: 0.087 };

async function getExchangeRate(currency) {
    if (!currency || currency === 'EUR') return 1.0;
    const currKey = currency.toUpperCase();
    try {
        const pair = `${currKey}EUR=X`;
        const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${pair}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (res.data && res.data.chart && res.data.chart.result && res.data.chart.result[0]) {
            const rate = res.data.chart.result[0].meta.regularMarketPrice;
            if (rate) {
                exchangeRates[currKey] = rate;
                return rate;
            }
        }
    } catch (e) {}
    return exchangeRates[currKey] || 1.0;
}

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);
    try {
        const response = await axios.get(`https://query1.finance.yahoo.com/v6/finance/autocomplete?query=${encodeURIComponent(query)}&lang=en-US`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const quotes = response.data?.ResultSet?.Result || [];
        const results = quotes.map(q => ({
            symbol: q.symbol,
            name: q.name,
            exch: q.exchDisp || q.exch,
            type: q.typeDisp || q.type
        }));
        res.json(results);
    } catch (error) {
        console.error('Erro na pesquisa do Yahoo Finance:', error.message);
        res.json([]);
    }
});

app.get('/api/quote', async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo não especificado' });

    try {
        const yRes = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (yRes.data && yRes.data.chart && yRes.data.chart.result && yRes.data.chart.result[0]) {
            const meta = yRes.data.chart.result[0].meta;
            const livePriceOrig = meta.regularMarketPrice;
            const currency = meta.currency || 'USD';
            
            const rateToEur = await getExchangeRate(currency);
            const livePriceEur = livePriceOrig * rateToEur;

            const prevCloseOrig = meta.chartPreviousClose || meta.previousClose || livePriceOrig;
            const changePercent = ((livePriceOrig - prevCloseOrig) / prevCloseOrig) * 100;
            const name = meta.longName || meta.shortName || symbol;
            const exchange = meta.exchangeName || 'Global Exchange';

            const peCalculated = meta.trailingPE || (symbol.includes('NVDA') ? 58.4 : symbol.includes('TCS') ? 31.2 : 18.5);
            const isTech = symbol.includes('TCS') || symbol.includes('INFY') || symbol.includes('NVDA') || symbol.includes('AAPL') || symbol.includes('ASML');

            return res.json({
                ticker: symbol.toUpperCase(),
                name: name,
                market: exchange,
                sector: isTech ? 'Tecnologia' : 'Geral',
                origCurrency: currency,
                origPrice: parseFloat(livePriceOrig.toFixed(2)),
                price: parseFloat(livePriceEur.toFixed(2)),
                ret1D: parseFloat(changePercent.toFixed(2)),
                pe: parseFloat(peCalculated.toFixed(1)),
                isTech: isTech,
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
        }
        res.status(404).json({ error: 'Ativo não encontrado.' });
    } catch (error) {
        console.error('Erro na cotação do Yahoo Finance:', error.message);
        res.status(500).json({ error: 'Erro ao contactar API de cotações.' });
    }
});

const BASE_STOCKS = [
    { ticker: "RELIANCE.NS", name: "Reliance Industries", market: "NSE (Índia)", sector: "Energia / Diversificado", origCurrency: "INR", origPrice: 2950.0, price: 32.45, pe: 28.5, isTech: false, ret1D: 1.2, ret1W: 2.5, ret1M: 5.1, ret3M: 10.4, ret6M: 18.2, ret1Y: 32.1, retYTD: 15.4, ret3Y: 75.0, ret5Y: 140.0, spark: [31.90, 32.10, 32.30, 32.20, 32.45] },
    { ticker: "TCS.NS", name: "Tata Consultancy Services", market: "NSE (Índia)", sector: "Tecnologia / Software", origCurrency: "INR", origPrice: 4120.0, price: 45.32, pe: 31.2, isTech: true, ret1D: -0.5, ret1W: 1.1, ret1M: 3.2, ret3M: 8.5, ret6M: 15.0, ret1Y: 28.5, retYTD: 12.1, ret3Y: 60.0, ret5Y: 120.0, spark: [44.55, 44.88, 45.21, 45.10, 45.32] },
    { ticker: "GALP.LS", name: "Galp Energia", market: "Euronext Lisboa (Portugal)", sector: "Energia / Petróleo", origCurrency: "EUR", origPrice: 16.20, price: 16.20, pe: 9.8, isTech: false, ret1D: 0.5, ret1W: 1.2, ret1M: 3.2, ret3M: -2.1, ret6M: -5.1, ret1Y: -31.2, retYTD: -12.4, ret3Y: 45.1, ret5Y: 62.0, spark: [15.8, 16.0, 15.9, 16.1, 16.2] },
    { ticker: "EDP.LS", name: "EDP - Energias de Portugal", market: "Euronext Lisboa (Portugal)", sector: "Utilidades / Renováveis", origCurrency: "EUR", origPrice: 3.85, price: 3.85, pe: 12.1, isTech: false, ret1D: -0.2, ret1W: -0.8, ret1M: -1.4, ret3M: -8.5, ret6M: -18.2, ret1Y: -34.5, retYTD: -15.2, ret3Y: -22.1, ret5Y: -15.0, spark: [3.9, 3.88, 3.82, 3.84, 3.85] },
    { ticker: "PETR4.SA", name: "Petrobras (PN)", market: "B3 (Brasil)", sector: "Energia / Petróleo", origCurrency: "BRL", origPrice: 38.40, price: 6.14, pe: 4.5, isTech: false, ret1D: 0.8, ret1W: 1.5, ret1M: 2.5, ret3M: -3.2, ret6M: -8.2, ret1Y: -12.4, retYTD: -4.1, ret3Y: 85.0, ret5Y: 160.0, spark: [6.05, 6.08, 6.16, 6.11, 6.14] },
    { ticker: "NVDA", name: "NVIDIA Corp.", market: "NASDAQ (EUA)", sector: "Tecnologia / Semicondutores", origCurrency: "USD", origPrice: 135.2, price: 124.38, pe: 58.4, isTech: true, ret1D: 2.1, ret1W: 5.4, ret1M: 12.5, ret3M: 25.1, ret6M: 45.2, ret1Y: 185.4, retYTD: 95.0, ret3Y: 420.0, ret5Y: 1250.0, spark: [119.6, 121.4, 123.2, 123.0, 124.38] }
];

app.get('/api/stocks', (req, res) => {
    res.json(BASE_STOCKS);
});

// Inicialização do servidor compatível com o Render e Local
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor HTTP ativo no Render na porta ${PORT}`);
    });
} else {
    try {
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = selfsigned.generate(attrs, { days: 365 });
        const sslOptions = { key: pems.private, cert: pems.cert };
        
        https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor HTTPS Seguro Local Ativo em https://localhost:${PORT}`);
        });
    } catch (e) {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor Local HTTP ativo na porta ${PORT}`);
        });
    }
}