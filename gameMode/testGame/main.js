const Chat = require('../../lib/chat')
//决不能按照数组顺序标识玩家位置
function start(gamers){
    this.playerList = init(gamers)
    this.publicCR = new Chat('public',Playerlist)
    this.manCR = new Chat('man')
    this.deadCR = new Chat('dead')

    playerList.foreach((current)=>{
        if(current.role === "man")
            manCR.joinChatRoom(current)
    })
}

function init(gamers){
    let maxPN = 6 //max number of players
    let maxBG = 2 //max number of bad guy
    let playerList = gamers.map((gamer)=>{
        return new Player(gamer)
    })

    for(let i=0;i<playerList.length;i++){
        playerList[i].number = Math.floor(Math.random()*maxPN)
        for(let j=0;j<i;){
            if(playerList[i].number === playerList[j].number)
            {
                playerList[i].number = Math.floor(Math.random()*maxPN)
                j=0
            }
            else
            {
                j++
            }
        }
    }

    for(let i=0;i<playerList.length;i++){
        playerList[i].role = "civilian"
    }
    
    let temp1 = Math.floor(Math.random()*maxPN)
    let temp2 = Math.floor(Math.random()*maxPN)
    playerList[temp1].role = "man"
    while(temp1 === temp2){
        temp2 = Math.floor(Math.random()*maxPN)
    }
    playerList[temp2].role = "man"

    return playerList
}

function test(){
    console.log("hello")
}

exports.test = test
