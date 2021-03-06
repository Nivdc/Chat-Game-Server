const fs = require('fs')
const Chat = require('./chat')
const userList = []
const roomList = []
const lobbyChat = new Chat('大厅')
const gamesFilePath = __dirname+"/../public/gamePackages"
const EventEmitter = new require('events')
const lobbyListener = new EventEmitter()
const defaultConfig = {
    customizable:false,
    options:[
        {
            allowOtherChat:false,
            modeName:"Default",
            maxPlayers:1
        }
    ]
}
let roomCount = 1
let gameList = null

function init(){
    gameList = getGameList()
    lobbyListener.on('cleanRoom',(roomID)=>{
        deleteRoom(roomID)
    })
    lobbyListener.on('gameStart',(roomID)=>{//todo

    })
    lobbyListener.on('gameOver',(roomID)=>{//todo

    })
    lobbyListener.on('roomStatusChanged',(roomID)=>{//todo

    })
}

function getGameList(){
    let gameList = []
    let gameCount = 1
    let files = fs.readdirSync(gamesFilePath)
    files.forEach((file)=>{
        gameList.push(new Game(file,require(`${gamesFilePath}/${file}/package`),gameCount))
        gameCount++
    })

    return gameList
}

function userCreateRoom(roomData,hostCookieID){//todo
    let tempUser = null
    let tempRoom = null
    if(tempUser = userList.find(user => {return user.cookieID === hostCookieID})){
        tempRoom = new Room(roomData,tempUser,roomCount)
        roomList.push(tempRoom)
        userList.forEach(user => {
            if(user.cookieID !== hostCookieID){
                user.SSEconnection.write(`event:createRoom\ndata:${JSON.stringify(tempRoom.roomInfo())}`)
            }
        })
        roomCount++
        console.log(tempRoom.roomInfo())
        return tempRoom.roomInfo()
    }
    return false
}

function deleteRoom(roomID){//todo
    roomList.forEach((room,index,list) => {
        if(room.id === roomID){
            room.status = 'close'
            userList.forEach(user => {
                user.SSEconnection.write(`event:changeRoom\ndata:${JSON.stringify(room.roomInfo())}`)
                //xxx:只是一个人加入，咋要发送这么一大坨数据呢？但是好像很方便啊
            })
           list.splice(index,1)
        }
    })
}

function sentLobbyInitInfo(cookieID){
    if(userList.find(user => {return user.cookieID === cookieID})){
        return {
            roomsInfo:roomList.map(room => room.roomInfo()),
            gamesInfo:gameList.map(game => game.gameInfo()),
            lobbyChatInfo:lobbyChat.chatInfo(),
        }
    }
}

function sentChatMessage(message,senderCookieID){
    return lobbyChat.sentChatMessage(message,senderCookieID)
}

function sentRoomChatMessage(message,senderCookieID,roomID){
    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        return tempRoom.sentChatMessage(message,senderCookieID)
    }
    return false
}

function userJoinLobby(user){
    userList.push(user)
    lobbyChat.userJoin(user)
    user.SSEconnection.on('close',()=>{
        userList.forEach((currentUser,index,list) => {
            if(currentUser.cookieID === user.cookieID){
                list.splice(index,1)
                lobbyChat.userQuit(currentUser)
                if(user.currentRoomID){
                    roomList.forEach((currentRoom,index,list)=>{
                        if(currentRoom.id === user.currentRoomID){
                            currentRoom.userQuit(user.cookieID)
                        }
                    })
                }
            }
        })
    })
}

function userQuitLobby(user){//todo

}

function userJoinRoom(cookieID,roomID){
    let tempUser = null
    let tempRoom = null
    if(tempUser = userList.find(user => {return user.cookieID === cookieID})){
        if(tempRoom = roomList.find(room => {return room.id === roomID})){
            tempRoom.userJoin(tempUser)
            userList.forEach(user => {
                user.SSEconnection.write(`event:changeRoom\ndata:${JSON.stringify(tempRoom.roomInfo())}`)
                //xxx:只是一个人加入，咋要发送这么一大坨数据呢？但是好像很方便啊
            })
            return true
        }
    }
    return false
}

