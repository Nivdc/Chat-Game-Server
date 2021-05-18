const fs = require('fs')
const userList = []
const roomList = []
const gamesFilePath = __dirname+"/../public/gamePackages"
const EventEmitter = new require('events')
const lobbyListener = new EventEmitter()
let roomCount = 1//如果count计数器从0开始，判断布尔值的时候可能会被认为是false
let gameList = null

function init(){
    gameList = getGameList()
    lobbyListener.on('cleanRoom',(roomID)=>{
        deleteRoom(roomID)
    })
    lobbyListener.on('gameStart',(room)=>{
        room.status = "inGame"
        sendEventTo(userList,'roomInfoUpd',room.roomInfo())
    })
    lobbyListener.on('gameOver',(room)=>{
        room.status = "open"
        sendEventTo(userList,'roomInfoUpd',room.roomInfo())
    })
    lobbyListener.on('roomInfoUpd',(room)=>{
        sendEventTo(userList,'roomInfoUpd',room.roomInfo())
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

function sendEventTo(userList,eventName,data){
    userList.forEach(user => {
        user.sendEvent(eventName,data)
    })
}

function userCreateRoom(roomData,hostCookieID){
    let tempUser = null
    let tempRoom = null
    if(tempUser = userList.find(user => {return user.cookieID === hostCookieID})){
        tempRoom = new Room(roomData,tempUser,roomCount)
        roomList.push(tempRoom)
        userList.forEach(user => {
            if(user.cookieID !== hostCookieID){
                user.sendEvent('createRoom',tempRoom.roomInfo())
            }
        })
        roomCount++
        return tempRoom.roomInfo()
    }
    return false
}

function deleteRoom(roomID){
    roomList.forEach((room,index,list) => {
        if(room.id === roomID){
            room.status = 'close'
            sendEventTo(userList,'roomInfoUpd',room.roomInfo())
            list.splice(index,1)
        }
    })
}

function sendLobbyInitInfo(user){
    user.sendEvent("lobbyInit",{
            roomsInfo:roomList.map(room => room.roomInfo()),
            gamesInfo:gameList.map(game => game.gameInfo()),
        }
    )
}

function sendLobbyChatMessage(message,senderCookieID){
    try{
        sendEventTo(userList,'lobbyChatMessage',buildChatMessage(message,userList.find(user=>user.cookieID===senderCookieID).name))
        return true
    }catch(error){//应对不在大厅的用户发送消息至大厅
        return false
    }
}

function buildChatMessage(message,senderName='system'){//这里的等号表示默认参数
    return {
        senderName:`${senderName}`,
        message:`${message}`,
    }
}

function sendRoomChatMessage(message,senderCookieID,roomID){//xxx:实际上是可以在这里发送消息给房间里的玩家的。。。
    try{
        return roomList.find(room => room.id === roomID).sendChatMessage(message,senderCookieID)
    }catch(error){//应对找不到该房间的情况
        return false
    }
}

function userJoinLobby(user){
    userList.push(user)
    sendLobbyInitInfo(user)
    sendEventTo(userList,'lobbyUserListUpd',userList.map(user => user.name))

    user.SSEconnection.on('close',()=>{
        userList.forEach((currentUser,index,list) => {
            if(currentUser.cookieID === user.cookieID){
                list.splice(index,1)
                sendEventTo(userList,'lobbyUserListUpd',userList.map(user => user.name))
                
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

function userQuitLobby(user){//todo...?这个功能有用吗？也许可以给游戏中的玩家少发点大厅数据。

}

function userJoinRoom(cookieID,roomID){
    let tempUser = null
    let tempRoom = null
    if(tempUser = userList.find(user => {return user.cookieID === cookieID})){
        if(tempRoom = roomList.find(room => {return room.id === roomID})){
            tempRoom.userJoin(tempUser)
            return true
        }
    }
    return false
}

function userQuitRoom(cookieID,roomID){
    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        tempRoom.userQuit(cookieID)
        return true
    }
    return false
}

function userSetRoom(roomData,userCookieID,roomID){
    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        if(tempRoom.userSetRoom(roomData,userCookieID)){
            return true
        }
    }
    return false
}

function startGame(roomID,userCookieID){//谁发明的这些乱七八糟的变量名？oh,no,it's me!
    let room = null
    if(room = roomList.find((room)=>{return room.id === roomID})){
        if(room.host.cookieID === userCookieID){
            room.startGame()
            return true
        }
    }
    return false
}

function convertPath(path){//xxx:...懒得做玩家是不是在房间里的验证了，又或者本来就不该做？这是否是一种过度优化？......
    if(/^\/room\/([0-9]*)\/game\/$/.test(path)){
        path = path + '/index.html'
    }
    let roomID = parseInt(path.match(/^\/room\/([0-9]*)\/game\/(.*)/)[1])
    let reqPath = path.match(/^\/room\/([0-9]*)\/game\/(.*)/)[2]

    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        return `${tempRoom.game.staticResourcePath}/${reqPath}`
    }
    return null
}

function tryGameService(method,path,cookieID,data){
    let user = null
    if(user = userList.find(user =>user.cookieID === cookieID)){
        if(user.currentRoomID){
            let room = roomList.find(room => room.id === user.currentRoomID)
            return room.inputHandler(method,path,user,data)
        }
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
        this.userList=[]

        this.userJoin(host)
    }

    userJoin(user){
        this.userList.push(user)
        user.currentRoomID = this.id
        lobbyListener.emit('roomInfoUpd',this)
    }

    userQuit(cookieID){//fixme:没有考虑到房主退出游戏的情况，好消息是这个bug很容易修复，只要在此处随机抽取一个房间内的玩家做房主即可
        if(cookieID === this.host.cookieID && this.userList.length !== 1){
            this.host = this.userList.find(user=>user.cookieID !== cookieID)
        }

        this.userList.forEach((user,index,list) =>{
            if(user.cookieID === cookieID){
                list.splice(index,1)
                user.currentRoomID = null
            }
        })

        if(this.userList.length === 0){
            lobbyListener.emit('cleanRoom',this.id)
        }
        else{
            lobbyListener.emit('roomInfoUpd',this)
        }
    }
    
    userSetRoom(roomData,cookieID){
        if(this.host.cookieID === cookieID){
            this.name=roomData.name
            this.status=roomData.status
            this.game = gameList.find(game => {return game.id === roomData.gameID})
            this.gameModeNum=roomData.gameModeNum
            this.customOption=roomData.customOption


            lobbyListener.emit('roomInfoUpd',this)
            return true
        }
        return false
    }

    sendChatMessage(message,senderCookieID){
        try{
            sendEventTo(this.userList,'roomChatMessage',buildChatMessage(message,this.userList.find(user=>user.cookieID===senderCookieID).name))
            return true
        }catch(error){//应对房间外的人发送消息至房间
            return false
        }
    }

    roomGameInfo(){//xxx:这里的信息可能多余了，只要有gameModeNum,一些信息可以在客户端读出来，但是自定义信息不能
        if(typeof(this.gameModeNum) === "number"){//如果这个值不是数字，说明使用的是自定义设置。
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

    startGame(){
        if(this.userList.length <= this.roomGameInfo().maxPlayers){
            lobbyListener.emit('gameStart',this)
            sendEventTo(this.userList,'gameStart')
            if(typeof(this.gameModeNum) === "number"){//如果这个值不是数字，说明使用的是自定义设置。
                this.Ggame = require(this.game.mainPath).start(this.userList,this.game.config.options[this.gameModeNum],this)            
                //fixme:挖坑给自己跳啊，我就知道下面那个东西不该叫Game，变量名不太对。
            }
            else if(this.customOption){
                this.Ggame = require(this.game.mainPath).start(this.userList,this.customOption,this)
            }
            //fixme:可以看出来目前我们是直接把用户和这个房间传进游戏逻辑里的，这样做非常非常非常不安全！！！
            //还是说应该信任游戏的作者不会把这些东西弄坏？
        }
    }

    gameOver(){
        this.Ggame = undefined
        lobbyListener.emit('gameOver',this)
        sendEventTo(this.userList,'gameOver')
    }

    inputHandler(method,path,user,data){
        if(this.Ggame){
            return this.Ggame.inputHandler(method,path,user,data)
        }
        else{
            return false
        }
    }
}

class Game{
    constructor(gameFileName,gamePkgInfo,gameID){
        this.gamePkgInfo = gamePkgInfo
        this.id = gameID
        this.staticResourcePath = `${gamesFilePath}/${gameFileName}/${gamePkgInfo.staticResourcePath}`
        this.mainPath = `${gamesFilePath}/${gameFileName}/${gamePkgInfo.main}`
        if(gamePkgInfo.config){
            this.config = require(`${gamesFilePath}/${gameFileName}/${gamePkgInfo.config}`)
        }
        else{
            const defaultConfig = {
                customizable:false,
                options:[
                    {
                        modeName:"Default",
                        maxPlayers:1
                    }
                ]
            }
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
exports.sendChatMessage = sendLobbyChatMessage
exports.userCreateRoom = userCreateRoom
exports.sendRoomChatMessage = sendRoomChatMessage
exports.userJoinRoom = userJoinRoom
exports.userQuitRoom = userQuitRoom
exports.userSetRoom = userSetRoom
exports.startGame = startGame
exports.convertPath = convertPath
exports.tryGameService = tryGameService