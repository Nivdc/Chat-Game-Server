import { arraysEqual, getRandomElement } from "./utils.js"

export const originalGameData = {
    factions: [
        {
            name:'Town',
            roleVariationList:[
                {
                    abilityNames:undefined,
                    name: "Citizen",
                },
                {
                    abilityNames:['Detect'],
                    name: "Sheriff",
                },
                {
                    abilityNames:['Heal'],
                    name: "Doctor",
                },
                {
                    abilityNames:['RoleBlock'],
                    name: "Escort",
                },
                {
                    defaultTeamName:"DetectTeam",
                    name: "AuxiliaryOfficer",
                },
            ]
        },
        {
            name:'Mafia',
            allMembersAreOnDefaultTeam:'AttackTeam',
            roleVariationList:[
                {
                    abilityNames:undefined,
                    name: "Mafioso",
                },
                {
                    abilityNames:['RoleBlock'],
                    name:'Consort'
                }
            ],
        }
    ],
    tags: [
        {
            name: "Killing",
            includeRoleNames: [
                "Mafioso"
            ]
        },
        {
            name:"Team",
            includeRoleNames: [] // auto generate
        }
    ],

    // ability其实很简单，它就是驱动逻辑
    // 玩家使用了某项技能之后，它就会根据游戏数据改变游戏数据，就这么简单
    // 根据改变时机的不同，ability有两种效果，立刻改变游戏数据，或是延迟到夜晚再改变游戏数据。
    // 团队使用的ability和个人是一样的，区别在于团队通过机制和投票选出执行人和目标，且会在生成action的时候附带一些team数据。

    // 记住，无论你想要实现多么复杂的功能，game这个大对象里面已经包含了一切所需要的数据，it is All in One.

    // 在编写generateNightAction的时候我们要注意，虽然action这个命名隐含着强烈的动作意味
    // 但在这个游戏中，action是，且只是一种数据，一种abilityRecord，
    // 它的作用是帮助gameDirector判断夜间发生了什么，并最终结算结果

    // 如果说gameDirector是线下游戏的主持人，那么这个action就是玩家在夜间递给主持人的小纸条
    // 上面写明了自己想要在今晚干什么

    // 也就是说使用一个ability分为两个部分，能不能用ability？ 和 用了ability会产生什么效果？
    // 此处的ability只用于解决第一个问题，第二个问题则要交由gameDirector处理
    // 我觉得这么做是很自然且符合逻辑，试想如果我们在线下玩这类游戏，如果我想要声明我今晚要攻击你，
    // 我是会直接对你：“你今晚被我攻击了”，然后你再来告诉我：“我死了”或者是“我身上有防弹衣，所以我不会死”吗？
    // 肯定不会是这样，肯定是要由主持人来结算夜间发生的事情的

    // 也许在其他游戏中攻击的实现方法不是这样的，但是在这个游戏中，我觉得只有这样才是正确的。

    // 两种特殊的ability类型Attack和Protect将会有特殊的处理行为。
    abilities:{
        targetedAbilities:[
            {
                name:"Attack",
                type:"Attack",
                verify(game, userIndex, targetIndex, previousTargetIndex){
                    const userIsAlive = game.playerList[userIndex].isAlive
                    const targetIsAlive = game.playerList[targetIndex].isAlive
                    const targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
            
                    return userIsAlive && targetIsAlive && targetIsNotPreviousTarget
                },
                teamVoteData:{
                    name:`AttackVote`,
                    verify(game, voterIndex, targetIndex, previousTargetIndex){
                        const voterIsAlive = game.playerList[voterIndex].isAlive
                        const targetIsAlive = game.playerList[targetIndex].isAlive
                        const targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                        // 为什么要限制黑手党在晚上投票呢？白天也可以投啊
                        // const gameStatusIsNighdataiscussion = (this.status === 'night/discussion')
                        // 为什么要限制黑手党给自己人投票呢？我觉得他可以啊
                        // const targetIsNotMafia = (this.queryAlivePlayersByRoleTag('Mafia').map(p => p.index).includes(targetIndex) === false)
                        return voterIsAlive && targetIsAlive && targetIsNotPreviousTarget
                    },
                    getResultIndexArray(game, count){
                        const voteMax = count.reduce((a, b) => Math.max(a, b), -Infinity);

                        if(voteMax > 0){
                            const voteMaxIndexArray = count.map((vc, idx) => {return  vc === voteMax ? idx:undefined}).filter(vidx => vidx !== undefined)
                            return voteMaxIndexArray
                        }
                        return undefined
                    },
                },
            },
            {
                name:"Heal",
                type:"Protect",
                verify(game, userIndex, targetIndex, previousTargetIndex){
                    const userIsAlive = game.playerList[userIndex].isAlive
                    const userIsNotTarget = (userIndex !== targetIndex)
                    const targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                    const targetIsNotDead_yet = game.playerList[targetIndex].isAlive
                    return userIsAlive && userIsNotTarget && targetIsNotPreviousTarget && targetIsNotDead_yet
                },
            },
            {
                name:"RoleBlock",
                verify(game, userIndex, targetIndex, previousTargetIndex){
                    const userIsAlive = game.playerList[userIndex].isAlive
                    const userIsNotTarget = (userIndex !== targetIndex)
                    const targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                    const targetIsAlive = game.playerList[targetIndex].isAlive
                    const targetIsNotUserTeamMember = (game.playerList[userIndex].team?.playerList.map(p => p.index).includes(targetIndex) !== true)
                    return userIsAlive && userIsNotTarget && targetIsNotPreviousTarget && targetIsAlive && targetIsNotUserTeamMember
                },
            },
            {
                name:"Detect",
                verify(game, userIndex, targetIndex, previousTargetIndex){
                    const userIsAlive = game.playerList[userIndex].isAlive
                    const userIsNotTarget = (userIndex !== targetIndex)
                    const targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                    const targetIsAlive = game.playerList[targetIndex].isAlive
                    return userIsAlive && userIsNotTarget && targetIsNotPreviousTarget && targetIsAlive
                },
                teamVoteData:{
                    name:`DetectVote`,
                    verify(game, voterIndex, targetIndex, previousTargetIndex){
                        const voterIsAlive = game.playerList[voterIndex].isAlive
                        const targetIsAlive = game.playerList[targetIndex].isAlive
                        const targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                        const targetIsNotAuxiliaryOfficer = (game.playerList[voterIndex].team.playerList.map(p => p.index).includes(targetIndex) === false)
                        return voterIsAlive && targetIsAlive && targetIsNotPreviousTarget && targetIsNotAuxiliaryOfficer
                    },
                    getResultIndexArray(game, count){
                        const voteMax = count.reduce((a, b) => Math.max(a, b), -Infinity);

                        if(voteMax > 0){
                            const voteMaxIndexArray = count.map((vc, idx) => {return  vc === voteMax ? idx:undefined}).filter(vidx => vidx !== undefined)
                            return voteMaxIndexArray
                        }
                        return undefined
                    },
                },
            }
        ]
    },
    // 
    roles: [
    ],
    votes: [
        {
            name: "LynchVote",
            verify: (game, voterIndex, voteData, previousVoteData)=>{
                const targetIndex = voteData
                const previousTargetIndex = previousVoteData
                if(Number.isInteger(targetIndex)){
                    let voterIsAlive = game.playerList[voterIndex].isAlive
                    let targetIsAlive = game.playerList[targetIndex]?.isAlive
                    let targetIsNotPreviousTarget = (targetIndex !== previousTargetIndex)
                    // 为什么玩家不能给自己投票？我觉得他可以啊
                    // let targetIsNotVoter = (voterIndex !== targetIndex)
                    let gameStatusIncludesLynchVote = game.status.split('/').includes('lynchVote')
                    return voterIsAlive && targetIsAlive && targetIsNotPreviousTarget && gameStatusIncludesLynchVote
                }
                else{
                    return false
                }
            },
            getResultIndex(game, count){
                const apll = game.alivePlayerList.length
                const voteNeeded = apll % 2 === 0 ? ((apll / 2) + 1) : Math.ceil(apll / 2)
                const resultIndex = count.findIndex(c => c >= voteNeeded)
                return  resultIndex >= 0 ? resultIndex : undefined
            }
        },
        {
            name: "TrialVote",
            verify: (game, voterIndex, voteData, previousVoteData)=>{
                if(typeof(voteData) === 'boolean'){
                    let voterIsAlive = game.playerList[voterIndex].isAlive
                    let voterIsNotTrialTarget = voterIndex !== game.trialTarget?.index
                    let voteDataIsNotPreviousVoteData = voteData !== previousVoteData
                    let gameStatusIncludesTrialVote = game.status.split('/').includes('trialVote')
                    return voterIsAlive && voterIsNotTrialTarget && voteDataIsNotPreviousVoteData && gameStatusIncludesTrialVote
                }
            },
            getResultBoolean(game, record){
                const guiltyCount = record.filter(r => r === true).length
                const innocentCount = record.filter(r => r === false).length

                return guiltyCount > innocentCount
            }
        }

    ],
    teams: [
        {
            name: "AttackTeam",
            abilityNames:['Attack'],
        }, 

        {
            name:"DetectTeam",
            abilityNames:['Detect'],
        }
    ]
}

