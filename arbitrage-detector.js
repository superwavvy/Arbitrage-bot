require('dotenv').config();
const { ethers } = require('ethers');

// --- 1. Setup Provider ---
const ARBITRUM_RPC = process.env.ARBITRUM_RPC;
if (!ARBITRUM_RPC) {
    console.error("ERROR: Missing ARBITRUM_RPC in .env file.");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC, {
    chainId: 42161,
    name: 'arbitrum'
});

// --- 2. Token Addresses ---
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// --- 3. Contract Addresses ---
const UNISWAP_V3_QUOTER = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const CAMELOT_V3_QUOTER = '0x0Fc73040b26E9bC8514fA028D998E73A254Fa76E';
const CAMELOT_V3_FACTORY = '0x1a3c9b1d2f0529d97f2afc5136cc23e58f1fd35b';

// --- 4. ABIs ---
const V3_FACTORY_ABI = ["function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"];
const CAMELOT_FACTORY_ABI = ["function poolByPair(address tokenA, address tokenB) external view returns (address pool)"];
const V3_POOL_ABI = ["function liquidity() external view returns (uint128)"];
const UNI_V3_QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];
const CAMELOT_V3_QUOTER_ABI = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) external returns (uint256 amountOut, uint16 fee)"
];

// --- 5. Contract Instances ---
const uniswapV3Factory = new ethers.Contract(UNISWAP_V3_FACTORY, V3_FACTORY_ABI, provider);
const uniswapV3Quoter = new ethers.Contract(UNISWAP_V3_QUOTER, UNI_V3_QUOTER_ABI, provider);
const camelotV3Factory = new ethers.Contract(CAMELOT_V3_FACTORY, CAMELOT_FACTORY_ABI, provider);
const camelotV3Quoter = new ethers.Contract(CAMELOT_V3_QUOTER, CAMELOT_V3_QUOTER_ABI, provider);

// --- 6. Discord Alert ---
async function sendDiscordAlert(message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (error) {
        console.error("Discord alert failed:", error.message);
    }
}

// --- 7. RPC Health Check ---
async function getRpcHealth() {
    const start = Date.now();
    try {
        await provider.getBlockNumber();
        return { status: "✅ OK", latency: `${Date.now() - start}ms` };
    } catch (e) {
        return { status: "🚨 FAILED", latency: "N/A" };
    }
}

// --- 8. Liquidity Checks (return null on failure, NOT 0n) ---
async function getUniswapV3Liquidity(tokenA, tokenB, fee) {
    try {
        const poolAddress = await uniswapV3Factory.getPool(tokenA, tokenB, fee);
        if (poolAddress === ethers.ZeroAddress) return null; // pool doesn't exist
        const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
        return await poolContract.liquidity();
    } catch (e) {
        console.log("⚠️ RPC Error (Uniswap liquidity):", e.message);
        return null; // UNKNOWN — not "zero"
    }
}

async function getCamelotV3Liquidity(tokenA, tokenB) {
    try {
        const poolAddress = await camelotV3Factory.poolByPair(tokenA, tokenB);
        if (poolAddress === ethers.ZeroAddress) return null;
        const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
        return await poolContract.liquidity();
    } catch (e) {
        console.log("⚠️ RPC Error (Camelot liquidity):", e.message);
        return null; // UNKNOWN — not "zero"
    }
}

// --- 9. Price Quotes ---
async function getUniV3Price(amountIn, fee) {
    try {
        const params = { tokenIn: WETH, tokenOut: USDC, amountIn, fee, sqrtPriceLimitX96: 0 };
        const result = await uniswapV3Quoter.quoteExactInputSingle.staticCall(params);
        return parseFloat(ethers.formatUnits(result[0], 6));
    } catch (e) {
        console.log("Uniswap V3 Quote Error:", e.message);
        return null;
    }
}

async function getCamelotV3Price(amountIn) {
    try {
        const result = await camelotV3Quoter.quoteExactInputSingle.staticCall(WETH, USDC, amountIn, 0);
        return parseFloat(ethers.formatUnits(result[0], 6));
    } catch (e) {
        console.log("Camelot V3 Quote Error:", e.message);
        return null;
    }
}

// --- 10. Price Impact Estimator ---
// Compares a small trade vs a large trade to estimate slippage
async function estimatePriceImpact() {
    const smallAmount = ethers.parseEther("0.1"); // 0.1 WETH — baseline
    const largeAmount = ethers.parseEther("2.0"); // 2 WETH — realistic trade size

    const smallPrice = await getUniV3Price(smallAmount, 500);
    const largePrice = await getUniV3Price(largeAmount, 500);

    if (smallPrice === null || largePrice === null) return null;
    if (smallPrice <= 0 || largePrice <= 0) return null;

    const impact = ((smallPrice - largePrice) / smallPrice) * 100;
    const absImpact = Math.abs(impact);

    // Sanity check: if impact is > 100%, the quote is unreliable
    // (likely hit the edge of concentrated liquidity)
    if (absImpact > 100) {
        return { smallPrice, largePrice, impact: null, unreliable: true };
    }

    return { smallPrice, largePrice, impact: absImpact, unreliable: false };
}

