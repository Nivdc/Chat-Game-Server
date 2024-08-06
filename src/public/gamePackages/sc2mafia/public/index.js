let socket = undefined

document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        loading:true,
        watchIgnore:false,
        setting:{},

        async init() {
            this.setting = cloneDeep(this.presets[0].setting)
            this.socketInit()
            sendEvent("FrontendReady")
            this.roleSetInit()
            this.loading = false
            // this.playAnimation('begin')
            // setTimeout(()=>{
            //     this.playAnimation('dayToNight')
            //     setTimeout(()=>{
            //         this.playAnimation('nightToDay')
            //         setTimeout(()=>{
            //             this.playAnimation('dayToNight')
            //         }, 10000)
            //     }, 10000)
            // }, 10000)


            this.$watch('setting', (value, oldValue)=>{
                if(this.watchIgnore === false){
                    sendEvent("HostChangesGameSetting", value)
                    
                }else{
                    this.watchIgnore = false
                }
            })
        },
        socketInit(){
            socket = window.top.socket
            window.top.game_onmessage = onMessage

        
            if(socket === undefined){
                console.log("调试模式，事件将不会被发送到服务器。")
                socket = {send:console.log}
            }

            for(const eventName in this.eventHandler){
                window.addEventListener(eventName, (e)=>{
                    this.eventHandler[eventName].call(this, e.detail)
                })
            }
        },

        eventHandler:{
            'HostChangesGameSetting':function(data){
                this.watchIgnore = true
                this.setting = data
            },

            "SetHost":function (data){
                this.host = this.playerList[data.index]
                let message = {parts:[]}
                message.parts.push(this.host.getNameMessagePart())
                message.parts.push({text:'  是新的主机', class:'text-warning'})
                if(this.isRunning === false)
                    this.addMessage(message)
            },

            'SetPlayerList':function(data){
                let playerDatas = data
                let playerColors = [
                    "red", "blue", "87CEFA",
                    "purple", "yellow", "FF6811",
                    "228B22", "FFC0EA", "8A2BE2",
                    "D3D3D3", "006400", "8B4513",
                    "98FB98", "696969", "fuchsia"
                ];

                this.playerList = playerDatas.map(pd => new Player(pd, playerColors[pd.index]))
            },

            // 'SetRoleSet':function(data){},
            // 'InitCompleted':function(data){this.loading = false},
            
            'ChatMessage':function(data){
                let message = {parts:[]}
                let sender  = this.playerList[data.sender.index]
                message.parts.push(sender.getNameMessagePart(': '))
                message.parts.push({text:data.message})
                this.addMessage(message)
            },

            'HostSetupGame':function(){
                this.addMessageWithoutLog({text:"游戏将在15秒后开始", style:"color:LawnGreen;"})
                this.startButtonToggle = false
            },

            'HostCancelSetup':function(data){
                this.addMessageWithoutLog({text:"主机取消了开始", style:"color:yellow;"})
                this.startButtonToggle = true
            },

            'PlayerQuit':function(data){
                let message = {parts:[], style:'background-color:darkred'}
                let player  = this.playerList[data.index]
                message.parts.push(player.getNameMessagePart())
                message.parts.push({text:' 退出了游戏'})
                this.addMessage(message)
            },

            'SetStatus':function(data){
                this.status = data
                console.log(this.status)
                if(this.status === 'begin'){
                    this.clearMssagesList()
                    this.createTimer('试镜', 0.5, ()=>{this.timer = undefined})
                }
                else if(this.status === 'animation/begin'){
                    this.timer?.clear()
                    this.timer = undefined
                    this.playAnimation('begin')
                }
                else if(this.status === 'animation/nightToDay'){
                    this.playAnimation('nightToDay')
                }
                else if(this.status === 'day/discussion'){
                    this.clearMssagesList()
                    this.playAnimation('showDayCount')
                    this.createTimer('讨论', this.setting.discussionTime, ()=>{this.timer = undefined})
                }
                else if(this.status === 'day/discussion/lynchVote'){
                    if(this.setting.enableDiscussion === false){
                        this.clearMssagesList()
                        this.playAnimation('showDayCount')
                    }
                    this.createTimer('投票', this.setting.dayLength, ()=>{this.timer = undefined})
                }
                else if(this.status === 'day/trial/defense'){
                    this.createTimer('审判辩护', this.setting.trialTime/2, ()=>{this.timer = undefined})
                }
                else if(this.status === 'day/discussion/trial/trialVote'){
                    this.createTimer('审判投票', this.setting.trialTime/2, ()=>{this.timer = undefined})
                }
                else if(this.status === 'day/execution/lastWord'){
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.append(this.executionTarget.getNameMagicString())
                    this.gamePageTipMessage.addText(" 你还有什么遗言吗？")
                    this.gamePageTipMessage.class = 'animation-fadeIn-1s'

                    this.createTimer('临终遗言', 0.4/2, ()=>{this.timer = undefined})
                }
                else if(this.status === 'day/execution/discussion'){
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.append(this.executionTarget.getNameMagicString())
                    this.gamePageTipMessage.addText(" 愿你安息")
                    this.executionTarget = undefined
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                    }, 3000)
                    this.createTimer('行刑追悼', 0.4/2, ()=>{this.timer = undefined})
                }
                else if(this.status === 'animation/dayToNight'){
                    this.playAnimation('dayToNight')
                }
                else if(this.status === 'night/discussion'){
                    this.playAnimation('showDayCount')
                    document.getElementById('music').volume = 1.0
                    document.getElementById('music').currentTime = 0
                    document.getElementById('music').play()
                    this.executionTarget = undefined
                    this.clearMssagesList()
                    this.createTimer('夜晚', this.setting.nightLength, ()=>{this.timer = undefined})
                }
                else if(this.status === 'end'){
                    this.createTimer('谢幕', 0.2)
                    this.addSystemHintText("本局游戏已结束，将在12秒后返回大厅。")
                }
            },

            'PlayerRename':function(data){
                if(data.player.hasCustomName === false)
                    this.addMessage({text:`${data.newName} 进入了城镇`, style:"color:lime;"})
                else
                    this.addMessage({text:`${data.player.name} 将名字改为 ${data.newName}`, style:"color:lime;"})
            },

            'RepickHost':function(data){
                let message = new MagicString()
                let player  = this.playerList[data.player.index]
                message.parts.push(player.getNameMessagePart())
                if(data.targetIndex == null)
                    message.parts.push({text:' 提议重选主机', style:'color:yellow;'})
                else{
                    let target = this.playerList[data.targetIndex]
                    message.parts.push({text:' 提议重选主机为 ', style:'color:yellow;'})
                    message.parts.push(target.getNameMessagePart())
                }
                this.addMessage(message)
            },

            'SetRole':function(data){
                this.myRole = this.roleSet.find(r=>r.name === data.name)
            },

            'SetTeam':function(data){
                this.myTeam = {}
                let teamPlayers = data.map(pd => this.playerList.find(p => p.index === pd.index))
                // console.log('IAmHere!->',teamPlayers)
                teamPlayers.forEach(p => {
                    let playerRoleData = data.find(pd => pd.index === p.index).role
                    p.role = this.roleSet.find(r => r.name === playerRoleData.name)
                })
                this.myTeam.playerList = teamPlayers
                // 这里有一个this指针的绑定问题，暂时就先这样吧
                this.myTeam.getMagicStrings = function(){
                    return this.myTeam.playerList.map(p => {
                        console.log(p, p.role)
                        let ms = new MagicString()
                        ms.append(p.getIndexAndNameMagicString())
                        ms.addText(' (')
                        ms.append(p.role.getNameMessagePart())
                        ms.addText(')')
                        return ms
                    })
                }
            },

            'SetWinner':function(data){
                let winningFaction = this.affiliationSet.find(a => a.name === data.winningFactionName)
                let winners = data.winners.map(dw => this.playerList[dw.index])

                this.gamePageTipMessage = new MagicString()
                this.gamePageTipMessage.addText("我们得到的结果是 ... ")
                this.gamePageTipMessage.append(this.buildAffiliationNameMagicString(winningFaction))
                this.gamePageTipMessage.addText(" 胜利！")
                this.gamePageTipMessage.class = 'animation-fadeIn-1s'
            },

            'SetCast':function(data){
                this.cast = data.map(pd => {
                    let ms = new MagicString
                    ms.append(this.playerList[pd.index].getNameMagicString())
                    ms.addText(" 饰演 ")
                    ms.append(this.roleSet.find(r => r.name === pd.role.name).getNameMessagePart())
                    return ms
                })

                document.getElementById('cast').classList.add('animation-fadeIn-1s')
            },

            'SetExecutionTarget':function(data){
                this.executionTarget = this.playerList[data.index]
            },

            'SetDayCount':function(data){
                this.dayCount = Number(data)
            }
        },
        commandHandler(commandString){
            [command, ...args] = commandString.split(" ")

            switch(command){
                case 'repick':
                    let playerIndex = Number(args.shift())
                    console.log(playerIndex)
                    sendEvent("RepickHost", playerIndex?playerIndex-1:undefined)
                break

                case 'rename':
                    if(this.status === 'begin' && this.setting.enableCustomName)
                        sendEvent("PlayerRename", args.shift())
                break

                case 'lw':
                case 'lastWill':
                    if(this.isRunningAndNoAnimation){
                        if(this.setting.enableLastWill){
                            sendEvent("SetLastWill", args.shift())
                        }else{
                            this.addSystemHintText("本局游戏没有启用遗言")
                        }
                    }else{
                        this.addSystemHintText("当前阶段不允许设置遗言")
                    }
                break
            }
        },
        playAnimation(animationName){
            switch(animationName){
                case 'begin':
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.addText("您将要扮演的角色是 ... ")
                    let mrnmp = this.myRole?.getNameMessagePart()
                    if(mrnmp)
                        mrnmp.style += 'font-weight:bold;'
                    this.gamePageTipMessage.parts.push(mrnmp)
                    this.gamePageTipMessage.class = 'animation-fadeIn-1s'
                    document.getElementById('gamePage').style.display = 'flex'
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                        document.getElementById('gamePageBody').classList.add('animation-fadeIn-3s')
                        document.getElementById('gamePageBody').style.display = 'flex'
                        if(this.setting.startAt.startsWith('day'))
                            document.getElementById('gamePage').classList.add('animation-nightToDay-6s')
                    }, 3000)
                break
                case 'dayToNight':
                    // document.getElementById('gamePage').classList.replace('animation-nightToDay', 'animation-dayToNight')
                    document.getElementById('gamePage').classList.remove('animation-nightToDay-6s')
                    document.getElementById('gamePage').classList.add('animation-dayToNight-6s')

                    this.gamePageTipMessage = new MagicString({text:"不幸的是，再讨论下去太晚了..."})
                    this.gamePageTipMessage.class = 'animation-fadeIn-1s'
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                    }, 3000)
                break
                case 'nightToDay':
                    document.getElementById('gamePage').classList.remove('animation-dayToNight-6s')
                    document.getElementById('gamePage').classList.add('animation-nightToDay-6s')
                    setTimeout(()=>{
                        document.getElementById('music').volume -= 0.25
                        setTimeout(()=>{
                            document.getElementById('music').volume -= 0.25
                            setTimeout(()=>{
                                document.getElementById('music').volume -= 0.25
                                setTimeout(()=>{
                                    document.getElementById('music').volume -= 0.25
                                    document.getElementById('music').pause()
                                }, 1000)
                            }, 1000)
                        }, 1000)
                    }, 1000)
                break
                case 'showDayCount':
                    let time = this.status.startsWith('day') ? '白天' : '夜晚'
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.text  = `${time}  ${this.dayCount}`
                    this.gamePageTipMessage.style = 'font-weight: bold;padding: 0.5em 1em;background-color: rgba(0, 0, 0, 0.2);'
                    this.gamePageTipMessage.class = 'border animation-fadeIn-1s'
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'border animation-fadeOut-2s'
                    }, 3000)
            }
        },

        get isRunning(){
            return this.status?.startsWith('day') || this.status?.startsWith('night') || this.status === 'end' || this.status === 'animation'
        },

        get isRunningAndNoAnimation(){
            return this.isRunning && this.status !== 'animation'
        },

        // 预设栏组件
        selectedPreset:undefined,
        presets : [
            {
                name:"默认",
                description:"默认的设置",
                setting:{
                    dayVoteType: "Majority",
                    dayLength: 1.2,
                    
                    enableTrial: false,
                    enableTrialDefense: true,
                    trialTime: 0.8,
                    pauseDayTimerDuringTrial: true,
                    
                    startAt: "day/No-Lynch",
                    
                    nightType: "Classic",
                    nightLength: 0.6,
                    
                    enableDiscussion: true,
                    discussionTime: 0.3,
                    
                    revealPlayerRoleOnDeath: true,
                    protectCitizensMode:true,
                    enableCustomName: true,
                    enableKillMessage: true,
                    enableLastWill: true,
                    enablePrivateMessage: true,
                    
                    roleList: [
                        "Citizen", "Citizen",
                        "AuxiliaryOfficer", "AuxiliaryOfficer", 
                        "Mafioso", "Mafioso", 
                    ],
                }
            }
        ],
        selectPreset(preset){
            this.selectedPreset = preset
            //todo: 同步选择的预设
        },
        useSelectedPreset(){
            if(this.selectedPreset??false)
                this.setting = cloneDeep(this.selectedPreset.setting)
        },
        importSetting(){
            let importJsonString = prompt("请输入导出字符串: ")
            if(typeof(importJsonString) === 'string'){
                try{
                    this.setting = JSON.parse(window.atob(importJsonString))
                }catch(e){
                    alert("导入错误，请重试。")
                }
            }
        },
        exportSetting(){
            let s = JSON.stringify(this.setting);
            let exportString = window.btoa(s)
            alert("导出结果为: \n\n" + exportString);
        },

        // 聊天框及玩家列表
        messageList:[],
        messageLog:[],
        inputString:'',
        addMessage(message){
            this.addMessageWithoutLog(message)
            this.messageLog.push(message)
        },
        addMessageWithoutLog(message){
            this.messageList.push(message)
            this.$nextTick(()=>{scrollToBottom('chatMessageList')})
        },
        addSystemHintText(text){
            this.addMessageWithoutLog({text, style:'color:NavajoWhite;background-color:rgba(0, 0, 0, 0.1);'})
        },

        playerList:[],
        submit(){
            if(/^\s*$/.test(this.inputString) === false){
                if(/^-/.test(this.inputString) === false){
                    sendEvent("ChatMessage", this.inputString)
                }
                else{
                    let str = this.inputString.substring(1); // remove '-'
                    if(this.status === 'begin' && this.setting.enableCustomName)
                        this.commandHandler(`rename ${str}`)
                    else
                        this.commandHandler(str)
                }
            }
            this.inputString = ''
        },
        clearMssagesList(){
            this.messageList = []
        },

        // 主机和重选主机按钮
        host:{},
        repickHost(){
            this.commandHandler(`repick`)
        },

        //角色目录与列表
        affiliationSet:[
            {
                name:"Town",
                nameZh:"城镇",
                color:"lime",
                goalDescriptionZh:"处死所有罪犯和恶人。"
            },
            {
                name:"Mafia",
                nameZh:"黑手党",
                color:"red",
                goalDescriptionZh:"杀光城镇以及所有想要对抗你们的人。"

            },
            // {
            //     name:"Random",
            //     nameZh:"随机",
            //     color:"#00ccff",
            // },
        ],
        selectedAffiliation:undefined,
        selectAffiliation(affiliation){
            this.selectedAffiliation = affiliation
            this.selectedRole = undefined
        },
        getAffiliationByName(affiliationName){
            return this.affiliationSet.find( a => a.name === affiliationName )
        },
        buildAffiliationNameMagicString(affiliation){
            return new MagicString({text:affiliation.nameZh, style:`color:${affiliation.color}`})
        },

        roleSet:[
            {
                name:"Citizen",
                nameZh:"市民",
                affiliationName:"Town",
                descriptionZh:"一个相信真理和正义的普通人",
                abilityDescriptionZh:"市民默认没有任何特殊能力",
                // victoryGoalDescriptionZh:"",
                otherDescriptionZh:"市民在这个游戏中默认为最为普遍的角色",
                abilityDetails:["你没有任何特殊能力。"],
                featureDetails:["如果所有市民死亡，则城镇输掉这场游戏。"]
            },
            // {
            //     name:"Sheriff",
            //     nameZh:"警长",
            //     affiliationName:"Town",
            //     descriptionZh:"一个执法机构的成员，迫于谋杀的威胁而身处隐匿。",
            //     abilityDescriptionZh:"这个角色有每晚侦查一人有无犯罪活动的能力。",
            // },
            {
                name:"AuxiliaryOfficer",
                nameZh:"辅警",
                affiliationName:"Town",
                descriptionZh:"一名与同僚熟络的辅助警员。",
                abilityDescriptionZh:"这个角色有在夜晚与其他辅警合作侦查的能力。",
                abilityDetails:["每晚投票调查一人的阵营。"],
                featureDetails:[
                    "在晚上你可以与其他辅警交谈。",
                    "你知道其他辅警的身份。" ,
                    "辅警团队在晚上可以投票（随机）派出一人调查某人的阵营。",
                    "调查结果全团可知，但如果调查人被杀，则没有结果。"
                ]
            },
            // {
            //     name:"Doctor",
            //     nameZh:"医生",
            //     affiliationName:"Town",
            //     descriptionZh:"一个熟练于医治外伤的秘密外科医生。",
            //     abilityDescriptionZh:"这个角色有每晚救治一人，使其免受一次死亡的能力。",
            // },
            {
                name:"Mafioso",
                nameZh:"党徒",
                affiliationName:"Mafia",
                descriptionZh:"一个犯罪组织的成员。",
                abilityDescriptionZh:"这个角色有在夜晚与其他黑手党合作杀人的能力。",
                abilityDetails:["每晚投票杀死一人。"],
                featureDetails:[
                    "在晚上你可以与其他黑手党成员交谈",
                ]
            },
        ],
        roleSetInit(){
            this.setRoleAffiliation()
            this.setRoleColor()
            this.roleSet.forEach(r=>{
                r.getNameMessagePart = (additionalString)=>{
                    return {text:r.nameZh+(additionalString??''), style:`color:${r.color};`}
                }
            })
        },
        setRoleAffiliation(){
            this.roleSet.forEach(r => {
                r.affiliation = this.affiliationSet.find(a => a.name === r.affiliationName)
            })
        },
        setRoleColor(){
            this.roleSet.forEach(r =>{
                Object.defineProperty(r, 'color', {
                    get: function() {
                      return this.affiliation?.color
                    },
                    enumerable: true,
                    configurable: true
                })
            })
        },
        getRoleSetByAffiliationName(affiliationName){
            return  this.roleSet.filter(r => r.affiliationName === affiliationName)
        },
        selectedRole:undefined,
        selectRole(role){
            this.selectedRole = role
            this.selectedAffiliation = role.affiliation
        },

        addSelectedRole(){
            if(this.selectedRole !== undefined){
                this.setting.roleList.push(this.selectedRole?.name)
                this.setting.roleList.sort((a,b)=>{
                    return this.roleSet.indexOf(this.roleSet.find(r => r.name === a)) - this.roleSet.indexOf(this.roleSet.find(r => r.name === b))
                })
            }
        },
        removeSelectedRole(){
            let roleIndex = this.setting.roleList.lastIndexOf(this.selectedRole?.name)
            if(roleIndex !== -1)
                this.setting.roleList.splice(roleIndex, 1)
        },

        getRoleListFromData(roleListData){
            return roleListData.map(rd => this.roleSet.find(r => r.name === rd))
        },

        //开始信息及按钮
        startInfo:"",
        startButtonToggle:true,
        start(){
            if(this.startButtonToggle === true){
                sendEvent("HostSetupGame", this.setting)
            }else{
                sendEvent("HostCancelSetup")
            }
        },

        //计时器组件
        timer:undefined,
        createTimer(name, durationMin, callback){
            this.timer?.clear()
            this.timer = undefined
            this.timer = {
                name,
                durationSec: 60 * durationMin,
                update(){
                    if(this.durationSec === 0){
                        clearTimeout(this.timerId)
                        if(callback??false)
                            callback()
                        return
                    }

                    // 首次运行
                    if(this.timerId === undefined){
                        this.timerId = setTimeout(()=>{this.update()}, 1000)
                    }else{
                        this.durationSec --
                        this.timerId = setTimeout(()=>{this.update()}, 1000)
                    }
                },
                clear(){
                    clearTimeout(this.timerId)
                },
            }
            this.timer.update()
        },

        // 游戏页面中心的提示
        gamePageTipMessage:undefined,

        // 一些游戏数据
        myRole:undefined,
        myTeam:undefined,

        // 玩家列表...的按钮
        clickTempButton(player){

        },

        // 游戏结束后显示的演员表
        cast:undefined
    }))

    function cloneDeep(o){
        return JSON.parse(JSON.stringify(o))
    }

    function onMessage(e){
        const event = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent(event.type, { detail:event.data }))
        console.log('recive <-', e)
    }

    function sendEvent(type, data){
        const event = {type,data}
        // console.log(event)
        socket?.send(JSON.stringify(event))
    }

    function scrollToBottom(elementClass) {
        const content = document.querySelector(`.${elementClass}`);
        content.scrollTop = content.scrollHeight;
    }
})

