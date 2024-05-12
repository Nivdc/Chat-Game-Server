let user_counter = 1
const user_list: User[] = []

let room_counter = 1
const room_list: Room[] = []

export function lobby_join_request(req: Request, server: Server){
    const uuid = req.headers.get("cookie")?.split('=')[1]

    if(uuid !== undefined)
        if(user_list.find(user => {return user.uuid === uuid}) !== undefined)
            return new Response("WebSocket upgrade error.", { status: 400 })

    let user = new User(`游客${user_counter}`)
    user_list.push(user)
    const success = server.upgrade(req, { data: { uuid:user.uuid }, headers : {"Set-Cookie": `user_uuid=${user.uuid}`} })

    if(success){
        user_counter ++
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
            user_quit_room(currentUser)
        }
    })
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
            user_quit_room(user)
            room_list.push(new Room(event.data, user, room_counter))
            room_counter ++
        break

        case "UserJoinRoom":
            user_quit_room(user)
            let room = room_list.find(room => {return room.id === Number(event.data)})
            room?.userJoin(user)
        break

        case "UserQuitRoom":
            user_quit_room(user)
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

function send_system_message(msg: string){
    send_event_to(user_list, "LobbyChatMessage", {sender_name:'系统', message:msg})
}

function user_quit_room(user: User){
    let room = user.current_room
    room?.userQuit(user)
    if(room?.user_list.length === 0){
        room_list.forEach((currentRoom,index,list) => {
            if(currentRoom === room){
                list.splice(index,1)
            }
        })
    }
}

class User{
    name : string 
    readonly uuid : string
    socket : WebSocket | null
    current_room : Room | null

    constructor(name : string){
        this.name = name
        this.uuid = crypto.randomUUID()
        this.socket = null
        this.current_room = null
    }

    set_websocket(socket : WebSocket){
        this.socket = socket
    }

    send_event(type : string, data? : any){
        if(this.socket){
            if(data){
                const event = {type, data}
                this.socket.send(JSON.stringify(event))
            }
            else{
                const event = {type}
                this.socket.send(JSON.stringify(event))
            }
        }
    }

    info(){
        return {
            name: this.name,
            current_room: this.current_room?.id
        }
    }
}

class Room{
    name: String
    status: string
    host: User
    readonly id: number
    user_list: User[]

    constructor(room_data: any,host: User,roomID: number){
        this.name   = room_data.name
        this.status = room_data.status
        this.host   = host
        this.id     = roomID
        // this.game = gameList.find(game => {return game.id === room_data.gameID})
        // this.gameModeNum=room_data.gameModeNum
        // this.customOption=room_data.customOption
        this.user_list = []

        this.userJoin(host)
    }

    userJoin(user: User){
        this.user_list.push(user)
        user.current_room = this
        this.send_system_message(`玩家->${user.name} 加入了房间。`)
    }

    userQuit(user: User){
        if(user === this.host && this.user_list.length > 1){
            let new_host = this.user_list.find(user => user !== this.host)
            if(new_host !== undefined){
                this.host = new_host
                this.send_system_message(`由于房主退出房间，新房主为->${new_host?.name} 。`)
            }
        }

        this.user_list.forEach((currentUser,index,list) =>{
            if(currentUser === user){
                list.splice(index,1)
                currentUser.current_room = null
            }
        })

        this.send_system_message(`玩家->${user.name} 退出了房间。`)
    }

    send_chat_message(sender_name: string, msg: string){
        send_event_to(this.user_list, "RoomChatMessage", {sender_name:sender_name, message:msg})
    }

    send_system_message(msg: string){
        this.send_chat_message('系统', msg)
    }

    room_ws_message_router(ws: WebSocket, message: any){
        const event = JSON.parse(message)
        let user = this.user_list.find(user => {return user.uuid === ws.data.uuid})
    
        if (user !== undefined)
        switch(event.type){
            case "RoomChatMessage":
                this.send_chat_message(user.name, event.data)
                break
            case "UserCreatRoom":
                break
            case "UserJoinRoom":
                break
            case "UserQuitRoom":
                break
            default:
                // user.current_room?.room_ws_message_router(ws, message)
                break
        }
    }
    
