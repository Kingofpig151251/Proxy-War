//client.js

$(() => {
    let gameTitle = document.getElementById('gameTitle');
    let mainStylesheet = document.getElementById('mainStylesheet');
    let backgroundVideoPlayer = document.getElementById('backgroundVideoPlayer');
    let backgroundVideoSource = document.getElementById('backgroundVideoSource');
    let gameControlPanel = document.getElementById('gameControlPanel');
    let gameOutputMessages = document.getElementById('gameOutputMessages');
    let battleForm = document.getElementById('battleForm');
    let battleTable = document.getElementById('battleTable');
    let fundingLabel = document.getElementById('fundingLabel');
    let forceInput = document.getElementById('forceInput');
    let armsInput = document.getElementById('armsInput');
    let foodInput = document.getElementById('foodInput');
    let skillRadioButtons = document.getElementsByName('skillRadioButtons');
    let skillRadioNb = document.getElementById('skillRadioNB');
    let skillRadioQe = document.getElementById('skillRadioQE');
    let skillRadioIc = document.getElementById('skillRadioIC');
    let selectedRadioButton = document.querySelector('input[name="radio_skill"]:checked');
    let messageForm = document.getElementById('messageForm');
    let nameInput = document.getElementById('nameInput');
    let messageInput = document.getElementById('messageInput');
    let sendButton = document.getElementById('sendButton');
    let joinGameButton = document.getElementById('joinGameButton');
    let gameStatePanel = document.getElementById('gameStatePanel');
    let stateTable = document.getElementById('stateTable');
    let stateLabel = document.getElementById('stateLabel');
    let playerQueueList = document.getElementById('playerQueueList');

    let ws = new WebSocket(`ws://${location.host}`);

    init();

    //收到消息時的處理
    ws.onmessage = function (event) {
        var jsonObj = JSON.parse(event.data);

        switch (jsonObj.type) {
            case MESSAGE_TYPES.SET_NAME:
                nameInput.disabled = true;
                messageInput.disabled = false;
                joinGameButton.disabled = false;
                break;
            case MESSAGE_TYPES.SET_LABEL:
                break;
            case MESSAGE_TYPES.SET_DISABLED:
                break;
            case MESSAGE_TYPES.SET_DISPLAY:
                break;
            case MESSAGE_TYPES.CHAT_MESSAGE:
                //add the message to the gameOutputMessages list
                gameOutputMessages.innerHTML += `<li><b>${jsonObj.name} : </b> ${jsonObj.message}</li>`;
                window.scrollTo(0, document.body.scrollHeight);
                break;
            case MESSAGE_TYPES.SYSTEM_MESSAGE:
                //add the message to the gameOutputMessages list
                gameOutputMessages.innerHTML += `<li><b>SYSTEM : </b> ${jsonObj.message}</li>`;
                break;
            case MESSAGE_TYPES.JOIN_GAME:
                break;
            case MESSAGE_TYPES.BATTLE:
                break;
            default:
                console.log('Unknown message type', type);
        }
    }

    function init() {
        messageInput.disabled = true;
        joinGameButton.disabled = true;
        for (let element of battleForm.elements) {
            element.disabled = true;
        }
    }

    // Send a something to the server
    function send(data) {
        ws.send(JSON.stringify(data));
        console.log('sent', data);
    }

    //set up the listeners for all the buttons
    joinGameButton.addEventListener('click', (e) => {
        send({ type: MESSAGE_TYPES.JOIN_GAME, message: nameInput.value });
    });

    sendButton.addEventListener('click', (e) => {
        e.preventDefault();

        if (!nameInput.disabled) {
            // 如果名字輸入未被禁用，則發送 nameInput 的值
            send({ type: MESSAGE_TYPES.SET_NAME, message: nameInput.value });
        } else {
            // 否則，發送 messageInput 的值
            send({ type: MESSAGE_TYPES.CHAT_MESSAGE, message: messageInput.value });
        }
    });

    messageForm.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendButton.click();
        }
    });

    battleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        send({ type: MESSAGE_TYPES.BATTLE, force: forceInput.value, arms: armsInput.value, food: foodInput.value, skill: selectedRadioButton.value });
    });

});