function userQuitRoom(cookieID,roomID){
    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        tempRoom.userQuit(cookieID)
        userList.forEach(user => {
            user.SSEconnection.write(`event:changeRoom\ndata:${JSON.stringify(tempRoom.roomInfo())}`)
            //xxx:只是一个人退出，咋要发送这么一大坨数据呢？但是好像很方便啊
        })
        return true
    }
    return false
}

function userSetRoom(roomData,userCookieID,roomID){
    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        tempRoom.userSetRoom(roomData,userCookieID)
        userList.forEach(user => {
            user.SSEconnection.write(`event:changeRoom\ndata:${JSON.stringify(tempRoom.roomInfo())}`)
            //xxx:只是改改设置，咋要发送这么一大坨数据呢？但是好像很方便啊
        })
        return true
    }
    return false
}

class Room{
    constructor(roomData,host,roomID){
        this.name=roomData.name
        this.status=roomData.status
        this.host=host
        this.id=roomID
        this.game = gameList.find(game => {return game.id === roomData.gameID})
        this.gameModeNum=roomData.gameModeNum
        this.customOption=roomData.customOption
        this.chat=new Chat('房间')
        this.userList=[]

        this.userJoin(host)
    }

    userJoin(user){
        this.userList.push(user)
        this.chat.userJoin(user)
        user.currentRoomID = this.id
    }

    userQuit(cookieID){
        this.userList.forEach((currentUser,index,list) =>{
            if(currentUser.cookieID === cookieID){
                list.splice(index,1)
                this.chat.userQuit(currentUser)
                currentUser.currentRoomID = null
            }
        })
        if(userList.length === 0){
            lobbyListener.emit('clean',this.id)
        }
    }
    
    userSetRoom(roomData,cookieID){
        if(host.cookieID === cookieID){
            this.name=roomData.name
            this.status=roomData.status
            this.game = gameList.find(game => {return game.id === roomData.gameID})
            this.gameModeNum=roomData.gameModeNum
            this.customOption=roomData.customOption
        }
    }

    sentChatMessage(message,senderCookieID){
        return this.chat.sentChatMessage(message,senderCookieID)
    }

    roomGameInfo(){//xxx:这里的信息多余了，只要有gameModeNum,一些信息可以在客户端读出来，但是自定义信息不能
        if(typeof(this.gameModeNum) === "number"){
            return {
                gameName:this.game.gamePkgInfo.name,
                gameID:this.game.id,
                gameModeName:this.game.config.options[this.gameModeNum].modeName,
                maxPlayers:this.game.config.options[this.gameModeNum].maxPlayers
            }
        }
        else if(this.customOption){
            return {
                gameName:this.game.gamePkgInfo.name,
                gameID:this.game.id,
                gameModeName:"自定义",
                maxPlayers:this.customOption.maxPlayers
            }
        }
    }

    roomInfo(){
        return {
            name:this.name,
            status:this.status,
            hostName:this.host.name,
            id:this.id,
            gameInfo:this.roomGameInfo(),
            gameModeNum:this.gameModeNum,
            userNames:this.userList.map(user => user.name),
            //xxx:userNames?这好像是说这个用户有多个名字啊...吃了英语不好的亏,如果这里要改，前端也要改
        }
    }
}

class Game{
    constructor(gameFileName,gamePkgInfo,gameID){
        this.gamePkgInfo = gamePkgInfo
        this.id = gameID
        this.mainPath = `${gamesFilePath}/${gameFileName}/${gamePkgInfo.main}`
        if(gamePkgInfo.config){
            this.config = require(`${gamesFilePath}/${gameFileName}/${gamePkgInfo.config}`)
        }
        else{
            this.config = defaultConfig
        }
    }

    gameInfo(){
        return {
            gamePkgInfo:this.gamePkgInfo,
            id:this.id,
            config:this.config,
        }
    }
}

init()
exports.userJoinLobby = userJoinLobby
exports.sentChatMessage = sentChatMessage
exports.sentLobbyInitInfo = sentLobbyInitInfo
exports.userCreateRoom = userCreateRoom
exports.sentRoomChatMessage = sentRoomChatMessage
exports.userJoinRoom = userJoinRoom
exports.userQuitRoom = userQuitRoom
exports.userSetRoom = userSetRoom
