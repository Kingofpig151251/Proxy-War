//http://127.0.0.1:8080/
// server.js
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const Troop = require('./Troop');
const path = require('path');

app.use(express.static(path.join(__dirname, '../public'))); // Add this line

server.listen(8080, () => {
  console.log('Listening on http://localhost:8080');
});