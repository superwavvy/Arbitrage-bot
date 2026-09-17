require('dotenv').config();
const { ethers } = require('ethers');

// 1. Setup Provider
const ARBITRUM_RPC = process.env.ARBITRUM_RPC;
const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC, {
    chainId: 42161,
    name: 'arbitrum'
});

// 2. Token Addresses on Arbitrum
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// 3. Contract Addresses
const UNISWAP_V3_QUOTER = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const CAMELOT_V3_QUOTER = '0x0Fc73040b26E9bC8514fA028D998E73A254Fa76E';
const CAMELOT_V3_FACTORY = '0x1a3c9b1d2f0529d97f2afc5136cc23e58f1fd35b';

// 4. ABIs
const V3_FACTORY_ABI = ["function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"];
const CAMELOT_FACTORY_ABI = ["function poolByPair(address tokenA, address tokenB) external view returns (address pool)"];
const V3_POOL_ABI = ["function liquidity() external view returns (uint128)"];
const UNI_V3_QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];
const CAMELOT_V3_QUOTER_ABI = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) external returns (uint256 amountOut, uint16 fee)"
];

// 5. Contract Instances
const uniswapV3Factory = new ethers.Contract(UNISWAP_V3_FACTORY, V3_FACTORY_ABI, provider);
const uniswapV3Quoter = new ethers.Contract(UNISWAP_V3_QUOTER, UNI_V3_QUOTER_ABI, provider);
const camelotV3Factory = new ethers.Contract(CAMELOT_V3_FACTORY, CAMELOT_FACTORY_ABI, provider);
const camelotV3Quoter = new ethers.Contract(CAMELOT_V3_QUOTER, CAMELOT_V3_QUOTER_ABI, provider);

// 6. Discord Notification Helper
async function sendDiscordAlert(message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: message,
                username: "Arb Bot", // <--- Overrides the webhook name
                avatar_url: "https://i.imgur.com/8Q9Z8Q9.png" // Optional: Add a custom bot avatar URL here
            })
        });
    } catch (error) {
        console.error("Discord alert failed:", error.message);
    }
}

// 7. Liquidity Checkers
async function getUniswapV3Liquidity(tokenA, tokenB, fee) {
    try {
        const poolAddress = await uniswapV3Factory.getPool(tokenA, tokenB, fee);
        if (poolAddress === ethers.ZeroAddress) return 0n;
        const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
        return await poolContract.liquidity();
    } catch (e) { return 0n; }
}

async function getCamelotV3Liquidity(tokenA, tokenB) {
    try {
        const poolAddress = await camelotV3Factory.poolByPair(tokenA, tokenB);
        if (poolAddress === ethers.ZeroAddress) return 0n;
        const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
        return await poolContract.liquidity();
    } catch (e) { return 0n; }
}

// 8. Main Arbitrage Logic
async function checkArbitrage() {
    console.log(`\n=========================================`);
    console.log(`[${new Date().toISOString()}] Checking Arbitrum Prices & Liquidity...`);
    
    const amountIn = ethers.parseEther("1.0"); // 1 WETH

    const uniV3Liq = await getUniswapV3Liquidity(WETH, USDC, 500);
    const camelotV3Liq = await getCamelotV3Liquidity(WETH, USDC);

    console.log(`Uniswap V3 Liquidity: ${uniV3Liq.toString()} (raw L units)`);
    console.log(`Camelot V3 Liquidity: ${camelotV3Liq.toString()} (raw L units)`);

    let uniV3Price = null;
    let camelotV3Price = null;

    if (uniV3Liq > 0n) {
        try {
            const params = { tokenIn: WETH, tokenOut: USDC, amountIn: amountIn, fee: 500, sqrtPriceLimitX96: 0 };
            const result = await uniswapV3Quoter.quoteExactInputSingle.staticCall(params);
            uniV3Price = parseFloat(ethers.formatUnits(result[0], 6));
            console.log(`Uniswap V3: 1 WETH = ${uniV3Price.toFixed(2)} USDC`);
        } catch (e) { console.log("Uniswap V3 Error:", e.message); }
    }

    if (camelotV3Liq > 0n) {
        try {
            const result = await camelotV3Quoter.quoteExactInputSingle.staticCall(WETH, USDC, amountIn, 0);
            camelotV3Price = parseFloat(ethers.formatUnits(result[0], 6));
            console.log(`Camelot V3: 1 WETH = ${camelotV3Price.toFixed(2)} USDC`);
        } catch (e) { console.log("Camelot V3 Error:", e.message); }
    }

    // --- Compare & Alert ---
    if (uniV3Price && camelotV3Price) {
        const priceDifference = Math.abs(uniV3Price - camelotV3Price);
        const percentageDiff = (priceDifference / Math.min(uniV3Price, camelotV3Price)) * 100;
        
        console.log(`Spread: ${priceDifference.toFixed(2)} USDC (${percentageDiff.toFixed(4)}%)`);

        if (percentageDiff > 0.3) { 
            console.log("🚀 REAL ARBITRAGE OPPORTUNITY DETECTED!");
            
            // Format Discord Message
            const buyDex = uniV3Price > camelotV3Price ? 'Camelot V3' : 'Uniswap V3';
            const sellDex = uniV3Price > camelotV3Price ? 'Uniswap V3' : 'Camelot V3';
            const alertMsg = `🚀 **Arbitrage Opportunity Detected!**\n**Pair:** WETH/USDC\n**Spread:** ${percentageDiff.toFixed(4)}%\n**Action:** Buy on **${buyDex}** -> Sell on **${sellDex}**\n*Prices: UniV3 $${uniV3Price.toFixed(2)} | Camelot $${camelotV3Price.toFixed(2)}*`;
            
            await sendDiscordAlert(alertMsg);
            
        } else {
            console.log("No significant arbitrage opportunity right now.");
        }
    } else {
        console.log("Could not compare prices due to insufficient liquidity or quote errors.");
    }
}

// 9. Execution Wrapper
async function main() {
    // --- Startup Notification ---
    const startupMsg = `🤖 **Arbitrage Bot Started!**\n**Status:** 🟢 Active\n**Pair:** WETH/USDC\n**DEXs:** Uniswap V3 | Camelot V3\n**Interval:** Every 5 minutes\n**Started At:** ${new Date().toISOString()}`;
    
    console.log("Sending startup notification to Discord...");
    await sendDiscordAlert(startupMsg);

    // --- Initial Run ---
    await checkArbitrage();
    
    // --- Loop ---
    setInterval(checkArbitrage, 5 * 60 * 1000); // Run every 5 minutes
}

main().catch(console.error);