    // userSetRoom(room_data,cookieID){
    //     if(this.host.cookieID === cookieID){
    //         this.name=room_data.name
    //         this.status=room_data.status
    //         this.game = gameList.find(game => {return game.id === room_data.gameID})
    //         this.gameModeNum=room_data.gameModeNum
    //         this.customOption=room_data.customOption


    //         lobbyListener.emit('roomInfoUpd',this)
    //         return true
    //     }
    //     return false
    // }

    // kickUser(hostCookieID,userID){
    //     if(this.host.cookieID === hostCookieID){
    //         this.user_list.forEach((user,index,list) =>{
    //             if(user.id === userID){
    //                 list.splice(index,1)
    //                 user.currentRoomID = null
    //                 user.sendEvent("kickOut")
    //                 lobbyListener.emit('roomInfoUpd',this)
    //             }
    //         })

    //         return true
    //     }
    //     else{
    //         return false
    //     }
    // }

    // sendChatMessage(message,senderCookieID){
    //     try{
    //         sendEventTo(this.user_list,'roomChatMessage',buildChatMessage(message,this.user_list.find(user=>user.cookieID===senderCookieID).name))
    //         return true
    //     }catch(error){//应对房间外的人发送消息至房间
    //         return false
    //     }
    // }

    // roomGameInfo(){//xxx:这里的信息可能多余了，只要有gameModeNum,一些信息可以在客户端读出来，但是自定义信息不能
    //     if(typeof(this.gameModeNum) === "number"){//如果这个值不是数字，说明使用的是自定义设置。
    //         return {
    //             gameName:this.game.gamePkgInfo.name,
    //             gameID:this.game.id,
    //             gameModeName:this.game.config.options[this.gameModeNum].modeName,
    //             maxPlayers:this.game.config.options[this.gameModeNum].maxPlayers
    //         }
    //     }
    //     else if(this.customOption){
    //         return {
    //             gameName:this.game.gamePkgInfo.name,
    //             gameID:this.game.id,
    //             gameModeName:"自定义",
    //             maxPlayers:this.customOption.maxPlayers
    //         }
    //     }
    // }

    // roomInfo(){
    //     return {
    //         name:this.name,
    //         status:this.status,
    //         hostInfo:this.host.info(),
    //         id:this.id,
    //         gameInfo:this.roomGameInfo(),
    //         gameModeNum:this.gameModeNum,
    //         usersInfos:this.user_list.map(user => user.info()),
    //     }
    // }

    // startGame(){
    //     if(this.user_list.length <= this.roomGameInfo().maxPlayers || !this.roomGameInfo().maxPlayers){
    //         lobbyListener.emit('gameStart',this)
    //         sendEventTo(this.user_list,'gameStart')
    //         if(typeof(this.gameModeNum) === "number"){//如果这个值不是数字，说明使用的是自定义设置。
    //             this.Ggame = require(this.game.mainPath).start(this.user_list,this.game.config.options[this.gameModeNum],this)            
    //             //fixme:挖坑给自己跳啊，我就知道下面那个东西不该叫Game，变量名不太对。
    //         }
    //         else if(this.customOption){
    //             this.Ggame = require(this.game.mainPath).start(this.user_list,this.customOption,this)
    //         }
    //         //fixme:可以看出来目前我们是直接把用户和这个房间传进游戏逻辑里的，这样做非常非常非常不安全！！！
    //         //还是说应该信任游戏的作者不会把这些东西弄坏？毕竟传个房间进去很方便嘛
    //     }
    // }

    // gameOver(){
    //     this.Ggame = undefined
    //     lobbyListener.emit('gameOver',this)
    //     sendEventTo(this.user_list,'gameOver')
    // }

    // inputHandler(method,path,user,data){
    //     if(this.Ggame){
    //         return this.Ggame.inputHandler(method,path,user,data)
    //     }
    //     else{
    //         return false
    //     }
    // }
}