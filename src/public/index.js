let socket = null
let create_room_data = {
    name: "未命名",
    status: "open",
}

$(document).ready(()=>{
    $('#msg').submit(event => {
        event.preventDefault()//阻止默认行为
        inputHandler($('#msg input').val())
        $('#msg input').val("")
    })
    login("","")
    welcome()
    init()
})

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
    $('#messageList table').append(
        `
        <tr>
            <td>[${channelName}]</td>
            <td>${senderName} :</td>
            <td>${message}</td>
        </tr>
        `
    )
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

            default:
                // let message = {message:`${inputStr}`}
                // $.post(`/game/message`,JSON.stringify(message))
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

function login(userName,password){
    socket = new WebSocket(`ws://${window.location.host}/session`)
//     const user={name:userName,password:password}
//     $.post('login',JSON.stringify(user),(data,textStatus)=>{
//         if(textStatus === 'success'){
//             socket = new WebSocket(`ws://${window.location.host}/session`)
//             if(socket !== null){
//                 socket.onopen = init
                
//                 sendSystemMsg("提示","登陆成功。")
//             }
//             else{
//                 alert("登录失败")
//             }
//         }
//         else{
//             alert("登录失败")
//         }
//    })
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
        }
    }
}

function showHelp(){
    sendSystemMsg('指令帮助',
    `<br/>
    /help : 显示本帮助。<br/>`)
}




// let currentChannel = '大厅'
// let currentRoom = null
// let roomsInfo = null
// let gamesInfo = null
// let myID = null

// $(document).ready(()=>{
//     login("","")//fixme:实现账户系统后应将此处移除。既然现在实际上没有账户系统，好像没必要每次访问都多点一次"游客登陆"。
//     $("#loginForm button").click(event=>{
//         switch($(event.currentTarget).text())
//         {
//             case "游客登录":
//                 login("","")
//             break
            
//             default:
//             break;
//         }
//     })
//     $('#msg input').focusin(()=>{//实现聊天框的悬停显示效果
//         $('#messageForm').css('background-color','rgba(7,54,66,1)')//fixme:这里的css优先级更高，把hover效果覆盖掉了
//         $('#userList').css('border-color','rgba(88,110,117,1)')
//         $('#userList').css('opacity','1')
//         $('#messageList').css('border-color','rgba(88,110,117,1)')
//     })
//     $('#msg input').focusout(()=>{
//         $('#messageForm').css('background-color','rgba(7,54,66,0)')
//         $('#userList').css('border-color','rgba(88,110,117,0)')
//         $('#userList').css('opacity','0')
//         $('#messageList').css('border-color','rgba(88,110,117,0)')
//     })
//     $('#msg select').change(function(){//切换频道
//         currentChannel=$(this).val()
//     })
//     $('#msg').submit(event => {
//         event.preventDefault()//阻止默认事件
//         inputHandler($('#msg input').val())
//         $('#msg input').val("")
//     })
//     $('#roomSettingForm').submit(event => {event.preventDefault()})//这两个表单的功能在下面用ajax实现了，此处阻止默认事件
//     $('#createRoomForm').submit(event => {event.preventDefault()})//......这么写有用吗？我还真不知道
// })

// function login(userName,password){
//     let user={name:`${userName}`,password:`${password}`}
//     $.post('login',JSON.stringify(user),(data,textStatus)=>{
//         if(textStatus === 'success'){
//             $("#loginForm").hide()
//             $("#lobbyForm").css('display','flex')
//             $("#chatForm").show()
//             $('#msg input').show()
//             SSEconnection = new WebSocket(`ws://${window.location.host}/session`)
//             if(SSEconnection !== null){
//                 SSEconnection.onopen = init
//             }
//         }
//         else{
//             alert("登录失败")
//         }
//    })
// }


// function addButtomClick(){
//     $("#roomListForm button").click(event=>{
//         switch($(event.currentTarget).text())
//         {
//             case "加入房间":
//                 let roomID=parseInt($('#roomList .choose').children(':last-child').text())
//                 joinRoom(roomID)
//             break
            
//             case "创建房间":
//                 $('#createRoomForm').show()
//             break

