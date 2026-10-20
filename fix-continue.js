var fs = require("fs");
var s = fs.readFileSync("arbitrage-detector.js", "utf8");

// The exact string injected earlier
var bad = `            ]);
            
            // Skip the old alert sending below
            continue;
`;
var good = `            ]);
`;

if (s.includes(bad)) {
    s = s.replace(bad, good);
    fs.writeFileSync("arbitrage-detector.js", s);
    console.log("OK: Removed the illegal 'continue;' statement.");
} else {
    console.log("Could not find the exact string. Let's try a regex.");
    // Fallback regex just in case whitespace is different
    var regex = /\s*\/\/ Skip the old alert sending below\s*continue;\s*/g;
    if (regex.test(s)) {
        s = s.replace(regex, "\n");
        fs.writeFileSync("arbitrage-detector.js", s);
        console.log("OK: Removed the illegal 'continue;' statement via regex.");
    } else {
         console.log("FAILED: Could not find the continue statement.");
    }
}