// 兜兜转转又回来了...
gameDataInit()
function gameDataInit(){
    rolesInit()
    tagsInit()
    
    function rolesInit(){
        for(const f of originalGameData.factions){
            if('roleVariationList' in f){
                for(const rv of f.roleVariationList){
                    let role = {
                        name:rv.name,
                        defaultAffiliationName:f.name,
                        abilityNames:rv.abilityNames,
                        defaultTeamName:rv.defaultTeamName,
                    }

                    for (const keyName in role) {
                        if (role[keyName] === undefined) {
                            delete role[keyName]
                        }
                    }

                    originalGameData.roles.push(role)
                }
            }
        }
    }

    function tagsInit(){
        const tagSet = originalGameData.tags
        const teamTag = tagSet.find(t => t.name === 'Team')
    
        if(teamTag.includeRoleNames.length === 0){        
            const defaultAffiliationTable = getDefaultAffiliationTable()
            for(const f of originalGameData.factions){
                if('allMembersAreOnDefaultTeam' in f){
                    const factionMemberRoleNames = defaultAffiliationTable.find(fTag => fTag.name === f.name).includeRoleNames
                    teamTag.includeRoleNames = teamTag.includeRoleNames.concat(factionMemberRoleNames)
                }
            }
    
            for(const r of originalGameData.roles){
                if('defaultTeamName' in r && r.defaultTeamName !== undefined){
                    if(teamTag.includeRoleNames.includes(r.name) === false){
                        teamTag.includeRoleNames.push(r.name)
                    }
                }
            }
        }

        for(const role of originalGameData.roles){
            if(role.tags === undefined){
                let tags = originalGameData.tags.map(t => t.includeRoleNames.includes(role.name)? t.name:undefined).filter(t => t !== undefined)
                tags = tags.length > 0 ? tags : undefined
        
                if(tags !== undefined)
                    role.tags = tags
            }
        }
    }
}