//             default:
//             break
//         }
//     })
//     $("#createRoomForm button").click(event=>{
//         switch($(event.currentTarget).text())
//         {
//             case "创建":
//                 let roomData={
//                     name:$('#createRoomForm .inputName input').val(),
//                     status:'open',
//                     gameID:parseInt($('#createRoomForm .chooseGame select').val()),
//                     gameModeNum:parseInt($('#createRoomForm .chooseGameMode select').val()),
//                     customOption:null,
//                 }
//                 $.post('room',JSON.stringify(roomData),(data,textStatus)=>{
//                     if(textStatus === 'success'){
//                         let room=data
//                         changeRoomSetting(room.name,room.gameInfo.gameID,room.gameModeNum)
//                         $('#createRoomForm').hide()
//                         $("#lobbyForm").hide()
//                         $("#roomForm").css('display','flex')
//                         updateRoomUserList(room.usersInfos,room.hostInfo)
//                         roomsInfo.push(room)//xxx:记住‘创建房间事件’不会发送给房主...这会不会是个不好的设计？
//                         currentRoom=roomsInfo[roomsInfo.length-1]
//                         updateRoomsInfo()
//                         enableHostForm()
//                         sendSystemMsg('提示','您现在是房主了，使用.help查看指令帮助。')
//                     }
//                 })
//             break
            
//             case "取消":
//                 $('#createRoomForm').hide()
//             break

//             default:
//             break
//         }
//     })
//     $("#roomForm button").click(event=>{
//         switch($(event.currentTarget).text()){
//             case "开始游戏":
//                 if(currentRoom){
//                     if(currentRoom.usersInfos.length <= currentRoom.gameInfo.maxPlayers || !currentRoom.gameInfo.maxPlayers){
//                         $.post(`room/${currentRoom.id}/game`)
//                     }
//                     else{
//                         sendSystemMsg('警告',
//                         `当前房间人数为${currentRoom.usersInfos.length}，最大游戏人数为${currentRoom.gameInfo.maxPlayers}。
//                         无法开始游戏。`)
//                         // 如果要踢出玩家请输入:".kick 玩家ID"，查看指令帮助请输入".help"。`)
//                     }
//                 }
//             break

//             case "退出房间":
//                 if(currentRoom){
//                     $.get(`room/${currentRoom.id}/quit`,(data,status)=>{
//                         //xxx:在url中使用动词不符合restful风格，不过使用get会比较方便，暂时就先这样吧。
//                         if(status === 'success'){
//                                 quitRoom()
//                             }
//                     })
//                 }
//             break

//             case "修改":
//                 let roomData={
//                     name:$('#roomSettingData input').val(),
//                     status:'open',
//                     gameID:parseInt($('#roomSettingData .chooseGame select').val()),
//                     gameModeNum:parseInt($('#roomSettingData .chooseGameMode select').val()),
//                     customOption:null,
//                 }
//                 $.post(`room/${currentRoom.id}`,JSON.stringify(roomData),sendSystemMsg('提示','修改成功'))//xxx:又一处不太符合restful的设计
//             break
            
//             default:
//             break
//         }
//     })
// }

// function joinRoom(roomID){
//     $.each(roomsInfo,(index,room)=>{
//         if(room.id === roomID){
//             if(room.usersInfos.length < room.gameInfo.maxPlayers || !room.gameInfo.maxPlayers){
//                 currentRoom=room
//                 $.get(`room/${room.id}`,(data,status)=>{
//                     if(status === 'success'){
//                         changeRoomSetting(room.name,room.gameInfo.gameID,room.gameModeNum)
//                         disableHostForm()
//                         $("#lobbyForm").hide()
//                         $("#roomForm").css('display','flex')
//                     }
//                     else{
//                         currentRoom = null
//                     }
//                 })
//             }
//             else{
//                 sendSystemMsg('提示','该房间已满')
//             }
//         }
//     })
// }

// function quitRoom(){
//     $("#roomForm").hide()
//     $('#roomUserList table').html('')
//     $("#lobbyForm").css('display','flex')
//     currentRoom=null
// }

