import { readdir } from "node:fs/promises"

// const updateHandler = {
//     get: function (target:any, property:any, receiver:any) {
//         console.log('target:', target, "property:", property)
//         return Reflect.get(target, property, receiver)
//     },
// }

let user_counter = 1
const user_list: User[] = []

let room_counter = 1
const room_list: Room[] = []

const gamesFilePath = import.meta.dir + "/../public/gamePackages"
const game_package_list: any[] = []

init()
function init(){
    scan_game_packages()
}

async function scan_game_packages(){
    const files = await readdir(gamesFilePath)
    files.forEach((file)=>{
        import(`${gamesFilePath}/${file}/package`).then((pkg)=>{
            pkg.default.gameFileName = file
            pkg.default.gameResourcePath = `gamePackages/${file}/${pkg.staticResourcePath}/index.html`
            game_package_list.push(pkg.default)
        })
    })
}

export function lobby_join_request(req: Request, server: Server){
    const uuid = req.headers.get("cookie")?.split('=')[1]

    if(uuid !== undefined)
        if(user_list.find(user => {return user.uuid === uuid}) !== undefined)
            return new Response("User is already logged in.", { status: 400 })

    let user = new User(`游客${user_counter}`)
    user_list.push(user)
    const success = server.upgrade(req, { data: { uuid:user.uuid }, headers : {"Set-Cookie": `user_uuid=${user.uuid}; SameSite=Strict;`} })

    if(success){
        user_counter ++
        all_user_update_all()
        return undefined
    }
    else{
        user_list.pop()
        return new Response("WebSocket upgrade error.", { status: 400 })
    }
}

export function lobby_set_user_websocket(ws: WebSocket){
    let user = user_list.find(user => {return user.uuid === ws.data.uuid})
    user?.set_websocket(ws)
}

export function lobby_user_quit(ws: WebSocket){
    user_list.forEach((currentUser,index,list) => {
        if(currentUser.uuid === ws.data.uuid){
            list.splice(index,1)
            currentUser.quit_room()
        }
    })
    all_user_update_all()
}

export function lobby_ws_message_router(ws: WebSocket, message: string){
    const event = JSON.parse(message)
    let user = user_list.find(user => {return user.uuid === ws.data.uuid})

    if (user !== undefined)
    switch(event.type){
        case "LobbyChatMessage":
            send_event_to(user_list, event.type, {sender_name:user.name, message:event.data})
        break

        case "UserCreatRoom":
            user.quit_room()
            room_list.push(new Room(event.data, user, room_counter))
            room_counter ++

            all_user_update_all()
        break

        case "UserJoinRoom":
            let room = room_list.find(room => {return room.id === Number(event.data)})
            room?.userJoin(user)
        break

        case "UserQuitRoom":
            user.quit_room()
        break

        default:
            user.current_room?.room_ws_message_router(ws, message)
        break
    }
}

function send_event_to(user_list: User[],type:string, data? :any){
    user_list.forEach(user => {
        user.send_event(type,data)
    })
}

function all_user_update_all(){
    send_event_to(user_list, "UserListUpdate", user_list.map(user => JSON.stringify(user)))
    send_event_to(user_list, "RoomListUpdate", room_list.map(room => JSON.stringify(room)))
    send_event_to(user_list, "GamePackagesUpdate", game_package_list.map(pkg => JSON.stringify(pkg)))
}

class User{
    name : string 
    readonly uuid : string
    socket : WebSocket | undefined
    current_room : Room | undefined

    constructor(name : string){
        this.name = name
        this.uuid = crypto.randomUUID()
    }

    set_websocket(socket : WebSocket){
        this.socket = socket
    }

    sendEvent(type : string, data? : any){this.send_event(type,data)}
    send_event(type : string, data? : any){
        if(this.socket){
            const event = {type, data}
            this.socket.send(JSON.stringify(event))
        }
    }

    quit_room(){
        this.current_room?.userQuit(this)
    }

    toJSON(){
        return {
            name: this.name,
            uuid: this.uuid,
            current_room_id: this.current_room?.id,
        }
    }
}

class Room{
    name: string
    status: string
    host: User
    readonly id: number
    user_list: User[]

    selected_game_package: any | undefined

    current_game: any | undefined

    constructor(room_data: any,host: User,roomID: number){
        this.name   = room_data.name
        this.status  = room_data.status
        this.host   = host
        this.id     = roomID
        this.user_list = []

        this.selected_game_package = game_package_list.find(pkg => {return pkg.name === room_data.selectedGameName})

        this.userJoin(host)
    }

    userJoin(user: User){
        if(this.status !== "open")
            return
        if(user.current_room === this)
            return

        user.quit_room()
        this.user_list.push(user)
        user.current_room = this
        all_user_update_all()
    }

    userQuit(user: User){
        if(user === this.host && this.user_list.length > 1){
            let new_host = this.user_list.find(user => user !== this.host)
            if(new_host !== undefined){
                this.host = new_host
            }
        }

        this.user_list.forEach((currentUser,index,list) =>{
            if(currentUser === user){
                list.splice(index,1)
                currentUser.current_room = undefined
            }
        })

        if(this.user_list.length === 0){
            room_list.forEach((currentRoom,index,list) => {
                if(currentRoom === this){
                    list.splice(index,1)
                }
            })
        }

        this.current_game?.userQuit(user)
        all_user_update_all()
    }

    send_chat_message(sender_name: string, msg: string){
        send_event_to(this.user_list, "RoomChatMessage", {sender_name:sender_name, message:msg})
    }

    room_ws_message_router(ws: WebSocket, message: any){
        const event = JSON.parse(message)
        let user = this.user_list.find(user => {return user.uuid === ws.data.uuid})
    
        if (user !== undefined)
        switch(event.type){
            case "RoomChatMessage":
                this.send_chat_message(user.name, event.data)
                break
            case "HostSetRoom":
                if(user === this.host)
                    this.hostSetRoom(event.data)
                break
            case "HostStartGame":
                if(user === this.host && this.selected_game_package)
                    this.start_game()
                break
            default:
                this.current_game?.game_ws_message_router(ws, message)
                break
        }
    }
    
    hostSetRoom(room_data: any){
        this.name   = room_data.name
        this.status  = room_data.status

        this.selected_game_package = game_package_list.find(pkg => {return pkg.name === room_data.selectedGameName})
        all_user_update_all()
    }

    start_game(){
        if(this.current_game === undefined){            
            send_event_to(this.user_list, "GameStarted")
            if(this.selected_game_package !== undefined){
                let sgp = this.selected_game_package
                import(`${gamesFilePath}/${sgp.gameFileName}/${sgp.main}`).then(game => {
                    this.current_game = game.start(this)
                })
            }
            this.status = "inGame"
        }
    }

    endGame(){this.end_game()}
    end_game(){
        send_event_to(this.user_list, "GameEnded")
        this.current_game = undefined
        this.status = "open"
    }

    toJSON(){
        return {
            name:this.name,
            status:this.status,
            host:this.host,
            id:this.id,
            selectedGamePackage:this.selected_game_package,
            userList:this.user_list
        }
    }
}