// 指向性技能类
// 注意在这个类中代理对象会优先调用data里面的同名数据
// 也就是说，除非data里面的存在相应的函数，否则的话，
// TargetedAbility将会遵循类中定义的默认行为
class TargetedAbility{
    constructor(game, player, role, abilityName){
        this.game = game
        this.player = player

        this.data = originalGameData.abilities.targetedAbilities.find(a => a.name === abilityName)
        if(this.data === undefined) console.error(`Unknow Ability: ${abilityName}`);
        if(this.data.verify === undefined) console.error(`Ability: ${abilityName} has no 'verify' Function`);

        this.state = {
            unableToUse:false,
            consecutiveUsageCount:0,
            usageCount:0,
        }

        if(role?.modifyObject?.['consecutiveAbilityUses_2_Cause_1_NightCooldown']){
            const consecutiveAbilityUsesLimit = 2
            const causeNightColldownNumber = 1
            Object.defineProperty(this.state, 'unableToUse', {
                get: function(){
                    let v = (this.consecutiveUsageCount + 1) % (consecutiveAbilityUsesLimit + causeNightColldownNumber)
                    if(v === 0)
                        v = (consecutiveAbilityUsesLimit + causeNightColldownNumber)

                    return v > consecutiveAbilityUsesLimit
                }
            })
        }

        return new Proxy(this, {
            get(target, prop) {
                return prop in target.data ? target.data[prop] : target[prop]
            }
        })
    }

    use(game, data){
        const target = game.playerList[data.targetIndex]
        if(this.verify(game, this.player.index, target.index) && this.state.unableToUse === false){
            this.target = target
            this.player.sendEvent('UseAblitySuccess', data)
        }else{
            this.player.sendEvent('UseAblityFailed', data)
        }
    }

    cancel(game, data){
        this.target = undefined
        this.player.sendEvent('UseAblityCancelSuccess', data)
    }

    generateNightAction(){
        if(this.target !== undefined){
            const abilityTarget = this.target
            this.target = undefined
            this.state.usageCount ++
            this.state.consecutiveUsageCount ++
            return {name:this.name, type:this.type, origin:this.player, target:abilityTarget}
        }else{
            this.state.consecutiveUsageCount = 0
            return undefined
        }
    }

