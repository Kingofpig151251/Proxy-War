// Element_ID.js
var Element_ID = {
    Labels: {
        gameTitle: 'gameTitle',
        roundLabel: 'roundLabel',
        fundingLabel: 'fundingLabel',
        hostNameLabel: 'hostNameLabel',
        guestNameLabel: 'guestNameLabel',
        stateLabel: 'stateLabel',
    },
    Forms: {
        battleForm: 'battleForm',
        messageForm: 'messageForm',
    },
    Tables: {
        stateTable: 'stateTable',
        battleTable: 'battleTable',
    },
    Inputs: {
        forceInput: 'forceInput',
        armsInput: 'armsInput',
        foodInput: 'foodInput',
        nameInput: 'nameInput',
        messageInput: 'messageInput',
    },
    Buttons: {
        joinGameButton: 'joinGameButton',
        sendButton: 'sendButton',
    },
    Panels: {
        gameControlPanel: 'gameControlPanel',
        gameStatePanel: 'gameStatePanel',
    },
    Others: {
        outputMessages: 'gameOutputMessages',
        waitingList: 'waitingList',
        mainStylesheet: 'mainStylesheet',
        backgroundVideoPlayer: 'backgroundVideoPlayer',
        backgroundVideoSource: 'backgroundVideoSource',
    }
};

if (typeof module !== 'undefined') {
    module.exports = Element_ID;
} else {
    window.Element_ID = Element_ID;
}