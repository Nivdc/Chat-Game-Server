var socket = undefined
var game_onmessage = undefined

let UI_Controller = {
    switchConsoleForm:function () {
        lobbyConsole.switch()
    },
    switchLobbyChatForm:function () {
        lobbyChat.switch()
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
                showHelp()
            break

            case 'lcm':
            case 'LobbyChatMessage':{
                const event = {type:"LobbyChatMessage",data:args.shift()}
                socket.send(JSON.stringify(event))
                break
            }

            case 'cr':
            case 'CreateRoom':{
                const event = {type:"UserCreatRoom",data:create_room_data}
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
            default:
                this.messageList.push("未知指令，请重试。输入help查看指令帮助。")
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
        lobbyConsole.inputHandler(`LobbyChatMessage ${this.inputString}`)
        this.inputString = ''
    },
    addMessage(senderName, message){
        this.messageList.push({senderName, message})
    },
}

let create_room_data = {
    name: "未命名",
    status: "open",
    selected_game_name:"测试游戏",
}

document.addEventListener("alpine:init", () => {
    lobbyConsole = Alpine.reactive(lobbyConsole)
    lobbyChat    = Alpine.reactive(lobbyChat) 
})

login()
init_socket()

function login(){
    socket = new WebSocket(`ws://${window.location.host}/session`)
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
            case "RoomListUpdate":
            case "GamePackagesUpdate":
                console.log(event.data)
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