    createAbilityTeamVote(game){
        const v = new Vote(game, this.teamVoteData)
        v.isTeamVote = true
        return v
    }

    generateTeamNightAction(executor, target){
        if(executor && target){
            return {name:this.name, type:this.type, origin:executor, target}
        }
        return undefined
    }
}

// 仁慈的父，我已坠入，看不见罪的国度，请原谅我的自负~
export class Role{
    constructor(game, player, roleData){
        this.game = game
        this.player = player
        this.name   = roleData.name

        const defaultRoleData = originalGameData.roles.find(r => r.name === roleData.name)
        this.affiliationName = roleData.affiliationName ?? defaultRoleData.defaultAffiliationName

        const factionMemberDefaultTeamName = originalGameData.factions.find(f => f.name === this.affiliationName).allMembersAreOnDefaultTeam
        this.teamName = roleData.teamName ?? defaultRoleData.defaultTeamName ?? factionMemberDefaultTeamName

        const abilityNames = defaultRoleData.abilityNames
        if(abilityNames !== undefined){
            this.abilities = []
            for(const aName of abilityNames){
                this.abilities.push(new TargetedAbility(this.game, this.player, this, aName))
            }
        }

        if(this.modifyObject){
            for(const keyName in this.modifyObject ){
                if(keyName.startsWith('hasEffect_')){
                    const effectName = keyName.split('_')[1]
                    if(this.modifyObject[keyName])
                        this.addEffect(effectName)
                }
            }
        }
    }

    get modifyObject(){
        const roleNameLowerCase = this.name.charAt(0).toLowerCase() + this.name.slice(1)
        return this.game.setting.roleModifyOptions[roleNameLowerCase]
    }

    useAblity(data){
        if(this.abilities.length === 1){
            var ability = this.abilities[0]
        }
        else if('name' in data){
            var ability = this.abilities.find(a => a.name === data.name)
        }

        ability?.use(this.game, data)
    }

    useAblityCancel(data){
        if(this.abilities.length === 1){
            var ability = this.abilities[0]
        }
        else if('name' in data){
            var ability = this.abilities.find(a => a.name === data.name)
        }

        ability?.cancel(this.game, data)
    }

    generateNightActions(){
        const actions = []
        if(this.abilities !== undefined)
        for(const a of this.abilities){
            const action = a.generateNightAction()
            if(action !== undefined)
                actions.push(action)
        }

        return actions
    }

    // ......嗯对，这里有个可以多重继承的东西...但是我更宁愿手动复制一下
    #effetcs = []
    addEffect(name, durationTurns = Infinity){
        this.#effetcs.push({name, durationTurns})
    }
    removeEffect(eName){
        this.#effetcs = this.#effetcs.filter(e => e.name !== eName)
    }
    hasEffect(eName){
        return this.#effetcs.map(e => e.name).includes(eName)
    }
    reduceEffectsDurationTurns(){
        this.#effetcs.forEach(e => e.durationTurns -= 1)
        this.#effetcs = this.#effetcs.filter(e => e.durationTurns > 0)
    }

    toJSON(){
        return {
            name:this.name,
            abilityNames:this.abilities?.map(a => a.name)
        }
    }
}

// 在这个类中，
// record记录了谁投票给谁，record[1]读取出来的就是2号玩家投票的对象
// 而count记录的是得票情况，count[1]读取出来的就是2号玩家得了几票
export class Vote{
    constructor(game, data){
        this.game = game
        this.data = data
        this.record = new Array(game.playerList.length).fill(undefined)

        if(Object.keys(data).find(k => k.startsWith('getResult')) === undefined)
            console.error(data.name, ' Unable to get results')
    }

    get name(){
        return this.data.name
    }

    get type(){
        return this.data.name
    }

    playerVote(voterIndex, voteData){
        const previousVoteData = this.record[voterIndex]
        const success = this.verify(this.game, voterIndex, voteData, previousVoteData)
        if(success){
            this.record[voterIndex] = voteData
            const voteCount = this.getCount()
            return {success, previousVoteData, voteCount}
        }

        return {success:false}
    }

    playerVoteCancel(voterIndex){
        const previousVoteData = this.record[voterIndex]
        if(previousVoteData !== undefined){
            this.record[voterIndex] = undefined
            const voteCount = this.getCount()
            return {success:true, previousVoteData, voteCount}
        }

        return {success:false}
    }

