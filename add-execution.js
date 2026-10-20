var fs = require("fs");
var s = fs.readFileSync("arbitrage-detector.js", "utf8");

// 1. Add Executor variables near the top
var header = `
const EXECUTOR_ADDRESS = "PASTE_YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE";
const EXECUTOR_ABI = [
    "function executeArb(address tokenIn, address tokenOut, uint256 amount, uint8 dex1, uint8 dex2, uint24 fee1, uint24 fee2, int256 minPnl) external"
];
`;
if (s.indexOf("const EXECUTOR_ADDRESS") === -1) {
    s = s.replace("const { ethers } = require('ethers');", "const { ethers } = require('ethers');\n" + header);
}

// 2. Replace the alert block with simultaneous execution
var anchor = `            console.log("🚀 REAL ARBITRAGE OPPORTUNITY DETECTED!");`;
var execution = `
            // --- EXECUTION LOGIC (Simultaneous with Discord Alert) ---
            console.log("🚀 REAL ARBITRAGE OPPORTUNITY DETECTED!");
            
            const executeTrade = async () => {
                if (!process.env.PRIVATE_KEY || EXECUTOR_ADDRESS === "PASTE_YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE") {
                    console.log("⚠️ Execution skipped: Missing Private Key or Contract Address.");
                    return;
                }
                try {
                    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
                    const executor = new ethers.Contract(EXECUTOR_ADDRESS, EXECUTOR_ABI, wallet);
                    
                    const loanAmount = ethers.parseEther("1.0"); // 1 WETH
                    const minPnl = ethers.parseEther("0.005");   // Require at least 0.005 WETH profit
                    
                    // If Uni price > Camelot price, we buy on Camelot (dex 2), sell on Uni (dex 1)
                    const buyOnCamelot = uniV3Price > camelotV3Price;
                    const dex1 = buyOnCamelot ? 2 : 1;
                    const dex2 = buyOnCamelot ? 1 : 2;
                    const fee1 = buyOnCamelot ? 0 : 500; 
                    const fee2 = buyOnCamelot ? 500 : 0;
                    
                    console.log("Firing transaction to Arbitrum...");
                    const tx = await executor.executeArb(
                        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
                        "0x912CE59144191C1204E64559FE8253a0e49E6548", // ARB
                        loanAmount, dex1, dex2, fee1, fee2, minPnl,
                        { gasLimit: 2000000 }
                    );
                    console.log("✅ Tx Sent! Hash:", tx.hash);
                    await sendDiscordAlert(\`✅ **Arb Executed!** Hash: \${tx.hash}\`);
                } catch (e) {
                    console.log("❌ Execution failed:", e.reason || e.message);
                    await sendDiscordAlert(\`❌ **Arb Failed:** \${e.reason || e.message}\`);
                }
            };

            // Fire Discord Alert and Execution at the SAME TIME
            await Promise.all([
                sendDiscordAlert(alertMsg),
                executeTrade()
            ]);
            
            // Skip the old alert sending below
            continue;
`;

// Find the old alert logic and replace it
var oldAlert = `            await sendDiscordAlert(alertMsg);
        } else {`;

if (!s.includes(oldAlert)) {
    console.error("ERROR: Could not find the alert anchor.");
    process.exit(1);
}
s = s.replace(oldAlert, execution + `        } else {`);
fs.writeFileSync("arbitrage-detector.js", s);
console.log("OK: Simultaneous execution logic added.");
