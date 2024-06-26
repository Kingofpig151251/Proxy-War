// server.js
"use strict";

//#region Imports
const WebSocket = require("ws");
const http = require("http");
const express = require("express");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const MESSAGE_TYPES = require("../public/MESSAGE_TYPES");
const Element_ID = require("../public/Element_ID");
const Troop = require("./Troop");
const { type } = require("os");
app.use(express.static("public"));
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
})
const opn = require("opn");
const mongoose = require("mongoose");
mongoose.connect("mongodb://127.0.0.1:27017/Proxy_War");
//#endregion

const chatSchema = new mongoose.Schema({
  name: String,
  message: String,
  timestamp: Date,
});

const Chat = mongoose.model("Chat", chatSchema);

const STATE = {
  MATCHING: "Matching",
  ATTACKER_TURN: "Attacker Turn",
  DEFENDER_TURN: "Defender Turn",
  BATTLING: "Battling",
};

let wattingList = [];
let attacker, defender, attackerTroop, defenderTroop;
let state = STATE.MATCHING;
let round = 0;

const DELAY_INCREMENT = 1000; // 1 second
const ATTRIBUTE_MULTIPLIER = 0.5;

wss.on("connection", async (ws) => {
  ws.on("message", async (message) => {
    var jsonObj = JSON.parse(message);
    console.log("received", jsonObj);
    if (jsonObj.message === "") {
      return;
    }
    switch (jsonObj.type) {
      case MESSAGE_TYPES.JOIN_GAME:
        if (!attacker && ws !== defender) {
          attacker = ws;
        } else if (!defender && ws !== attacker) {
          defender = ws;
        } else if (
          !wattingList.includes(ws) &&
          ws !== attacker &&
          ws !== defender
        ) {
          wattingList.push(ws);
        } else {
          ws.send(
            JSON.stringify({
              type: MESSAGE_TYPES.SYSTEM_MESSAGE,
              message: "You are already in the game.",
            })
          );
          return;
        }
        broadcastMessage(
          MESSAGE_TYPES.SYSTEM_MESSAGE,
          `${ws.name} has joined the game.`
        );
        break;
      case MESSAGE_TYPES.SET_NAME:
        //Set the name of the player
        ws.name = jsonObj.message;
        // disable the name input
        ws.send(
          JSON.stringify({
            type: MESSAGE_TYPES.SET_NAME,
            message: ws.name,
          })
        );
        //Send a message to all clients that a new player has joined
        wss.clients.forEach((client) => {
          client.send(
            JSON.stringify({
              type: MESSAGE_TYPES.SYSTEM_MESSAGE,
              message: `${ws.name} has joined the chat.`,
            })
          );
        });
        break;
      case MESSAGE_TYPES.CHAT_MESSAGE:
        saveChatAndSendMessage(ws, jsonObj);
        //Send the message to all clients
   
        break;
      case MESSAGE_TYPES.BATTLE:
        if (ws === attacker && state === STATE.ATTACKER_TURN) {
          try {
            attackerTroop.updateFromBattleMessage(jsonObj);
            broadcastMessage(
              MESSAGE_TYPES.SYSTEM_MESSAGE,
              `${
                attackerTroop.name
              } has finished the turn, the amount invested is ${
                attackerTroop.force + attackerTroop.arms + attackerTroop.food
              }. With skill ${attackerTroop.skill}`
            );
            state = STATE.DEFENDER_TURN;
            broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `Now is ${state}.`);
          } catch (error) {
            ws.send(
              JSON.stringify({
                type: MESSAGE_TYPES.SYSTEM_MESSAGE,
                message: error.message,
              })
            );
          }
        } else if (ws === defender && state === STATE.DEFENDER_TURN) {
          try {
            defenderTroop.updateFromBattleMessage(jsonObj);
            broadcastMessage(
              MESSAGE_TYPES.SYSTEM_MESSAGE,
              `${
                defenderTroop.name
              } has finished the turn, the amount invested is ${
                defenderTroop.force + defenderTroop.arms + defenderTroop.food
              }. With skill ${defenderTroop.skill}`
            );
            state = STATE.BATTLING;
            updateLabel();
            await compare(attackerTroop, defenderTroop);
            broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `Now is ${state}.`);
          } catch (error) {
            ws.send(
              JSON.stringify({
                type: MESSAGE_TYPES.SYSTEM_MESSAGE,
                message: error.message,
              })
            );
          }
        }
        break;
      default:
        console.log("Unknown message type", type);
    }
    addPlayerToBattle();
    if (attacker && defender && state === STATE.MATCHING) {
      startGame();
    }
    if (attacker && defender) {
      setDisabled();
    }
    updateLabel();
    updataWaitingList();
  });

  ws.on("close", async () => {
    // broadcast who are disconnected
    if (wss.clients.size === 0) {
      attacker = null;
      defender = null;
      attackerTroop = null;
      defenderTroop = null;
      round = 0;
      state = STATE.MATCHING;
    }
    broadcastMessage(
      MESSAGE_TYPES.SYSTEM_MESSAGE,
      `${ws.name} has disconnected.`
    );
    if (state != STATE.MATCHING) {
      let name = ws === attacker ? defender.name : attacker.name;
      if (attacker === ws) {
        broadcastMessage(
          MESSAGE_TYPES.SYSTEM_MESSAGE,
          `${attacker.name} has escaped. ${name} win the game.`
        );
        attacker = null;
      }
      if (defender === ws) {
        broadcastMessage(
          MESSAGE_TYPES.SYSTEM_MESSAGE,
          `${defender.name} has escaped. ${name} win the game.`
        );
        defender = null;
      }
      addPlayerToBattle();
      round = 0;
      state = STATE.MATCHING;
      if (attacker && defender && state === STATE.MATCHING) {
        startGame();
      }
      if (attacker && defender) {
        await setDisabled();
      }
    }
    updateLabel();
    updataWaitingList();
  });

  // Get all chat records from the database
  const chatRecords = await Chat.find({});

  // Send each chat record to the new user
  chatRecords.forEach((record) => {
    ws.send(
      JSON.stringify({
        type: MESSAGE_TYPES.CHAT_MESSAGE,
        name: record.name,
        message: record.message,
        timestamp: record.timestamp,
      })
    );
  });

  updateLabel();
  updataWaitingList();
});