// --- 11. Main Logic ---
async function checkArbitrage() {
    console.log(`\n=========================================`);
    console.log(`[${new Date().toISOString()}] Checking Arbitrum Prices & Liquidity...`);

    const amountIn = ethers.parseEther("1.0");
    const rpcHealth = await getRpcHealth();

    const uniV3Liq = await getUniswapV3Liquidity(WETH, USDC, 500);
    const camelotV3Liq = await getCamelotV3Liquidity(WETH, USDC);

    // --- Handle UNKNOWN states explicitly ---
    const uniStatus = uniV3Liq === null ? "UNKNOWN" : `${uniV3Liq.toString()} units`;
    const camelotStatus = camelotV3Liq === null ? "UNKNOWN" : `${camelotV3Liq.toString()} units`;

    console.log(`RPC: ${rpcHealth.status} (${rpcHealth.latency})`);
    console.log(`Uniswap V3 Liquidity: ${uniStatus}`);
    console.log(`Camelot V3 Liquidity: ${camelotStatus}`);

    let uniV3Price = null;
    let camelotV3Price = null;

    if (uniV3Liq !== null && uniV3Liq > 0n) {
        uniV3Price = await getUniV3Price(amountIn, 500);
        if (uniV3Price) console.log(`Uniswap V3: 1 WETH = ${uniV3Price.toFixed(2)} USDC`);
    } else {
        console.log(`⚠️ Uniswap V3: UNKNOWN (liquidity check failed or pool empty)`);
    }

    if (camelotV3Liq !== null && camelotV3Liq > 0n) {
        camelotV3Price = await getCamelotV3Price(amountIn);
        if (camelotV3Price) console.log(`Camelot V3: 1 WETH = ${camelotV3Price.toFixed(2)} USDC`);
    } else {
        console.log(`⚠️ Camelot V3: UNKNOWN (liquidity check failed or pool empty)`);
    }

    // --- Compare & Alert ---
    if (uniV3Price !== null && camelotV3Price !== null) {
        const priceDifference = Math.abs(uniV3Price - camelotV3Price);
        const percentageDiff = (priceDifference / Math.min(uniV3Price, camelotV3Price)) * 100;

        console.log(`Spread: ${priceDifference.toFixed(2)} USDC (${percentageDiff.toFixed(4)}%)`);

        if (percentageDiff > 0.3) {
            console.log("🚀 REAL ARBITRAGE OPPORTUNITY DETECTED!");

            const buyDex = uniV3Price > camelotV3Price ? 'Camelot V3' : 'Uniswap V3';
            const sellDex = uniV3Price > camelotV3Price ? 'Uniswap V3' : 'Camelot V3';

            // Get price impact estimate
            const impact = await estimatePriceImpact();
const impactStr = impact === null
    ? "UNKNOWN (quote failed)"
    : impact.unreliable
    ? "UNKNOWN (quote hit liquidity limit — trade too large for this pool)"
    : `~${impact.impact.toFixed(3)}% on 2 WETH`;
            // Build the enhanced health-record alert
            const alertMsg =
                `🚀 **Arbitrage Opportunity Detected!**\n` +
                `**Pair:** WETH/USDC\n` +
                `**Spread:** ${percentageDiff.toFixed(4)}%\n` +
                `**Action:** Buy on **${buyDex}** → Sell on **${sellDex}**\n\n` +
                `**📋 Execution Health Record:**\n` +
                `• **Quote Size:** 1 WETH\n` +
                `• **UniV3 Price:** $${uniV3Price.toFixed(2)}\n` +
                `• **Camelot Price:** $${camelotV3Price.toFixed(2)}\n` +
                `• **Estimated Price Impact:** ${impactStr}\n` +
                `• **Pool Liquidity (UniV3):** ${uniStatus}\n` +
                `• **Pool Liquidity (Camelot):** ${camelotStatus}\n\n` +
                `**🌐 Network & Timestamp:**\n` +
                `• **RPC:** ${rpcHealth.status} (${rpcHealth.latency})\n` +
                `• **Chain ID:** 42161 (Arbitrum One)\n` +
                `• **Timestamp:** ${new Date().toISOString()}`;

            await sendDiscordAlert(alertMsg);
        } else {
            console.log("No significant arbitrage opportunity right now.");
        }
    } else {
        console.log("❌ Could not compare: one or both venues returned UNKNOWN.");
    }
}

// --- 12. Execution ---
async function main() {
    const startupMsg =
        `🤖 **Arbitrage Bot Started!**\n` +
        `**Pair:** WETH/USDC\n` +
        `**DEXs:** Uniswap V3 | Camelot V3\n` +
        `**Interval:** Every 35 minutes\n` +
        `**Started:** ${new Date().toISOString()}`;
    await sendDiscordAlert(startupMsg);

    await checkArbitrage();
    setInterval(checkArbitrage, 35 * 60 * 1000);
}

main().catch(console.error);
