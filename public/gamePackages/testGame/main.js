const EventEmitter = new require('events')

function start(userList,options,room){
    return new Game(userList,options,room)
}

function sendEventToAll(userList,eventName,data){
    userList.forEach(user => {
        user.sendEvent(eventName,data)
    })
}

class Game{
    constructor(userList,options,room){
        this.userList=userList
        this.gameListener = new EventEmitter()
        this.gameListener.on('message',(data)=>{
            sendEventToAll(this.userList,"gameChatMessage",data)
        })
        this.gameListener.once('gameOver',()=>{
            room.gameOver()
        })
    }

    inputHandler(method,path,user,data){
        if(data === null){
            return false
        }
        else if(data.message === ".end"){
            this.gameListener.emit("gameOver")
            return true
        }
        else{
            data.senderName = user.name
            this.gameListener.emit("message",data)
            return true
        }
    }
}

// module.exports = Game 
exports.start = start