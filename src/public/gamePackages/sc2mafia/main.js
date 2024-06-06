const gameDataPath = import.meta.dir + '/public/gameData/'
let defaultSetting = {}
let roleList = []
let majorFactions = new Set(["Town", "Mafia", "Triad", ])


await init()
async function init(){
    defaultSetting = await readJsonFile(gameDataPath+"defaultSetting.json")
    roleList = await generateRoleList()

    async function readJsonFile(path){
        return await Bun.file(path).json()
    }

    async function generateRoleList(){
        let roleList = []
        let roleData = await readJsonFile(gameDataPath+"roles.json")
        let categoriesData = await readJsonFile(gameDataPath+"categories.json")

        for(let r of roleData){
            r.categories = []
            for(const c of categoriesData){
                if(c.includeRole.includes(r.name))
                    r.categories.push(c.name)
            }

            // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
            let f = r.categories.filter(c => majorFactions.has(c))
            if (f){
                r.affiliation = f.pop()
            }else{
                r.affiliation = "Neutral"
                r.categories.unshift("Neutral")
            }

            roleList.push(r)
        }

        return roleList
    }
}

export function start(room){
    return new Game(room)
}

class Game{
    constructor(room){
        this.playerList = room.user_list.map(user => new Player(user))
        this.host = room.host
        this.room = room
        this.status = "init"
    }

    get survivingPlayerList(){
        return this.playerList.filter((p) => p.isAlive === true)
    }

    get deadPlayerList(){
        return this.playerList.filter((p) => p.isAlive === false)
    }

    get atTrialOrExecutionStage(){
        const trialAndExecutionStatuses = ["trial", "trialDefense", "execution", "executionLastWord"]
        return trialAndExecutionStatuses.includes(this.status)
    }

    game_ws_message_router(ws, message){
        const event = JSON.parse(message)
        let player = this.playerList.find(player => {return player.user.uuid === ws.data.uuid})
    
        if (player !== undefined)
        switch(event.type){
            case "HostSetupGame":
                if(player.user.uuid === this.host.uuid && this.status === "init")
                    this.setup(event.data)
            break

            case "PlayerRename":
                if(this.status === "begin" && this.setting.enableCustomName){
                    player.name = event.data
                }
            break

            case "ChatMessage":
                this.sendChatMessage(player, event.data)
            break

            case "LynchVote":
                // todo:发送投票信息
                if(player.isAlive && this.status === "day"){
                    if(event.data !== undefined){
                        player.lynchVoteTargetNumber = Number(event.data)
                        this.lynchVoteCheck()
                    }
                }
            break

            case "MafiaKillVote":
                if(player.isAlive && player.role.affiliation === "Mafia"){
                    player.mafiaKillVoteTargetNumber = Number(event.data)
                    this.mafiaKillVoteCheck()
                }
            break
        }
    }

    sendEventToAll(eventType, data){
        this.sendEventToGroup(this.playerList, eventType, data)
    }

    sendEventToGroup(playerGroup, eventType, data){
        playerGroup.forEach(player =>{
            player.sendEvent(eventType,data)
        })
    }

    setup(setting){
        this.setting = {...defaultSetting, ...setting}
        // todo:此处应有根据随机规则生成真正角色列表的逻辑
        // todo:检查玩家人数是否与角色列表匹配
        // todo:为没有自定义名字的玩家随机分配名字
        shuffleArray(this.setting.roleSet)
        shuffleArray(this.playerList)
        for(let [index, p] of this.playerList.entries()){
            p.role = roleList.find( r => r.name === this.setting.roleSet[index] )
            p.isAlive = true
        }

        // todo:向每名玩家发送自己的角色
        // todo:向黑手党发送队友的信息

        // 游戏环境变量初始化...可能不全，因为js可以随时添加上去，欸嘿
        this.dayCount = 1
        this.nightActionSequence = []

        this.setStatus("begin")
    }

    // 此处有一个比较反直觉的逻辑，我思考了很久
    // 一个状态会持续多久，并不是它本身有个长度决定的，
    // 而是由下一个状态多久后会到来决定的，明白这一点很重要。
    // 当前阶段持续30秒和下一个阶段30秒后出现，其实是逻辑等价的说法。

    // 感觉从下方的代码可以抽出一个gameStage的数据对象出来...
    // 总的来看，游戏可以有以下这几个阶段：
    // begin, day/discussion, day/lyuchVote, day/trial/defense, day/trial
    // day/execution, day/execution/lastWord, night, night/action, end
    // 但是...累了累了，先搞完再说吧。

