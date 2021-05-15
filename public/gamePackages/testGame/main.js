const EventEmitter = new require('events')
let gameListener = null

function start(userList,options,room){
    gameListener = new EventEmitter()
    gameListener.on('message',(data)=>{
        sentEventToAll(userList,"gameChatMessage",data)
    })
    gameListener.once('gameOver',()=>{
        room.gameOver()
        //好吧，这真的很奇怪，游戏实际上不存在，只有这个监听器存在着。。。
    })
}

//为什么？为什么不能在下面直接处理玩家的操作？因为这个函数没有玩家的数据，他也不是给主函数调用的。但是为什么会这样？这很奇怪，对我来说很奇怪...
//虽然当代的游戏都能无阻塞地异步处理玩家的输入，但是还是我还是觉得这很奇怪。
function inputHandler(method,path,user,data){
    if(data === null){
        return false
    }
    else if(data.message === ".end"){
        gameListener.emit("gameOver")
        return true
    }
    else{
        data.senderName = user.name
        gameListener.emit("message",data)
        return true
    }
}

function sentEventToAll(userList,eventName,data){
    userList.forEach(user => {
        user.sendEvent(eventName,data)
    })
}


exports.start = start
exports.inputHandler = inputHandler