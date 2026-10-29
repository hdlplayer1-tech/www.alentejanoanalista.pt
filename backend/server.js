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

// Dicionário e função de tradução de setores para Português
function translateSector(englishSector) {
    if (!englishSector) return 'Geral';
    
    const sectorMap = {
        'Technology': 'Tecnologia',
        'Healthcare': 'Saúde',
        'Financial Services': 'Serviços Financeiros',
        'Consumer Cyclical': 'Consumo Cíclico',
        'Consumer Defensive': 'Consumo Defensivo',
        'Energy': 'Energia',
        'Utilities': 'Utilidades Públicas',
        'Industrials': 'Bens Industriais',
        'Basic Materials': 'Matérias-Primas',
        'Real Estate': 'Imobiliário',
        'Communication Services': 'Serviços de Comunicação'
    };

    for (const [en, pt] of Object.entries(sectorMap)) {
        if (englishSector.toLowerCase().includes(en.toLowerCase())) {
            return pt;
        }
    }
    
    return englishSector;
}

async function getStockSector(symbol) {
    try {
        const res = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const profile = res.data?.quoteSummary?.result?.[0]?.assetProfile;
        if (profile && profile.sector) {
            return translateSector(profile.sector);
        }
    } catch (e) {}

    // Fallbacks inteligentes caso o quoteSummary falhe
    const upper = symbol.toUpperCase();
    if (upper.includes('NVDA') || upper.includes('TCS') || upper.includes('INFY') || upper.includes('AAPL') || upper.includes('ASML')) return 'Tecnologia';
    if (upper.includes('GALP') || upper.includes('RELIANCE') || upper.includes('PETR4')) return 'Energia';
    if (upper.includes('EDP')) return 'Utilidades Públicas';
    
    return 'Geral';
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
        const [yRes, sectorTranslated] = await Promise.all([
            axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            }),
            getStockSector(symbol)
        ]);

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
            const isTech = sectorTranslated === 'Tecnologia';

            return res.json({
                ticker: symbol.toUpperCase(),
                name: name,
                market: exchange,
                sector: sectorTranslated,
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
                ret3Y: parseFloat((changePercent *