class Player{
    constructor(playerData, color){
        this.data   = playerData
        this.color  = html5ColorHexMap[color]??(color.startsWith('#')? color:`#${color}`)
    }

    get name(){
        return this.data.name
    }

    get index(){
        return this.data.index
    }

    getIndexAndNameMagicString(){
        return new MagicString({text:`${this.index+1}.${this.name}`, style:`color:${this.color};`})
    }

    getNameMessagePart(additionalString){
        return {text:this.name+(additionalString??''), style:`font-weight:bold;color:${this.color};`}
    }

    getNameMagicString(){
        return new MagicString({text:this.name, style:`color:${this.color};`})
    }
    
    getNameMagicStringWithAdditionalContent({text:adtext, style:adstyle}){
        return new MagicString({text:this.name+adtext, style:`color:${this.color};`+adstyle})
    }

}

class MagicString{
    constructor({text, style, cssClass, parts} = {parts:[]}){
        this.text   = text      ?? ""
        this.style  = style     ?? ""
        this.class  = cssClass  ?? ""
        this.parts  = parts     ?? []
    }

    toString(){
        let partStrings = this.parts?.map(p => p.text).join()
        return this.text + partStrings
    }

    addColor(color){
        this.style += `color:${color}`
    }

    addText(text){
        this.parts.push({text})
    }

