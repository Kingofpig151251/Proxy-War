// server.js
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const MESSAGE_TYPES = require('../public/MESSAGE_TYPES');
const Element_ID = require('../public/Element_ID');
const Troop = require('./Troop');
const path = require('path');
const e = require('express');

app.use(express.static(path.join(__dirname, '../public')));

const STATE = {
  MATCHING: 'Matching',
  HOST_TURN: 'Host Turn',
  GUEST_TURN: 'Guest Turn',
  SETTLING: 'Settling'
}

let wattingList = [];
let host, guest, hostTroop, guestTroop;
let state = STATE.MATCHING;
let round = 1;
wss.on('connection', (ws) => {

  ws.on('message', (message) => {
    var jsonObj = JSON.parse(message);
    if (jsonObj.message === '') {
      return;
    }
    switch (jsonObj.type) {
      case MESSAGE_TYPES.JOIN_GAME:
        if (!host) {
          host = ws;
        } else if (!guest) {
          guest = ws;
        } else {
          wattingList.push(ws);
        }
        broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${ws.name} has joined the game.`);
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

  ws.on('close', () => {
    //if the host disconnects, set the host to null
    if (host === ws) {
      host = null;
      //if wattingList is not empty, set the first player in the list to the host
      if (wattingList.length > 0) {
        host = wattingList.shift();
        host.send(JSON.stringify({
          type: MESSAGE_TYPES.SYSTEM_MESSAGE,
          message: 'You are the host.'
        }));
        host.send(JSON.stringify({
          type: MESSAGE_TYPES.UPDATA_LABEL,
          Element_ID: Element_ID.Labels.hostNameLabel,
          message: host.name
        }));
      }
    }
    //if the guest disconnects, set the guest to null
    if (guest === ws) {
      guest = null;
      //if wattingList is not empty, set the first player in the list to the guest
      if (wattingList.length > 0) {
        guest = wattingList.shift();
        guest.send(JSON.stringify({
          type: MESSAGE_TYPES.SYSTEM_MESSAGE,
          message: 'You are the guest.'
        }));
        guest.send(JSON.stringify({
          type: MESSAGE_TYPES.UPDATA_LABEL,
          Element_ID: Element_ID.Labels.guestNameLabel,
          message: guest.name
        }));
      }
    }
  });
});

function startGame() {
  hostTroop = new Troop();
  guestTroop = new Troop();
  //send ready to battle message all clients
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({
      type: MESSAGE_TYPES.SYSTEM_MESSAGE,
      message: `${host.name} and ${guest.name} are in battle.`
    }));
  });
  state = STATE.HOST_TURN;
}

function broadcastMessage(type, message) {
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({
      type: type,
      message: message
    }));
  });
}

function updataLabel(Element_ID, message) {
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({
      type: MESSAGE_TYPES.UPDATA_LABEL,
      Element_ID: Element_ID,
      message: message
    }));
  });
}

server.listen(8080, () => {
  console.log('Listening on http://localhost:8080');
});