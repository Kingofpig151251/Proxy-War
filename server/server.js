// server.js
//http://localhost:8080
'use strict';

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
let round = 0;

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

    updateLabel();

  });

  ws.on('close', () => {
    // broadcast who are disconnected
    broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${ws.name} has disconnected.`);

    updateLabel();

  });

  updateLabel();

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


function returnFunding(client) {
  if (hostTroop !== undefined && guestTroop !== undefined) {
    if (client === host) return hostTroop.funding;
    if (client === guest) return guestTroop.funding;
    return 0;
  }
  return 0;
}

function updateLabel() {
  wss.clients.forEach(client => {
    const hostName = host ? host.name : 'Waiting';
    const guestName = guest ? guest.name : 'Waiting';
    const data = JSON.stringify({
      type: MESSAGE_TYPES.UPDATA_LABEL,
      value: {
        state: state,
        round: round,
        hostName: hostName,
        guestName: guestName,
        funding: returnFunding(client)
      }
    });

    client.send(data);
  });
}

server.listen(8080, () => {
  console.log('Listening on http://localhost:8080');
});