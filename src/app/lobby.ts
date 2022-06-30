import { User } from "./user_manager.ts"

const userList: User[] = []
const eventList: Array<[string, Function]> = []
// const roomList: Room[] = []
// const gamesFilePath = __dirname+"/../public/gamePackages"
// const EventEmitter = new require('events')
// const lobbyListener = new EventEmitter()

export function userJoinLobby(user: User): void{
    userList.push(user)

    if(user.socket){
        user.socket.onclose = ()=>{
            userList.forEach((currentUser,index,list) => {
                if(currentUser.uuid === user.uuid){
                    list.splice(index,1)

                    // if(user.currentRoomID){
                    //     roomList.forEach((currentRoom,index,list)=>{
                    //         if(currentRoom.id === user.currentRoomID){
                    //             currentRoom.userQuit(user.uuid)
                    //         }
                    //     })
                    // }
                }
            })
        }

        user.socket.onmessage = (message)=>{
            const data = JSON.parse(message.data)
            eventHandler(user,data)
        }
    }
}

function eventHandler(user: User,data: any):void{
    if(data.type){
        eventList.forEach((currentEvent)=>{
            if(currentEvent[0] === data.type){
                if(data.data){
                    currentEvent[1](user,data.data)
                }else{
                    currentEvent[1](user)
                }
            }
        })
    }
}

export function addEvent(type: string, handler: Function){
    const event: [string, Function] = [type, handler]
    eventList.push(event)
}

export function removeEvent(type: string){
    eventList.forEach((currentEvent,index,list) => {
        if(currentEvent[0] === type){
            list.splice(index,1)
        }
    })
}

function init(){
    addEvent("lobbyChatMessage",(user:User, data:any)=>{
        sendEventTo(userList, "lobbyChatMessage", buildChatMessage(data,user.name))
    })
}
init()

function sendEventTo(userList:User[],type:string,data?:any):void{
    userList.forEach(user => {
        user.sendEvent(type,data)
    })
}

function buildChatMessage(message:string,senderName='system'){
    return {
        senderName:`${senderName}`,
        message:`${message}`,
    }
}


// class Room{
//     id: number
//     name: string
//     host: User
//     userList: User[]
// }