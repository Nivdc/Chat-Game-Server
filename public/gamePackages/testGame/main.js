const Chat = require('lib/chat')

function start(userList,options,callback){
    mainChat = new Chat('游戏',userList)
    mainChat.sentEventToEveryone('showGameInfo',options)
    callback()
}

function init(gamers){
}

function inputHandler(data){

}

exports.start = start
