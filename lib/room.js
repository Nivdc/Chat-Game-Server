const Chat = require('./chat')

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

module.exports = Room
