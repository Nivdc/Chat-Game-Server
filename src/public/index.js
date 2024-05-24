var socket = undefined
var game_onmessage = undefined

let UI_Controller = {
    switchConsoleForm:function () {
        lobbyConsole.showUp = !lobbyConsole.showUp
        if(lobbyConsole.showUp === true)
            lobbyConsole.$nextTick(() => { document.querySelector('#consoleInput input').focus() })
    },
    switchLobbyChatForm:function () {
    }
}

let lobbyConsole = {
    showUp:true,
    messageList:[],
    inputString:'',

    close(){this.showUp = false},
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

            case 'cr':
            case 'CreateRoom' :{
                const event = {type:"UserCreatRoom",data:create_room_data}
                socket.send(JSON.stringify(event))
                break
            }
            case 'jr':
            case 'JoinRoom'   :{
                const tagete_room_id = inputStr.match(/^\/(\w+)\s+(\d+)*$/)[2]
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

let create_room_data = {
    name: "未命名",
    status: "open",
    selected_game_name:"测试游戏",
}

let lobbyChatMessageList = []

document.addEventListener("alpine:init", () => {
    lobbyChatMessageList = Alpine.reactive(lobbyChatMessageList)
    lobbyConsole = Alpine.reactive(lobbyConsole)
})

login()
init()
welcome()

function msg_submit(){
    let input = document.querySelector('#msg input')
    inputHandler(input.value)
    input.value = ""
}

function welcome(){
    sendSystemMsg('公告',`<br/>
    欢迎使用，当前仍是早期技术测试版。服务器随时可能当场死亡。<br/>
    您可能会遇到页面失去响应、连接中断、游戏结果错误、电脑爆炸等情况。<br/>
    事先声明本平台不对您的遭遇负任何责任。<a href="https://github.com/Nivdc/lobby" target="_blank">点此访问项目主页</a>。<br/>
    初次访问可输入/help查看指令帮助。<br/>`)
}

function sendSystemMsg(msgType,msg){
    updateMessageList('系统消息',msgType,msg)
}

function updateMessageList(channelName,senderName,message){
    lobbyChatMessageList.push({channelName, senderName,message})
}

function inputHandler(inputStr){
    if(/^\/(\w+).*$/.test(inputStr)){
        switch(inputStr.match(/^\/(\w+).*$/)[1]){
            case 'help':
                showHelp()
            break

            case 'cr':
            case 'CreateRoom' :{
                const event = {type:"UserCreatRoom",data:create_room_data}
                socket.send(JSON.stringify(event))
                break
            }
            case 'jr':
            case 'JoinRoom'   :{
                const tagete_room_id = inputStr.match(/^\/(\w+)\s+(\d+)*$/)[2]
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
                sendSystemMsg("系统提示","未知指令，请重试。")
            break
        }
    }
    else{
        if(socket !== null){
            const message = {type:"LobbyChatMessage",data:inputStr}
            socket.send(JSON.stringify(message))
        }
    }
}

function login(){
    socket = new WebSocket(`ws://${window.location.host}/session`)
}

function init(){
    // socket.onopen = () => {
    //     inputHandler("/cr")
    // }
    socket.onmessage = (e) => {
        const event = JSON.parse(e.data)
        switch(event.type){
            case "LobbyChatMessage":
                updateMessageList("大厅", event.data.sender_name, event.data.message)
            break

            case "RoomChatMessage":
                updateMessageList("房间", event.data.sender_name, event.data.message)
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

// function showHelp(){
//     sendSystemMsg('指令帮助',
//     `<br/>
//     /help : 显示本帮助。<br/>`)
// }