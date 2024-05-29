export function start(room){
    return new Game(room)
}

function sendEventToAll(userList,eventName,data){
    userList.forEach(user => {
        user.send_event(eventName,data)
    })
}

class Game{
    constructor(room){
        this.playerList = room.user_list
        this.room = room
    }

    game_ws_message_router(ws, message){
        const event = JSON.parse(message)
        let user = this.playerList.find(user => {return user.uuid === ws.data.uuid})
    
        if (user !== undefined)
        switch(event.type){
            case "GameChatMessage":
                sendEventToAll(this.playerList,"GameChatMessage",{sender_name:user.name, message:event.data})
                break
            case "IAmReady":
                user.send_event("GameInit",{
                    playersNames:this.playerList.map(player => player.name),
                })
                break
            case "EndGame":
                this.room.end_game()
                break
        }
    }

    userQuit(user){
        this.playerList.forEach((currentUser,index,list) =>{
            if(currentUser === user){
                list.splice(index,1)
            }
        })

        if(this.playerList.length === 0)
            this.room.end_game()
    }
}