// function changeRoomSetting(roomName,gameID,gameModeNum){
//     $('#roomSettingData input').val(roomName)
//     $('#roomSettingData .chooseGame select').val(gameID)
//     $('#roomSettingData .chooseGame select').change()
//     $('#roomSettingData .chooseGameMode select').val(gameModeNum)
//     $('#roomSettingData .chooseGameMode select').change()
// }

// function addEventListener(){
//     SSEconnection.addEventListener('lobbyInit',(event)=>{
//         let data = JSON.parse(event.data)
//         myID = data.id
//         roomsInfo = data.roomsInfo
//         gamesInfo = data.gamesInfo
//         updateRoomsInfo()
//         $.each(gamesInfo,(index,game)=>{
//             $('.roomDataForm .chooseGame select').append(
//             `
//             <option value="${game.id}">${game.gamePkgInfo.name}</option>
//             `)
//         })
//         $('.roomDataForm .chooseGame select').change(function(){
//             $.each(gamesInfo,(index,game)=>{
//                 if(game.id === parseInt($(this).val())){
//                     $(this).parent().siblings('.chooseGameMode').children('select').html('')
//                     $.each(game.config.options,(index,mode)=>{
//                         $(this).parent().siblings('.chooseGameMode').children('select').append(
//                         `
//                         <option value="${index}">${mode.modeName}</option>
//                         `)
//                     })
//                     if(game.config.customizable){
//                         //$('.roomDataForm #chooseGameMode select').append(`<option value="null">自定义</option>`)
//                     }
//                 }
//             })
//         })
//         $('.roomDataForm .chooseGame select').change()
//         $('.roomDataForm .chooseGameMode select').change(function(){
//             $.each(gamesInfo,(index,game)=>{
//                 if(game.id === parseInt($(this).parent().siblings('.chooseGame').children('select').val())){
//                     $(this).parent().siblings('.gameDescription').html('')//todo
//                     if(game.gamePkgInfo.description){
//                         $(this).parent().siblings('.gameDescription').html(`<p>游戏简介:</p>${game.gamePkgInfo.description}`)
//                     }
//                     else{
//                         html+=`<p>游戏简介:作者太懒了，什么都没有写。</p>`
//                         $(this).parent().siblings('.gameDescription').html(`<p>游戏简介:</p>作者太懒了，什么都没有写。`)
//                     }

//                     $(this).parent().siblings('.setting').html('')
//                     $(this).parent().siblings('.setting').html(`<p>设定:</p>${JSON.stringify(game.config.options[parseInt($(this).val())])}`)
//                     //xxx:懒得搞了，选择json做配置文件的话选项的翻译好像非常难搞，这方面还需要斟酌一下，以后有时间在弄吧
//                 }
//             })
//         })
//         $('.roomDataForm .chooseGameMode select').change()
//     })
//     SSEconnection.addEventListener('lobbyChatMessage',(event)=>{
//         let data = JSON.parse(event.data)
//         updateMessageList('大厅',data.senderName,data.message)
//     })
//     SSEconnection.addEventListener('roomChatMessage',(event)=>{
//         let data = JSON.parse(event.data)
//         updateMessageList('房间',data.senderName,data.message)
//     })
//     SSEconnection.addEventListener('createRoom',(event)=>{//Server will NOT send this event to host
//         let room = JSON.parse(event.data)
//         roomsInfo.push(room)
//         updateRoomsInfo()
//     })
//     SSEconnection.addEventListener('roomInfoUpd',(event)=>{
//         let newRoomInfo = JSON.parse(event.data)
//         $.each(roomsInfo,(index,roomInfo)=>{
//             if(roomInfo.id === newRoomInfo.id){
//                 roomsInfo[index] = newRoomInfo
//                 updateRoomsInfo()
//                 if(currentRoom && currentRoom.id === newRoomInfo.id){
//                     currentRoom=newRoomInfo
//                 }
//             }
//         })
//         if(currentRoom && currentRoom.id === newRoomInfo.id){
//             changeRoomSetting(newRoomInfo.name,newRoomInfo.gameInfo.gameID,newRoomInfo.gameModeNum)
//             updateRoomUserList(newRoomInfo.usersInfos,newRoomInfo.hostInfo)

