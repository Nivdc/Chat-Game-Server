//这个文件用来展示游戏大厅
//this file is been used to show game lobby
//
//require Class Chat
//include Class Lobby and Class Room
const Chat = require('./chat')
const Room = require('./room')

class Lobby{
    constructor(){
        this.maxRooms=80
        this.chat=new Chat("lobby")
        this.rooms=new Array()
    }

    creatRoom(name,master){
        if(this.rooms.length < this.maxRooms){
            this.rooms.push(new Room(name,master))
        }
    }

    deleteRoom(name){
        for(var i=0 ; i<this.rooms.lenght ; i++){
            if(this.rooms[i].name === name){
                this.rooms.splice(i,1)
                break
            }
        }
    }

    showRoomList(){
        return {
            names:this.rooms.map(room => room.name)
            masters:this.rooms.map(room=>room.master)
        }
    }

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
            roomName:this.name
            gameMode:this.gameMode
            master:this.master
            playersNames:this.players.map(player => player.name)
        }
    }

}

module.exports = Lobby