    // 我们说30秒后黑夜会到来，它真的会来吗？如来
    // 到底来没来？如来~
    setStatus(status){
        switch(status){
            case "begin":
                this.status = "begin"
                this.beginTimer = new Timer(() => this.begin(), 0.5, true)
            break
            default:
                this.status = status
            break
        }

        this.sendEventToAll("GameStatusUpdate", JSON.stringify(this))

        console.log(this.status)
    }

    begin(){
        switch(this.setting.startAt){
            case "day":
                this.dayCycle()
            break
            case "night":
                this.nightCycle()
            break
            case "day/No-Lynch":
                this.dayCycle("day/No-Lynch")
            break
        }
    }

    dayCycle(type){
        this.playerList.forEach((p) => p.resetCommonProperties())
        this.dayOver = false

        let dayType = type ?  type : "day"
        let length = type !== "day/No-Lynch" ? this.setting.dayLength : 0

        if(this.setting.enableDiscussion){
            length += this.setting.discussionTime
            this.setStatus("discussion")
            this.discussionTimer = new Timer(() => this.setStatus(dayType), this.setting.discussionTime, true)
        }else{
            this.setStatus(dayType)
        }

        this.dayTimer = new Timer(() => {
            this.dayOver = true
            if(!this.atTrialOrExecutionStage)
                this.nightCycle()
        }, length, true)
    }

    nightCycle(){
        this.setStatus("night")
        this.nightActionSequence = []
        this.dayCount ++
        this.nightTimer = new Timer(() => {
            this.nightAction()
            this.dayCycle()
        }, this.setting.nightLength, true)
    }

    nightAction(){
        this.setStatus("nightAction")

        this.nightActionSequence.push({type:"MafiaKill", targets:this.MafiaKillTargets})


        this.nightActionSequence.sort(actionSequencing)

        // this.nightActionStep.count = 0
        this.nightActionStep()

        function actionSequencing(a,b){
            const priorityOfActions = {
                "MafiaKill":1
            }

            return priorityOfActions[a.name] - priorityOfActions[b.name]
        }
    }

    nightActionStep(){
        if(this.nightActionSequence.length === 0){
            this.dayCycle()
            return
        }

        let a = this.nightActionSequence.shift()
        switch(a.type){
            case "MafiaKill":
                let realTarget = getRandomElement(a.targets)
                // let realKiller = getRandomElement(this.querySurvivingPlayerByRoleName("Mafioso"))
                realTarget.isAlive = false
                realTarget.deathReason = "MafiaKill"
            break
        }
        



        function getRandomElement(arr){
            const randomIndex = Math.floor(Math.random() * arr.length)
            return arr[randomIndex]
        }
    }

    // addNightAction(type, args){
    //     let existedEvents = this.nightActionSequence.filter((a) => a.type === type)

    //     switch(type){
    //         case "MafiaKill":
    //             if(existedEvents.length === 1) 
    //                 this.nightActionSequence.splice(this.nightActionSequence.indexOf(existedEvents.pop()), 1)
    //             this.nightActionSequence.push({type, target:args.target})
    //         break
    //     }
    // }

    sendChatMessage(sender, data){
        let targetGroup = undefined
        if(sender.isAlive === true){
            let publicChatEnableStatus = ["day", "init", "discussion", "execution", "trial",]
            if(publicChatEnableStatus.includes(this.status)){
                targetGroup = this.survivingPlayerList
            }else if(this.status === "night"){
                if(["Mafia"].includes(sender.role.affiliation))
                    targetGroup = this.querySurvivingPlayerByCategory(sender.role.affiliation)
            }   
        }else{
            targetGroup = this.deadPlayerList
        }

        this.sendEventToGroup(targetGroup, "Game:ChatMessage", {senderName:sender.name, message:data.message})
    }

    lynchVoteCheck(){
        let spll = this.survivingPlayerList.length
        let voteNeeded = spll % 2 === 0 ? ((spll / 2) + 1) : Math.ceil(spll / 2)
        let lynchTarget = this.voteCheck('LynchVote', this.survivingPlayerList, voteNeeded)

        if(lynchTarget !== undefined){
            if(this.setting.enableTrial){
                this.trialCycle(lynchTarget)
            }else{
                this.execution(lynchTarget)
            }
        }

    }

    mafiaKillVoteCheck(){
        // Note that when a tie vote occurs, there can be multiple targets
        let killTargets = this.voteCheck('MafiaKillVote', this.querySurvivingPlayerByCategory('Mafia'))
        this.MafiaKillTargets = killTargets
        // todo:发往客户端的提示信息
    }

