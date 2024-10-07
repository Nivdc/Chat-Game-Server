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
            case 'sr':
            case 'SetRoom':{
                const event = {type:"HostSetRoom",data:JSON.parse(args.shift())}
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
    showUp: true,
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
    showUp: true,
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
            if(room.status === 'open')
                this.selectedRoom = room
    },
    joinRoom(){
        if(this.selectedRoom)
            lobbyConsole.inputHandler(`JoinRoom ${this.selectedRoom.id}`)
    },
    openCreateRoomForm(){
        lobbyCreateRoom.showUp = true
        document.getElementById('lobbyCreateRoomForm').style.zIndex = 2
    },
}

let lobbyCreateRoom = {
    showUp: false,
    gamePackageList: [],
    roomCreationData: {
        name: "未命名",
        status: "open",
        selectedGameName:'sc2mafia',
    },

    close(){this.showUp = false},
    submit(){
        console.log(JSON.stringify(this.roomCreationData))
        lobbyConsole.inputHandler(`CreateRoom ${JSON.stringify(this.roomCreationData)}`)
        this.close()
    },
    cancel(){this.close()},
}

let lobbyRoom = {
    showUp: false,
    name:'',
    host:undefined,
    status:undefined,
    userList: [],
    messageList:[],
    chatInputString:'',
    selectedGameName:'',
    selectedGamePackage:undefined,

    setup(room){
        this.name = room.name
        this.host = room.host
        this.status = room.status
        this.userList = room.userList
        this.selectedGameName = room.selectedGamePackage.name
        this.selectedGamePackage = room.selectedGamePackage

        this.showUp = true
    },
    close(){
        this.showUp = false
        lobbyConsole.inputHandler(`QuitRoom`)
        this.messageList = []
        this.chatInputString = ''
    },
    submit(){
        lobbyConsole.inputHandler(`RoomChatMessage ${this.chatInputString}`)
        this.chatInputString = ''
    },
    start(){
        lobbyConsole.inputHandler(`StartGame`)
    },
    set(){
        let roomSetData = {
            name: this.name,
            status: this.status,
            selectedGameName: this.selectedGameName,
        }
        lobbyConsole.inputHandler(`SetRoom ${JSON.stringify(roomSetData)}`)
    },
    isHost(){
        if(this.host)
            return userSelf.uuid === this.host.uuid
        return false
    },
    addMessage(senderName, message){
        this.messageList.push({senderName, message})
    },
}


document.addEventListener("alpine:init", () => {
    lobbyConsole  = Alpine.reactive(lobbyConsole)
    lobbyChat     = Alpine.reactive(lobbyChat)
    lobbyRoomList = Alpine.reactive(lobbyRoomList)
    lobbyCreateRoom = Alpine.reactive(lobbyCreateRoom)
    lobbyRoom = Alpine.reactive(lobbyRoom)

    init()
    let forms = document.querySelectorAll('.form')
    for(const form of forms)
        dragElement(form,forms)
})


function init(){
    socket = new WebSocket(`ws://${window.location.host}/session`)
    socket.onopen = ()=>{
        userSelf.uuid = document.cookie.split('=')[1]
    }
    socket.onclose = ()=>{
        alert("与服务器的连接已断开")
    }
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
                lobbyRoom.addMessage(event.data.sender_name, event.data.message)
            break

            case "UserListUpdate":
                userList = event.data.map(userData => JSON.parse(userData))
                userSelf = userList.find(user => {return user.uuid === userSelf.uuid})
                document.getElementById('userCounter').dispatchEvent(new CustomEvent('user-counter-update', { detail:userList.length }))
            break

            case "RoomListUpdate":
                lobbyRoomList.roomList = event.data.map(roomData => JSON.parse(roomData))
                if(userSelf.current_room_id){
                    let room = lobbyRoomList.roomList.find(room => {return room.id === userSelf.current_room_id})
                    if(room){
                        lobbyRoom.setup(lobbyRoomList.roomList.find(room => {return room.id === userSelf.current_room_id}))
                        document.getElementById("lobbyRoomForm").style.zIndex = 2
                    }
                }
            break

            case "GamePackagesUpdate":
                lobbyCreateRoom.gamePackageList = event.data.map(gaamePackageData => JSON.parse(gaamePackageData))
                lobbyCreateRoom.roomCreationData.selectedGameName = lobbyCreateRoom.gamePackageList[0].name
            break

            case "GameStarted":
                document.getElementById('mainForm').style.display = 'none'
                document.body.insertAdjacentHTML('beforeend', `<iframe id="game" height="100%" width="100%" src='${lobbyRoom.selectedGamePackage.gameResourcePath}'></iframe>`)
            break

            case "GameEnded":
                document.getElementById('mainForm').style.display = ''
                document.getElementById('game').remove()
                game_onmessage = undefined
            break

            default:
                if(game_onmessage)
                    game_onmessage(e)
            break
        }
    }
}


function dragElement(elmnt, elmnts) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (document.getElementById(elmnt.id + "Head"))
      // if present, the header is where you move the DIV from:
      document.getElementById(elmnt.id + "Head").onmousedown = dragMouseDown;

    elmnt.onmousedown = ()=>{
        for(const el of elmnts){
            if(el.id !== 'welcomeForm')
                el.style.zIndex = 0
        }
        elmnt.style.zIndex=1
    }


    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // get the mouse cursor position at startup:
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      // call a function whenever the cursor moves:
      document.onmousemove = elementDrag;
    }
  
    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // calculate the new cursor position:
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      // set the element's new position:
      elmnt.style.top       = (elmnt.offsetTop - pos2) + "px";
      elmnt.style.left      = (elmnt.offsetLeft - pos1) + "px";
      elmnt.style.bottom    = null
      elmnt.style.right     = null
    }
  
    function closeDragElement() {
      // stop moving when mouse button is released:
      document.onmouseup = null;
      document.onmousemove = null;
    }
}