// Function to broadcast a message to all connected clients
function broadcastMessage(type, message) {
  wss.clients.forEach((client) => {
    client.send(
      JSON.stringify({
        type: type,
        message: message,
      })
    );
  });
}

// Function to return the funding of a client's troop
function returnFunding(client) {
  if (attackerTroop !== undefined && defenderTroop !== undefined) {
    if (client === attacker && attackerTroop !== null)
      return attackerTroop.funding;
    if (client === defender && defenderTroop !== null)
      return defenderTroop.funding;
    return 0;
  }
  return 0;
}

// Function to update the label for all connected clients
function updateLabel() {
  wss.clients.forEach((client) => {
    const hostName = attacker ? attacker.name : "Waiting";
    const guestName = defender ? defender.name : "Waiting";
    const data = JSON.stringify({
      type: MESSAGE_TYPES.UPDATA_LABEL,
      value: {
        state: state,
        round: round,
        hostName: hostName,
        guestName: guestName,
        hostFunding: returnFunding(attacker),
        guestFunding: returnFunding(defender),
        funding: returnFunding(client),
      },
    });
    client.send(data);
  });
}

// Function to update the waiting list for all connected clients
function updataWaitingList() {
  clearWaitingList();
  wss.clients.forEach((client) => {
    for (let name of wattingList) {
      const data = JSON.stringify({
        type: MESSAGE_TYPES.UPDATA_WAITING_LIST,
        value: name.name,
      });
      client.send(data);
    }
  });
}

// Function to clear the waiting list for all connected clients
function clearWaitingList() {
  wss.clients.forEach((client) => {
    const data = JSON.stringify({
      type: MESSAGE_TYPES.CLEAR_WAITTING_LIST,
    });
    client.send(data);
  });
}

function startGame() {
  attackerTroop = new Troop(attacker.name, 100);
  defenderTroop = new Troop(defender.name, 90);
  //send ready to battle message all clients
  broadcastMessage(
    MESSAGE_TYPES.SYSTEM_MESSAGE,
    `${attacker.name}(attacker) and ${defender.name}(defender) are in battle.`
  );
  state = STATE.ATTACKER_TURN;
  round = 1;
}

// Function to set the disabled state for all connected clients
async function setDisabled() {
  wss.clients.forEach((client) => {
    const data = JSON.stringify({
      type: MESSAGE_TYPES.SET_DISABLED,
      value: true,
    });
    client.send(data);
  });
  switch (state) {
    case STATE.ATTACKER_TURN:
      attacker.send(
        JSON.stringify({ type: MESSAGE_TYPES.SET_DISABLED, value: false })
      );
      break;
    case STATE.DEFENDER_TURN:
      defender.send(
        JSON.stringify({ type: MESSAGE_TYPES.SET_DISABLED, value: false })
      );
      break;
  }
}

