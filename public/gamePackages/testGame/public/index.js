let playerList=null

$(document).ready(()=>{
  $('#msg').submit(event => {
        event.preventDefault()
        let message = {message:`${$('#msg input').val()}`}
        $.post(`game`,JSON.stringify(message))
        $('#msg input').val("")
    })
})

function init(){
    getLobbyInitInfo()
    SSEconnection.addEventListener('chatMessage',(event)=>{
        let data = JSON.parse(event.data)
        let html=$('#gameMessageList table').html()+`
        <tr>
            <td>${data.senderName}:</td>
            <td>${data.message}</td>
        </tr>`
        $('#messageList table').html(html)
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
