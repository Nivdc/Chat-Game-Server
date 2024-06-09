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
        this.playerList.forEach((p) => {p.setPlayerList(this.playerList)})
        this.host = room.host
        this.room = room
        this.status = "init"

        // 异步函数的执行顺序和性能影响需要更多的观察
        class GameStage{
            constructor(game, name, durationMin){
                this.promise = new Promise((resolve)=>{
                    this.timer = new Timer(resolve, durationMin, true)
                })
                game.setStatus(name)
            }

            end(){
                this.timer.tick()
            }

            clear(){
                this.timer.clear()
            }

            then(...args){
                return this.promise.then(...args)
            }

            [Symbol.asyncIterator]() {
                return (async function* () {
                    await this.promise;
                    yield;
                }).call(this);
            }
        }

        this.GameStage = GameStage
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

        this.newGameStage("begin", 0.05)
        this.gameStage.then(()=>{ this.begin() })
    }

    // 此处有一个比较反直觉的逻辑，我思考了很久
    // 一个状态会持续多久，并不是它本身有个长度决定的，
    // 而是由下一个状态多久后会到来决定的，明白这一点很重要。
    // 当前阶段持续30秒和下一个阶段30秒后出现，其实是逻辑等价的说法。

    // 感觉从下方的代码可以抽出一个gameStage的数据对象出来...
    // 总的来看，游戏可以有以下这几个阶段：
    // begin, day/deathDeclare, day/discussion, day/discussion/lyuchVote, day/trial/defense, day/trial/discussion
    // day/execution/lastWord,day/execution/discussion, night/discussion, night/action, end
    // 但是...累了累了，先搞完再说吧。

    // 我们说30秒后黑夜会到来，它真的会来吗？如来
    // 到底来没来？如来~
    setStatus(status){
        this.status = status
        // this.sendEventToAll("GameStatusUpdate", JSON.stringify(this))

        console.log("StatusChange->",this.status)
    }

    newGameStage(name, durationMin){
        this.gameStage = new this.GameStage(this, name, durationMin)
        return this.gameStage
    }

    begin(){
        switch(this.setting.startAt.split('/')[0]){
            case "day":
                this.dayCycle()
            break
            case "night":
                this.nightCycle()
            break
        }
    }

    async dayCycle(type){
        this.playerList.forEach((p) => p.resetCommonProperties())
        this.dayOver = false

        // if(this.dayCount !== 1){
        //     this.deathDeclare()
        // }

        if(this.setting.enableDiscussion)
            await this.newGameStage("day/discussion", this.setting.discussionTime)

        // Except for the first day/No-Lynch...this is a bit counter-intuitive.
        if(this.dayCount !== 1 || this.setting.startAt !== "day/No-Lynch")
            await this.newGameStage("day/discussion/lyuchVote", this.setting.dayLength)


        this.dayOver = true
        if(!this.atTrialOrExecutionStage)
            this.nightCycle()
    }

    deathDeclare(){

    }

    async nightCycle(){
        this.nightActionSequence = []
        this.recentlyDeadPlayers = []

        await this.newGameStage("night/discussion", this.setting.nightLength)

        this.dayCount ++
        this.nightAction()
    }

    nightAction(){
        this.setStatus("night/action")

        if(this.MafiaKillTargets)
            this.nightActionSequence.push({type:"MafiaKill", targets:this.MafiaKillTargets})
        else
            // todo:今晚不杀人?的消息事件


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
                this.recentlyDeadPlayers.push(realTarget)
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

        // 如果定义了最小票数，达到最小票数的玩家对象将被返回(lynchVote)
        // 否则得票最高的玩家将被返回，可以返回多个(MafiaKillVote)
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

    async execution(player){
        let executionLenght = 0.4

        this.gameStage.end()
        await this.newGameStage("day/execution/lastWord", executionLenght/2)
        player.isAlive = false
        player.deathReason = "Execution"

        //todo:向所有玩家发送处决消息和玩家遗言

        await this.newGameStage("day/execution/discussion", executionLenght/2)
        await this.victoryCheck()

        if(this.status !== "end")
            this.nightCycle()
    }

    async victoryCheck(){
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
            await this.newGameStage("end", 0.02)
            this.room.endGame()
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

    // clearAllTimer(){
    //     for (const [key, value] of Object.entries(this)) {
    //         if(key.endsWith("Timer")){
    //             console.log(key)
    //             value.clear()
    //         }
    //     }
    // }

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

    get index(){
        return this.playerList.indexOf(this)
    }

    setPlayerList(playerList){
        this.playerList = playerList
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