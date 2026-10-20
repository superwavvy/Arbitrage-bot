var fs = require("fs");
var s = fs.readFileSync("arbitrage-detector.js", "utf8");

var oldCatch = `                } catch (e) {
                    console.log("❌ Execution failed:", e.reason || e.message);
                    await sendDiscordAlert(\`❌ **Arb Failed:** \${e.reason || e.message}\`);
                }`;

var newCatch = `                } catch (e) {
                    // Extract a clean error message for Discord
                    let errMsg = "Unknown Error";
                    if (e.shortMessage) errMsg = e.shortMessage;
                    else if (e.reason) errMsg = e.reason;
                    else if (e.message) errMsg = e.message.slice(0, 200); // Truncate massive JSON dumps
                    
                    console.log("❌ Execution failed:", errMsg);
                    await sendDiscordAlert(\`❌ **Arb Failed:** \${errMsg}\`);
                }`;

if (s.includes(oldCatch)) {
    s = s.replace(oldCatch, newCatch);
    fs.writeFileSync("arbitrage-detector.js", s);
    console.log("OK: Patched error handling to guarantee Discord alerts.");
} else {
    console.error("FAIL: Could not find the catch block. Code might have changed.");
}
