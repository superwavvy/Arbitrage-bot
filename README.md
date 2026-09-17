# Arbitrum Arbitrage Detector 🤖

A Node.js bot that scans Uniswap V3 and Camelot V3 on Arbitrum for WETH/USDC arbitrage opportunities. Features live Discord notifications and on-chain liquidity checks.

## 🚀 Features
- **Multi-DEX Scanning:** Queries Uniswap V3 and Camelot V3.
- **On-Chain Price Quotes:** Uses Ethers v6 `staticCall` to simulate swaps without gas fees.
- **Liquidity Guard:** Checks pool reserves to filter out "ghost pools" and fake spreads.
- **Discord Alerts:** Sends startup notifications and real-time arbitrage alerts.
- **Secure Configuration:** Uses `.env` for API keys and RPC URLs.

## 🛠️ Tech Stack
- **Runtime:** Node.js (v20+)
- **Blockchain:** Arbitrum One (Chain ID: 42161)
- **Library:** Ethers.js v6
- **APIs:** Alchemy (RPC), Discord Webhooks

## 📦 Installation
1. Clone the repo:
   `git clone git@github.com:superwavvy/Arbitrage-bot.git`
2. Install dependencies:
   `npm install`
3. Create a `.env` file:
   ```env
   ARBITRUM_RPC=your_alchemy_rpc_url
   DISCORD_WEBHOOK_URL=your_discord_webhook_url
