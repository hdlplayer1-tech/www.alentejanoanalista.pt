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

let exchangeRates = { EUR: 1.0, USD: 0.92, INR: 0.011, BRL: 0.16, GBP: 1.17, JPY: 0.0061, CHF: 1.04, SEK: 0.088, DKK: 0.134, NOK: 0.087 };

async function getExchangeRate(currency) {
    if (!currency || currency === 'EUR') return 1.0;
    const currKey = currency.toUpperCase();
    try {
        const pair = `${currKey}EUR=X`;
        const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${pair}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 3000
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

function getQuickSector(symbol, name) {
    const s = (symbol + ' ' + (name || '')).toUpperCase();
    
    if (s.includes('NVDA') || s.includes('TCS') || s.includes('INFY') || s.includes('AAPL') || s.includes('MSFT') || s.includes('ASML') || s.includes('AMD') || s.includes('INTC') || s.includes('GOOG')) {
        return 'Tecnologia';
    }
    if (s.includes('GALP') || s.includes('PETR') || s.includes('RELIANCE') || s.includes('SHEL') || s.includes('XOM') || s.includes('CVX') || s.includes('BP')) {
        return 'Energia';
    }
    if (s.includes('EDP') || s.includes('UTIL') || s.includes('ENGIE') || s.includes('IBERDROLA') || s.includes('NEE')) {
        return 'Utilidades Públicas';
    }
    if (s.includes('PG') || s.includes('KO') || s.includes('PEP') || s.includes('UL') || s.includes('JNJ') || s.includes('NESN')) {
        return 'Consumo Defensivo';
    }
    if (s.includes('AMZN') || s.includes('TSLA') || s.includes('NKE') || s.includes('MCD')) {
        return 'Consumo Cíclico';
    }
    if (s.includes('JPM') || s.includes('BAC') || s.includes('BNP') || s.includes('SAN') || s.includes('BCP')) {
        return 'Serviços Financeiros';
    }
    if (s.includes('PFE') || s.includes('AZN') || s.includes('NOVN') || s.includes('LLY')) {
        return 'Saúde';
    }
    return 'Geral';
}

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);
    try {
        const response = await axios.get(`https://query1.finance.yahoo.com/v6/finance/autocomplete?query=${encodeURIComponent(query)}&lang=en-US`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 4000
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
        console.error('Erro na pesquisa:', error.message);
        res.json([]);
    }
});

app.get('/api/quote', async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo não especificado' });

    try {
        // 1. Obter dados de preço e cotação (Chart)
        const yRes = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 5000
        });

        if (!yRes.data || !yRes.data.chart || !yRes.data.chart.result || !yRes.data.chart.result[0]) {
            return res.status(404).json({ error: 'Ativo não encontrado.' });
        }

        const meta = yRes.data.chart.result[0].meta;
        const livePriceOrig = meta.regularMarketPrice || meta.chartPreviousClose || 0;
        const currency = meta.currency || 'USD';
        
        const rateToEur = await getExchangeRate(currency);
        const livePriceEur = livePriceOrig * rateToEur;

        const prevCloseOrig = meta.chartPreviousClose || meta.previousClose || livePriceOrig;
        const changePercent = prevCloseOrig ? ((livePriceOrig - prevCloseOrig) / prevCloseOrig) * 100 : 0;
        const name = meta.longName || meta.shortName || symbol;
        const exchange = meta.exchangeName || 'Global Exchange';

        const sectorCalculated = getQuickSector(symbol, name);
        
        // 2. Obter P/E real e oficial na fonte de rácios do Yahoo (quoteSummary)
        let peCalculated = meta.trailingPE || 0;

        if (!peCalculated) {
            try {
                const summaryRes = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 4000
                });
                
                const resultObj = summaryRes.data?.quoteSummary?.result?.[0];
                const summaryDetail = resultObj?.summaryDetail;
                const keyStats = resultObj?.defaultKeyStatistics;

                peCalculated = summaryDetail?.trailingPE?.raw || 
                               keyStats?.trailingPE?.raw || 
                               summaryDetail?.forwardPE?.raw || 
                               keyStats?.forwardPE?.raw || 0;
            } catch (err) {
                console.log(`Não foi possível obter quoteSummary para ${symbol}`);
            }
        }

        const finalPe = peCalculated > 0 ? parseFloat(peCalculated.toFixed(1)) : 0;
        const isTech = sectorCalculated === 'Tecnologia';

        return res.json({
            ticker: symbol.toUpperCase(),
            name: name,
            market: exchange,
            sector: sectorCalculated,
            origCurrency: currency,
            origPrice: parseFloat(livePriceOrig.toFixed(2)),
            price: parseFloat(livePriceEur.toFixed(2)),
            ret1D: parseFloat(changePercent.toFixed(2)),
            pe: finalPe,
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

    } catch (error) {
        console.error('Erro na cotação:', error.message);
        res.status(500).json({ error: 'Erro ao contactar API de cotações.' });
    }
});

const BASE_STOCKS = [
    { ticker: "RELIANCE.NS", name: "Reliance Industries", market: "NSE (Índia)", sector: "Energia", origCurrency: "INR", origPrice: 2950.0, price: 32.45, pe: 28.5, isTech: false, ret1D: 1.2, ret1W: 2.5, ret1M: 5.1, ret3M: 10.4, ret6M: 18.2, ret1Y: 32.1, retYTD: 15.4, ret3Y: 75.0, ret5Y: 140.0, spark: [31.90, 32.10, 32.30, 32.20, 32.45] },
    { ticker: "TCS.NS", name: "Tata Consultancy Services", market: "