    voteCheck(voteType, checkPlayers, voteNeeded = undefined){
        let voteCount = Array(this.playerList.length).fill(0)
        for(const p of checkPlayers){
            if(p[`${voteType}TargetNumber`] !== undefined)
                voteCount[p[`${voteType}TargetNumber`] - 1] += `${voteType}Weight` in p ? p[`${voteType}Weight`] : 1
        }

        // if target isn't alive, vote count = 0
        for(const index of voteCount.keys()){
            if(this.playerList[index].isAlive === false)
                voteCount[index] = 0
        }

        // 如果定义了最小票数，达到最小票数的玩家对象将被返回
        // 否则得票最高的玩家将被返回，可以返回多个
        if(voteNeeded !== undefined){
            for(const [index, vc] of voteCount.entries()){
                if(vc >= voteNeeded){
                    return this.player[index]
                }
            }
            return undefined
        }else{
            let voteMax = Math.max(voteCount)
            let voteMaxIndexArray = voteCount.map((vc, idx) => {
                if(vc === voteMax)
                    return idx
            })
            return voteMaxIndexArray.map((idx) => this.playerList[idx])
        }
    }

    execution(player){
        let executionLenght = 0.4
        this.setStatus("executionLastWord")
        this.executionLWTimer = new Timer(()=> {
            this.setStatus("execution")
            player.isAlive = false
            player.deathReason = "Execution"
        }, executionLenght/2, true)

        //todo:向所有玩家发送处决消息和玩家遗言

        this.executionTimer = new Timer(()=> {
            this.dayTimer.tick()
            this.nightCycle()
        }, executionLenght, true)

        this.victoryCheck()
    }

    victoryCheck(){
        let town_sp_l = this.querySurvivingPlayerByCategory("Town").length
        let mafia_sp_l = this.querySurvivingPlayerByCategory("Mafia").length
        
        if(town_sp_l === 0){
            this.winningFaction = "Mafia"
            this.winners = this.querySurvivingPlayerByCategory("Mafia")
        }else if(mafia_sp_l === 0){
            this.winningFaction = "Town"
            this.winners = this.querySurvivingPlayerByCategory("Town")
        }
        
        if(this.winningFaction !== undefined){
            this.setStatus("end")
            this.clearAllTimer()
            this.endTimer = new Timer(()=> this.room.endGame(), 0.02, true)
        }
    }

    querySurvivingPlayerByCategory(categoryString){
        return this.survivingPlayerList.filter((p)=>{
            return p.role.categories.includes(categoryString)
        })
    }

    querySurvivingPlayerByRoleName(roleName){
        return this.survivingPlayerList.filter((p)=>{
            return p.role.name === roleName
        })
    }

    clearAllTimer(){
        for (const [key, value] of Object.entries(this)) {
            if(key.endsWith("Timer")){
                console.log(key)
                value.clear()
            }
        }

    }

    userQuit(user){
        this.playerList.forEach((currentPlaer,index,list) =>{
            if(currentPlaer.user === user){
                currentPlaer.user = undefined
            }
        })
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

class Player{
    constructor(user){
        this.user = user
    }

    sendEvent(eventType, data){
        if(this.user !== undefined)
            this.user.sendEvent(eventType, data)
    }

    resetCommonProperties(){
        this.lynchVoteTargetNumber = undefined
    }
}

class Timer{
    constructor(callback, delayMin, go){
        this.callback = callback
        this.delay = 1000 * 60 * delayMin

        if(go)
            this.start()
    }

    // get remainingTime(){
    //     if(this.id){
    //         return this.delay - (Date.now() - this.startTime)
    //     }else{
    //         return undefined
    //     }
    // }

    start(){
        if(!this.id){
            this.startTime = Date.now()
            this.id = setTimeout(()=>{this.tick()}, this.delay)
        }
    }

    pause(){
        if(this.id){
            this.clear()
            this.delay = Date.now() - this.startTime
        }
    }

    tick(){
        this.clear()
        this.callback()
    }

    // addDelay(min, go){
    //     this.pause()
    //     this.delay += 1000 * 60 * min

    //     if(go)
    //         this.start()
    // }

    // change(newCallback, newDelay, nowGo){
    //     this.pause()
    //     this.callback = newCallback

    //     if(newDelay)
    //         this.delay = newDelay
        
    //     if(nowGo)
    //         this.start()
    // }

    clear(){
        if(this.id){
            clearTimeout(this.id)
            this.id = undefined
        }
    }
}