    getCount(){
        let count = new Array(this.record.length).fill(0)
        for(const [voterIndex, targetIndex] of this.record.entries()){
            const p = this.game.playerList[voterIndex]
            if(targetIndex !== undefined){
                let voteWeight = `${this.type}Weight` in p.role ? p.role[`${this.type}Weight`] : 1
                if(this.isTeamVote && p.role.hasEffect('TeamLeader')){
                    voteWeight = (p.team.playerList.length + 1)
                }

                count[targetIndex] += voteWeight
            }
        }

        return count
    }

    getResult(){
        if('getResultIndex' in this.data)
            return this.data.getResultIndex(this.game, this.getCount())
        else if('getResultBoolean' in this.data)
            return this.data.getResultBoolean(this.game, this.record)
        else if('getResultIndexArray' in this.data)
            return this.data.getResultIndexArray(this.game, this.getCount())
    }

    getResultIndex(){
        if('getResultIndex' in this.data)
            return this.data.getResultIndex(this.game, this.getCount())
    }

    getResultIndexArray(){
        if('getResultIndexArray' in this.data)
            return this.data.getResultIndexArray(this.game, this.getCount())
    }

    resetRecord(){
        this.record = this.record.fill(undefined)
    }

    verify(game, voterIndex, voteData, previousTargetIndex){
        return this.data.verify(game, voterIndex, voteData, previousTargetIndex)
    }
    // cancelVerify(game, record, voterIndex){
    //     return this.data.cancelVerify(game, record, voterIndex)
    // }
}

// Team原本的设计是与玩家的身份完全隔离的，它只是一种PlayerGroup
// 也就是说游戏是支持将玩家分组到各个团队里面的，但是我发现我们做不到完全隔离
// 因为这里面临着一个团队行动由谁来执行，抽取执行人的问题（以及团队领袖有额外投票权的问题
// 所以...目前的解决方案就是写死在代码里面，Mafia执行人就是Mafioso，三和就是暴徒，共济会就是长老，邪教就是邪教徒
// 除此之外，游戏还会在白天开始时检测团队有无执行人，并检测团队有无可变身为执行人的角色
// 如果没有预定的角色名，则会在团队成员中随机抽取
export class Team{
    constructor(game, affiliationName, teamName){
        this.game = game
        this.name = teamName
        this.affiliationName = affiliationName

        this.playerList = []

        const data = originalGameData.teams.find(t => t.name === this.name)
        if(data === undefined)
            console.error('Unknow TeamName:', this.name)

        if('abilityNames' in data){
            this.abilities = []
            this.abilityVotes = []
            for(const aName of data.abilityNames){
                const ability = new TargetedAbility(this.game, undefined, undefined, aName)
                this.abilities.push(ability)
                this.abilityVotes.push(ability.createAbilityTeamVote(game))
            }
        }
    }

    sendEventToAliveMember(eventType, data){
        return this.game.sendEventToGroup(this.alivePlayerList, eventType, data)
    }

    get alivePlayerList(){
        return this.playerList.filter(p => p.isAlive)
    }

    get defaultExecutionRoleName(){
        const defaultExecutionRoleNameList = {
            'Town':{
                'DetectTeam':'AuxiliaryOfficer',
            },
            'Mafia':{
                'AttackTeam':'Mafioso',
            },
        }

        return defaultExecutionRoleNameList[this.affiliationName][this.name]
    }

    get defaultExecutionMembers(){
        return this.alivePlayerList.filter(p => p.role.name === this.defaultExecutionRoleName)
    }

    get executableTeamMembers(){
        if(this.defaultExecutionMembers.length === 0){
            var canBeExecutorMembers = this.alivePlayerList.filter(p => p.role.modifyObject?.['canBeTeamActionExecutor'] === true)
        }
        return this.defaultExecutionMembers.length > 0 ? this.defaultExecutionMembers : canBeExecutorMembers
    }

    checkTeamHasActionExecutor(){
        if(this.defaultExecutionMembers.length === 0){
            const convertiblePlayer = this.alivePlayerList.find(p => p.role.modifyObject?.['canBeTurnedIntoTeamExecutor'] === true)
            if(convertiblePlayer !== undefined){
                convertiblePlayer.setRole({name:this.defaultExecutionRoleName})
                this.sendEventToAliveMember('SetTeam', this)
            }
        }
    }

