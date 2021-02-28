const Chat = require('./chat')
let userList = []
let rooms = []
let lobbyChat = new Chat('lobby')

function creatRoom(name,master){
    if(this.rooms.length < this.maxRooms){
        this.rooms.push(new Room(name,master))
    }
}

function deleteRoom(name){
    for(var i=0 ; i<this.rooms.lenght ; i++){
        if(this.rooms[i].name === name){
            this.rooms.splice(i,1)
            break
        }
    }
}

function sentRoomList(cookieID){//xxx:not good enough
    if(userList.find(user => {return user.cookieID === cookieID})){
        return {
            names:this.rooms.map(room => room.name),
            masters:this.rooms.map(room=>room.master)
        }
    }
}

function sentChatMessage(message,senderCookieID){
    return lobbyChat.sentChatMessage(message,senderCookieID)
}

function userJoinLobby(user){
    userList.push(user)
    lobbyChat.userJoin(user)
    user.SSEconnection.on('close',()=>{
        userList.forEach((currentUser,index,list) => {
            if(currentUser.cookieID === user.cookieID){
                list.splice(index,1)
                lobbyChat.userQuit(currentUser)
            }
        })
    })
}

class Room{
    constructor(name,master,gameNode){
        this.name=name
        this.master=master
        this.gameNode=gameNode
        this.chat=new Chat(`${this.name}`)
        this.players=new Array()
    }

    playerJoin(player){
        this.players.push(player)
    }

    playerQuit(player){
        for(var i=0 ; i<players.lenght ; i++){
            if(this.players[i].name === player.name){
                this.players.splice(i,1)
                break
            }
        }
    }

    showRoomData(){
        return {
            roomName:this.name,
            gameMode:this.gameMode,
            maxPlayer:this.maxPlayer,
            master:this.master,
            playersNames:this.players.map(player => player.name),
        }
    }

}
exports.userJoinLobby = userJoinLobby
exports.sentChatMessage = sentChatMessage
