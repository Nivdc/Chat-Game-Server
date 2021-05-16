var SSEconnection = null//提升至全局变量，让游戏脚本可以添加自己的事件处理函数
let currentChannel = '大厅'
let currentRoomID=null
let roomsInfo = null
let gamesInfo = null

$(document).ready(()=>{
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
        $('#messageForm').css('background-color','rgba(7,54,66,1)')//fixme:这里的css优先级更高，把hover效果覆盖掉了
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
        $('#msg select').change(function(){
        currentChannel=$(this).val()
    })
    $('#msg').submit(event => { 
        event.preventDefault()
        let message = {message:`${$('#msg input').val()}`}
        switch(currentChannel){
            case '大厅':
                $.post('lobby/message',JSON.stringify(message))
            break

            case '房间':
                if(currentRoomID){
                    $.post(`room/${currentRoomID}/message`,JSON.stringify(message))
                }
            default:
            break
        }
        $('#msg input').val("")
    })
    $('#roomSettingForm').submit(event => {event.preventDefault()})//这两个表单的功能在下面用ajax实现了，此处阻止默认事件
    $('#createRoomForm').submit(event => {event.preventDefault()})
})

function login(userName,password){
    let user={userName:`${userName}`,password:`${password}`}
    $.post('session',JSON.stringify(user),(data,textStatus)=>{
        if(textStatus === 'success'){
            $("#loginForm").hide()
            $("#lobbyForm").css('display','flex')
            $("#chatForm").show()
            $('#msg input').show()
            if(SSEconnection = new EventSource('session')){
                SSEconnection.onopen = init
            }
        }
        else{
            alert("登录失败")
        }
   })
}

function init(){
    addButtomClick()
    addEventListener()
}

function addButtomClick(){
    $("#roomListForm button").click(event=>{
        switch($(event.currentTarget).text())
        {
            case "加入房间":
                let roomID=parseInt($('#roomList .choose').children(':last-child').text())
                $.each(roomsInfo,(index,room)=>{
                    if(room.id === roomID){
                        if(room.userNames.length < room.gameInfo.maxPlayers || !room.gameInfo.maxPlayers){
                            currentRoomID=room.id
                            $.get(`room/${room.id}`,(data,status)=>{
                                if(status === 'success'){
                                    changeRoomSetting(room.name,room.gameInfo.gameID,room.gameModeNum)
                                    $('#roomSettingForm :input').prop("disabled",true)
                                    $('#roomSettingForm button').hide()
                                    $('#roomUserListForm button:eq(0)').hide()
                                    $("#lobbyForm").hide()
                                    $("#roomForm").css('display','flex')
                                }
                                else{
                                    currentRoomID = null
                                }
                            })
                        }
                    }
                })
            break
            
            case "创建房间":
                $('#createRoomForm').show()
            break

            default:
            break
        }
    })
    $("#createRoomForm button").click(event=>{
        switch($(event.currentTarget).text())
        {
            case "创建":
                let roomData={
                    name:$('#createRoomForm .inputName input').val(),
                    status:'open',
                    gameID:parseInt($('#createRoomForm .chooseGame select').val()),
                    gameModeNum:parseInt($('#createRoomForm .chooseGameMode select').val()),
                    customOption:null,
                }
                $.post('room',JSON.stringify(roomData),(data,textStatus)=>{
                    if(textStatus === 'success'){
                        let room=data
                        changeRoomSetting(room.name,room.gameInfo.gameID,room.gameModeNum)
                        $('#createRoomForm').hide()
                        $("#lobbyForm").hide()
                        $("#roomForm").css('display','flex')
                        updateRoomUserList(room.userNames,room.hostName)
                        currentRoomID=room.id
                        roomsInfo.push(room)
                        updateRoomsInfo()
                    }
                })
            break
            
            case "取消":
                $('#createRoomForm').hide()
            break

            default:
            break
        }
    })
    $("#roomForm button").click(event=>{
        switch($(event.currentTarget).text()){
            case "开始游戏":
                $.post(`room/${currentRoomID}/game`)
            break

            case "退出房间":
                $.each(roomsInfo,(index,room)=>{
                    if(room.id === currentRoomID){
                        $.get(`room/${room.id}/quit`,(data,status)=>{
                            //xxx:在url中使用动词不符合restful风格，不过使用get会比较方便，暂时就先这样吧。
                            if(status === 'success'){
                                $('#roomSettingForm :input').prop("disabled",false)
                                $('#roomSettingForm button').show()
                                $('#roomUserListForm button:eq(0)').show()
                                $("#roomForm").hide()
                                $('#roomUserList table').html('')
                                $("#lobbyForm").css('display','flex')
                                currentRoomID=null
                             }
                        })
                    }
                })
            break

            case "修改":
                let roomData={
                    name:$('#roomSettingData input').val(),
                    status:'open',
                    gameID:parseInt($('#roomSettingData .chooseGame select').val()),
                    gameModeNum:parseInt($('#roomSettingData .chooseGameMode select').val()),
                    customOption:null,
                }
                $.post(`room/${currentRoomID}`,JSON.stringify(roomData),(data,textStatus)=>{
                })
            break
            
            default:
            break
        }
    })
}