//             if(currentRoom.hostInfo.id !== myID){
//                 if(myID === newRoomInfo.hostInfo.id){
//                     enableHostForm()
//                     sendSystemMsg('提示','您现在是房主了，使用.help查看指令帮助。')
//                 }
//             }
//         }
//         else if(newRoomInfo.status === 'close'){
//             roomsInfo.forEach((roomInfo,index,list)=>{
//                 if(roomInfo.id === newRoomInfo.id){
//                     list.splice(index,1)
//                 }
//             })
//         }
//     })
//     SSEconnection.addEventListener('lobbyUserListUpd',(event)=>{
//         let data = JSON.parse(event.data)
//         updateLobbyUserList(data)
//     })
//     SSEconnection.addEventListener('gameStart',(event)=>{
//         $('#roomForm').hide()
//         $('#chatForm').hide()
//         $('body').append(`<iframe id="game" height="100%" width="100%" src='room/${currentRoom.id}/game/'></iframe>`)
//     })
//     SSEconnection.addEventListener('gameOver',(event)=>{
//         $('#roomForm').show()
//         $('#chatForm').show()
//         $('iframe').remove()//remove会自动去掉所有子页面加入的监听事件，工作得相当不错~
//     })
//     SSEconnection.addEventListener('kickOut',(event)=>{
//         quitRoom()
//         sendSystemMsg('提示','您已被踢出房间。')
//     })
// }

// function enableHostForm(){
//     $('#roomSettingForm :input').prop("disabled",false)
//     $('#roomSettingForm button').show()
//     $('#roomUserListForm button:eq(0)').show()
// }

// function disableHostForm(){
//     $('#roomSettingForm :input').prop("disabled",true)
//     $('#roomSettingForm button').hide()
//     $('#roomUserListForm button:eq(0)').hide()
// }

// function welcome(){
//     sendSystemMsg('欢迎',`<br/>
//     欢迎使用，当前仍是早期技术测试版。请不要使用同一浏览器多次访问！服务器可能会当场死亡。<br/>
//     您可能会遇到包括但不限于以下情况：页面失去响应、连接中断、无法点击到按钮、游戏结果错误、电脑爆炸。
//     事先声明本平台不对您的遭遇负任何责任。该平台使用的所有代码已在GitHub上开源，使用BSD3 Licences，<a href="https://github.com/Nivdc/Chat-Game-Server">访问项目主页</a>。<br/>
//     已知主页面在非chrome浏览器下显示不正常。<br/>`)
// }

// function updateMessageList(channelName,senderName,message){
//     $('#messageList table').append(
//         `
//         <tr>
//             <td>[${channelName}]</td>
//             <td>${senderName}:</td>
//             <td>${message}</td>
//         </tr>
//         `
//     )
// }

// function sendSystemMsg(msgType,msg){
//     updateMessageList('系统消息',msgType,msg)
// }

