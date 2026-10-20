var fs = require("fs");
var s = fs.readFileSync("arbitrage-detector.js", "utf8");

// 1. Lower the threshold to 0.1% (just for testing alerts)
s = s.replace(/if \(percentageDiff > 0\.3\)/, "if (percentageDiff > 0.1)");

// 2. Add automatic WebSocket reconnection
var wsAnchor = "provider.websocket.on('error', (err) => {";
var wsPatch = `
provider.websocket.on('close', () => {
    console.log("⚠️ WebSocket closed. Attempting to reconnect in 5 seconds...");
    setTimeout(() => {
        console.log("🔄 Reconnecting...");
        process.exit(1); // PM2/Botkeep will instantly restart the script
    }, 5000);
});

` + wsAnchor;
s = s.replace(wsAnchor, wsPatch);

fs.writeFileSync("arbitrage-detector.js", s);
console.log("OK: Patched threshold to 0.1% and added reconnect logic.");
