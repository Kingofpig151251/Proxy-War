// MESSAGE_TYPES.js
const MESSAGE_TYPES = {
    SET_NAME: 'setName',
    UPDATA_LABEL: 'updataLabel',
    SET_DISABLED: 'setDisabled',
    SET_DISPLAY: 'setDisplay',
    CHAT_MESSAGE: 'chatMessage',
    SYSTEM_MESSAGE: 'systemMessage',
    JOIN_GAME: 'joinGame',
    BATTLE: 'battle',
};

if (typeof module !== 'undefined') {
    module.exports = MESSAGE_TYPES;
} else {
    window.MESSAGE_TYPES = MESSAGE_TYPES;
}