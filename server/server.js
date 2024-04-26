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
const { type } = require('os');
app.use(express.static('public'));
const opn = require('opn');
const e = require('express');
//#endregion

const STATE = {
  MATCHING: 'Matching',
  HOST_TURN: 'Host Turn',
  GUEST_TURN: 'Guest Turn',
  BATTLING: 'Battling',
}

let wattingList = [];
let host, guest, hostTroop, guestTroop;
let state = STATE.MATCHING;
let round = 0;

const DELAY_INCREMENT = 1000; // 1 second
const ATTRIBUTE_MULTIPLIER = 0.5;

wss.on('connection', (ws) => {

  ws.on('message', async (message) => {
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
            broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${hostTroop.name} has finished the turn, the amount invested is ${hostTroop.force + hostTroop.arms + hostTroop.food}. With skill ${hostTroop.skill}`);
            state = STATE.GUEST_TURN;
            broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `Now is ${state}.`);
          } catch (error) {
            ws.send(JSON.stringify({ type: MESSAGE_TYPES.SYSTEM_MESSAGE, message: error.message }));
          }
        } else if (ws === guest && state === STATE.GUEST_TURN) {
          try {
            guestTroop.updateFromBattleMessage(jsonObj);
            broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${guestTroop.name} has finished the turn, the amount invested is ${guestTroop.force + guestTroop.arms + guestTroop.food}. With skill ${guestTroop.skill}`);
            state = STATE.BATTLING;
            updateLabel();
            await compare(hostTroop, guestTroop);
            broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `Now is ${state}.`);
          } catch (error) {
            ws.send(JSON.stringify({ type: MESSAGE_TYPES.SYSTEM_MESSAGE, message: error.message }));
          }
        }
        break;
      default:
        console.log('Unknown message type', type);
    }
    addPlayerToBattle();
    if (host && guest && state === STATE.MATCHING) {
      startGame();
    }
    if (host && guest) {
      setDisabled();
    }
    updateLabel();
    updataWaitingList();
  });

  ws.on('close', async () => {
    // broadcast who are disconnected
    broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${ws.name} has disconnected.`);
    addPlayerToBattle();
    if (state === STATE.BATTLING) {
      if (host === ws) {
        broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${host.name} has escaped. ${guest.name} win the game.`);
        host = null;
      }
      if (guest === ws) {
        broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${guest.name} has escaped. ${host.name} win the game.`);
        guest = null;
      }
    }
    if (host && guest && state === STATE.MATCHING) {
      startGame();
    }
    if (host && guest) {
      await setDisabled();
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
  broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${host.name}(host) and ${guest.name}(guest) are in battle.`);
  state = STATE.HOST_TURN;
  round = 1;
}

async function setDisabled() {
  wss.clients.forEach(client => {
    const data = JSON.stringify({ type: MESSAGE_TYPES.SET_DISABLED, value: true });
    client.send(data);
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

async function compare(hostTroop, guestTroop) {
  let hostTotal = hostTroop.force + hostTroop.arms + hostTroop.food;
  let guestTotal = guestTroop.force + guestTroop.arms + guestTroop.food;
  hostTroop.winAttributes = 0;
  guestTroop.winAttributes = 0;
  await compareAttribute(hostTroop, guestTroop, 'force');
  await compareAttribute(hostTroop, guestTroop, 'arms');
  await compareAttribute(hostTroop, guestTroop, 'food');

  //check host skill
  switch (hostTroop.skill) {
    case 'NB':
      hostTotal += hostTroop.funding;
      break;
    case 'QE':
      hostTroop.winAttributes = hostTroop.winAttributes <= 3 ? hostTroop.winAttributes + 1 : hostTroop.winAttributes;
      break;
  }

  switch (guestTroop.skill) {
    case 'NB':
      guestTotal += guestTroop.funding;
      break;
    case 'QE':
      guestTroop.winAttributes = guestTroop.winAttributes <= 3 ? guestTroop.winAttributes + 1 : guestTroop.winAttributes;
      break;
  }

  if (hostTroop.skill === 'IC') {
    guestTotal *= guestTroop.winAttributes * 0.5;
  } else {
    guestTotal *= guestTroop.winAttributes;
  }

  if (guestTroop.skill === 'IC') {
    hostTotal *= hostTroop.winAttributes * 0.5;
  } else {
    hostTotal *= hostTroop.winAttributes;
  }

  await delayBroadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `Settlement incoming...`);
  await delayBroadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${hostTroop.name} get ${hostTotal} income.`);
  await delayBroadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${guestTroop.name} get ${guestTotal} income,`);

  if (hostTroop.winAttributes != 0) {
    hostTroop.funding += hostTotal;
  } else {
    hostTroop.funding = hostTroop.funding;
  }

  if (guestTroop.winAttributes != 0) {
    guestTroop.funding += guestTotal;
  } else {
    guestTroop.funding = guestTroop.funding;
  }
  round++;
  state = STATE.HOST_TURN;
  await checkWhoWin();
}

async function checkWhoWin() {
  if (round === 3) {
    if (hostTroop.funding > guestTroop.funding) {
      broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${hostTroop.name} win the game.`);
    } else if (hostTroop.funding < guestTroop.funding) {
      broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `${guestTroop.name} win the game.`);
    } else {
      broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `No one win the game.`);
    }
    host = null;
    guest = null;
    hostTroop = null;
    guestTroop = null;
    round = 0;
    state = STATE.MATCHING;
  }
}

// if host is null, set the waitting list player to host, if guest is null, set the second player to guest
function addPlayerToBattle() {
  if (wattingList.length === 0) return;
  if (host === null) {
    host = wattingList.shift();
  }
  if (guest === null) {
    guest = wattingList.shift();
  }
}

async function delayBroadcastMessage(type, message) {
  return new Promise(resolve => {
    setTimeout(() => {
      broadcastMessage(type, message);
      resolve();
    }, DELAY_INCREMENT);
  });
}

async function compareAttribute(hostTroop, guestTroop, attribute) {
  let messages = [
    `${attribute} battling... `,
    `${host.name} :${hostTroop[attribute]} vs ${guest.name} :${guestTroop[attribute]}`,
    hostTroop[attribute] > guestTroop[attribute] ? `${host.name} win ${attribute} battle.` :
      hostTroop[attribute] < guestTroop[attribute] ? `${guest.name} win ${attribute} battle.` :
        `No one win ${attribute} battle.`
  ];

  for (let message of messages) {
    await delayBroadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, message);
  }

  if (hostTroop[attribute] > guestTroop[attribute]) {
    hostTroop.winAttributes += 1;
  } else if (hostTroop[attribute] < guestTroop[attribute]) {
    guestTroop.winAttributes += 1;
  }
}

server.listen(8080, () => {
  console.log('Listening on http://localhost:8080');
  opn('http://localhost:8080');
  opn('http://localhost:8080');
});