    playerVote(voter, voteData){
        if(this.abilities.length === 1){
            const ability = this.abilities[0]
            const vote = this.abilityVotes[0]
            const voterIndex = voter.index
            const targetIndex = voteData
            const oldAbilityTargets = vote.getResultIndexArray()
            const {success, previousTargetIndex, voteCount} = vote.playerVote(voterIndex, voteData)
            if(success){
                this.sendEventToAliveMember('TeamVote', {teamAbilityName:ability.name, voterIndex, targetIndex, previousTargetIndex})

                const newAbilityTargets = vote.getResultIndexArray()
                if(arraysEqual(oldAbilityTargets, newAbilityTargets) === false){
                    this.sendEventToAliveMember('TeamAbilityTargetsNotice', {teamAbilityName:ability.name, targets:newAbilityTargets})
                }
            }
        }
    }
    playerVoteCancel(voter, voteData){
        if(this.abilities.length === 1){
            const ability = this.abilities[0]
            const vote = this.abilityVotes[0]
            const voterIndex = voter.index
            const oldAbilityTargets = vote.getResultIndexArray()
            const {success, previousTargetIndex, voteCount} = vote.playerVoteCancel(voterIndex)
            if(success){
                this.sendEventToAliveMember('TeamVoteCancel', {teamAbilityName:ability.name, voterIndex, previousTargetIndex})
                
                const newAbilityTargets = vote.getResultIndexArray()
                if(arraysEqual(oldAbilityTargets, newAbilityTargets) === false){
                    this.sendEventToAliveMember('TeamAbilityTargetsNotice', {teamAbilityName:ability.name, targets:newAbilityTargets})
                }
            }
        }
    }

    generateNightActions(){
        let actionSequence = []
        for(const [index, ability] of this.abilities.entries()){
            const actionExecutor = getRandomElement(this.executableTeamMembers)

            const abilityVote = this.abilityVotes[index]
            if(abilityVote.getResultIndexArray() !== undefined){
                const abilityTargetIndex = getRandomElement(abilityVote.getResultIndexArray())
                const abilityTarget = this.game.playerList[abilityTargetIndex]

                const action = ability.generateTeamNightAction(actionExecutor, abilityTarget)
                if(action !== undefined){
                    action.isTeamAction = true
                    actionSequence.push(action)
                    this.sendEventToAliveMember('TeamNightActionNotice', {name:action.name, originIndex:action.origin.index, targetIndex:action.target.index})
                }
            }

            abilityVote.resetRecord()
        }

        return actionSequence
    }

    toJSON(){
        return {
            name:this.name,
            affiliationName:this.affiliationName,
            abilityNames:this.abilities?.map(a => a.name),
            memberPlayerData:this.playerList.map(p => p.toJSON_includeRole())
        }
    }
}

// // 下面这个输出是用来调试的，和浏览器环境不兼容因此只能注释掉
// if(require.main === module){
//     // console.log(gameDataInit({playerList:[]}))
//     // console.log(getDefaultAffiliationTable())
//     console.log(originalGameData)
// }

function extractNumbers(str) {
    return str.match(/\d+/g).map(Number) ?? []
}

export function getRoleTags(roleName){
    const role = originalGameData.roles.find(r => r.name === roleName)
    return role.tags
}

export function abilityUseVerify(game, abilityName, userIndex, targetIndex, previousTargetIndex){
    const ability = originalGameData.abilities.targetedAbilities.find(a => a.name === abilityName)
    return ability?.verify(game, userIndex, targetIndex, previousTargetIndex)
}

export function teamVoteVerify(game, team, teamAbilityName, {voterIndex, targetIndex, previousTargetIndex}){
    const voteVerify = originalGameData.abilities.targetedAbilities.find(a => a.name === teamAbilityName).teamVoteData.verify
    return voteVerify(game, voterIndex, targetIndex, previousTargetIndex)
}

export function publicVoteVerify(game, voteTypeName, {voterIndex, targetIndex, previousTargetIndex}){
    const vote = originalGameData.votes.find(v => v.name === voteTypeName)
    return vote.verify(game, voterIndex, targetIndex, previousTargetIndex)
}

export function getDefaultAffiliationTable(){
    let  defaultAffiliationTable = []
    const roles = originalGameData.roles
    const factionNameSet = new Set(roles.map(r => r.defaultAffiliationName))
    for(const factionName of factionNameSet){
        defaultAffiliationTable.push({
            name:factionName,
            includeRoleNames:roles.filter(r => r.defaultAffiliationName === factionName).map(r => r.name)
        })
    }

    return defaultAffiliationTable
}