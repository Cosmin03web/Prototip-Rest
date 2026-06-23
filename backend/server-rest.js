require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const client = require('prom-client');

const app = express();
app.use(cors());

const FINNHUB_KEY = process.env.FINNHUB_KEY;

// --- CONFIGURARE PROMETHEUS ---
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
});

// --- API GATEWAY COMPLEX ---
app.get('/api/dashboard', async (req, res) => {
    try {
        const binanceSymbols = encodeURI('["BTCUSDT","ETHUSDT","SOLUSDT"]');

        const [binanceRes, frankfurterRes, coinGeckoRes, aaplRes, msftRes, nvdaRes] = await Promise.all([
            axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbols=${binanceSymbols}`).catch(() => ({ data: [] })),
            
            axios.get('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,RON,CHF').catch(() => ({ data: { error: true } })),
            
            axios.get('https://api.coingecko.com/api/v3/search/trending').catch(() => ({ data: { error: true } })),
            
            axios.get(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${FINNHUB_KEY}`).catch(() => ({ data: { error: true } })),
            axios.get(`https://finnhub.io/api/v1/quote?symbol=MSFT&token=${FINNHUB_KEY}`).catch(() => ({ data: { error: true } })),
            axios.get(`https://finnhub.io/api/v1/quote?symbol=NVDA&token=${FINNHUB_KEY}`).catch(() => ({ data: { error: true } }))
        ]);

        const cryptoData = Array.isArray(binanceRes.data) ? binanceRes.data : [];
        const btc = cryptoData.find(c => c.symbol === 'BTCUSDT');
        const eth = cryptoData.find(c => c.symbol === 'ETHUSDT');
        const sol = cryptoData.find(c => c.symbol === 'SOLUSDT');

        const formatStock = (res, symbolName) => {
            if (res.data.error || !res.data.c) return null;
            return {
                symbol: symbolName,
                price: parseFloat(res.data.c).toFixed(2),
                changePercent: parseFloat(res.data.dp).toFixed(2)
            };
        };
        const stocksData = [
            formatStock(aaplRes, 'AAPL (Apple)'),
            formatStock(msftRes, 'MSFT (Microsoft)'),
            formatStock(nvdaRes, 'NVDA (Nvidia)')
        ].filter(s => s !== null);

        let trendingCoins = [];
        let trendingNFTs = [];
        if (!coinGeckoRes.data.error) {
            if (coinGeckoRes.data.coins) {
                trendingCoins = coinGeckoRes.data.coins.slice(0, 3).map(c => ({
                    name: c.item.name, symbol: c.item.symbol
                }));
            }
            if (coinGeckoRes.data.nfts) {
                trendingNFTs = coinGeckoRes.data.nfts.slice(0, 3).map(n => ({
                    name: n.name, symbol: n.symbol
                }));
            }
        }

        const fiatData = frankfurterRes.data.error ? null : {
            date: frankfurterRes.data.date,
            rates: frankfurterRes.data.rates
        };

        const dashboardData = {
            timestamp: new Date().toISOString(),
            bitcoin: btc ? { price: parseFloat(btc.lastPrice).toFixed(2), change: parseFloat(btc.priceChangePercent).toFixed(2) } : null,
            altcoins: [
                eth ? { symbol: 'ETH', price: parseFloat(eth.lastPrice).toFixed(2), change: parseFloat(eth.priceChangePercent).toFixed(2) } : null,
                sol ? { symbol: 'SOL', price: parseFloat(sol.lastPrice).toFixed(2), change: parseFloat(sol.priceChangePercent).toFixed(2) } : null
            ].filter(a => a !== null),
            stocks: stocksData,
            fiat: fiatData,
            trending: {
                crypto: trendingCoins,
                nfts: trendingNFTs
            }
        };

        res.json(dashboardData);

    } catch (error) {
        console.error("Eroare Gateway:", error.message);
        res.status(500).json({ error: "Eroare internă Gateway" });
    }
});

const PORT = 3000;
const path = require('path');
app.use(express.static(path.join(__dirname, 'frontend-dashboard/build')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend-dashboard/build', 'index.html'));
});
app.listen(PORT, () => {
    console.log(`[REST Gateway] Serverul rulează pe http://localhost:${PORT}`);
});
