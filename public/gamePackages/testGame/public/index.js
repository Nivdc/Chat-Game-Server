$(document).ready(()=>{
  $('#gameMsg').submit(event => {
        event.preventDefault()//阻止默认行为
        let message = {message:`${$('#gameMsg input').val()}`}
        $.post(`/game`,JSON.stringify(message))
        $('#gameMsg input').val("")
    })
    top.window.SSEconnection.addEventListener('gameChatMessage',updateMessageList.bind(event))
})

function updateMessageList(event){
    let data = JSON.parse(event.data)
    $("#gameMessageList table").append(
    `
    <tr>
        <td>${data.senderName}:</td>
        <td>${data.message}</td>
    </tr>
    `)
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
