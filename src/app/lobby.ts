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

        user.socket.onmessage = (e)=>{
            const event = JSON.parse(e.data)
            eventHandler(event,user)
        }
    }
}

function eventHandler(event: any,user: User):void{

}

// class Room{
//     id: number
//     name: string
//     host: User
//     userList: User[]
// }