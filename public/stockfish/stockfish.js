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