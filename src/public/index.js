var socket = undefined
var game_onmessage = undefined

let userList = undefined
let userSelf = {}

let UI_Controller = {
    switchConsoleForm:function () {
        lobbyConsole.switch()
    },
    switchLobbyChatForm:function () {
        lobbyChat.switch()
    },
    switchLobbyRoomListForm:function (){
        lobbyRoomList.switch()
    }
}

let lobbyConsole = {
    showUp:false,
    messageList:[],
    inputString:'',

    close(){this.showUp = false},
    switch(){
        this.showUp = !this.showUp
        if(this.showUp === true)
            this.$nextTick(() => { document.querySelector('#consoleInput input').focus() })
    },
    addMessage(message){
        this.messageList.push(message)
    },
    submit(){
        this.inputHandler(this.inputString)
        this.inputString = ''
    },
    inputHandler(inputString){
        [command, ...args] = inputString.split(" ")

        switch(command){
            case 'clear':
                this.messageList = []
            break

            case 'help':
                this.addMessage('作者很懒，还没有写帮助捏~普通玩家用不到控制台，你非得用的话自己翻代码吧。')
            break

            case 'lcm':
            case 'LobbyChatMessage':{
                const event = {type:"LobbyChatMessage",data:args.shift()}
                socket.send(JSON.stringify(event))
                break
            }

            case 'cr':
            case 'CreateRoom':{
                const event = {type:"UserCreatRoom",data:JSON.parse(args.shift())}
                socket.send(JSON.stringify(event))
                break
            }
            case 'jr':
            case 'JoinRoom':{
                const tagete_room_id = Number(args.shift())
                const event = {type:"UserJoinRoom",data:tagete_room_id}
                socket.send(JSON.stringify(event))
                break
            }
            case 'qr':
            case 'QuitRoom':{
                const event = {type:"UserQuitRoom"}
                socket.send(JSON.stringify(event))
                break
            }
            case 'st':
            case 'StartGame':{
                const event = {type:"HostStartGame"}
                socket.send(JSON.stringify(event))
                break
            }
            case 'rcm':
            case 'RoomChatMessage':{
                const event = {type:"RoomChatMessage",data:args.shift()}
                socket.send(JSON.stringify(event))
                break
            }
            default:
                this.addMessage("未知指令，请重试。输入help查看指令帮助。")
            break
        }
    }
}

let lobbyChat = {
    showUp: false,
    messageList:[],
    inputString:'',

    close(){this.showUp = false},
    switch(){
        this.showUp = !this.showUp
        if(this.showUp === true)
            this.$nextTick(() => { document.querySelector('#lobbyChatInput input').focus() })
    },
    submit(){
        if(/^\s*$/.test(this.inputString) === false)
            lobbyConsole.inputHandler(`LobbyChatMessage ${this.inputString}`)
        this.inputString = ''
    },
    addMessage(senderName, message){
        this.messageList.push({senderName, message})
    },
}

let lobbyRoomList = {
    showUp: false,
    roomList:[],
    selectedRoom:undefined,

    close(){this.showUp = false},
    switch(){
        this.showUp = !this.showUp
    },
    select(room){
        if(this.selectedRoom === room)
            this.joinRoom()
        else
            this.selectedRoom = room
    },
    joinRoom(){
        if(this.selectedRoom)
            lobbyConsole.inputHandler(`JoinRoom ${this.selectedRoom.id}`)
    },
    openCreateRoomForm(){
        lobbyCreateRoom.showUp = true
    },
}

let lobbyCreateRoom = {
    showUp: false,
    gamePackageList: [],
    roomCreationData: {
        name: "未命名",
        status: "open",
        selectedGameName:undefined,
    },

    close(){this.showUp = false},
    submit(){
        lobbyConsole.inputHandler(`CreateRoom ${JSON.stringify(this.roomCreationData)}`)
        this.close()
    },
    cancel(){this.close()},
}

let lobbyRoom = {
    showUp: true,
    name:'测试',
    host:undefined,
    userList: [],
    messageList:[],
    chatInputString:'',

    close(){this.showUp = false},
    submit(){
        lobbyConsole.inputHandler(`RoomChatMessage ${chatInputString}`)
        this.chatInputString = ''
    },
    cancel(){this.close()},
}


document.addEventListener("alpine:init", () => {
    lobbyConsole  = Alpine.reactive(lobbyConsole)
    lobbyChat     = Alpine.reactive(lobbyChat)
    lobbyRoomList = Alpine.reactive(lobbyRoomList)
    lobbyCreateRoom = Alpine.reactive(lobbyCreateRoom)

    init()
})


function init(){
    socket = new WebSocket(`ws://${window.location.host}/session`)
    socket.onopen = ()=>{
        userSelf.uuid = document.cookie.split('=')[1]
    }
    // socket.onclose = ()=>{
    //     alert("与服务器的连接已断开")
    // }
    init_socket()
}

function init_socket(){
    // socket.onopen = () => {
    //     inputHandler("/cr")
    // }
    socket.onmessage = (e) => {
        const event = JSON.parse(e.data)
        switch(event.type){
            case "LobbyChatMessage":
                lobbyChat.addMessage(event.data.sender_name, event.data.message)
            break

            case "RoomChatMessage":
                // updateMessageList("房间", event.data.sender_name, event.data.message)
            break

            case "UserListUpdate":
                userList = event.data.map(userData => JSON.parse(userData))
                userSelf = userList.find(user => {return user.uuid === userSelf.uuid})
            break

            case "RoomListUpdate":
                lobbyRoomList.roomList = event.data.map(roomData => JSON.parse(roomData))
            break

            case "GamePackagesUpdate":
                lobbyCreateRoom.gamePackageList = event.data.map(gaamePackageData => JSON.parse(gaamePackageData))
                lobbyCreateRoom.roomCreationData.selectedGameName = lobbyCreateRoom.gamePackageList[0].name
            break

            case "GameStarted":
                // $('#mainForm').hide()
                // $('body').append(`<iframe id="game" height="100%" width="100%" src='gamePackages/testGame/public/index.html'></iframe>`)
            break
            case "GameEnded":
                // $('#mainForm').show()
                // $('#game').remove()
                // game_onmessage = undefined

            default:
                if(game_onmessage)
                    game_onmessage(e)
            break
        }
    }
}