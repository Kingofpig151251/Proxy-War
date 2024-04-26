//client.js

$(() => {

    let Elements = {
        Labels: {
            gameTitle: document.getElementById(Element_ID.Labels.gameTitle),
            roundLabel: document.getElementById(Element_ID.Labels.roundLabel),
            fundingLabel: document.getElementById(Element_ID.Labels.fundingLabel),
            attackerNameLabel: document.getElementById(Element_ID.Labels.attackerNameLabel),
            defenderNameLabel: document.getElementById(Element_ID.Labels.defenderNameLabel),
            stateLabel: document.getElementById(Element_ID.Labels.stateLabel),
        },
        Forms: {
            battleForm: document.getElementById(Element_ID.Forms.battleForm),
            messageForm: document.getElementById(Element_ID.Forms.messageForm),
        },
        Tables: {
            stateTable: document.getElementById(Element_ID.Tables.stateTable),
            battleTable: document.getElementById(Element_ID.Tables.battleTable),
        },
        Inputs: {
            forceInput: document.getElementById(Element_ID.Inputs.forceInput),
            armsInput: document.getElementById(Element_ID.Inputs.armsInput),
            foodInput: document.getElementById(Element_ID.Inputs.foodInput),
            nameInput: document.getElementById(Element_ID.Inputs.nameInput),
            messageInput: document.getElementById(Element_ID.Inputs.messageInput),
        },
        Buttons: {
            joinGameButton: document.getElementById(Element_ID.Buttons.joinGameButton),
            sendButton: document.getElementById(Element_ID.Buttons.sendButton),
        },
        Panels: {
            gameControlPanel: document.getElementById(Element_ID.Panels.gameControlPanel),
            gameStatePanel: document.getElementById(Element_ID.Panels.gameStatePanel),
        },
        Others: {
            outputMessages: document.getElementById(Element_ID.Others.outputMessages),
            waitingList: document.getElementById(Element_ID.Others.waitingList),
            mainStylesheet: document.getElementById(Element_ID.Others.mainStylesheet),
            backgroundVideoPlayer: document.getElementById(Element_ID.Others.backgroundVideoPlayer),
            backgroundVideoSource: document.getElementById(Element_ID.Others.backgroundVideoSource),
        }
    }

    let ws = new WebSocket(`ws://${location.host}`);

    init();
    setupListeners();

    //收到消息時的處理
    ws.onmessage = function (event) {

        var data = JSON.parse(event.data);
        console.log('received', data);
        switch (data.type) {
            case MESSAGE_TYPES.SET_NAME:
                Elements.Inputs.nameInput.disabled = true;
                Elements.Inputs.messageInput.disabled = false;
                Elements.Buttons.joinGameButton.disabled = false;
                break;
            case MESSAGE_TYPES.UPDATA_LABEL:
                stateLabel.innerHTML = data.value.state;
                roundLabel.innerHTML = data.value.round;
                attackerNameLabel.innerHTML = data.value.hostName;
                defenderNameLabel.innerHTML = data.value.guestName;
                fundingLabel.innerHTML = data.value.funding;
                break;
            case MESSAGE_TYPES.UPDATA_WAITING_LIST:
                waitingList.innerHTML += `<ul>${data.value}</ul>`;
                break;
            case MESSAGE_TYPES.CLEAR_WAITTING_LIST:
                waitingList.innerHTML = '';
                break;
            case MESSAGE_TYPES.SET_DISABLED:
                for (let element of battleForm.elements) {
                    element.disabled = data.value;
                }
                break;
            case MESSAGE_TYPES.CHAT_MESSAGE:
                //add the message to the gameOutputMessages list
                gameOutputMessages.innerHTML += `<li><b>${data.name} : </b> ${data.message}</li>`;
                window.scrollTo(0, document.body.scrollHeight);
                break;
            case MESSAGE_TYPES.SYSTEM_MESSAGE:
                //add the message to the gameOutputMessages list
                gameOutputMessages.innerHTML += `<li><b>SYSTEM : </b> ${data.message}</li>`;
                window.scrollTo(0, document.body.scrollHeight);
                break;
            case MESSAGE_TYPES.JOIN_GAME:
                break;
            case MESSAGE_TYPES.BATTLE:
                break;
            default:
                console.log('Unknown message type', type);
                break;
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

    function setupListeners() {
        //set up the listeners for all the buttons
        joinGameButton.addEventListener('click', (e) => {
            e.preventDefault();
            send({ type: MESSAGE_TYPES.JOIN_GAME, message: nameInput.value });
        });

        sendButton.addEventListener('click', (e) => {
            e.preventDefault();

            if (!nameInput.disabled) {
                send({ type: MESSAGE_TYPES.SET_NAME, message: nameInput.value });
            } else {
                send({ type: MESSAGE_TYPES.CHAT_MESSAGE, message: messageInput.value });
                messageInput.value = '';
            }
        });

        messageForm.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendButton.click();
            }
        });

        battleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            for (let element of battleForm.elements) {
                element.disabled = true;
            }
            let selectedSkill = document.querySelector('input[name="radio_skill"]:checked').value;
            send({
                type: MESSAGE_TYPES.BATTLE,
                force: forceInput.value,
                arms: armsInput.value,
                food: foodInput.value,
                skill: selectedSkill,
            });
        });
    }
});

