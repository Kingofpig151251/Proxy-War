//http://127.0.0.1:8080/
// server.js
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const MESSAGE_TYPES = require('../public/messageTypes');
const Troop = require('./Troop');
const path = require('path');

app.use(express.static(path.join(__dirname, '../public'))); // Add this line

wss.on('connection', (ws) => {


  ws.on('message', (message) => {
    var jsonObj = JSON.parse(message);
    if (jsonObj.message === '') {
      return;
    }
    switch (jsonObj.type) {
      case MESSAGE_TYPES.JOIN_GAME:
        break;
      case MESSAGE_TYPES.SET_NAME:
        //Set the name of the player
        ws.name = jsonObj.message;
        // disable the name input
        ws.send(JSON.stringify({
          type: MESSAGE_TYPES.SET_NAME,
          message: ws.name
        }));
        //Send a message to all clients that a new player has joined
        wss.clients.forEach((client) => {
          client.send(JSON.stringify({
            type: MESSAGE_TYPES.SYSTEM_MESSAGE,
            message: `${ws.name} has joined the chat.`
          }));
        });
        break;
      case MESSAGE_TYPES.CHAT_MESSAGE:
        //Send the message to all clients
        wss.clients.forEach((client) => {
          client.send(JSON.stringify({
            type: MESSAGE_TYPES.CHAT_MESSAGE,
            message: jsonObj.message,
            name: ws.name
          }));
        });
        break;
      case MESSAGE_TYPES.BATTLE:
        break;
      default:
        console.log('Unknown message type', type);
    }

  });
  ws.on('close', () => { });

});




server.listen(8080, () => {
  console.log('Listening on http://localhost:8080');
});