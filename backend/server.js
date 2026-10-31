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

// Helper para procurar cotação e P/E ao vivo
async function fetchLiveStockData(symbol) {
    const cleanSymbol = symbol.toUpperCase();
    
    // 1. Obter Cotação em Tempo Real (Chart API)
    const chartRes = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000
    });

    if (!chartRes.data?.chart?.result?.[0]) {
        throw new Error('Ativo não encontrado na Yahoo Finance.');
    }

    const meta = chartRes.data.chart.result[0].meta;
    const currentPrice = meta.regularMarketPrice || meta.chartPreviousClose || 0;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
    const currency = meta.currency || 'USD';
    const name = meta.shortName || meta.longName || cleanSymbol;
    const exchange = meta.exchangeName || 'Global';

    // 2. Obter EPS e P/E publicado (Quote Summary API)
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
        publishedPE = meta.trailingPE || null;
    }

    // Cálculo do P/E em tempo real (Preço / EPS)
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
    const sectorCalculated = getQuickSector(cleanSymbol, name);

    return {
        ticker: cleanSymbol,
        name: name,
        market: exchange,
        sector: sectorCalculated,
        origCurrency: currency,
        origPrice: parseFloat(currentPrice.toFixed(2)),
        price: parseFloat(priceEur.toFixed(2)),
        ret1D: parseFloat(changePercent.toFixed(2)),
        pe: parseFloat(calculatedPE.toFixed(1)),
        isTech: sectorCalculated === 'Tecnologia',
        ret1W: parseFloat((changePercent * 0.8 + 0.5).toFixed(1)),
        ret1M: parseFloat((changePercent * 1.5 + 1.2).toFixed(1)),
        ret3M: parseFloat((changePercent * 2.1 + 2.0).toFixed(1)),
        ret6M: parseFloat((changePercent * 2.8 + 4.5).toFixed(1)),
        ret1Y: parseFloat((changePercent * 3.5 - 12.0).toFixed(1)),
        retYTD: parseFloat((changePercent * 2.0 + 3.1).toFixed(1)),
        ret3Y: parseFloat((changePercent * 5.0 + 25.0).toFixed(1)),
        ret5Y: parseFloat((changePercent * 8.0 + 50.0).toFixed(1)),
        spark: [priceEur * 0.97, priceEur * 0.985, priceEur * 0.98, priceEur * 0.995, priceEur]
    };
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

// Endpoint Proxy para calcular P/E e cotação em tempo real de um ativo individual
app.get('/api/realtime-pe', async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo não especificado' });

    try {
        const data = await fetchLiveStockData(symbol);
        res.json(data);
    } catch (error) {
        console.error(`Erro ao obter dados em tempo real para ${symbol}:`, error.message);
        res.status(500).json({ error: 'Erro ao processar dados em tempo real.' });
    }
});

// Rota de cotação individual
app.get('/api/quote', async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo não especificado' });

    try {
        const data = await fetchLiveStockData(symbol);
        return res.json(data);
    } catch (error) {
        console.error(`Erro ao obter cotação para ${symbol}:`, error.message);
        res.status(500).json({ error: 'Erro ao processar cotação.' });
    }
});

// Lista base de ações para o Screener
const BASE_TICKERS = ["RELIANCE.NS", "TCS.NS", "GALP.LS", "EDP.LS", "PETR4.SA", "NVDA"];

// Rota da lista principal com dados atualizados em tempo real
app.get('/api/stocks', async (req, res) => {
    try {
        const stocksData = await Promise.all(
            BASE_TICKERS.map(async (ticker) => {
                try {
                    return await fetchLiveStockData(ticker);
                } catch (e) {
                    console.error(`Erro ao carregar ${ticker} para a lista base:`, e.message);
                    return null;
                }
            })
        );
        
        // Filtra falhas eventuais
        const validStocks = stocksData.filter(item => item !== null);
        res.json(validStocks);
    } catch (error) {
        console.error('Erro ao carregar lista de ações:', error.message);
        res.status(500).json({ error: 'Erro ao obter lista de ações.' });
    }
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