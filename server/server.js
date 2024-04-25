// server.js
'use strict';

//#region Imports
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
const { type } = require('os');
app.use(express.static(path.join(__dirname, '../public')));
//#endregion

const STATE = {
  MATCHING: 'Matching',
  HOST_TURN: 'Host Turn',
  GUEST_TURN: 'Guest Turn',
}

let wattingList = [];
let host, guest, hostTroop, guestTroop;
let state = STATE.MATCHING;
let round = 0;

wss.on('connection', (ws) => {

  ws.on('message', (message) => {
    var jsonObj = JSON.parse(message);
    console.log('received', jsonObj);
    if (jsonObj.message === '') {
      return;
    }
    switch (jsonObj.type) {
      case MESSAGE_TYPES.JOIN_GAME:
        if (!host && ws !== guest) {
          host = ws;
        } else if (!guest && ws !== host) {
          guest = ws;
        } else if (!wattingList.includes(ws) && ws !== host && ws !== guest) {
          wattingList.push(ws);
        } else {
          ws.send(JSON.stringify({ type: MESSAGE_TYPES.SYSTEM_MESSAGE, message: 'You are already in the game.' }));
          return;
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
        if (ws === host && state === STATE.HOST_TURN) {
          try {
            hostTroop.updateFromBattleMessage(jsonObj);
            state = STATE.GUEST_TURN;
          } catch (error) {
            ws.send(JSON.stringify({ type: MESSAGE_TYPES.SYSTEM_MESSAGE, message: error.message }));
          }
        } else if (ws === guest && state === STATE.GUEST_TURN) {
          try {
            guestTroop.updateFromBattleMessage(jsonObj);
            state = STATE.HOST_TURN;
            round++;
          } catch (error) {
            ws.send(JSON.stringify({ type: MESSAGE_TYPES.SYSTEM_MESSAGE, message: error.message }));
          }
        }
        break;
      default:
        console.log('Unknown message type', type);
    }

    if (host && guest && state === STATE.MATCHING) {
      startGame();
    }
    if (host && guest) {
      setDisabled();
    }
    updateLabel();
    updataWaitingList();
  });

  ws.on('close', () => {
    // broadcast who are disconnected
    broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${ws.name} has disconnected.`);

    if (host && guest && state === STATE.MATCHING) {
      startGame();
    }
    if (host && guest) {
      setDisabled();
    }
    updateLabel();
    updataWaitingList();
  });
  updateLabel();
  updataWaitingList();
});


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
        funding: returnFunding(client),
      },
    });
    client.send(data);
  });
}

function updataWaitingList() {
  clearWaitingList();
  wss.clients.forEach(client => {
    for (let name of wattingList) {
      const data = JSON.stringify({
        type: MESSAGE_TYPES.UPDATA_WAITING_LIST,
        value: name.name,
      });
      client.send(data);
    }
  });
}

function clearWaitingList() {
  wss.clients.forEach(client => {
    const data = JSON.stringify({
      type: MESSAGE_TYPES.CLEAR_WAITTING_LIST,
    });
    client.send(data);
  });
}

function startGame() {
  hostTroop = new Troop(host.name, 100);
  guestTroop = new Troop(guest.name, 90);
  //send ready to battle message all clients
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({
      type: MESSAGE_TYPES.SYSTEM_MESSAGE,
      message: `${host.name} and ${guest.name} are in battle.`
    }));
  });
  state = STATE.HOST_TURN;
  round = 1;
}

function setDisabled() {
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({
      type: MESSAGE_TYPES.SET_DISABLED,
      value: true
    }));
  });
  switch (state) {
    case STATE.HOST_TURN:
      host.send(JSON.stringify({ type: MESSAGE_TYPES.SET_DISABLED, value: false }));
      break;
    case STATE.GUEST_TURN:
      guest.send(JSON.stringify({ type: MESSAGE_TYPES.SET_DISABLED, value: false }));
      break;
  }
}



server.listen(8080, () => {
  console.log('Listening on http://localhost:8080');
});