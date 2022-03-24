$(document).ready(()=>{
    $('#gameMsg').submit(event => {
        event.preventDefault()//阻止默认行为
        inputHandler($('#gameMsg input').val())
        $('#gameMsg input').val("")
    })
    top.window.SSEconnection.addEventListener('gameChatMessage',(event)=>{
        let data = JSON.parse(event.data)
        updateMessageList(data.senderName,data.message)
    })
    top.window.SSEconnection.addEventListener('gameInit',(event)=>{
        let data = JSON.parse(event.data)
        playersNames = data.playersNames
        updatePlayerList(playersNames)
    })
    $.post('/game/IAmReady')
    welcome()
})

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

function updatePlayerList(playersList){
    $('#playerList table').html('')
    $.each(playersList,(index,playerName)=>{
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
            case 'end':
                let order = {order:`endGame`}
                $.post(`/game/order`,JSON.stringify(order))
            break
            
            case 'help':
                showHelp()
            break

            default:
                let message = {message:`${inputStr}`}
                $.post(`/game/message`,JSON.stringify(message))
            break
        }
    }
    else{
        let message = {message:`${inputStr}`}
        $.post(`/game/message`,JSON.stringify(message))
    }
}

function showHelp(){
    updateMessageList('指令帮助',
    `<br/>
    .end:结束游戏（对任何人都有效）<br/>
    .help:显示本帮助`)
}