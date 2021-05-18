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
        this.playerList=userList//游戏内的user统一称为player，可能会在下一个游戏中采用player类包装user，以实现更多的功能
        this.gameListener = new EventEmitter()
        this.gameListener.on('sendInitInfo',(user)=>{
            user.sendEvent('gameInit',{
                playersNames:this.playerList.map(player => player.name),
            })
        })
        this.gameListener.on('message',(data)=>{
            sendEventToAll(this.playerList,"gameChatMessage",data)
        })
        this.gameListener.once('gameOver',()=>{
            room.gameOver()
        })
    }

    inputHandler(method,path,user,data){
        if(path.split('/')[1]==='game'){
            switch(path.split('/')[2]){
                case 'IAmReady':
                    this.gameListener.emit("sendInitInfo",user)
                    return true
                break

                case 'message':
                    data.senderName = user.name
                    this.gameListener.emit("message",data)
                    return true
                break

                case 'order':
                    switch(data.order){
                        case 'endGame':
                            this.gameListener.emit("gameOver")
                            return true
                        break

                        default:
                            return false
                        break
                    }
                break

                default:
                    return false
                break
            }
        }
        else{
            return false
        }
    }
}

exports.start = start