$(document).ready(()=>{
  $('#gameMsg').submit(event => {
        event.preventDefault()//阻止默认行为
        let message = {message:`${$('#gameMsg input').val()}`}
        $.post(`game`,JSON.stringify(message))
        $('#gameMsg input').val("")
    })
    init()
})

function init(){
    SSEconnection.addEventListener('gameChatMessage',(event)=>{
        let data = JSON.parse(event.data)
        let html=$('#gameMessageList table').html()+`
        <tr>
            <td>${data.senderName}:</td>
            <td>${data.message}</td>
        </tr>`
        $('#gameMessageList table').html(html)
    })
}

function updateChatInfo(chatInfo){
    $('#playerList table').html('')
    $.each(chatInfo,(index,userName)=>{
        $('#playerList table').append(
        `
        <tr>
            <td>${userName}</td>
        </tr>
        `
        )
    })

}