// function updateRoomsInfo(){
//     $('#roomList table').html(`
//     <tr>
//         <th>房间名</th>
//         <th>游戏</th>
//         <th>模式</th>
//         <th><i class="fa fa-users" aria-hidden="true"></i></th>
//         <th>房主</th>
//         <th>ID</th>
//     </tr>
//     `)
//     $.each(roomsInfo,(index,room)=>{
//         if(room.status === 'open'){
//             $('#roomList table').append(
//             `
//             <tr>
//                 <td>${room.name}</td>
//                 <td>${room.gameInfo.gameName}</td>
//                 <td>${room.gameInfo.gameModeName}</td>
//                 <td>${room.usersInfos.length}/${(room.gameInfo.maxPlayers)?room.gameInfo.maxPlayers:'N'}</td>
//                 <td>${room.hostInfo.name}</td>
//                 <td>${room.id}</td>
//             </tr>
//             `
//             )
//         }
//     })
//     $('#roomList table tr td').hover(function(){
//         if($(this).parent().hasClass('choose')===false){
//             $(this).parent().siblings().removeClass('hover')
//             $(this).parent().addClass('hover')
//         }
//     },function(){
//         if($(this).parent().hasClass('choose')===false){
//             $(this).parent().removeClass('hover')
//         }
//     })
//     $('#roomList table tr td').click(function(){
//         $(this).parent().siblings().removeClass('choose')
//         $(this).parent().addClass('choose')
//         let roomID=parseInt($(this).parent().children(':last-child').text())
//         $.each(roomsInfo,(index,room)=>{
//             if(room.id === roomID){
//                 let html=null
//                 $.each(room.usersInfos,(index,usersInfo)=>{
//                     html+=`<tr><td>${usersInfo.name}</td></tr>`
//                 })
//                 $('#roomUserInfo table').html(html)
//                 let gameID = room.gameInfo.gameID
//                 $.each(gamesInfo,(index,game)=>{
//                     if(game.id === gameID){
//                         html=`<p>游戏名称:${game.gamePkgInfo.name}</p>`
//                         if(game.gamePkgInfo.description){
//                             html+=`<p>游戏简介:${game.gamePkgInfo.description}</p>`
//                         }
//                         else{
//                             html+=`<p>游戏简介:作者太懒了，什么都没有写。</p>`
//                         }
//                         $('#gameInfo').html(html)
//                     }
//                 })
//             }
//         })
//     })
// }

// function updateLobbyUserList(userList){
//     $('#userList table').html('')
//     $.each(userList,(index,userName)=>{
//         $('#userList table').append(
//         `
//         <tr>
//             <td>${userName}</td>
//         </tr>
//         `
//         )
//     })
// }

// function updateRoomUserList(usersInfos,hostInfo){
//     $('#roomUserList table').html(`
//         <tr>
//             <th>玩家</th>
//             <th>ID</th>
//         </tr>
//     `)
//     $.each(usersInfos,(index,usersInfo)=>{
//         if(usersInfo.name !== hostInfo.name){
//             $('#roomUserList table').append(`<tr><td>${usersInfo.name}</td><td>${usersInfo.id}</td></tr>`)
//         }
//         else{
//             $('#roomUserList table').append(`<tr class="choose"><td>${usersInfo.name}</td><td>${usersInfo.id}</td></tr>`)
//         }
//     })
// }

// function inputHandler(inputStr){
//     if(/^\.([a-z0-9]*)$/i.test(inputStr.split(' ')[0])){
//         switch(inputStr.split(' ')[0].match(/^\.([a-z0-9]*)$/i)[1]){
//             case 'kick':
//                 try{
//                     kickUser(inputStr.split(' ')[1])
//                 }catch(error){
//                     sendSystemMsg('提示','您输入的玩家id有误')
//                 }
//             break
            
//             case 'help':
//                 showHelp()
//             break

//             default:
//                 sendChatMsg(inputStr)
//             break
//         }
//     }
//     else{
//         sendChatMsg(inputStr)
//     }
// }

// function kickUser(userID){//todo
//     if(userID !== 'all'){
//         let userData = {id:userID}
//         $.post(`room/${currentRoom.id}/kick`,JSON.stringify(userData),sendSystemMsg('提示','操作成功'))//又又又...restful...下次再遇到我就改过来:P
//     }
//     else{
//         $.each(currentRoom.usersInfos,(index,usersInfo)=>{
//             if(usersInfo.id !== myID){
//                 let userData = {id:usersInfo.id}
//                 $.post(`room/${currentRoom.id}/kick`,JSON.stringify(userData))
//             }
//         })
//     }
// }

// function showHelp(){
//     sendSystemMsg(
//     '指令帮助',
//     `<br/>
//     .kick 玩家id:踢出玩家（只对房主有效）<br/>
//     .kick all:踢出除房主外的所有玩家（只对房主有效）<br/>
//     .help:显示本帮助`)
// }        

// function sendChatMsg(msg){
//     let message = {message:`${msg}`}
//     switch(currentChannel){
//         case '大厅':
//             $.post('lobby/message',JSON.stringify(message))
//         break
    
//         case '房间':
//             if(currentRoom){
//                 $.post(`room/${currentRoom.id}/message`,JSON.stringify(message))
//             }
//         default:
//         break
//     }
// }