    append(newPart){
        this.parts.push(newPart)
    }
}

const html5ColorHexMap = {
    "aliceblue": "#f0f8ff", "antiquewhite": "#faebd7", "aqua": "#00ffff", "aquamarine": "#7fffd4", "azure": "#f0ffff",
    "beige": "#f5f5dc", "bisque": "#ffe4c4", "black": "#000000", "blanchedalmond": "#ffebcd", "blue": "#0000ff",
    "blueviolet": "#8a2be2", "brown": "#a52a2a", "burlywood": "#deb887", "cadetblue": "#5f9ea0", "chartreuse": "#7fff00",
    "chocolate": "#d2691e", "coral": "#ff7f50", "cornflowerblue": "#6495ed", "cornsilk": "#fff8dc", "crimson": "#dc143c",
    "cyan": "#00ffff", "darkblue": "#00008b", "darkcyan": "#008b8b", "darkgoldenrod": "#b8860b", "darkgray": "#a9a9a9",
    "darkgrey": "#a9a9a9", "darkgreen": "#006400", "darkkhaki": "#bdb76b", "darkmagenta": "#8b008b", "darkolivegreen": "#556b2f",
    "darkorange": "#ff8c00", "darkorchid": "#9932cc", "darkred": "#8b0000", "darksalmon": "#e9967a", "darkseagreen": "#8fbc8f",
    "darkslateblue": "#483d8b", "darkslategray": "#2f4f4f", "darkslategrey": "#2f4f4f", "darkturquoise": "#00ced1", "darkviolet": "#9400d3",
    "deeppink": "#ff1493", "deepskyblue": "#00bfff", "dimgray": "#696969", "dimgrey": "#696969", "dodgerblue": "#1e90ff",
    "firebrick": "#b22222", "floralwhite": "#fffaf0", "forestgreen": "#228b22", "fuchsia": "#ff00ff", "gainsboro": "#dcdcdc",
    "ghostwhite": "#f8f8ff", "gold": "#ffd700", "goldenrod": "#daa520", "gray": "#808080", "grey": "#808080",
    "green": "#008000", "greenyellow": "#adff2f", "honeydew": "#f0fff0", "hotpink": "#ff69b4", "indianred": "#cd5c5c",
    "indigo": "#4b0082", "ivory": "#fffff0", "khaki": "#f0e68c", "lavender": "#e6e6fa", "lavenderblush": "#fff0f5",
    "lawngreen": "#7cfc00", "lemonchiffon": "#fffacd", "lightblue": "#add8e6", "lightcoral": "#f08080", "lightcyan": "#e0ffff",
    "lightgoldenrodyellow": "#fafad2", "lightgray": "#d3d3d3", "lightgrey": "#d3d3d3", "lightgreen": "#90ee90", "lightpink": "#ffb6c1",
    "lightsalmon": "#ffa07a", "lightseagreen": "#20b2aa", "lightskyblue": "#87cefa", "lightslategray": "#778899", "lightslategrey": "#778899",
    "lightsteelblue": "#b0c4de", "lightyellow": "#ffffe0", "lime": "#00ff00", "limegreen": "#32cd32", "linen": "#faf0e6",
    "magenta": "#ff00ff", "maroon": "#800000", "mediumaquamarine": "#66cdaa", "mediumblue": "#0000cd", "mediumorchid": "#ba55d3",
    "mediumpurple": "#9370db", "mediumseagreen": "#3cb371", "mediumslateblue": "#7b68ee", "mediumspringgreen": "#00fa9a", "mediumturquoise": "#48d1cc",
    "mediumvioletred": "#c71585", "midnightblue": "#191970", "mintcream": "#f5fffa", "mistyrose": "#ffe4e1", "moccasin": "#ffe4b5",
    "navajowhite": "#ffdead", "navy": "#000080", "oldlace": "#fdf5e6", "olive": "#808000", "olivedrab": "#6b8e23",
    "orange": "#ffa500", "orangered": "#ff4500", "orchid": "#da70d6", "palegoldenrod": "#eee8aa", "palegreen": "#98fb98",
    "paleturquoise": "#afeeee", "palevioletred": "#db7093", "papayawhip": "#ffefd5", "peachpuff": "#ffdab9", "peru": "#cd853f",
    "pink": "#ffc0cb", "plum": "#dda0dd", "powderblue": "#b0e0e6", "purple": "#800080", "rebeccapurple": "#663399",
    "red": "#ff0000", "rosybrown": "#bc8f8f", "royalblue": "#4169e1", "saddlebrown": "#8b4513", "salmon": "#fa8072",
    "sandybrown": "#f4a460", "seagreen": "#2e8b57", "seashell": "#fff5ee", "sienna": "#a0522d", "silver": "#c0c0c0",
    "skyblue": "#87ceeb", "slateblue": "#6a5acd", "slategray": "#708090", "slategrey": "#708090", "snow": "#fffafa",
    "springgreen": "#00ff7f", "steelblue": "#4682b4", "tan": "#d2b48c", "teal": "#008080", "thistle": "#d8bfd8",
    "tomato": "#ff6347", "turquoise": "#40e0d0", "violet": "#ee82ee", "wheat": "#f5deb3", "white": "#ffffff",
    "whitesmoke": "#f5f5f5", "yellow": "#ffff00", "yellowgreen": "#9acd32"
};