function changeRoomSetting(roomName,gameID,gameModeNum){
    $('#roomSettingData input').val(roomName)
    $('#roomSettingData .chooseGame select').val(gameID)
    $('#roomSettingData .chooseGame select').change()
    $('#roomSettingData .chooseGameMode select').val(gameModeNum)
    $('#roomSettingData .chooseGameMode select').change()
}

function addEventListener(){
    SSEconnection.addEventListener('lobbyInit',(event)=>{
        let data = JSON.parse(event.data)
        roomsInfo = data.roomsInfo
        gamesInfo = data.gamesInfo
        updateRoomsInfo()
        $.each(gamesInfo,(index,game)=>{
            $('.roomDataForm .chooseGame select').append(
            `
            <option value="${game.id}">${game.gamePkgInfo.name}</option>
            `)
        })
        $('.roomDataForm .chooseGame select').change(function(){
            $.each(gamesInfo,(index,game)=>{
                if(game.id === parseInt($(this).val())){
                    $(this).parent().siblings('.chooseGameMode').children('select').html('')
                    $.each(game.config.options,(index,mode)=>{
                        $(this).parent().siblings('.chooseGameMode').children('select').append(
                        `
                        <option value="${index}">${mode.modeName}</option>
                        `)
                    })
                    if(game.config.customizable){
                        //$('.roomDataForm #chooseGameMode select').append(`<option value="null">自定义</option>`)
                    }
                }
            })
        })
        $('.roomDataForm .chooseGame select').change()
        $('.roomDataForm .chooseGameMode select').change(function(){
            $.each(gamesInfo,(index,game)=>{
                if(game.id === parseInt($(this).parent().siblings('.chooseGame').children('select').val())){
                    $(this).parent().siblings('.setting').html('')
                    $(this).parent().siblings('.setting').html(`<p>设定:</p>${JSON.stringify(game.config.options[parseInt($(this).val())])}`)
                    //xxx:懒得搞了，选择json做配置文件的话选项的翻译好像非常难搞，这方面还需要斟酌一下，以后有时间在弄吧
                }
            })
        })
        $('.roomDataForm .chooseGameMode select').change()
    })
    SSEconnection.addEventListener('lobbyChatMessage',(event)=>{
        let data = JSON.parse(event.data)
        updateMessageList('大厅',data.senderName,data.message)
    })
    SSEconnection.addEventListener('roomChatMessage',(event)=>{
        let data = JSON.parse(event.data)
        updateMessageList('房间',data.senderName,data.message)
    })
    SSEconnection.addEventListener('createRoom',(event)=>{//Server will NOT send this event to host
        let room = JSON.parse(event.data)
        roomsInfo.push(room)
        updateRoomsInfo()
    })
    SSEconnection.addEventListener('RoomInfoUpd',(event)=>{
        let room = JSON.parse(event.data)
        if(room.status === 'open'){
            $.each(roomsInfo,(index,roomInfo)=>{
                if(roomInfo.id === room.id){
                    roomInfo = room
                }
            })
            if(currentRoomID == room.id){
                changeRoomSetting(room.name,room.gameInfo.gameID,room.gameModeNum)
                updateRoomUserList(room.userNames,room.hostName)
            }
        }
        else if(room.status === 'close'){
            roomsInfo.forEach((roomInfo,index,list)=>{
                if(roomInfo.id === room.id){
                    list.splice(index,1)
                }
            })
        }
        updateRoomsInfo()
    })
    SSEconnection.addEventListener('lobbyUserListUpd',(event)=>{
        let data = JSON.parse(event.data)
        updateLobbyUserList(data)
    })
    SSEconnection.addEventListener('gameStart',(event)=>{
        $('#roomForm').hide()
        $('#chatForm').hide()
        $('body').append(`<iframe id="game" height="100%" width="100%" src='room/${currentRoomID}/game/'></iframe>`)
    })
    SSEconnection.addEventListener('gameOver',(event)=>{
        $('#roomForm').show()
        $('#chatForm').show()
        $('iframe').remove()//remove会去掉所有子页面加入的监听事件，工作得相当不错~
    })
}

