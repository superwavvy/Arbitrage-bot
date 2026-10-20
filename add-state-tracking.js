var fs = require("fs");
var s = fs.readFileSync("arbitrage-detector.js", "utf8");

// 1. Add the global state variable at the top
if (s.indexOf("let activeOpportunity = null;") === -1) {
    s = s.replace("const { ethers } = require('ethers');", "const { ethers } = require('ethers');\nlet activeOpportunity = null;");
}

// 2. Find the block where we check the spread and replace it
var oldBlock = `        if (percentageDiff > 0.19) {
            console.log("🚀 REAL ARBITRAGE OPPORTUNITY DETECTED!");`;

var newBlock = `        const currentBlock = await provider.getBlockNumber();

        if (percentageDiff > 0.19) {
            if (!activeOpportunity) {
                activeOpportunity = {
                    startTime: Date.now(),
                    startBlock: currentBlock,
                    startSpread: percentageDiff
                };
                console.log(\`🚀 [OPPORTUNITY OPEN] Block: \${currentBlock} | Spread: \${percentageDiff.toFixed(4)}%\`);
            } else {
                console.log(\`📈 [OPPORTUNITY CONTINUES] Block: \${currentBlock} | Spread: \${percentageDiff.toFixed(4)}% (Age: \${Date.now() - activeOpportunity.startTime}ms)\`);
            }
            console.log("🚀 REAL ARBITRAGE OPPORTUNITY DETECTED!");`;

if (!s.includes(oldBlock)) {
    console.error("ERROR: Could not find the anchor block. Code structure might have changed.");
    process.exit(1);
}
s = s.replace(oldBlock, newBlock);

// 3. Add the "Close" logic to the else statement
var oldElse = `        } else {
            console.log("No significant opportunity.");
        }`;

var newElse = `        } else {
            if (activeOpportunity) {
                const duration = Date.now() - activeOpportunity.startTime;
                const blocks = currentBlock - activeOpportunity.startBlock;
                console.log(\`📉 [OPPORTUNITY CLOSED] Lasted \${duration}ms (~\${blocks} blocks) | Spread dropped to \${percentageDiff.toFixed(4)}%\`);
                activeOpportunity = null;
            } else {
                console.log("No significant opportunity.");
            }
        }`;

if (!s.includes(oldElse)) {
    console.error("ERROR: Could not find the else block.");
    process.exit(1);
}
s = s.replace(oldElse, newElse);

fs.writeFileSync("arbitrage-detector.js", s);
console.log("OK: State tracking added successfully.");
