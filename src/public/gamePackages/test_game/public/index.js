let socket = undefined

$(document).ready(()=>{
    $('#gameMsg').submit(event => {
        event.preventDefault()//阻止默认行为
        inputHandler($('#gameMsg input').val())
        $('#gameMsg input').val("")
    })
    socket = window.top.socket
    window.top.game_onmessage = game_onmessage
    send_event('IAmReady')
    welcome()
})

function send_event(type, data){
    const event = {type, data}
    socket.send(JSON.stringify(event))
}

function game_onmessage(e){
    const event = JSON.parse(e.data)
    switch(event.type){
        case "GameInit":
            updatePlayerList(event.data.playersNames)
        break

        case "GameChatMessage":
            updateMessageList(event.data.sender_name, event.data.message)
        break
    }
}

function welcome(){
    updateMessageList('系统','欢迎体验测试游戏，目前只有聊天室功能，输入".end"结束，输入".help"查看指令帮助')
}

function updateMessageList(senderName,message){
    $("#gameMessageList table").append(
    `
    <tr>
        <td>${senderName}:</td>
        <td>${message}</td>
    </tr>
    `)
}

function updatePlayerList(playersNames){
    $('#playerList table').html('')
    console.log(playersNames)
    playersNames.forEach(playerName => {
        $('#playerList table').append(
            `
            <tr>
                <td>${playerName}</td>
            </tr>
            `
        )
    })
}

function inputHandler(inputStr){
    if(/^\.([a-z0-9]*)$/i.test(inputStr)){
        switch(inputStr.match(/^\.([a-z0-9]*)$/i)[1]){
            case 'end':{
                let event = {type:`EndGame`}
                socket.send(JSON.stringify(event))
                break
            }
            case 'help':{
                showHelp()
                break
            }
            default:{
                let event = {type:`GameChatMessage`, data:`${inputStr}`}
                socket.send(JSON.stringify(event))
                break
            }
        }
    }
    else{
        let event = {type:`GameChatMessage`, data:`${inputStr}`}
        socket.send(JSON.stringify(event))
    }
}

function showHelp(){
    updateMessageList('指令帮助',
    `<br/>
    .end:结束游戏（对任何人都有效）<br/>
    .help:显示本帮助`)
}