function updateMessageList(channelName,senderName,message){
    $('#messageList table').append(
        `
        <tr>
            <td>[${channelName}]</td>
            <td>${senderName}:</td>
            <td>${message}</td>
        </tr>
        `
    )
}

function updateRoomsInfo(){
    $('#roomList table').html(`
    <tr>
        <th>房间名</th>
        <th>游戏</th>
        <th>模式</th>
        <th><i class="fa fa-users" aria-hidden="true"></i></th>
        <th>房主</th>
        <th>ID</th>
    </tr>
    `)
    $.each(roomsInfo,(index,room)=>{
        if(room.status === 'open'){
            $('#roomList table').append(
            `
            <tr>
                <td>${room.name}</td>
                <td>${room.gameInfo.gameName}</td>
                <td>${room.gameInfo.gameModeName}</td>
                <td>${room.userNames.length}/${(room.gameInfo.maxPlayers)?room.gameInfo.maxPlayers:'N'}</td>
                <td>${room.hostName}</td>
                <td>${room.id}</td>
            </tr>
            `
            )
        }
    })
    $('#roomList table tr td').hover(function(){
        if($(this).parent().hasClass('choose')===false){
            $(this).parent().siblings().removeClass('hover')
            $(this).parent().addClass('hover')
        }
    },function(){
        if($(this).parent().hasClass('choose')===false){
            $(this).parent().removeClass('hover')
        }
    })
    $('#roomList table tr td').click(function(){
        $(this).parent().siblings().removeClass('choose')
        $(this).parent().addClass('choose')
        let roomID=parseInt($(this).parent().children(':last-child').text())
        $.each(roomsInfo,(index,room)=>{
            if(room.id === roomID){
                let html=null
                $.each(room.userNames,(index,name)=>{
                    html+=`<tr><td>${name}</td></tr>`
                })
                $('#roomUserInfo table').html(html)
                let gameID = room.gameInfo.gameID
                $.each(gamesInfo,(index,game)=>{
                    if(game.id === gameID){
                        html=`<p>游戏名称:${game.gamePkgInfo.name}</p>`
                        if(game.gamePkgInfo.description){
                            html+=`<p>游戏简介:${game.gamePkgInfo.description}</p>`
                        }
                        else{
                            html+=`<p>游戏简介:作者太懒了，什么都没有写。</p>`
                        }
                        $('#gameInfo').html(html)
                    }
                })
            }
        })
    })
}

function updateLobbyUserList(userList){
    $('#userList table').html('')
    $.each(userList,(index,userName)=>{
        $('#userList table').append(
        `
        <tr>
            <td>${userName}</td>
        </tr>
        `
        )
    })

}

function updateRoomUserList(userNames,hostName){
    $('#roomUserList table').html(`
        <tr>
            <th>玩家</th>
        </tr>
    `)
    $.each(userNames,(index,name)=>{
        if(name !== hostName){
            $('#roomUserList table').append(`<tr><td>${name}</td></tr>`)
        }
        else{
            $('#roomUserList table').append(`<tr class="choose"><td>${name}</td></tr>`)
        }
    })
}
