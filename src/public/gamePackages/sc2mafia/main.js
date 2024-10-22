import { gameDataInit } from "./gameData"

const gameDataPath = import.meta.dir + '/public/gameData/'
let defaultSetting = await readJsonFile(gameDataPath+"defaultSetting.json")

async function readJsonFile(path){
    return await Bun.file(path).json()
}

export function start(room){
    return new Game(room)
}

class Game{
    constructor(room){
        this.playerList = room.user_list.map(user => new Player(user))
        this.playerList.forEach(p => p.setPlayerList(this.playerList))
        this.host = this.playerList.find(p => p.user === room.host)
        this.room = room
        this.status = "init"

        const {tagSet, roleMetaSet, voteSet, teamSet} = gameDataInit(this)
        this.tagSet = tagSet
        this.roleMetaSet = roleMetaSet
        this.voteSet = voteSet
        this.teamSet = teamSet

        this.sendEventToAll('BackendReady')

        // 异步函数的执行顺序和性能影响需要更多的观察
        class GameStage{
            constructor(game, name, durationMin){
                this.game = game
                this.name = name
                this.controller = new AbortController()
                this.promise = new Promise((resolve, reject)=>{
                    this.timer = new Timer(resolve, durationMin, true)
                    this.controller.signal.addEventListener('abort', () => {
                        this.timer.clear()
                        reject(`GameStage:${this.name} aborted`);
                    })
                })
                this.game.setStatus(this.name)
            }

            pause(){
                this.timer.pause()
            }

            start(){
                this.game.setStatus(this.name)
                this.timer.start()
            }

            end(){
                this.timer.tick()
            }

            abort(){
                this.controller.abort()
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

    get onlinePlayerList(){
        return this.playerList.filter((p) => p.isOnline === true)
    }

    get alivePlayerList(){
        return this.playerList.filter((p) => p.isAlive === true)
    }

    get deadPlayerList(){
        return this.playerList.filter((p) => p.isAlive === false)
    }

    get atTrialOrExecutionStage(){
        return this.status.split('/').includes("trial") || this.status.split('/').includes("execution")
    }

    game_ws_message_router(ws, message){
        const event = JSON.parse(message)
        let player = this.playerList.find(player => {return player.uuid === ws.data.uuid})

        if (player !== undefined){
            console.log("recive <-", event)
            switch(event.type){
                case "FrontendReady":
                    this.sendInitData(player)
                break

                case "HostSetupGame":
                    if(player.uuid === this.host.uuid && this.status === "init"){
                        this.setup(event.data)
                        this.sendEventToAll(event.type)
                    }
                break

                case "HostCancelSetup":
                    if(player.uuid === this.host.uuid && this.status === "setup"){
                        this.abortSetupStage()
                    }
                break

                case "HostChangesGameSetting":
                    if(player.uuid === this.host.uuid && this.status === "init")
                        this.sendEventToAll(event.type, event.data)
                break

                case "PlayerRename":
                    if(this.status === "begin" && this.setting.enableCustomName){
                        this.sendEventToAll(event.type, {player, newName:event.data})
                        player.name = event.data
                    }
                break

                case "RepickHost":
                    if(['init', 'setup'].includes(this.status)){
                        if(event.data == undefined || isValidIndex((Number(event.data)), this.playerList.length) === false)
                            return

                        this.sendEventToAll(event.type, {player, targetIndex:(Number(event.data))})
                        if(player !== this.host){
                            if(event.data){
                                player.repickHostVoteTargetIndex = Number(event.data)
                            }
                            else{
                                player.repickHostVoteTargetIndex = -1
                            }
                            this.repickHostVoteCheck()
                        }else{
                            if(event.data)
                                this.repickHost(this.playerList[(Number(event.data))])
                            else{
                                this.repickHost(this.getNewRandomHost())
                            }
                        }
                    }
                break

                case "ChatMessage":
                    this.sendChatMessage(player, event.data)
                break
            }

            // 仔细观察活着的玩家在游戏流程中的几种行为，我认为可以分为以下几类：
            // 1.公开投票，例如lynchVote
            // 2.团队投票，例如MafiaKillVote
            // 3.使用技能
            // 4.其他，例如聊天、设置遗言

            // 最后一类并不复杂，我们暂时忽略，而为前几类行为进行编程的难点在于，它们有很相似的行为，却又略有不同。

            //                                                                            ┌──► Immediately change the game state
            // PublicVote ─┐                                ┌─ Public vote result check ──┘                                     
            //   TeamVote ─┼► Input parameter verification ─┼─ Team   vote result check ────► Set Team ability targets ──┐    
            // UseAbility ─┘                                └───────────────────────────────► Set Role ability targets ──┤    
            //                                                                                                           │    
            //                                                                                                 (At Night)│    
            //                                                                              Generate actions ◄───────────┘     

            // 我们可以将这三种行为抽象出来，并且单独编程每个行为的验证函数，但是这里有个小问题，
            // TeamVote可以由Team对象验证，UseAbility可以由Role对象验证，但是PublicVote该由谁来验证呢？

            // 要回答这个问题，我们必须要仔细思考一下现实中的黑手党（狼人杀）是怎么玩的，
            // 当我们在线下与朋友们一起玩这类游戏的时候，如果你说：“我要投票审判12号玩家。”
            // 是由谁来确认你的这个投票是有效的呢？答案很简单，是游戏的主持人。

            // 因此，PublicVote应该由SystemHost来验证。
            // 而出于某些原因，在这个程序中，我会将SystemHost称之为GameDirector。


            // 一旦我们引入了这个GameDirector，我就不得不说明一下这个设计思路了
            // 简单来说就是，线下游戏中我们需要某个玩家来当主持人，而在线上游戏中，我们通过编程这个主持人的行为来实现更优的游戏流程
            // 而一旦我们深究这个思路，就会发现在本项目中存在一个与该思路不符的设计: class GameStage
            // game对象（也就是这个特别大的对象）可以继续持有各项游戏数据（也理应如此），
            // 但是游戏阶段的控制理应转交给GameDirector决定才对，
            // 我们有理由认为此处有可能存在一个更好的设计。

            // ...然而这意味着目前项目中的很多代码都要重写，顺便还要承认我自己之前写了很多废代码...
            // 既然现有的游戏流程还是可以满足需求的...那就暂且先放放？

            if(player.isAlive ?? false){
                switch(event.type){
                    case "LynchVote":
                    case "TrialVote":
                        this.gameDirector.playerVote(event.type, player, event.data)
                    break
                    case "LynchVoteCancel":
                    case "TrialVoteCancel":
                        let voteType = event.type.slice(0, event.type.indexOf('Cancel'))
                        this.gameDirector.playerVoteCancel(voteType, player)
                    break
                    case "TeamVote":
                        player.team.playerVote(player, event.data)
                    break
                    case "TeamVoteCancel":
                        player.team.playerVoteCancel(player, event.data)
                    break

                    case "UseAbility":
                        player.role.useAblity(event.data)
                    break

                    case 'SetLastWill':
                        if(this.setting.enableLastWill){
                            player.lastWill = event.data
                            player.sendEvent("SetLastWill", player.lastWill)
                        }
                    break
                    case 'SetKillerMessage':
                        if(this.setting.enableLastWill){
                            player.killerMessage = event.data
                            player.sendEvent("SetKillerMessage", player.killerMessage)
                        }
                    break
                    case 'PrivateMessage':
                        // fixme: 后端的检测不是很严谨，动画阶段也能发送私信
                        if(this.setting.enablePrivateMessage){
                            const data = event.data
                            const target  = this.playerList[data.targetIndex]
                            if(target.isAlive){
                                this.sendEventToGroup(this.onlinePlayerList.filter(p => p !== target), 'PrivateMessage-PublicNotice', {senderIndex:player.index, targetIndex:target.index})
                                target.sendEvent('PrivateMessage-Receiver', {senderIndex:player.index, message:data.message})
                            }
                        }
                    break
                }
            }
        }
    }

    sendEventToAll(eventType, data){
        this.sendEventToGroup(this.playerList, eventType, data)
    }

    sendEventToGroup(playerGroup, eventType, data){
        if(playerGroup !== undefined)
            playerGroup.forEach(player =>{
                player.sendEvent(eventType,data)
            })
    }

    sendInitData(p){
        // todo: 以下数据也许可以整合到一起发送以提高压缩率。
        p.sendEvent("SetPlayerList", this.playerList)
        p.sendEvent("SetHost", this.host)
        p.sendEvent("SetStatus", this.status)
        p.sendEvent("SetDayCount", this.dayCount ?? 1)
        p.sendEvent("SetTagSet", this.tagSet)
        p.sendEvent("SetRoleSet", this.roleMetaSet)
        p.sendEvent("InitCompleted")
    }

    async setup(setting){
        try{
            await this.newGameStage("setup", 0.025)
            this.setting = {...defaultSetting, ...setting}
            await this.newGameStage("begin", 0.05)
            let {realRoleNameList, possibleRoleSet} = this.processRandomRole(this.setting.roleList)
            this.sendEventToAll("SetPossibleRoleSet", possibleRoleSet)
            // todo:检查玩家人数是否与角色列表匹配
            // todo:为没有自定义名字的玩家随机分配名字
            shuffleArray(realRoleNameList)
            shuffleArray(this.playerList)
            this.sendEventToAll("SetPlayerList", this.playerList)
            for(let [index, p] of this.playerList.entries()){
                p.setRole(this.roleMetaSet.find( r => r.name === realRoleNameList[index] ))
                p.isAlive = true

                p.sendEvent("SetPlayerSelfIndex", p.index)
                p.sendEvent("SetRole", p.role)
                for(let t of this.teamSet){
                    if(t.includeRoleNames.includes(p.role.name)){
                        t.playerList.push(p)
                        p.team = t
                    }
                }
            }

            for(const t of this.teamSet){
                t.sendEvent("SetTeam", t.playerList.map(p=>p.toJSON_includeRole()))
            }

            this.teamSet = this.teamSet.filter(t => t.playerList.length > 0)

            this.gameDirectorInit()

            this.dayCount = 1

            await this.newGameStage("animation/begin", 0.1)
            this.begin()
        }catch(e){
            if(e === "GameStage:setup aborted")
                return
            else
                throw e
        }
    }

    // 死去的概率论在攻击我，还是得靠GPT，G老师救场
    processRandomRole(roleListData){
        let realRoleNameList = roleListData.map((r) => {
            if(typeof(r) === 'string'){
                return r
            }else{
                // return weightedRandom(r.possibleRoleSet)
                const roleNameLowerCase = r.name.charAt(0).toLowerCase() + r.name.slice(1)
                const modifyObject = this.setting.roleModifyOptions[roleNameLowerCase]
                if(modifyObject !== undefined){
                    for(const keyName of Object.keys(modifyObject)){
                        if(keyName.startsWith('excludeTag')){
                            const excludeTagName = keyName.split('excludeTag')[1]
                            r.possibleRoleSet = r.possibleRoleSet.filter(prd => {
                                const roleMeta = this.roleMetaSet.find(r => r.name === prd.name)
                                return roleMeta.tagStrings.includes(excludeTagName) === false
                            })
                        }
                        else if(keyName.startsWith('excludeRole')){
                            const excludeRoleName = keyName.split('excludeRole')[1]
                            r.possibleRoleSet = r.possibleRoleSet.filter(prd => prd.name !== excludeRoleName)
                        }
                    }
                }

                return weightedRandom(r.possibleRoleSet)
            }
        })

        const fixedRoleNameList       = roleListData.filter(r => typeof(r) === 'string')
        const fixedRoleNameSet        = new Set(fixedRoleNameList)
        const randomObjectList        = roleListData.filter(r => r.name?.endsWith('Random'))
        const possibleRoleNameList    = randomObjectList.map(ro => ro.possibleRoleSet.map(pr => pr.name)).flat(Infinity)
        const possibleRoleNameSet     = new Set(possibleRoleNameList)

        let possibleRoleArray = []
        for(const possibleRoleName of possibleRoleNameSet){
            let totalExpectation = 0
            let totalProbability_NotCurrentRole = 1

            for(const randomObject of randomObjectList){
                const currentRandomProbability = calculateProbability(possibleRoleName, randomObject.possibleRoleSet)
                const currentRandomExpectation = currentRandomProbability
                totalExpectation += currentRandomExpectation

                const probability_NotCurrentRole = 1 - currentRandomProbability
                totalProbability_NotCurrentRole *= probability_NotCurrentRole
            }

            const totalProbability = 1 - totalProbability_NotCurrentRole

            let possibleRoleData = {name:possibleRoleName, expectation:Number(totalExpectation.toFixed(3)), probability:Number(totalProbability.toFixed(3))}
            possibleRoleArray.push(possibleRoleData)
        }

        for(const fixedRoleName of fixedRoleNameSet){
            if(possibleRoleNameSet.has(fixedRoleName)){
                let prd = possibleRoleArray.find(pr => pr.name === fixedRoleName)
                prd.expectation = Number(prd.expectation) + fixedRoleNameList.filter(rn => rn === fixedRoleName).length
                prd.probability = 1
            }else{
                possibleRoleArray.push({name:fixedRoleName, expectation:fixedRoleNameList.filter(rn => rn === fixedRoleName).length, probability:1})
            }
        }

        return {realRoleNameList, possibleRoleSet:possibleRoleArray}
    }

    gameDirectorInit(){
        const game = this

        this.gameDirector = {
            async playerVote(type, voter, data){
                const vote = game.voteSet.find(v => v.name === type)
                const voterIndex = voter.index
                const voteData = data
                // const targetIndex = Number(data)
                const {success, previousVoteData, voteCount} = vote.playerVote(voterIndex, voteData)
                if(success){
                    if(type === 'LynchVote'){
                        game.sendEventToAll(type, {voterIndex, targetIndex:voteData, previousTargetIndex:previousVoteData})
                        game.sendEventToAll(`SetLynchVoteCount`, voteCount)
                        const resultIndex = vote.getResult()
                        if(resultIndex !== undefined){
                            const lynchTarget = game.playerList[resultIndex]
                            // game.sendEventToAll("SetLynchTarget", lynchTarget)
                            if(game.setting.enableTrial){
                                if(game.setting.pauseDayTimerDuringTrial === true){
                                    this.tempDayStageCache = game.gameStage
                                    this.tempDayStageCache.pause()
                                }
                                await game.trialCycle(lynchTarget)
                                const {trialTargetIsGuilty, voteRecord} = this.checkTrialVoteResult()
                                game.sendEventToAll("SetTrialVoteRecord", voteRecord)
                                if(trialTargetIsGuilty){
                                    game.execution(lynchTarget)
                                }
                                else{
                                    if(game.setting.pauseDayTimerDuringTrial === true && this.tempDayStageCache !== undefined ){
                                        game.gameStage = this.tempDayStageCache
                                        game.gameStage.start()
                                        this.tempDayStageCache = undefined
                                    }
                                    else if(game.setting.pauseDayTimerDuringTrial === false && game.dayOver === true){
                                        game.nightCycle()
                                    }
                                    else if(game.setting.pauseDayTimerDuringTrial === false && game.dayOver === false){
                                        game.setStatus("day/discussion/lynchVote")
                                    }
                                }
                                game.trialTarget = undefined
                            }
                            else{
                                game.execution(lynchTarget)
                            }

                            vote.resetRecord()
                            game.sendEventToAll(`SetLynchVoteCount`, Array(game.playerList.length).fill(0))
                        }
                    // }else if(type === 'SkipVote'){
                    //     game.sendEventToAll(type, {voterIndex, voteData, previousVoteData})
                    }else if(type === 'TrialVote'){
                        game.sendEventToAll(type, {voterIndex})
                    }
                }
            },
            playerVoteCancel(type, voter){
                const vote = game.voteSet.find(v => v.name === type)
                const voterIndex = voter.index
                const {success, previousTargetIndex, voteCount} = vote.playerVoteCancel(voterIndex)
                if(success){

                    if(type === 'LynchVote'){
                        game.sendEventToAll(type+'Cancel', {voterIndex, previousTargetIndex})
                        game.sendEventToAll(`SetLynchVoteCount`, voteCount)
                    }else if(type === 'TrialVote'){
                        game.sendEventToAll(type+'Cancel', {voterIndex})
                    }
                }
            },
            checkTrialVoteResult(){
                const trialVote = game.voteSet.find(v => v.name === 'TrialVote')
                const record = trialVote.record.slice()
                const result = trialVote.getResult()
                trialVote.resetRecord()
                return  {trialTargetIsGuilty:result, voteRecord:record}
            }
        }
    }

    // 此处有一个比较反直觉的逻辑，我思考了很久
    // 一个状态会持续多久，并不是它本身有个长度决定的，
    // 而是由下一个状态多久后会到来决定的，明白这一点很重要。
    // 当前阶段持续30秒和下一个阶段30秒后出现，其实是逻辑等价的说法。

    // 感觉从下方的代码可以抽出一个gameStage的数据对象出来...
    // 总的来看，游戏可以有以下这几个阶段：
    // begin, day/deathDeclare（animation）, day/discussion, day/discussion/lynchVote, 
    // day/trial/defense, day/discussion/trial/trialVote
    // day/execution/lastWord, day/execution/discussion, night/discussion, night/action（animation）, end
    // 除此之外，还有两个不在游戏循环内的阶段：
    // init, setup
    // 前端可能会播放动画，因此后端要等待动画播放完毕还有一个阶段：
    // animation

    // 我们说30秒后黑夜会到来，它真的会来吗？如来
    // 到底来没来？如来~

    setStatus(status){
        // console.log("Befor->",this.status)

        this.status = status
        this.sendEventToAll("SetStatus", this.status)

        console.log("SetStatus->",this.status)
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

    async dayCycle(){
        this.nightActionSequence = []
        this.playerList.forEach((p) => p.resetCommonProperties())
        this.dayOver = false

        if(this.dayCount !== 1){
            await this.newGameStage("animation/actionToDay", 0.1)
            await this.deathDeclare()
        }

        await this.victoryCheck()
        if(this.status === 'end')
            return

        if(this.setting.enableDiscussion)
            await this.newGameStage("day/discussion", this.setting.discussionTime)

        // 如果是第一天，就判断是否以白天/无处刑开局，如果不是，那就执行...有点绕
        // Except for the first day/No-Lynch...this is a bit counter-intuitive.
        if(this.dayCount !== 1 || this.setting.startAt !== "day/No-Lynch"){
            this.sendEventToAll(`SetLynchVoteCount`, Array(this.playerList.length).fill(0))
            await this.newGameStage("day/discussion/lynchVote", this.setting.dayLength)
        }


        this.dayOver = true
        if(!this.atTrialOrExecutionStage)
            this.nightCycle()
    }

    async deathDeclare(){
        if(this.recentlyDeadPlayers?.length > 0){
            this.sendEventToAll('SetRecentlyDeadPlayers', this.recentlyDeadPlayers.map(p => this.getPlayerDeathDeclearData(p)))
            await this.newGameStage("animation/daily/deathDeclear", 0.05 + (this.recentlyDeadPlayers.length * 0.1))
        }
    }

    async nightCycle(){
        if(this.nightActionSequence === undefined)
            this.nightActionSequence = []
        this.recentlyDeadPlayers = []

        // 如果是第一天，就判断是否以夜晚开局，如果不是，那就执行。
        if(this.dayCount !== 1 || this.setting.startAt !== "night")
            await this.newGameStage("animation/dayToNight", 0.1)
        await this.newGameStage("night/discussion", this.setting.nightLength)

        this.dayCount ++
        this.sendEventToAll("SetDayCount", this.dayCount ?? 1)
        await this.newGameStage("animation/nightToAction", 0.1)
        await this.nightAction()
        this.dayCycle()
    }

    async nightAction(){
        this.setStatus("night/action")

        this.generatePlayerAction()

        this.nightActionSequence.sort(actionSequencing)

        this.nightActionProcess()

        // 此处前端已经收到了所有事件通知，等待下面这个阶段出现就会播放动画队列
        // 而这里就有一个后端究竟要等多久的问题，理想情况下，它应该等待无限久，直到所有人的所有前端动画都播放完
        // 但是这么做就会有一点点复杂，让我们暂且先偷个懒，就先设置成30秒吧
        await this.newGameStage("animation/actions", 0.5)

        for(const dp of this.recentlyDeadPlayers){
            dp.sendEvent("YouAreDead")
        }

        function actionSequencing(a,b){
            const priorityOfActions = {
                "MafiaKillAttack":9,
                "DoctorHealProtect":19,

                // "SheriffCheck":20,
                "AuxiliaryOfficerCheck":21,
            }

            return priorityOfActions[a.type] - priorityOfActions[b.type]
        }
    }

    // generatePlayerAction
    // 它的主要作用是为了防止反复变动造成复杂的修改
    // 试想如果一个党徒决定在晚上杀死1号玩家，但是过了会儿他又改成2号
    // 如果我们不引入一个生成过程，就得要对夜晚的行动队列进行反复修改
    generatePlayerAction(){
        for(const t of this.teamSet){
            this.nightActionSequence.push(...t.generateAction())
        }

        // SoloPlayer
        for(const p of this.alivePlayerList){
            for(const a of p.role.abilities ?? []){
                const action = a.generateAction(p)
                if(action !== undefined)
                    this.nightActionSequence.push(action)
            }
        }
    }

    // 每个action都至少包含三个数据: origin/行动者, target/对象, type/类型
    nightActionProcess(){
        // If no actions happend
        if(this.nightActionSequence.length === 0){
            return
        }

        // Attack and Protection Processing
        let attackSequence  = filterAndRemove(this.nightActionSequence, a => a.type.endsWith('Attack'))
        let protectSequence = filterAndRemove(this.nightActionSequence, a => a.type.endsWith('Protect'))

        for(const p of this.alivePlayerList){
            let asf  = attackSequence .filter(a => a.target === p)
            let psf  = protectSequence.filter(a => a.target === p)
            let anps = interleaveArrays(asf, psf)
            let tempDeathReason = []

            while(anps.length > 0){
                let action = anps.shift()
                // fixme: 这里有个小问题要解决，如果杀手已经死了，还是会发送这个消息。
                // action.origin.sendEvent("YouGoToKill", {targetIndex: action.target.index})
                switch(action.type){
                    case 'MafiaKillAttack':
                        action.target.sendEvent('YouUnderAttack', {source:'Mafia'})
                        action.target.isAlive = false
                        tempDeathReason.push('MafiaKillAttack')

                        if('killerMessage' in action.origin)
                            action.target.messageLeftByKiller = action.origin.killerMessage
                        else
                            action.target.messageLeftByKiller = undefined
                    break

                    case 'DoctorHealProtect':
                        if(tempDeathReason.length !== 0){
                            if(this.setting.roleModifyOptions[doctor][knowsIfTargetIsAttacked])
                                action.origin.sendEvent('YourTargetIsAttacked')
                        }
                        if(action.target.isAlive === false && p.deathReason === undefined){
                            action.target.sendEvent('YouAreHealed')
                            action.target.isAlive = true
                        }
                    break
                }
            }

            if(p.isAlive === false){
                p.deathReason = tempDeathReason
                this.recentlyDeadPlayers.push(p)
            }
        }


        while(this.nightActionSequence.length > 0){
            let a = this.nightActionSequence.shift()
            switch(a.type){
                case 'AuxiliaryOfficerCheck':
                    if(a.origin.isAlive === true){
                        this.sendEventToGroup(this.queryAlivePlayersByRoleName('AuxiliaryOfficer'), 
                        'AuxiliaryOfficerCheckResult', {targetIndex:a.target.index, targetAffiliationName:a.target.role.affiliationName})
                    }
                break

                // case "SheriffCheck":
                // break
            }
        }
    }

    abortSetupStage(){
        if(this.gameStage?.name === "setup"){
            this.gameStage.abort()
            this.gameStage = undefined
            this.status = "init"
            this.sendEventToAll("HostCancelSetup")
        }
    }

    sendChatMessage(sender, data){
        let targetGroup = undefined

        if(this.status === "init" || this.status === "setup" || this.status === "end")
            targetGroup = this.onlinePlayerList
        else{
            if(sender.isAlive === true){
                if(this.status.startsWith("day") && this.status.split('/').includes("discussion")){
                    targetGroup = this.onlinePlayerList
                }else if(this.status.startsWith("night") && this.status.split('/').includes("discussion")){
                    if(sender.role.affiliationName === "Mafia")
                        targetGroup = this.queryAlivePlayersByRoleTag(sender.role.affiliationName)
                    else if(sender.role.name === "AuxiliaryOfficer")
                        targetGroup = this.queryAlivePlayersByRoleName("AuxiliaryOfficer")
                }
            }else{
                targetGroup = this.deadPlayerList
            }
        }

        if(this.status.split('/').includes('lastWord') && sender === this.executionTarget)
            targetGroup = this.onlinePlayerList
        if(this.status.split('/').includes('defense')  && sender === this.trialTarget){
            targetGroup = this.onlinePlayerList
        }

        if(targetGroup !== undefined)
            this.sendEventToGroup(targetGroup, "ChatMessage", {senderIndex:sender.index, message:data})
    }

    // 首先检查是否有一半的玩家投票重选主机，如果有，随机选择一个主机
    // 其次检查是否有一半的玩家都投票给某个特别的玩家，如果有，选择他为主机
    repickHostVoteCheck(){
        let opll = this.onlinePlayerList.length
        // 尚且不确定哪种人数要求更好，一种不含半数，另一种含半数
        // const voteNeeded = opll % 2 === 0 ? ((opll / 2) + 1) : Math.ceil(opll / 2)
        const voteNeeded = Math.ceil(opll / 2)

        const votedPlayerNumber = this.playerList.filter(p => p.repickHostVoteTargetIndex !== undefined ).length
        if(votedPlayerNumber >= voteNeeded){
            var randomHost = this.getNewRandomHost()
        }

        // 为接下来的检测排除干扰项
        this.playerList.filter(p => p.repickHostVoteTargetIndex === -1).forEach(p => p.repickHostVoteTargetIndex = undefined)

        let specificHost = this.voteCheck('RepickHostVote', this.onlinePlayerList, this.onlinePlayerList, voteNeeded)

        if(specificHost !== undefined)
            this.repickHost(specificHost)
        else if(randomHost !== undefined)
            this.repickHost(randomHost)
    }

    getNewRandomHost(){
        do{
            var randomHost = getRandomElement(this.onlinePlayerList)
        }while(randomHost === this.host && this.onlinePlayerList.length > 1)

        return randomHost
    }

    repickHost(newHost){
        if(newHost?.isOnline && newHost !== this.host){
            this.host = newHost
            this.sendEventToAll("SetHost", this.host)
            this.abortSetupStage()
            this.onlinePlayerList.forEach(p => p.repickHostVoteTargetIndex = undefined)
        }
    }

    // 这个旧的投票检查函数目前仅用于repickHostVote
    voteCheck(voteType, checkPlayers, voteTargets, voteNeeded){
        voteType = voteType.charAt(0).toLowerCase() + voteType.slice(1)
        let voteCount = Array(this.playerList.length).fill(0)
        for(const p of checkPlayers){
            if(p[`${voteType}TargetIndex`] !== undefined){
                voteCount[p[`${voteType}TargetIndex`]] += `${voteType}Weight` in p ? p[`${voteType}Weight`] : 1
                console.log('voteType:', voteType, `->${p.index} voteTo`, p[`${voteType}TargetIndex`])
            }
        }

        for(const player of this.playerList){
            if(voteTargets.includes(player) === false){
                voteCount[player.index] = 0
            }
        }

        if(voteType === 'lynchVote')
            this.sendEventToAll(`SetLynchVoteCount`, voteCount)
        
        // 如果定义了最小票数，达到最小票数的玩家对象将被返回(lynchVote)
        // 否则得票最高的玩家将被返回，可以返回多个(MafiaKillVote)
        if(voteNeeded !== undefined){
            for(const [index, vc] of voteCount.entries()){
                if(vc >= voteNeeded){
                    return this.playerList[index]
                }
            }
            return undefined
        }else{
            const voteMax = voteCount.reduce((a, b) => Math.max(a, b), -Infinity);

            if(voteMax > 0){
                let voteMaxIndexArray = voteCount.map((vc, idx) => {return  vc === voteMax ? idx:undefined}).filter(vidx => vidx !== undefined)
                if(voteMaxIndexArray.length > 0)
                    return voteMaxIndexArray.map((idx) => this.playerList[idx])
            }
            return undefined
        }
    }

    async trialCycle(player){
        let trialLenghtMin = this.setting.trialTime

        this.trialTarget = player
        this.sendEventToAll("SetTrialTarget", this.trialTarget)
        if(this.setting.enableTrialDefense){
            await this.newGameStage("day/trial/defense", trialLenghtMin/2)
            await this.newGameStage("day/discussion/trial/trialVote", trialLenghtMin/2)
        }
        else{
            await this.newGameStage("day/discussion/trial/trialVote", trialLenghtMin)
        }
    }

    async execution(player){
        let executionLenghtMin = 0.4 // 0.4 * 60 = 24s

        // "day" stage end
        this.gameStage.end()
        this.executionTarget = player
        this.sendEventToAll("SetExecutionTarget", this.executionTarget)
        await this.newGameStage("day/execution/lastWord", executionLenghtMin/2)
        player.isAlive = false
        player.deathReason = "Execution"

        this.recentlyDeadPlayers = []
        this.recentlyDeadPlayers.push(player)

        this.sendEventToAll('SetRecentlyDeadPlayers', this.recentlyDeadPlayers.map(p => this.getPlayerDeathDeclearData(p)))
        await this.newGameStage("animation/execution/deathDeclear", this.recentlyDeadPlayers.length * 0.1)
        this.executionTarget = undefined

        await this.newGameStage("day/execution/discussion", executionLenghtMin/2)
        await this.victoryCheck()

        if(this.status !== "end")
            this.nightCycle()
    }

    // getDDD, Ha
    getPlayerDeathDeclearData(deadPlayer){
        let data = {}
        data.index = deadPlayer.index
        data.deathReason = deadPlayer.deathReason
        if(this.setting.revealPlayerRoleOnDeath)
            data.roleName = deadPlayer.role.name
        if(this.setting.enableLastWill)
            data.lastWill = deadPlayer.lastWill
        if(this.setting.enableKillerMessage)
            data.messageLeftByKiller = deadPlayer.messageLeftByKiller

        return data
    }

    async victoryCheck(){
        let town_ap_l = this.queryAlivePlayersByRoleTag("Town").length
        let mafia_ap_l = this.queryAlivePlayersByRoleTag("Mafia").length
        
        if(town_ap_l === 0){
            this.winningFaction = "Mafia"
            this.winners = this.queryAlivePlayersByRoleTag("Mafia")
        }else if(mafia_ap_l === 0){
            this.winningFaction = "Town"
            this.winners = this.queryAlivePlayersByRoleTag("Town")
        }else if(this.setting.protectCitizensMode === true){
            let citizens_ap_l = this.queryAlivePlayersByRoleName("Citizen").length
            if(citizens_ap_l === 0){
                this.winningFaction = "Mafia"
                this.winners = this.queryAlivePlayersByRoleTag("Mafia")
            }
        }
        
        if(this.winningFaction !== undefined){
            this.sendEventToAll("SetWinner", {winningFactionName:this.winningFaction, winners:this.winners})
            this.sendEventToAll("SetCast", this.playerList.map(p => p.toJSON_includeRole()))

            await this.newGameStage("end", 0.2)
            this.room.endGame()
        }
        else if(this.onlinePlayerList.length === 0){
            this.status = 'end'
            this.room.endGame()
        }
    }

    queryAlivePlayersByRoleTag(tagString){
        return this.alivePlayerList.filter((p)=>{
            return p.role.tagStrings.includes(tagString)
        })
    }

    queryAlivePlayersByRoleName(roleName){
        return this.alivePlayerList.filter((p)=>{
            return p.role.name === roleName
        })
    }

    userQuit(user){
        let player = this.playerList.find(p => p.user === user)
        this.sendEventToGroup(this.onlinePlayerList, "PlayerQuit", player)
        if(user === this.host.user)
            this.repickHost(this.getNewRandomHost())

        player.user = undefined
        // todo: AFK Kill

        if(this.onlinePlayerList.length === 0){
            this.status = 'end'
            this.gameStage?.abort()
            this.room.endGame()
        }
    }
}

function getRandomElement(arr){
    const randomIndex = Math.floor(Math.random() * arr.length)
    return arr[randomIndex]
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function isValidIndex(index, arrayLength) {
    return Number.isInteger(index) && index >= 0 && index < arrayLength;
}

function filterAndRemove(array, condition) {
    let newArray = array.filter(condition)

    for (let i = array.length - 1; i >= 0; i--) {
        if (condition(array[i])) {
            array.splice(i, 1)
        }
    }

    return newArray
}

function interleaveArrays(arr1, arr2) {
    let result = [];
    let maxLength = Math.max(arr1.length, arr2.length);

    for (let i = 0; i < maxLength; i++) {
        if (i < arr1.length) {
            result.push(arr1[i]);
        }
        if (i < arr2.length) {
            result.push(arr2[i]);
        }
    }

    return result;
}

function weightedRandom(possibleRoles) {
    const totalWeight = possibleRoles.reduce((sum, role) => sum + role.weight, 0)

    const randomNum = Math.random() * totalWeight

    let cumulativeWeight = 0

    for (let i = 0; i < possibleRoles.length; i++) {
        cumulativeWeight += possibleRoles[i].weight
        if (randomNum < cumulativeWeight) {
            return possibleRoles[i].name
        }
    }

    return undefined
}

function calculateProbability(roleName, possibleRoles) {
    const totalWeight = possibleRoles.reduce((sum, role) => sum + role.weight, 0)

    const roleWeight  = possibleRoles.find(r => r.name === roleName).weight
    const probability = roleWeight / totalWeight

    return probability
}

class Player{
    constructor(user){
        this.user = user
        this.playedRoleNameRecord = []
    }

    get uuid(){
        return this.user?.uuid
    }

    get name(){
        return this.nickname !== undefined ? this.nickname : 
            this.user !== undefined ? this.user.name : "OfflinePlayer"
    }

    set name(name){
        this.nickname = name
    }

    get hasCustomName(){
        return 'nickname' in this
    }

    get index(){
        return this.playerList.indexOf(this)
    }

    get isOnline(){
        return this.user === undefined ? false : true
    }

    setPlayerList(playerList){
        this.playerList = playerList
    }

    sendEvent(eventType, data){
        if(this.user !== undefined)
            this.user.sendEvent(eventType, data)
    }

    getTargetIndex(type){
        type = type.charAt(0).toLowerCase() + type.slice(1)
        return this[`${type}TargetIndex`] ?? undefined
    }

    setTargetIndex(type, targetIndex){
        type = type.charAt(0).toLowerCase() + type.slice(1)
        let ti = Number(targetIndex)
        this[`${type}TargetIndex`] = isValidIndex(ti, this.playerList.length) ? ti : undefined
    }

    resetCommonProperties(){
        // this.lynchVoteTargetIndex = undefined
        for (const key of Object.keys(this)) {
            if(key.endsWith("TargetIndex"))
                this[key] = undefined
        }
    }

    setRole(roleMeta){
        this.playedRoleNameRecord.push(roleMeta.name)
        const player = this
        this.role = new Proxy({
            player,
            roleMeta,
            useAblity(data){
                this.roleMeta.useAblity(this.player, data)
            },
        }, {
            get(target, prop) {
                return prop in target ? target[prop] : target.roleMeta[prop]
            }
        })
        this.role.roleMeta.setRoleData(this)
    }

    toJSON_includeRole(){
        return {
            name: this.name,
            index:this.index,
            role:this.role
        }
    }

    toJSON(){
        return {
            name: this.name,
            userName: this.user.name,
            index:this.index,
            hasCustomName:this.hasCustomName,
        }
    }
}

class Timer{
    constructor(callback, delayMin, go){
        this.callback = callback
        this.delay = 1000 * 60 * delayMin

        if(go)
            this.start()
    }

    get remainingTime(){
        if(this.id){
            return this.delay - (Date.now() - this.startTime)
        }else{
            return undefined
        }
    }

    start(){
        if(!this.id){
            this.startTime = Date.now()
            this.id = setTimeout(()=>{this.tick()}, this.delay)
        }
    }

    pause(){
        if(this.id){
            this.delay = this.remainingTime
            this.clear()
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