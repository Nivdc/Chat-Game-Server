// import { abilityUseVerify } from "../gameData.js"

let socket = undefined

document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        loading:true,
        settingWatchIgnore:false,
        setting:{},

        async init() {
            this.setting = cloneDeep(this.presets[0].setting)
            this.eventHandlerInit()
            this.socketInit()
            this.tagSet = undefined
            this.categoryList = undefined
            this.roleSet = undefined
            this.recentlyDeadPlayers = []
            this.possibleRoleSet = undefined
            sendEvent("FrontendReady")

            // testCode
            // showGamePage
            // this.loading = false
            // document.getElementById('gamePageBody').classList.add('animation-fadeIn-3s')

            // this.status = "night/discussion"
            // this.playAnimation('begin')

            // this.actionAnimationNameSequence.push('mafiaKillAttack')
            // this.actionAnimationNameSequence.push('doctorHealProtect')
            // this.playActionAnimations()
            // this.playAnimation("mafiaKillAttack")
            


            this.$watch('setting', (value, oldValue)=>{
                if(this.settingWatchIgnore === false){
                    sendEvent("HostChangesGameSetting", value)
                }else{
                    this.settingWatchIgnore = false
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

            // webSocket链接会保证消息收发的顺序性
            for(const eventName in this.eventHandler){
                window.addEventListener(eventName, (e)=>{
                    this.eventHandler[eventName].call(this, e.detail)
                })
            }
        },

        eventHandlerInit(){
            // 下面这些是夜间行动阶段会收到的事件，它们都遵循同样的处理逻辑，
            // 先添加到actionAnimationNameSequence里面暂存起来
            // 等到animation/actions阶段再顺序播放
            const nightActionEvents = [
                'YouGoToKill',
                'YouUnderAttack',
                'YouAreHealed',

                'AuxiliaryOfficerCheckResult',
            ]

            for(const eName of nightActionEvents){
                this.eventHandler[eName] = function(data){
                    const animationName = eName.charAt(0).toLowerCase() + eName.slice(1)
                    this.actionAnimationNameSequence.push({name:animationName, data})
                }
            }
        },
        eventHandler:{
            'BackendReady':function(data){
                // 前端加载完毕，后端有可能仍未加载完毕（特别是在首次启动的时候
                // 在上面的代码里一旦前端加载完毕就会发送一个FrontendReady
                // 后端加载完毕后会发送一个BackendReady
                // 如果收到BackendReady时，页面仍然在loading，说明后端没有收到前面那个FrontendReady
                // 因此此时必须再发送一次FrontendReady
                if(this.loading === true)
                    sendEvent("FrontendReady")
            },

            'InitCompleted':function(data){
                this.loading = false
            },
            'HostChangesGameSetting':function(data){
                this.settingWatchIgnore = true
                this.setting = data
            },

            "SetHost":function (data){
                this.host = this.playerList[data.index]
                let message = new MagicString()
                message.append(this.host.getNameMagicString_Bold())
                message.append({text:'  是新的主机', class:'text-warning'})
                if(this.isRunning === false && this.status !== 'begin')
                    this.addMessage(message)
            },

            'SetPossibleRoleSet'(data){
                this.possibleRoleSet = data
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

            'ChatMessage':function(data){
                const sender  = this.playerList[data.senderIndex]

                let message = new MagicString()
                message.append(sender.getNameMagicStringWithExtras({text:': ', style:`font-weight:bold;`}))
                message.addText(data.message)

                if(sender.isAlive === false)
                    message.style = `background-color:${hexToRgba(html5ColorHexMap['darkred'], 0.7)};`
                if(sender === this.executionTarget || sender === this.trialTarget)
                    message.style = `background-color:${hexToRgba(html5ColorHexMap['dodgerblue'], 0.3)};`

                this.addMessage(message)
            },

            'PrivateMessage-PublicNotice':function(data){
                const sender  = this.playerList[data.senderIndex]
                const target  = this.playerList[data.targetIndex]

                let message = new MagicString()
                message.append(sender.getNameMagicStringWithExtras({style:`font-weight:bold;`}))
                message.addText(' 发送了一条私密消息给 ')
                message.append(target.getNameMagicStringWithExtras({style:`font-weight:bold;`}))
                message.style = 'color:NavajoWhite;background-color:rgba(0, 0, 0, 0.2);'
                this.addMessage(message)
            },
            'PrivateMessage-Receiver':function(data){
                const sender  = this.playerList[data.senderIndex]
                const target  = this.playerList[data.targetIndex]

                let message = new MagicString()
                message.append(sender.getNameMagicStringWithExtras({style:`font-weight:bold;`}))
                message.addText(' 发送了一条私密消息给你: ')
                message.addText(data.message)
                message.style = 'color:NavajoWhite;background-color:rgba(0, 0, 0, 0.2);'
                this.addMessage(message)

            },

            'HostSetupGame':function(){
                this.addMessageWithoutLog({text:"游戏将在15秒后开始", style:"color:LawnGreen;"})
                this.startButtonToggle = false
            },

            'HostCancelSetup':function(data){
                this.addMessageWithoutLog({text:"主机取消了开始", style:"color:yellow;"})

                // Undo changes made by preprocessRandomRole()
                this.settingWatchIgnore = true
                this.setting.roleList = this.setting.roleList.map(r => {
                    if(typeof(r) === 'string'){
                        return r
                    }else{
                        return r.name
                    }
                })

                this.startButtonToggle = true
            },

            'PlayerQuit':function(data){
                let message = new MagicString({style:'background-color:darkred;text-shadow: 1px 1px 0px #000000;'})
                let player  = this.playerList[data.index]
                message.append(player.getNameMagicString_Bold())
                message.append({text:' 退出了游戏'})
                this.addMessage(message)
            },

            'SetStatus':function(data){
                this.status = data
                if(this.status === 'begin'){
                    this.clearMssagesList()
                    this.createTimer('试镜', 0.5)
                }
                else if(this.status === 'animation/begin'){
                    this.timer?.clear()
                    this.timer = undefined
                    this.playAnimation('begin')
                }
                // else if(this.status === 'animation/nightToDay'){
                //     this.playAnimation('nightToDay')
                // }
                else if(this.status === 'animation/actionToDay'){
                    this.playAnimation('actionToDay')
                }
                else if(this.status === 'animation/daily/deathDeclear'){
                    this.playAnimation('deathDeclear')
                }
                else if(this.status === 'day/discussion'){
                    this.clearMssagesList()
                    this.playAnimation('showDayCount')
                    this.createTimer('讨论', this.setting.discussionTime)
                }
                else if(this.status === 'day/discussion/lynchVote'){
                    if(this.setting.enableDiscussion === false){
                        this.clearMssagesList()
                        this.playAnimation('showDayCount')
                    }

                    const apll = this.playerList.filter(p => p.isAlive).length
                    const voteNeeded = apll % 2 === 0 ? ((apll / 2) + 1) : Math.ceil(apll / 2)

                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.addText(`我们需要 ${voteNeeded} 票来将某人送上${this.setting.enableTrial? '审判台':'绞刑架'}。`)
                    this.gamePageTipMessage.class = 'animation-fadeIn-1s'

                    if(this.tempDayTimerCache === undefined){
                        // 如果是正常的投票阶段
                        this.createTimer('投票', this.setting.dayLength)
                    }else{
                        // 如果是审判后继续的投票阶段
                        if(this.setting.pauseDayTimerDuringTrial){
                            // 如果暂停白天
                            this.timer = this.tempDayTimerCache
                            this.timer.update()
                            this.tempDayTimerCache = undefined
                        }else{
                            // 如果不暂停白天
                            this.tempDayTimerCache.durationSec -= (60 * this.setting.trialTime)
                            if(this.tempDayTimerCache.durationSec > 0){
                                this.timer = this.tempDayTimerCache
                                this.timer.update()
                            }
                            this.tempDayTimerCache = undefined
                        }
                    }
                }
                else if(this.status === 'day/trial/defense'){
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.append(this.trialTarget.getNameMagicString())
                    this.gamePageTipMessage.addText(" 你被控密谋对抗城镇，你还有什么要辩护的？")

                    this.tempDayTimerCache = this.timer
                    this.tempDayTimerCache.clear()

                    this.createTimer('审判辩护', this.setting.trialTime/2)
                }
                else if(this.status === 'day/discussion/trial/trialVote'){
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.addText("城镇现已可决定 ")
                    this.gamePageTipMessage.append(this.trialTarget.getNameMagicString())
                    this.gamePageTipMessage.addText(" 的命运")

                    const trialVoteTime = this.setting.enableTrialDefense? this.setting.trialTime/2 : this.setting.trialTime
                    this.createTimer('审判投票', trialVoteTime)
                }
                else if(this.status === 'day/execution/lastWord'){
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.append(this.executionTarget.getNameMagicString())
                    this.gamePageTipMessage.addText(" 你还有什么遗言吗？")
                    this.gamePageTipMessage.class = 'animation-fadeIn-1s'

                    this.createTimer('临终遗言', 0.4/2)
                }
                else if(this.status === 'animation/execution/deathDeclear'){
                    this.playAnimation('deathDeclear')
                }
                else if(this.status === 'day/execution/discussion'){
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.append(this.executionTarget.getNameMagicString())
                    this.gamePageTipMessage.addText(" 愿你安息")
                    this.executionTarget = undefined
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                    }, 3000)
                    this.createTimer('行刑追悼', 0.4/2)
                }
                else if(this.status === 'animation/dayToNight'){
                    this.timer = undefined

                    this.playAnimation('dayToNight')
                }
                else if(this.status === 'night/discussion'){
                    this.playAnimation('showDayCount')
                    document.getElementById('music').volume = 1.0
                    document.getElementById('music').currentTime = 0
                    document.getElementById('music').play()
                    this.executionTarget = undefined
                    this.clearMssagesList()
                    this.createTimer('夜晚', this.setting.nightLength)
                }
                else if(this.status === 'animation/nightToAction'){
                    this.playAnimation('nightToAction')
                }
                else if(this.status === 'animation/actions'){
                    this.playActionAnimations()
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
                message.append(player.getNameMagicString_Bold())
                if(data.targetIndex == null)
                    message.append({text:' 提议重选主机', style:'color:yellow;'})
                else{
                    let target = this.playerList[data.targetIndex]
                    message.append({text:' 提议重选主机为 ', style:'color:yellow;'})
                    message.append(target.getNameMagicString_Bold())
                }
                this.addMessage(message)
            },

            'SetPlayerSelfIndex':function(data){
                this.myIndex = Number(data)
            },

            'SetRole':function(data){
                this.myRole = this.roleSet.find(r=>r.name === data.name)
                this.myRole.abilityNames = data.abilityNames
            },

            'SetTeam':function(data){
                this.myTeam = {}
                let teamPlayers = data.map(pd => this.playerList.find(p => p.index === pd.index))
                teamPlayers.forEach(p => {
                    let playerRoleData = data.find(pd => pd.index === p.index).role
                    p.role = this.roleSet.find(r => r.name === playerRoleData.name)
                })
                this.myTeam.playerList = teamPlayers
                // 这里有一个this指针的绑定问题，下面这个函数的this绑定到了全局的game，暂时就先这样吧
                this.myTeam.getMagicStrings = function(){
                    return this.myTeam.playerList.map(p => {
                        let ms = new MagicString()
                        ms.append(p.getIndexAndNameMagicString())
                        ms.addText(' (')
                        ms.append(p.role.getNameMagicString())
                        ms.addText(')')
                        return ms
                    })
                }
            },

            'SetWinner':function(data){
                let winningFaction = this.tagSet.find(t => t.name === data.winningFactionName)
                let winners = data.winners.map(dw => this.playerList[dw.index])

                this.gamePageTipMessage = new MagicString()
                this.gamePageTipMessage.addText("我们得到的结果是 ... ")
                this.gamePageTipMessage.append(winningFaction.getNameMagicString())
                this.gamePageTipMessage.addText(" 胜利！")
                this.gamePageTipMessage.class = 'animation-fadeIn-1s'
            },

            'SetCast':function(data){
                this.cast = data.map(pd => {
                    let ms = new MagicString
                    ms.append(this.playerList[pd.index].getNameMagicString())
                    ms.addText(" 饰演 ")
                    ms.append(this.roleSet.find(r => r.name === pd.role.name).getNameMagicString())
                    return ms
                })

                document.getElementById('cast').classList.add('animation-fadeIn-1s')
            },

            'SetTrialTarget':function(data){
                this.trialTarget = this.playerList[data.index]
            },

            'SetExecutionTarget':function(data){
                this.executionTarget = this.playerList[data.index]
                let message = new MagicString()
                message.append(this.executionTarget.getNameMagicString())
                message.addText(' 将会被处决！')
                message.style = 'color:NavajoWhite;background-color:rgba(0, 0, 0, 0.2);'
                this.addMessage(message)
            },

            'SetDayCount':function(data){
                this.dayCount = Number(data)
            },
            'SetTagSet':function(data){
                const tagFrontendDatas = frontendData.tags
                const tagBackendDatas = data

                this.tagSet = tagFrontendDatas.map(tfd => new Tag(tfd, tagBackendDatas.find(tbd => tbd.name === tfd.name)))
                this.categoryList = this.tagSet.filter(t => (t.isFaction || t.name === 'Random'))
            },
            'SetRoleSet':function(data){
                const roleFrontendDatas = frontendData.roles
                const roleBackendDatas = data.filter(rd => roleFrontendDatas.find(rfd => rfd.name === rd.name) !== undefined)

                this.roleSet = roleFrontendDatas.map(rfd => new Role(rfd, roleBackendDatas.find(rbd => rbd.name === rfd.name), this.tagSet))
                this.addRandomRoles()
            },

            'SetRecentlyDeadPlayers':function(data){
                this.recentlyDeadPlayers = data
            },

            'LynchVote':function(data){
                let voter = this.playerList[data.voterIndex]
                let target = this.playerList[data.targetIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                if(data.previousTargetIndex === undefined)
                    message.addText(' 投票审判 ')
                else
                    message.addText(' 将他的投票改为 ')
                message.append(target.getNameMagicString())
                message.style = `background-color:${hexToRgba(target.color, 0.2)};text-shadow: 1px 1px 0px #000000;`
                this.addMessage(message)
            },
            'LynchVoteCancel':function(data){
                let voter = this.playerList[data.voterIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                message.addText(' 取消了他的投票')
                message.style = `background-color: rgba(0, 0, 0, 0.5);`
                this.addMessage(message)
            },

            'SetLastWill':function(data){
                let lastWillString = data
                let lwsa = lastWillString.split('\n')
                let lws1 = lwsa[0] ?? ""
                let lws2 = lwsa[1] ?? ""

                this.addSystemHintText('你已将自己的遗言设置为：')

                this.addSystemHintText(lws1)


                if(isEmpty(lws2) === false){
                    this.addSystemHintText(lws2)
                }

                document.getElementById('lastWillInput1').value = lws1
                document.getElementById('lastWillInput2').value = lws2
            },

            'SetKillerMessage':function(data){
                let killerMessageString = data

                if(killerMessageString != undefined){
                    this.addSystemHintText('你写下了你的杀手信息: ')
                    this.addSystemHintText(killerMessageString)
                }
                else{
                    this.addSystemHintText('你清除了你的杀手信息。')
                }
            },

            'MafiaKillVote':function(data){
                let voter = this.playerList[data.voterIndex]
                let target = this.playerList[data.targetIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                if(data.previousTargetIndex === undefined)
                    message.addText(' 投票杀死 ')
                else
                    message.addText(' 将他的投票改为 ')
                message.append(target.getNameMagicString())
                message.style = `background-color:${hexToRgba(target.color, 0.5)};text-shadow: 1px 1px 0px #000000;`
                this.addMessage(message)
            },
            'MafiaKillVoteCancel':function(data){
                let voter = this.playerList[data.voterIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                message.addText(' 取消了他的投票')
                message.style = `background-color: rgba(0, 0, 0, 0.5);`
                this.addMessage(message)
            },
            'MafiaKillTargets':function(data){
                let message = new  MagicString()
                let targets = data.map(pidx => this.playerList[pidx])
                if(targets.length === 1){
                    message.addText('你们决定杀死 ')
                    message.append(targets[0].getNameMagicString())
                    message.style = `background-color:${hexToRgba(targets[0].color, 0.5)};text-shadow: 1px 1px 0px #000000;`
                }
                else if(targets.length > 1){
                    message.addText('你们决定在[ ')
                    for(const [i, t] of targets.entries()){
                        message.append(t.getNameMagicString())
                        if(i < (targets.length-1))
                            message.addText('、')
                    }
                    message.addText(' ] 中随机杀死一人。')
                    message.style = `background-color: rgba(0, 0, 0, 0.5);`
                }
                this.addMessage(message)
            },

            'AuxiliaryOfficerCheckVote':function(data){
                let voter = this.playerList[data.voterIndex]
                let target = this.playerList[data.targetIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                if(data.previousTargetIndex === undefined)
                    message.addText(' 投票搜查 ')
                else
                    message.addText(' 将他的投票改为 ')
                message.append(target.getNameMagicString())
                message.style = `background-color:${hexToRgba(target.color, 0.5)};text-shadow: 1px 1px 0px #000000;`
                this.addMessage(message)
            },
            'AuxiliaryOfficerCheckVoteCancel':function(data){
                let voter = this.playerList[data.voterIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                message.addText(' 取消了他的投票')
                message.style = `background-color: rgba(0, 0, 0, 0.5);`
                this.addMessage(message)
            },
            'AuxiliaryOfficerCheckTargets':function(data){
                let message = new  MagicString()
                let targets = data.map(pidx => this.playerList[pidx])
                if(targets.length === 1){
                    message.addText('你们决定搜查 ')
                    message.append(targets[0].getNameMagicString())
                    message.style = `background-color:${hexToRgba(targets[0].color, 0.5)};text-shadow: 1px 1px 0px #000000;`
                }
                else if(targets.length > 1){
                    message.addText('你们决定在[ ')
                    for(const [i, t] of targets.entries()){
                        message.append(t.getNameMagicString())
                        if(i < (targets.length-1))
                            message.addText('、')
                    }
                    message.addText(' ] 中随机搜查一人。')
                    message.style = `background-color: rgba(0, 0, 0, 0.5);`
                }
                this.addMessage(message)
            },


            'TeamActionNotice':function(data){
                let message = new MagicString()
                message.addText('你们决定派出 ')
                message.append(this.playerList[data.originIndex].getNameMagicString())
                if(this.myRole.affiliation.name === 'Mafia'){
                    message.addText(' 去杀死 ')
                }
                else if(this.myRole.name === 'AuxiliaryOfficer'){
                    message.addText(' 去搜查 ')
                }
                message.append(this.playerList[data.targetIndex].getNameMagicString())
                this.addMessage(message)
            },

            'SetLynchVoteCount':function(data){
                this.lynchVoteCount = data
            },

            'TrialVote':function(data){
                let voter = this.playerList[data.voterIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                message.addText(' 已投票。')
                message.style = `background-color: rgba(0, 0, 0, 0.5);`
                this.addMessage(message)
            },
            'TrialVoteCancel':function(data){
                let voter = this.playerList[data.voterIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                message.addText(' 撤销了他的投票')
                message.style = `background-color: rgba(0, 0, 0, 0.5);`
                this.addMessage(message)
            },

            'SetTrialVoteRecord':function(data){
                const alivePlayersIndexArray = this.playerList.filter(p => p.isAlive)
                                                            .filter(p => p.index !== this.trialTarget.index)
                                                            .map(p => p.index)
                const guiltyCount = data.filter(d => d === true).length
                const innocentCount = data.filter(d => d === false).length

                let firstMessage = new MagicString()
                firstMessage.addText("投票结果: ")
                firstMessage.append(new MagicString({text:guiltyCount.toString(), style:"color:red;"}))
                firstMessage.addText(" : ")
                firstMessage.append(new MagicString({text:innocentCount.toString(), style:"color:#119111;"}))
                firstMessage.style = `background-color: rgba(0, 0, 0, 0.7);`
                this.addMessage(firstMessage)

                for(const i of alivePlayersIndexArray){
                    let message = new MagicString()
                    message.addText(`${i+1} - `)
                    message.append(this.playerList[i].getNameMagicString())
                    if(typeof(data[i]) === 'boolean'){
                        message.addText(" 投给 ")
                        if(data[i] === true){
                            message.append(new MagicString({text:"有罪", style:"color:red;"}))
                            message.style = `background-color: ${hexToRgba(html5ColorHexMap["red"], 0.5)};`
                        }else{
                            message.append(new MagicString({text:"无罪", style:"color:#119111;"}))
                            message.style = `background-color: ${hexToRgba(html5ColorHexMap["green"], 0.5)};`
                        }
                    }else if(data[i] === null){
                        message.addText(" 弃权了")
                        message.style = `background-color: rgba(0, 0, 0, 0.5);`
                    }
                    this.addMessage(message)
                }

                this.trialTarget = undefined
            },

            'YouAreDead':function(data){
                this.addSystemHintText("哦不，你死了，但是你仍可以留下来观看本局游戏。", 'darkred')
            },

            // night action events
            'YouGoToKill':function(data){
                this.actionAnimationNameSequence.push('youGoToKill')
            },
            'MafiaKillAttack':function(data){
                this.actionAnimationNameSequence.push('mafiaKillAttack')
            },
            'DoctorHealProtect':function(data){
                this.actionAnimationNameSequence.push('doctorHealProtect')
            },
        },
        commandHandler(commandString){
            [command, ...args] = commandString.split(" ")

            switch(command){
                case 'repick':
                    let playerIndex = Number(args.shift())
                    sendEvent("RepickHost", playerIndex?playerIndex-1:undefined)
                break

                case 'rename':
                    if(this.status === 'begin' && this.setting.enableCustomName){
                        const newName = args.shift()
                        if(isEmpty(newName) === false)
                            sendEvent("PlayerRename", newName)
                    }
                    else
                        this.addSystemHintText("本局游戏没有启用自设名字，或尚未处于准备阶段")
                break

                case 'lw':
                case 'lastWill':
                    if(this.isRunningAndNoAnimation){
                        if(this.setting.enableLastWill){
                            sendEvent("SetLastWill", args.shift())
                        }else{
                            this.addSystemHintText("本局游戏没有启用遗嘱")
                        }
                    }else{
                        this.addSystemHintText("抱歉，现在不能设置遗嘱")
                    }
                break

                case 'dn':
                case 'deathNote':
                case 'km':
                case 'killerMessage':
                    if(this.isRunningAndNoAnimation){
                        if(this.setting.enableLastWill){
                            sendEvent("SetKillerMessage", args.shift())
                        }else{
                            this.addSystemHintText("本局游戏没有启用杀手留言")
                        }
                    }else{
                        this.addSystemHintText("抱歉，现在不能设置杀手留言")
                    }
                break

                case 'pm':
                case 'privateMessage':
                    if(this.isRunningAndNoAnimation){
                        if(this.setting.enablePrivateMessage){
                            let targetIndex = Number(args.shift())-1
                            let message = args.shift()
                            if(isEmpty(message) === false){
                                sendEvent("PrivateMessage", {targetIndex, message})
                            }
                        }else{
                            this.addSystemHintText("本局游戏没有启用私信")
                        }
                    }else{
                        this.addSystemHintText("抱歉，现在不能发送私信")
                    }
                break

                // fixme:player Can vote to self...And deadPlayer
                case 'lv':
                case 'lynchVote':
                    if(this.status.split('/').includes('lynchVote')){
                        let targetIndex = Number(args.shift())-1
                        if(Number.isNaN(targetIndex) === false)
                            sendEvent('LynchVote', targetIndex)
                        else
                            sendEvent('LynchVoteCancel')
                    }
                    else
                        this.addSystemHintText("当前阶段不允许进行审判投票")
                break
                case 'lynchVoteCancel':
                    sendEvent('LynchVoteCancel')
                break

                case 'tg':
                case 'target':
                    // todo: 缺少一些投票失败的提示
                    const targetIndex = Number(args.shift())-1
                    if(Number.isNaN(targetIndex) === false){
                        sendEvent('TeamVote', targetIndex)
                    }else{
                        sendEvent('TeamVoteCancel')
                    }
                break

                case 'tv':
                case 'trialVote':
                    if(this.status.split('/').includes('trialVote')){
                        const voteString = args.shift()
                        if(voteString === 'guilty' || voteString === 'true')
                            sendEvent('TrialVote', true)
                        else if(voteString === 'innocent' || voteString === 'false')
                            sendEvent('TrialVote', false)

                        else
                            sendEvent('TrialVoteCancel')
                    }
                    else
                        this.addSystemHintText("当前阶段不允许进行处决投票")
                break
                case 'trialVoteCancel':
                    sendEvent('TrialVoteCancel')
                break

                case 'use':
                case 'useAbility':
                    const usedAbilityName = args.shift()
                    if(this.myRole.abilityNames.includes(usedAbilityName)){
                        switch(usedAbilityName){
                            case 'DoctorHealProtect':
                                let targetIndex = Number(args.shift())-1
                                if(Number.isNaN(targetIndex) === false)
                                    sendEvent('UseAbility', {name:usedAbilityName, targetIndex})
                            break
                        }
                    }
                break


                default:
                    this.addSystemHintText("未知指令，请重试。")
                break
            }
        },
        async playAnimation(animationName, data){
            switch(animationName){
                case 'begin':
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.addText("您将要扮演的角色是 ... ")
                    let mrnmp = this.myRole?.getNameMagicString()
                    if(mrnmp)
                        mrnmp.style += 'font-weight:bold;'
                    this.gamePageTipMessage.parts.push(mrnmp)
                    this.gamePageTipMessage.class = 'animation-fadeIn-1s'
                    document.getElementById('gamePage').style.display = 'flex'
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                        document.getElementById('gamePageBody').classList.add('animation-fadeIn-3s')
                        document.getElementById('gamePageHead').classList.add('animation-fadeIn-3s')
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
                case 'nightToAction':
                    document.getElementById('gamePage').classList.remove('animation-dayToNight-6s')
                    document.getElementById('gamePage').classList.add('animation-nightToAction-6s')
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
                case 'actionToDay':{
                    const classList = document.getElementById('gamePage').classList
                    animationClassList = [...classList].filter(className => className.startsWith('animation'))
                    animationClassList.forEach(c => classList.remove(c))
                    classList.add('animation-actionToDay-6s')
                break}
                case 'showDayCount':{
                    let time = this.status.startsWith('day') ? '白天' : '夜晚'
                    this.gamePageTipMessage = new MagicString()
                    this.gamePageTipMessage.text  = `${time}  ${this.dayCount}`
                    this.gamePageTipMessage.style = 'font-size:1.5em;font-weight: bold;padding: 0.5em 1em;background-color: rgba(0, 0, 0, 0.2);'
                    this.gamePageTipMessage.class = 'border animation-fadeIn-1s'
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'border animation-fadeOut-2s'
                    }, 3000)
                break}
                case 'deathDeclear':
                    if(this.recentlyDeadPlayers.length > 0){
                        let delaySec = 0
                        if(this.status === 'animation/daily/deathDeclear'){
                            this.gamePageTipMessage = new MagicString()
                            if(this.recentlyDeadPlayers.length === 1)
                                this.gamePageTipMessage.addText("我们中的一人未能活过昨晚。")
                            else if(this.recentlyDeadPlayers.length > 1)
                                this.gamePageTipMessage.addText("我们中的一些人未能活过昨晚。")
                            this.gamePageTipMessage.class = 'animation-fadeIn-1s'
                            delaySec = 3
                        }

                        setTimeout(()=>{
                            this.playAnimation('deathDeclearOnce', this.recentlyDeadPlayers.pop())
                            let animationCycleCount = 1

                            while(this.recentlyDeadPlayers.length > 0){
                                setTimeout(()=>{
                                    this.playAnimation('deathDeclearOnce', this.recentlyDeadPlayers.pop())
                                }, 6 * animationCycleCount * 1000)
                                animationCycleCount ++
                            }
                        }, delaySec * 1000)
                    }
                break
                case 'deathDeclearOnce':
                    if(data !== undefined){
                        let deadPlayerData  = data
                        let player      = this.playerList[deadPlayerData.index]
                        let role        = this.roleSet.find(r => r.name === deadPlayerData.roleName)
                        let lastWill    = deadPlayerData.lastWill
                        let messageLeftByKiller = deadPlayerData.messageLeftByKiller

                        if(this.status === 'animation/daily/deathDeclear'){
                            this.gamePageTipMessage = new MagicString()
                            this.gamePageTipMessage.append(player.getNameMagicString())
                            this.gamePageTipMessage.addText(' 在这个早晨被发现时已经死亡了。')

                            // todo: killerHint
                        }
                        else if(this.status === 'animation/execution/deathDeclear'){
                            // 这个时候提示栏正在被“xxx，你还有什么遗言吗？”占用
                            if(this.gamePageTipMessage.class !== 'animation-fadeOut-2s')
                                this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                        }


                        setTimeout(() => {
                            this.gamePageTipMessage = new MagicString()
                            this.gamePageTipMessage.append(player.getNameMagicString())
                            this.gamePageTipMessage.addText(' 的角色是 ')
                            this.gamePageTipMessage.append(role.getNameMagicString())
                            this.gamePageTipMessage.class = 'animation-fadeIn-1s'

                            let newMessage = cloneDeep(this.gamePageTipMessage)
                            newMessage.class = ''
                            newMessage.style = 'background-color:rgba(0, 0, 0, 0.2);'
                            this.addMessage(newMessage)

                            player.isAlive  = false
                            player.role     = role
                            player.lastWill = lastWill
                        }, 2000)
                        setTimeout(() => {
                            if(this.setting.enableLastWill){
                                if(lastWill !== undefined){
                                    let lastWillTitle = new MagicString()
                                    lastWillTitle.append(player.getNameMagicString())
                                    lastWillTitle.addText(' 给我们留下了他的遗嘱:')
                                    lastWillTitle.style = 'color:NavajoWhite;background-color:rgba(0, 0, 0, 0.2);'
                                    this.addMessage(lastWillTitle)

                                    let lwsa = lastWill.split('\n')
                                    let lws1 = lwsa[0] ?? ""
                                    let lws2 = lwsa[1] ?? ""
                    
                                    this.addSystemHintText(lws1)
                    
                                    if(isEmpty(lws2) === false){
                                        this.addSystemHintText(lws2)
                                    }
                                }else{
                                    this.addSystemHintText('我们未能找到他的遗嘱。')
                                }
                            }
                            this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                        }, 4000);
                        setTimeout(() => {
                            if(this.setting.enableKillerMessage){
                                if(messageLeftByKiller !== undefined){
                                    this.addSystemHintText("与此同时，我们在他的尸体旁边发现了杀手信息:")
                                    this.addSystemHintText(messageLeftByKiller)
                                }
                            }
                        }, 6000);
                    }
                break

                // action animations
                // 行动动画和普通动画的区别就是它会返回一个promise，在动画结束时resolve
                case 'youGoToKill':{
                    let message = new MagicString()
                    message.addText("你前去杀死 ")
                    message.append(this.playerList[data.targetIndex].getNameMagicString())
                    message.addText("。")
                    this.addMessage(message)

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}

                case 'youUnderAttack':{
                    if(data.source === 'Mafia')
                        this.addSystemHintText("你被黑手党攻击了", 'darkred')

                    const gamePageElement = document.getElementById('gamePage')
                    gamePageElement.classList.remove('animation-nightToAction-6s')
                    return new Promise((resolve) => {
                        gamePageElement.classList.add('animation-underAttack-6s')
                        gamePageElement.addEventListener('animationend', () => {
                            resolve()
                        }, { once: true })
                    })
                break}

                case 'youAreHealed':{
                    this.addSystemHintText("但是有个陌生人救了你一命", 'limegreen')

                    const gamePageElement = document.getElementById('gamePage')
                    return new Promise((resolve) => {
                        gamePageElement.classList.add('animation-doctorHealProtect-2s')
                        gamePageElement.addEventListener('animationend', () => {
                            resolve()
                        }, { once: true })
                    })
                break}

                case 'auxiliaryOfficerCheckResult':{
                    let target = this.playerList[data.targetIndex]
                    let affiliation = this.tagSet.find(t => t.name === data.targetAffiliation)
                    let message = new MagicString()
                    message.append(target.getNameMagicString())
                    if(affiliation.name === 'Mafia'){
                        message.addText(' 是 ')
                        message.append(affiliation.getNameMagicString())
                    }else{
                        message.addText(' 看起来不可疑。')
                    }
                    this.addMessage(message)

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}
            }
        },

        actionAnimationNameSequence:[],
        async playActionAnimations(){
            while(this.actionAnimationNameSequence.length > 0){
                const actionAnimation = this.actionAnimationNameSequence.shift()
                await this.playAnimation(actionAnimation.name, actionAnimation.data)
            }
            // sendEvent('AnimationsComplete')
        },

        get isRunning(){
            return this.status?.startsWith('day') || this.status?.startsWith('night') || this.status === 'end' || this.status?.split('/').includes('animation')
        },

        get isRunningAndNoAnimation(){
            return this.isRunning && this.status?.split('/').includes('animation') === false
        },

        // 预设栏组件
        selectedPreset:undefined,
        presets : [
            {
                name:"默认",
                description:"默认的设置",
                setting:{
                    dayVoteType: "Majority",
                    dayLength: 0.1,
                    
                    enableTrial: true,
                    enableTrialDefense: true,
                    trialTime: 0.2,
                    pauseDayTimerDuringTrial: false,
                    
                    startAt: "night",
                    
                    nightType: "Classic",
                    nightLength: 0.6,
                    
                    enableDiscussion: false,
                    discussionTime: 0.3,
                    
                    revealPlayerRoleOnDeath: true,
                    protectCitizensMode:false,
                    enableCustomName: true,
                    enableKillerMessage: true,
                    enableLastWill: true,
                    enablePrivateMessage: true,
                    
                    roleList: [
                        // "Citizen", "Citizen",
                        // "Sheriff",
                        // "Doctor",
                        "Doctor",
                        "Mafioso",
                        // "AllRandom",
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
            const s = JSON.stringify(this.setting)
            const exportString = window.btoa(s)
            alert("导出结果为: \n\n" + exportString)
            this.addSystemHintText("导出结果为:")
            this.addSystemHintText(exportString)
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
        addSystemHintText(text, color){
            this.addMessageWithoutLog({text, style:`color:${color??'NavajoWhite'};background-color:rgba(0, 0, 0, 0.2);`})
        },

        playerList:[],
        submit(){
            if(isEmpty(this.inputString) === false){
                if(/^-/.test(this.inputString) === false){
                    sendEvent("ChatMessage", this.inputString)
                }
                else{
                    let str = this.inputString.substring(1); // remove '-'
                    if(this.status === 'begin')
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
        addRandomRoles(){
            // 首先添加AllRandom
            const allTag = {name:'All', nameTranslate:'全体', color:'white', includeRoleNames:this.roleSet.map(r => r.name)}
            const randomTag = this.tagSet.find(t => t.name === 'Random')
            this.roleSet.push(new RandomRole({factionTag:allTag, randomTag, roleSet:this.roleSet}))

            // 然后剩下的标签与Faction标签排列组合
            const factionTags = this.tagSet.filter(t => t.isFaction)
            const nonFactionTags = this.tagSet.filter(t => (t.isFaction !== true))
            for(const factionTag of factionTags){
                this.roleSet.push(new RandomRole({factionTag, randomTag, roleSet:this.roleSet}))
                for(const nonFactionTag of nonFactionTags){
                    if(nonFactionTag.name !== 'Random'){
                        // 先看一下nonFactionTag.includeRoleNames和factionTag.includeRoleNames有没有交集
                        const roleNameIntersection = factionTag.includeRoleNames.filter(rName => nonFactionTag.includeRoleNames.includes(rName))
                        if(roleNameIntersection.length > 0){
                            // 如果有交集，再看一下交集是否和factionTag.includeRoleNames完全一致
                            const ftirn = factionTag.includeRoleNames.sort()
                            const rni = roleNameIntersection.sort()
                            if(ftirn.every((rName, index) => rName === rni[index]) === false){
                                this.roleSet.push(new RandomRole({factionTag, nonFactionTag, randomTag, roleSet:this.roleSet}))
                            }
                        }
                    }
                }
            }
        },
        selectedCategory:undefined,
        selectCategory(category){
            this.selectedCategory = category
            this.selectedRole = undefined
        },

        getRoleSetByCategoryName(categoryName){
            return  this.roleSet?.filter(r => r.affiliationName === categoryName)
        },
        selectedRole:undefined,
        selectRole(role){
            this.selectedRole = role
            this.selectedCategory = role.affiliation
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

        getRoleListMagicStrings(roleListData){
            if(roleListData === undefined) return;
            let magicStrings = roleListData.map(rd => {
                if(typeof(rd) === 'string')
                    return this.roleSet?.find(r => r.name === rd)
                else if('name' in rd)
                    return this.roleSet?.find(r => r.name === rd.name)
            })
            .filter(r => r !== undefined)
            .map(r => {
                return {magicString:r.getNameMagicString(), role:r}
            })
            return magicStrings
        },

        getPossibleRoleData(){
            if(this.possibleRoleSet === undefined) return;
            let possibleRoleDataArray = this.possibleRoleSet.map(prd => {
                let roleData = this.roleSet.find(r => r.name === prd.name)
                roleData.expectation = prd.expectation
                roleData.probability = prd.probability

                return roleData
            })

            return possibleRoleDataArray.sort((a,b)=>{
                    return this.roleSet.indexOf(this.roleSet.find(r => r.name === a.name)) - this.roleSet.indexOf(this.roleSet.find(r => r.name === b.name))
                })
        },

        //开始信息及按钮
        startInfo:"",
        startButtonToggle:true,
        start(){
            if(this.startButtonToggle === true){
                this.settingWatchIgnore = true
                this.setting.roleList = this.preprocessRandomRole(this.setting.roleList)
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
                    if(this.durationSec <= 0){
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
        myIndex:undefined,
        lynchVoteCount:undefined,

        // 玩家列表...的按钮
        clickTempButton(target){
            let targetIndex = target.index + 1
            if(this.status.split('/').includes('lynchVote')){
                this.commandHandler(`lynchVote ${targetIndex}`)
            }else if(this.status === 'night/discussion'){
                if(this.myRole.name === 'Doctor')
                    this.commandHandler(`useAbility DoctorHealProtect ${targetIndex}`)
                else
                    this.commandHandler(`target ${targetIndex}`)
            }
        },

        // 游戏结束后显示的演员表
        cast:undefined,

        // 消息历史记录
        messageLogToggle:false,

        // 遗言编辑栏
        lastWillEditorToggle:false,
        lastWillSubmit(){
            let lwi1t = document.getElementById('lastWillInput1').value
            let lwi2t = document.getElementById('lastWillInput2').value

            let lws = isEmpty(lwi2t) ? lwi1t : `${lwi1t}\n${lwi2t}`

            if(isEmpty(lws) === false)
                this.commandHandler(`lastWill ${lws}`)

            this.lastWillEditorToggle = false
        },

        trialVoteOption:undefined,
        trialVote(option){
            this.trialVoteOption = option
            this.commandHandler(`trialVote ${option}`)
        },

        preprocessRandomRole(roleListData){
            const randomRoleSet = Array.from(new Set(roleListData.filter(rName => rName.endsWith('Random'))))
            if(randomRoleSet.size === 0)
                return roleListData


            const randomObjectSet = randomRoleSet.map(randomName => {
                return this.roleSet.find(r => r.name === randomName).generateRandomObject()
            })

            let newRoleList = cloneDeep(roleListData)
            for(const randomObject of randomObjectSet){
                newRoleList.forEach((roleName, index) =>{
                    if(roleName === randomObject.name)
                        newRoleList[index] = randomObject
                })
            }

            return newRoleList
        },

        roleCardData:undefined,
        openRoleCard(event, roleData){
            this.roleCardData = roleData
            const roleCardElement = document.getElementById("roleCard")
            // roleCardElement本身会影响到鼠标移入移出的判定，所以要加上一个5px的偏差值
            roleCardElement.style.top  = event.clientY + 5 + "px"
            roleCardElement.style.left = event.clientX + 5 + "px"
        },
        closeRoleCard(){
            this.roleCardData = undefined
        }
    }))

    function cloneDeep(o){
        return JSON.parse(JSON.stringify(o))
    }

    function isEmpty(str) {  
        return str === null || str === undefined || /^\s*$/.test(str);  
    }  

    function onMessage(e){
        const event = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent(event.type, { detail:event.data }))
        if(event.data)
            console.log('recive <-', "type:", event.type, "\t data:", event.data)
        else
            console.log('recive <-', "type:", event.type)
    }

    function sendEvent(type, data){
        const event = {type,data}
        socket.send(JSON.stringify(event))
        if(event.data)
            console.log("send ->", "type:", event.type, "\t data:", event.data)
        else
            console.log('send ->', "type:", event.type)
    }

    function scrollToBottom(elementClass) {
        const content = document.querySelector(`.${elementClass}`);
        content.scrollTop = content.scrollHeight;
    }
    
    function hexToRgba(hex, opacity){
        hex = hex.replace('#', '')
        if (hex.length === 3) {  
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
        }  
        let r = parseInt(hex.substring(0, 2), 16)
        let g = parseInt(hex.substring(2, 4), 16)
        let b = parseInt(hex.substring(4, 6), 16)
        return `rgba(${r},${g},${b},${opacity})`
    }
})

class Player{
    constructor(playerData, color){
        this.data    = playerData
        this.isAlive = playerData.isAlive ?? true
        this.color   = html5ColorHexMap[color]??(color.startsWith('#')? color:`#${color}`)
    }

    get name(){
        return this.data.name
    }

    get index(){
        return this.data.index
    }

    get userName(){
        return this.data.userName
    }

    getIndexAndNameMagicString(){
        return new MagicString({text:`${this.index+1}.${this.name}`, style:`color:${this.color};`})
    }

    getNameMagicString(){
        return new MagicString({text:this.name, style:`color:${this.color};`})
    }

    getNameMagicString_Bold(){
        return new MagicString({text:this.name, style:`color:${this.color};font-weight:bold;`})
    }
    
    getNameMagicStringWithExtras({text:extext, style:exstyle}){
        return new MagicString({text:this.name+(extext??''), style:`color:${this.color};`+(exstyle??'')})
    }

}


// 这个类有潜力发展成html custom element，但是我还需要更多研究
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

const frontendData = {
    tags :[
        {
            name:"Town",
            nameTranslate:'城镇',
            color:"lime",
        },
        {
            name:"Mafia",
            nameTranslate:'黑手党',
            color:"red",
        },
        {
            name:"Random",
            nameTranslate:'随机',
            color:"#00ccff",
        },
        {
            name: "Killing",
            nameTranslate:'致命',
        },
        {
            name: "Team",
            nameTranslate:'团队',
        },
    ],
    factions:[
        {
            name:'Town',
            goalDescriptionTranslate:"处死所有罪犯和恶人。"
        },
        {
            name:'Mafia',
            goalDescriptionTranslate:"杀光城镇以及所有想要对抗你们的人。"
        },
    ],
    roles:[
        {
            name:"Citizen",
            nameTranslate:"市民",
            descriptionTranslate:"一个相信真理和正义的普通人",
            abilityDescriptionTranslate:"市民默认没有任何特殊能力",
            otherDescriptionTranslate:"市民在这个游戏中默认为最为普遍的角色",
            abilityDetails:["你没有任何特殊能力。"],
            featureDetails:["如果所有市民死亡，则城镇输掉这场游戏。"]
        },
        // {
        //     name:"Sheriff",
        //     nameTranslate:"警长",
        //     descriptionTranslate:"一个执法机构的成员，迫于谋杀的威胁而身处隐匿。",
        //     abilityDescriptionTranslate:"这个角色有每晚侦查一人有无犯罪活动的能力。",
        // },
        {
            name:"AuxiliaryOfficer",
            nameTranslate:"辅警",
            descriptionTranslate:"一名与同僚熟络的辅助警员。",
            abilityDescriptionTranslate:"这个角色有在夜晚与其他辅警合作侦查的能力。",
            abilityDetails:["每晚投票调查一人的阵营。"],
            featureDetails:[
                "在晚上你可以与其他辅警交谈。",
                "你知道其他辅警的身份。" ,
                "辅警团队在晚上可以投票（随机）派出一人调查某人的阵营。",
                "调查结果全团可知，但如果调查人被杀，则没有结果。"
            ]
        },
        {
            name:"Doctor",
            nameTranslate:"医生",
            descriptionTranslate:"一个熟练于医治外伤的秘密外科医生。",
            abilityDescriptionTranslate:"这个角色有每晚救治一人，使其免受一次死亡的能力。",
            abilityDetails:["每晚救治一人，使其免受一次死亡。"],
            featureDetails:["还没空写"]
        },
        {
            name:"Mafioso",
            nameTranslate:"党徒",
            descriptionTranslate:"一个犯罪组织的成员。",
            abilityDescriptionTranslate:"这个角色有在夜晚与其他黑手党合作杀人的能力。",
            abilityDetails:["每晚投票杀死一人。"],
            featureDetails:[
                "在晚上你可以与其他黑手党成员交谈",
            ]
        },
        // {
        //     name:"AllRandom",
        //     nameTranslate:"全体随机",
        //     descriptionTranslate:"可能是游戏中的任意角色",
        // },
    ],

    // 我觉得还不到引入一个本地化系统的时候
    // translateData:{
    //     chinese:{
    //         tags:[
    //             {
    //                 name:'Town',
    //                 nameTranslate:'城镇'
    //             },
    //             {
    //                 name:'Mafia',
    //                 nameTranslate:'黑手党'
    //             },
    //             {
    //                 name:'Random',
    //                 nameTranslate:'随机'
    //             },
    //         ],
    //         factions:[
    //             {
    //                 name:'Town',
    //                 goalDescriptionTranslate:"处死所有罪犯和恶人。"
    //             },
    //             {
    //                 name:'Mafia',
    //                 goalDescriptionTranslate:"杀光城镇以及所有想要对抗你们的人。"
    //             },
    //         ]
    //     }
    // }
}

class Tag{
    constructor(tagFrontendData, tagBackendData){
        this.data = tagFrontendData
        this.data = {...this.data, ...tagBackendData}

        if(this.data.isFaction){
            const fnfd = frontendData.factions.find(fnfd => fnfd.name === this.data.name)
            this.data = {...this.data, ...fnfd}
        }

        return new Proxy(this, {
            get(target, prop) {
                return prop in target ? target[prop] : target.data[prop]
            }
        })
    }

    getNameMagicString(){
        const name = this.data.nameTranslate ?? this.name
        return new MagicString({text:name, style:`color:${this.color};`})
    }
}

class Role{
    constructor(roleFrontendData, roleBackendData, tagSet){
        this.data = roleFrontendData
        this.data = {...this.data, ...roleBackendData}
        this.affiliation = tagSet.find(t => (t.isFaction && t.name === this.data.affiliationName))

        return new Proxy(this, {
            get(target, prop) {
                return prop in target ? target[prop] : target.data[prop]
            }
        })
    }

    get color(){
        return this.data.color ?? this.affiliation?.color
    }

    getNameMagicString(){
        const name = this.data.nameTranslate ?? this.name
        return new MagicString({text:name, style:`color:${this.color};`})
    }
}

class RandomRole{
    constructor({factionTag, nonFactionTag, randomTag, roleSet}){
        this.factionTag = factionTag
        this.nonFactionTag = nonFactionTag ?? undefined
        this.randomTag = randomTag
        this.affiliationName = randomTag.name
        this.affiliation = randomTag
        this.roleSet = roleSet
    }

    get name(){
        return this.factionTag.name + (this.nonFactionTag?.name ?? '') + this.randomTag.name
    }

    get nameTranslate(){
        return this.factionTag.nameTranslate + (this.nonFactionTag?.nameTranslate ?? '') + this.randomTag.nameTranslate
    }

    get includeRoleNames(){
        const nonFactionRoleNameSet = new Set(this.nonFactionTag?.includeRoleNames)
        if(nonFactionRoleNameSet.size > 0)
            return this.factionTag.includeRoleNames.filter(rName => nonFactionRoleNameSet.has(rName))
        else
            return this.factionTag.includeRoleNames
    }

    getNameMagicString(){
        let ms = new MagicString({text:this.factionTag.nameTranslate, style:`color:${this.factionTag.color};`})
        ms.append(new MagicString({text:(this.nonFactionTag?.nameTranslate ?? this.randomTag.nameTranslate), style:`color:${this.randomTag.color};`}))
        return ms
    }

    generateRandomObject(){
        const includeRoles = this.includeRoleNames.map(rName => this.roleSet.find(r => r.name === rName)).filter(r => r !== undefined)

        return {
            name:this.name,
            possibleRoleSet:includeRoles.map(r => {
                return {name:r.name, weight:r.weight ?? 1}
            })
        }
    }
}