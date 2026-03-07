const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "../node_modules/stockfish/src");
const destDir = path.join(__dirname, "../public/stockfish");

fs.mkdirSync(destDir, { recursive: true });

// Use single-threaded build for maximum browser compatibility
const files = [
  "stockfish-nnue-16-single.js",
  "stockfish-nnue-16-single.wasm",
];

let copied = 0;
for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    const size = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`Copied ${file} (${size} KB)`);
    copied++;
  } else {
    console.warn(`Not found: ${src}`);
  }
}

// Create a wrapper that loads stockfish and forwards UCI messages
const wrapper = `
// Stockfish Web Worker wrapper — loaded from /stockfish/stockfish.js
importScripts('/stockfish/stockfish-nnue-16-single.js');

let sf;
Stockfish().then(function(engine) {
  sf = engine;
  sf.addMessageListener(function(msg) {
    postMessage(msg);
  });
  postMessage('stockfishjs-ready');
});

self.onmessage = function(e) {
  if (sf) sf.postMessage(e.data);
};
`;

fs.writeFileSync(path.join(destDir, "stockfish.js"), wrapper.trim());
console.log(`Wrote stockfish.js wrapper`);
console.log(`Done. ${copied}/${files.length} files copied.`);
