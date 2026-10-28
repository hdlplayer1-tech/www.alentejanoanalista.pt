# Global Market Bot & Screener (Live API Node.js Edition)

Este é um projeto web completo e profissional em **Node.js / Express** ligado a uma **API Financeira Global em Tempo Real** (com suporte para Yahoo Finance Proxy e Finnhub).

## Estrutura do Projeto
- `backend/server.js`: Servidor Express que faz o proxy das chamadas para as bolsas globais.
- `frontend/index.html`: Interface do Screener de Mercado e Watchlist.
- `frontend/app.js`: Lógica cliente em JavaScript.
- `package.json`: Ficheiro de dependências do Node.js.

## Como Executar
1. Instale o Node.js na sua máquina.
2. Abra o terminal na pasta do projeto e execute:
   ```bash
   npm install
   npm start
   ```
3. Abra o navegador em `http://localhost:3000`.

## Recursos Incluídos
- **21 Bolsas Mundiais**: Índia (NSE/BSE com `RELIANCE.NS`, `TCS.NS`, `INFY.NS`), Portugal, Brasil, EUA, Reino Unido, Espanha, França, Alemanha, Suíça, Japão, etc.
- **5 Modelos de Investimento**: Warren Buffett, Benjamin Graham, Jim Simons, Michael Burry e HDL.
- **Consultas ilimitadas**: Escreva qualquer Ticker na barra de pesquisa para puxar cotações em tempo real através da API do servidor.
