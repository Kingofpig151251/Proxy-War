//indexScript.js
$(() => {
    gameTitle = document.getElementById('gameTitle');
    mainStylesheet = document.getElementById('mainStylesheet');
    backgroundVideoPlayer = document.getElementById('backgroundVideoPlayer');
    backgroundVideoSource = document.getElementById('backgroundVideoSource');
    gameControlPanel = document.getElementById('gameControlPanel');
    gameOutputMessages = document.getElementById('gameOutputMessages');
    battleForm = document.getElementById('battleForm');
    battleTable = document.getElementById('battleTable');
    fundingLabel = document.getElementById('fundingLabel');
    forceInput = document.getElementById('forceInput');
    armsInput = document.getElementById('armsInput');
    foodInput = document.getElementById('foodInput');
    skillRadioButtons = document.getElementsByName('skillRadioButtons');
    skillRadioNb = document.getElementById('skillRadioNB');
    skillRadioQe = document.getElementById('skillRadioQE');
    skillRadioIc = document.getElementById('skillRadioIC');
    selectedRadioButton = document.querySelector('input[name="radio_skill"]:checked');
    messageForm = document.getElementById('messageForm');
    nameInput = document.getElementById('nameInput');
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendButton');
    joinGameButton = document.getElementById('joinGameButton');
    gameStatePanel = document.getElementById('gameStatePanel');
    stateTable = document.getElementById('stateTable');
    stateLabel = document.getElementById('stateLabel');
    playerQueueList = document.getElementById('playerQueueList');

    ws = new WebSocket(`ws://${location.host}`);

    //set up the listeners for all the buttons
    joinGameButton.addEventListener('click', () => {
        send({ type: 'joinGame', name: nameInput.value });
    });

    sendButton.addEventListener('click', () => {
        send({ type: 'message', message: messageInput.value });
    });

    battleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        send({ type: 'battle', force: forceInput.value, arms: armsInput.value, food: foodInput.value, skill: selectedRadioButton.value });
    });

    // Send a something to the server
    function send(data) {
        ws.send(JSON.stringify(data));
        console.log('sent', data);
    }

});

