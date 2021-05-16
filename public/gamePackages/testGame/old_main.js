const EventEmitter = new require('events')
let gameListener = null

function start(userList,options,room){
    //这个函数拥有的数据储存在同一个地方，多次运行会导致不同的房间运行同一个游戏。（也许可以用来做个网游？
    //这个特性可以让游戏模块知道有多少个该游戏在运行中
    gameListener = new EventEmitter()
    this.userList=userList
    gameListener.on('message',(data)=>{
        sendEventToAll(this.userList,"gameChatMessage",data)
    })
    gameListener.once('gameOver',()=>{
        room.gameOver()
    })
}

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

function sendEventToAll(userList,eventName,data){
    userList.forEach(user => {
        user.sendEvent(eventName,data)
    })
}


exports.start = start
exports.inputHandler = inputHandler