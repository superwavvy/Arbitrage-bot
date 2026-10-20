var fs = require("fs");
var s = fs.readFileSync("arbitrage-detector.js", "utf8");

var bad = 'if (!process.env.PRIVATE_KEY || EXECUTOR_ADDRESS === "0x6B0698E135cF50A5f7c85091744e7328AFFFd46f")';
var good = 'if (!process.env.PRIVATE_KEY)';

if (s.includes(bad)) {
    s = s.replace(bad, good);
    fs.writeFileSync("arbitrage-detector.js", s);
    console.log("OK: Fixed the IF statement.");
} else {
    console.log("Could not find the exact string. (It might already be fixed).");
}
