let SSEconnection = null

$(document).ready(()=>{
    let roomList = null
    //$.get('lobby',(data)=>{
            //    roomList = JSON.parse(data)
            //})


    $("#loginForm button").click(event=>{
        switch($(event.currentTarget).text())
        {
            case "游客登录":
                login("","")
            break
            
            default:
            break;
        }
    })
    $('#msg input').focusin(()=>{
        $('#messageForm').css('background-color','rgba(7,54,66,1)')
        $('#userList').css('border-color','rgba(88,110,117,1)')
        $('#userList').css('opacity','1')
        $('#messageList').css('border-color','rgba(88,110,117,1)')
    })
    $('#msg input').focusout(()=>{
        $('#messageForm').css('background-color','rgba(7,54,66,0)')
        $('#userList').css('border-color','rgba(88,110,117,0)')
        $('#userList').css('opacity','0')
        $('#messageList').css('border-color','rgba(88,110,117,0)')
    })
    $('#msg').submit(event => {
        event.preventDefault()
        let message = {message:`${$('#msg input').val()}`}
        $.post('lobby/message',JSON.stringify(message))
        $('#msg input').val("")
    })
})



function login(userName,password){
    let user={userName:`${userName}`,password:`${password}`}
    $.post('session',JSON.stringify(user),(data,textStatus)=>{
        if(textStatus === 'success'){
            $("#loginForm").hide()
            $("#lobbyForm").css('display','flex')
            $("#chatForm").show()
            $('#msg input').show()
            SSEconnection = new EventSource('session')
            SSEconnection.addEventListener('chatMessage',(event)=>{
                let data = JSON.parse(event.data)
                let html=$('#messageList table').html()+`<tr><td>${data.senderName}:</td><td>${data.message}</td></tr>`
                $('#messageList table').html(html)
            })
        }
        else{
            alert("登录失败")
        }
    })
}