// Function to compare the attributes of attacker's troop and defender's troop
async function compare(attackerTroop, defenderTroop) {
  let attackerTotal =
    attackerTroop.force + attackerTroop.arms + attackerTroop.food;
  let defenderTotal =
    defenderTroop.force + defenderTroop.arms + defenderTroop.food;
  attackerTroop.winAttributes = 0;
  defenderTroop.winAttributes = 0;
  await compareAttribute(attackerTroop, defenderTroop, "force");
  await compareAttribute(attackerTroop, defenderTroop, "arms");
  await compareAttribute(attackerTroop, defenderTroop, "food");

  //check host skill
  switch (attackerTroop.skill) {
    case "NB":
      attackerTotal += attackerTroop.funding;
      break;
    case "QE":
      attackerTroop.winAttributes =
        attackerTroop.winAttributes <= 3
          ? attackerTroop.winAttributes + 1
          : attackerTroop.winAttributes;
      break;
  }

  switch (defenderTroop.skill) {
    case "NB":
      defenderTotal += defenderTroop.funding;
      break;
    case "QE":
      defenderTroop.winAttributes =
        defenderTroop.winAttributes <= 3
          ? defenderTroop.winAttributes + 1
          : defenderTroop.winAttributes;
      break;
  }

  if (attackerTroop.skill === "IC") {
    defenderTotal *= defenderTroop.winAttributes * 0.5;
  } else {
    defenderTotal *= defenderTroop.winAttributes;
  }

  if (defenderTroop.skill === "IC") {
    attackerTotal *= attackerTroop.winAttributes * 0.5;
  } else {
    attackerTotal *= attackerTroop.winAttributes;
  }

  await delayBroadcastMessage(
    MESSAGE_TYPES.SYSTEM_MESSAGE,
    `Settlement incoming...`
  );
  await delayBroadcastMessage(
    MESSAGE_TYPES.SYSTEM_MESSAGE,
    `${attackerTroop.name} get ${attackerTotal} income.`
  );
  await delayBroadcastMessage(
    MESSAGE_TYPES.SYSTEM_MESSAGE,
    `${defenderTroop.name} get ${defenderTotal} income.`
  );

  if (attackerTroop.winAttributes != 0) {
    attackerTroop.funding += attackerTotal;
  } else {
    attackerTroop.funding = attackerTroop.funding;
  }

  if (defenderTroop.winAttributes != 0) {
    defenderTroop.funding += defenderTotal;
  } else {
    defenderTroop.funding = defenderTroop.funding;
  }
  round++;
  state = STATE.ATTACKER_TURN;
  await checkWhoWin();
}

async function checkWhoWin() {
  if (round > 3) {
    if (attackerTroop.funding > defenderTroop.funding) {
      broadcastMessage(
        MESSAGE_TYPES.SYSTEM_MESSAGE,
        `${attackerTroop.name} win the game.`
      );
    } else if (attackerTroop.funding < defenderTroop.funding) {
      broadcastMessage(
        MESSAGE_TYPES.SYSTEM_MESSAGE,
        `${defenderTroop.name} win the game.`
      );
    } else {
      broadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, `No one win the game.`);
    }
    attacker = null;
    defender = null;
    attackerTroop = null;
    defenderTroop = null;
    round = 0;
    state = STATE.MATCHING;
  }
}

// if host is null, set the waitting list player to host, if guest is null, set the second player to guest
function addPlayerToBattle() {
  if (wattingList.length === 0) return;
  if (attacker === null) {
    attacker = wattingList.shift();
  }
  if (defender === null) {
    defender = wattingList.shift();
  }
}

async function delayBroadcastMessage(type, message) {
  return new Promise((resolve) => {
    setTimeout(() => {
      broadcastMessage(type, message);
      resolve();
    }, DELAY_INCREMENT);
  });
}

// Function to compare a specific attribute of attacker's troop and defender's troop
async function compareAttribute(attackerTroop, defenderTroop, attribute) {
  let messages = [
    `${attribute} battling... `,
    `${attacker.name} :${attackerTroop[attribute]} vs ${defender.name} :${defenderTroop[attribute]}`,
    attackerTroop[attribute] > defenderTroop[attribute]
      ? `${attacker.name} win ${attribute} battle.`
      : attackerTroop[attribute] < defenderTroop[attribute]
      ? `${defender.name} win ${attribute} battle.`
      : `No one win ${attribute} battle.`,
  ];

  for (let message of messages) {
    await delayBroadcastMessage(MESSAGE_TYPES.SYSTEM_MESSAGE, message);
  }

  if (attackerTroop[attribute] > defenderTroop[attribute]) {
    attackerTroop.winAttributes += 1;
  } else if (attackerTroop[attribute] < defenderTroop[attribute]) {
    defenderTroop.winAttributes += 1;
  }
}

async function saveChatAndSendMessage(ws, jsonObj) {
  const chat = new Chat({
    name: ws.name,
    message: jsonObj.message,
    timestamp: new Date(),
  });

  await chat.save();

  wss.clients.forEach((client) => {
    client.send(
      JSON.stringify({
        type: MESSAGE_TYPES.CHAT_MESSAGE,
        message: jsonObj.message,
        name: ws.name,
        timestamp: new Date(),
      })
    );
  });
}

server.listen(8080, () => {
  console.log("Listening on http://localhost:8080");
  opn("http://localhost:8080");
  opn("http://localhost:8080");
});
