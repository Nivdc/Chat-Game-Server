import { abilityUseVerify, publicVoteVerify, teamVoteVerify} from "../gameData.js"
import { arraysEqual } from "../utils.js"

let socket = undefined

document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        loading:true,
        settingWatchIgnore:false,
        setting:{},

        async init() {
            this.setting = cloneDeep(this.presets[0].setting)
            this.socketInit()
            this.readyPlayerIndexList = []
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

            // this.actionSequence.push('mafiaKillAttack')
            // this.actionSequence.push('doctorHealProtect')
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
                const hostIndex = data.index
                this.host = this.playerList[data.index]
                let message = new MagicString()
                message.append(this.host.getNameMagicString_Bold())
                message.append({text:'  是新的主机', class:'text-warning'})
                if(this.isRunning === false && this.status !== 'begin')
                    this.addMessage(message)

                if(hostIndex === this.myIndex){
                    enableElements('settingPageTopBar')
                    enableElements('presetForm')
                    enableElements('settingPageInnerBodyRightBar')
                }else{
                    disableElements('settingPageTopBar')
                    disableElements('presetForm')
                    disableElements('settingPageInnerBodyRightBar')
                }
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

                this.playerList = playerDatas.map(pd => new Player(this, pd, playerColors[pd.index]))
            },

            'ChatMessage':function(data){
                const sender  = this.playerList[data.senderIndex]
                const senderIsDead = data.senderIsDead

                const message = new MagicString()
                if(sender !== undefined)
                    message.append(sender.getNameMagicStringWithExtras({text:': ', style:`font-weight:bold;`}))
                else if(data.isRadioMessage){
                    message.append(new MagicString({text:'广播消息: ', style:`font-weight:bold;color:MediumSpringGreen;`}))
                }
                else{
                    message.append(new MagicString({text:'匿名者: ', style:`font-weight:bold;`}))
                }
                message.addText(data.message)

                if(senderIsDead)
                    message.style = `background-color:${hexToRgba(html5ColorHexMap['darkred'], 0.7)};`
                if(sender === this.executionTarget || sender === this.trialTarget || data.isRadioMessage)
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

            'SetReadyPlayerIndexList':function(data){
                const newReadyPlayerIndexList = data
                const newPlayerIndexList = getComplement(newReadyPlayerIndexList, this.readyPlayerIndexList)
                for(const pIndex of newPlayerIndexList){
                    let message = new MagicString({style:'background-color:rgba(0, 0, 0, 0.2);color:yellow;text-shadow: 1px 1px 0px #000000;'})
                    let player  = this.playerList[pIndex]
                    if(player !== undefined){
                        player.isReady = true
                        message.append(player.getNameMagicString_Bold())
                        message.append({text:` 加入了游戏 (${this.playerList.filter(p => p.isReady === true).length} / ${this.playerList.length})`})
                        this.addMessage(message)
                    }
                }

                this.readyPlayerIndexList = newReadyPlayerIndexList
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
                    this.generateRoleDetails()
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
                    this.myLynchVoteTargetIndex = undefined
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
                    this.createTimer('夜晚', this.setting.nightLength, ()=>{this.timer = undefined})
                }
                else if(this.status === 'animation/nightToAction'){
                    this.playAnimation('nightToAction')
                    this.myAbilities?.forEach(a => a.target = undefined)
                }
                // else if(this.status === 'action'){
                //     // nothing to do...
                // }
                else if(this.status === 'animation/actions'){
                    this.playActionAnimations()
                }
                else if(this.status === 'animation/actions/last12Sec'){
                    this.createTimer('行动', 0.2, ()=>{this.timer = undefined})
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
                this.myAbilities = data.abilityNames?.map(aName => new Ability(this, aName))
            },

            'SetTeam':function(data){
                this.myTeam = data
                this.myTeam.playerList = data.memberPlayerData.map(mpd => this.playerList.find(p => p.index === mpd.index))
                this.myTeam.playerList.forEach(p => {
                    const playerRoleName = data.memberPlayerData.find(mpd => mpd.index === p.index).role.name
                    p.role = this.roleSet.find(r => r.name === playerRoleName)
                })
                // 这里有一个this指针的绑定问题，下面这个函数的this绑定到了全局的game，暂时就先这样吧，它能用
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

                this.playerList[this.myIndex].team = this.myTeam

                this.myTeam.color = this.factionSet.find(f => f.name === this.myTeam.affiliationName).color
            },

            'SetWinner':function(data){
                const winningFaction = this.factionSet.find(f => f.name === data.winningFactionName)
                const winners = data.winners.map(dw => {
                    const winnerPlayer = this.playerList[dw.index]
                    winnerPlayer.role = this.roleSet.find(r => r.name === dw.role.name)
                    winnerPlayer.affiliationName = dw.affiliationName
                    return winnerPlayer
                })

                const neutralWinners = winners.filter(w => w.affiliationName === undefined)

                this.gamePageTipMessage = new MagicString()
                this.gamePageTipMessage.addText("我们得到的结果是 ... ")
                if(winningFaction !== undefined){
                    this.gamePageTipMessage.addText(winningFaction.nameTranslate, winningFaction.color)
                }else{
                    if(neutralWinners.length > 0){
                        for(const [index, nw] of neutralWinners.entries()){
                            if(index !== 0) this.gamePageTipMessage.addText('、');
                            this.gamePageTipMessage.append(nw.role.getNameMagicString())
                        }
                    }else{
                        this.gamePageTipMessage.addText("无人")
                    }
                }
                this.gamePageTipMessage.addText(" 胜利！")
                this.gamePageTipMessage.class = 'animation-fadeIn-1s'
            },

            'SetCast':function(data){
                this.cast = data.map(pd => {
                    let ms = new MagicString
                    ms.append(this.playerList[pd.index].getNameMagicString())
                    ms.addText(" 饰演 ")
                    for(const [index, roleName] of pd.playedRoleNameRecord.entries()){
                        if(index !== 0)
                            ms.addText('/')
                        ms.append(this.roleSet.find(r => r.name === roleName).getNameMagicString())
                    }
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
            'SetFactionSet':function(data){
                const factionFrontendDatas = frontendData.factions
                const factionBackendDatas = data

                this.factionSet = factionFrontendDatas.map(ffd => new Faction({...ffd, ...factionBackendDatas.find(fbd => fbd.name === ffd.name)}))
            },
            'SetTagSet':function(data){
                const tagFrontendDatas = frontendData.tags
                const tagBackendDatas = data

                this.tagSet = tagFrontendDatas.map(tfd => new Tag({...tfd, ...tagBackendDatas.find(tbd => tbd.name === tfd.name)}))
                this.categoryList = this.factionSet
            },
            'SetRoleSet':function(data){
                const roleFrontendDatas = frontendData.roles
                const roleBackendDatas = data.filter(rd => roleFrontendDatas.find(rfd => rfd.name === rd.name) !== undefined)
                getComplement(roleFrontendDatas.map(r => r.name), roleBackendDatas.map(r => r.name)).forEach(roleName => console.error(`Role: ${roleName} has no frontend data!`))
                roleBackendDatas.filter(rbd => rbd.defaultAffiliationName === undefined).forEach(rbd => rbd.defaultAffiliationName = 'Neutral')

                this.roleSet = roleFrontendDatas.map(rfd => new Role({...rfd, ...roleBackendDatas.find(rbd => rbd.name === rfd.name)}, this.tagSet, this.factionSet, this.setting))
                this.factionSet.forEach(f => f.addExtraRoleName(this.roleSet))
                this.addRandomRoles()
            },

            'SetRecentlyDeadPlayers':function(data){
                this.recentlyDeadPlayers = data

                const myData = data.find(dp => dp.index === this.myIndex)
                if(myData !== undefined)
                    this.addSystemHintText("哦不，你死了，但是你仍可以留下来观看本局游戏。", 'darkred')
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

                if(voter.index === this.myIndex){
                    this.myLynchVoteTargetIndex = target.index
                }
            },
            'LynchVoteCancel':function(data){
                let voter = this.playerList[data.voterIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                message.addText(' 取消了他的投票')
                message.style = `background-color: rgba(0, 0, 0, 0.5);`
                this.addMessage(message)

                if(voter.index === this.myIndex){
                    this.myLynchVoteTargetIndex = undefined
                }
            },

            'SetLastWill':function(data){
                let lastWillString = data
                if(isEmpty(lastWillString)) return;
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
                    this.addSystemHintText('你写下了你的留言信息: ')
                    this.addSystemHintText(killerMessageString)
                }
                else{
                    this.addSystemHintText('你清除了你的留言信息。')
                }
            },

            'TeamVote':function(data){
                const voter = this.playerList[data.voterIndex]
                const target = this.playerList[data.targetIndex]
                const message = new MagicString()
                const abilityActionWord =  frontendData.abilities.targetedAbilities[data.teamAbilityName].actionWord
                message.append(voter.getNameMagicString())
                if(data.previousTargetIndex === undefined)
                    message.addText(` 投票${abilityActionWord} `)
                else
                    message.addText(' 将他的投票改为 ')
                message.append(target.getNameMagicString())
                message.style = `background-color:${hexToRgba(target.color, 0.5)};text-shadow: 1px 1px 0px #000000;`
                this.addMessage(message)

                if(voter.index === this.myIndex){
                    this.myTeamAbilityVoteTargetIndex = target.index
                }
            },
            'TeamVoteCancel':function(data){
                let voter = this.playerList[data.voterIndex]
                let message = new MagicString()
                message.append(voter.getNameMagicString())
                message.addText(' 取消了他的投票')
                message.style = `background-color: rgba(0, 0, 0, 0.5);`
                this.addMessage(message)

                if(voter.index === this.myIndex){
                    this.myTeamAbilityVoteTargetIndex = undefined
                }
            },
            'TeamAbilityTargetsNotice':function(data){
                if(data){
                    const message = new  MagicString()
                    const targets = data.targets?.map(pidx => this.playerList[pidx])
                    const abilityActionWord =  frontendData.abilities.targetedAbilities[data.teamAbilityName].actionWord
                    if(targets === undefined || targets.length === 0){
                        message.addText(`你们决定今晚不${abilityActionWord}任何人。`)
                        message.style = `background-color: rgba(0, 0, 0, 0.5);`
                    }
                    else if(targets.length === 1){
                        message.addText(`你们决定${abilityActionWord} `)
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
                        message.addText(` ] 中随机${abilityActionWord}一人。`)
                        message.style = `background-color: rgba(0, 0, 0, 0.5);`
                    }
                    this.addMessage(message)
                }
            },
            'TeamNightActionNotice':function(data){
                const action = data
                const message = new MagicString()
                message.addText('你们决定派出 ')
                message.append(this.playerList[action.originIndex].getNameMagicString())
                message.addText(` 去${frontendData.abilities.targetedAbilities[action.name].actionWord} `)
                message.append(this.playerList[action.targetIndex].getNameMagicString())
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

            'ActionHappened':function(data){
                this.actionSequence.push(data)
            },

            'YouDecidedToCommitSuicide':function(data){
                this.addSystemHintText('你决定在今晚自杀！', 'red')
            },
            'YouGiveUpSuicide':function(data){
                this.addSystemHintText('你洗了把脸清醒了一下，决定还是不自杀了', 'green')
            },

            'UseAblitySuccess':function(data){
                const abilityName = data.name
                this.myAbilities.find(a => a.name === abilityName).useSuccess(data)
            },
            'UseAblityCancelSuccess':function(data){
                const abilityName = data.name
                this.myAbilities.find(a => a.name === abilityName).cancelSuccess()
            },
            'UseAblityFailed':function(data){
                this.addSystemHintText('技能使用失败，可能是因为在冷却、没次数了。(更多提示以后再做吧。)')
            },

            'TrialTargetIsSilenced':function(data){
                this.addSystemHintText('系统提示：当前审判的玩家被沉默了')
            }
        },
        commandHandler(commandString){
            let [command, ...args] = commandString.split(" ")

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

                case 'lv':
                case 'lynchVote':{
                    if(this.status.split('/').includes('lynchVote')){
                        const targetIndex = Number(args.shift())-1
                        if(publicVoteVerify(this ,'LynchVote', {voterIndex:this.myIndex, targetIndex})){
                            if(Number.isNaN(targetIndex) === false)
                                sendEvent('LynchVote', targetIndex)
                            else
                                sendEvent('LynchVoteCancel')
                        }
                        else
                            this.addSystemHintText("投票参数验证失败")
                    }
                    else
                        this.addSystemHintText("当前阶段不允许进行审判投票")
                break}
                case 'lynchVoteCancel':
                    sendEvent('LynchVoteCancel')
                break

                case 'tg':
                case 'target':
                case 'teamVote':
                    // todo: 缺少一些投票失败的提示
                    const targetIndex = Number(args.shift())-1
                    if(Number.isNaN(targetIndex) === false){
                        sendEvent('TeamVote', targetIndex)
                    }else{
                        sendEvent('TeamVoteCancel')
                    }
                break
                case 'teamVoteCancel':
                    sendEvent('TeamVoteCancel')
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
                case 'useAbility':{
                    const usedAbilityName = args.shift()
                    const targetIndex = Number(args.shift())-1

                    if(this.myAbilities?.map(a => a.name).includes(usedAbilityName)){
                        const extraData = args.length > 0 ? args : undefined
                        if(Number.isNaN(targetIndex) === false){
                            sendEvent('UseAbility', {name:usedAbilityName, targetIndex, extraData})
                        }else{
                            sendEvent('UseAbility', {name:usedAbilityName, extraData})
                        }
                    }
                break}
                case 'useAbilityCancel':
                    const cancelAbilityName = args.shift()
                    if(this.myAbilities?.map(a => a.name).includes(cancelAbilityName)){
                        sendEvent('UseAbilityCancel', {name:cancelAbilityName})
                    }
                break

                case 'Suicide':
                case'suicide':
                    sendEvent('Suicide')
                break


                default:
                    this.addSystemHintText("未知指令，请重试。")
                break
            }
        },
        async playAnimation(animationName, data){
            const classList = document.getElementById('gamePage').classList
            const animationClassList = [...classList].filter(className => className.startsWith('animation'))
            animationClassList.forEach(c => classList.remove(c))

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
                    document.getElementById('gamePage').classList.add('animation-dayToNight-6s')
                    document.getElementById('gamePage').style.backgroundColor = '#002B36'
                    this.gamePageTipMessage = new MagicString({text:"不幸的是，再讨论下去太晚了..."})
                    this.gamePageTipMessage.class = 'animation-fadeIn-1s'
                    setTimeout(()=>{
                        this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                    }, 3000)
                break
                case 'nightToDay':
                    document.getElementById('gamePage').classList.add('animation-nightToDay-6s')
                    document.getElementById('gamePage').style.backgroundColor = '#073642'
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
                    document.getElementById('gamePage').classList.add('animation-nightToAction-6s')
                    document.getElementById('gamePage').style.backgroundColor = 'black'

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
                    document.getElementById('gamePage').classList.add('animation-actionToDay-6s')
                    document.getElementById('gamePage').style.backgroundColor = '#073642'
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
                        player.deathReason = data.deathReason

                        if(this.status === 'animation/daily/deathDeclear'){
                            this.gamePageTipMessage = new MagicString()
                            this.gamePageTipMessage.append(player.getNameMagicString())
                            this.gamePageTipMessage.addText(' 在这个早晨被发现时已经死亡了。')

                            player.deathTime = `${this.dayCount - 1}/Night`
                            // todo: killerHint
                        }
                        else if(this.status === 'animation/execution/deathDeclear'){
                            // 这个时候提示栏正在被“xxx，你还有什么遗言吗？”占用
                            if(this.gamePageTipMessage.class !== 'animation-fadeOut-2s')
                                this.gamePageTipMessage.class = 'animation-fadeOut-2s'

                            player.deathTime = `${this.dayCount}/Day`
                        }

                        if(role !== undefined)
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
                case 'youTakeAction':{
                    const relatedAbilityName = data.actionName
                    Ability.generateActionNotice(this, relatedAbilityName, data)

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}

                case 'yourTargetIsAttacked':{
                    this.addSystemHintText("你行动的对象今晚被攻击了", 'red')

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}

                case 'youUnderAttack':{
                    const source = this.factionSet.find(f => f.name === data.source) ?? this.roleSet.find(r => r.name === data.source)
                    if(data.originalActionName === 'CloseProtection' && source){
                        if(source.name === 'Bodyguard'){
                            this.addSystemHintText(`你的目标被保护着，你与保镖交火。`, 'red')
                        }else{
                            this.addSystemHintText(`你的目标被攻击了，你与入侵者交火。`, 'red')
                        }
                    }
                    else if(source !== undefined)
                        this.addSystemHintText(`你被${source.nameTranslate}袭击了`, 'red')
                    else
                        this.addSystemHintText("你被人袭击了", 'red')


                    const gamePageElement = document.getElementById('gamePage')
                    return new Promise((resolve) => {
                        gamePageElement.classList.add('animation-underAttack-6s')
                        gamePageElement.addEventListener('animationend', () => {
                            resolve()
                        }, { once: true })
                    })
                break}

                case 'youAreProtected':{
                    if(data.originalActionName === 'Heal')
                        this.addSystemHintText("但是有个陌生人救了你一命", 'limegreen')
                    else if(data.originalActionName === 'CloseProtection')
                        this.addSystemHintText("但是有个陌生人击退了入侵者", 'limegreen')

                    const gamePageElement = document.getElementById('gamePage')
                    return new Promise((resolve) => {
                        gamePageElement.classList.add('animation-protect-2s')
                        gamePageElement.addEventListener('animationend', () => {
                            resolve()
                        }, { once: true })
                    })
                break}

                case 'receiveDetectionReport':{
                    const target = this.playerList[data.targetIndex]
                    const faction = this.factionSet.find(f => f.name === data.targetAffiliationName)
                    const role = this.roleSet.find(r => r.name === data.targetRoleName)
                    const message = new MagicString()
                    message.append(target.getNameMagicString())
                    if(faction !== undefined && faction.name !== 'Neutral'){
                        message.addText(' 是 ')
                        message.append(faction.getNameMagicString())
                    }
                    else if(role !== undefined){
                        message.addText(' 是 ')
                        message.append(role.getNameMagicString())
                    }
                    else{
                        message.addText(' 看起来不可疑。')
                    }
                    this.addMessage(message)

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}

                case 'receiveTrackReport':{
                    const target = this.playerList[data.targetIndex]
                    const visitedTargets = data.visitedTargetIndices?.map(index => this.playerList[index])
                    const message = new MagicString()
                    message.append(target.getNameMagicString())
                    if(visitedTargets !== undefined && visitedTargets.length > 0){
                        message.addText(' 今晚访问了 ')
                        visitedTargets.forEach((p, index) =>{
                            if(index > 0) message.addText(', ');
                            message.append(p.getNameMagicString())
                        })
                    }
                    else{
                        message.addText(' 今晚没有访问任何人。')
                        if(data.targetHasNightAction === true){
                            message.addText('但是你察觉他今晚有所行动！')
                        }
                    }
                    this.addMessage(message)

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}

                case 'youCommittedSuicide':{
                    this.addSystemHintText("你自杀了", 'red')

                    const gamePageElement = document.getElementById('gamePage')
                    return new Promise((resolve) => {
                        gamePageElement.classList.add('animation-suicide-2s')
                        gamePageElement.addEventListener('animationend', () => {
                            resolve()
                        }, { once: true })
                    })
                break}

                case 'yourRoleIsBlocked':{
                    this.addSystemHintText("一个迷人的身躯占据了你的夜晚，今夜你无暇顾及其他...", 'Fuchsia')

                    const gamePageElement = document.getElementById('gamePage')
                    return new Promise((resolve) => {
                        gamePageElement.classList.add('animation-roleBlocked-2s')
                        gamePageElement.addEventListener('animationend', () => {
                            resolve()
                        }, { once: true })
                    })
                break}

                case 'youWereSilenced':{
                    this.addSystemHintText("一名极度危险的人物威胁了你，你被沉默了。", 'yellow')

                    const gamePageElement = document.getElementById('gamePage')
                    return new Promise((resolve) => {
                        gamePageElement.classList.add('animation-silenced-2s')
                        gamePageElement.addEventListener('animationend', () => {
                            resolve()
                        }, { once: true })
                    })
                break}

                case 'yourTargetHasEffect':{
                    switch(data.effectName){
                        case 'ImmuneToRoleBlock':
                            this.addSystemHintText("你的目标免疫限制", 'white')
                        break

                        case 'ImmuneToAttack':{
                            this.addSystemHintText("你的目标矫健地躲过了你的攻击!（夜间无敌）")
                        }
                    }

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}

                case 'someoneIsTryingToDoSomethingToYou':{
                    let actionName = data.originalActionName ?? data.actionName
                    if(data.originalActionName === 'CloseProtection' && data.actionName === 'Attack') actionName = 'Attack';
                    const actionWord = frontendData.abilities.targetedAbilities[actionName].actionWord
                    const source = this.factionSet.find(f => f.name === data.source) ?? this.roleSet.find(r => r.name === data.source)
                    this.addSystemHintText(`今晚${source?.nameTranslate ?? '有人'}试图 ${actionWord} 你！`)

                    return new Promise((resolve) => {
                        setTimeout(()=>{
                            resolve()
                        }, 2 * 1000)
                    })
                break}
                
                default:
                    console.error(`Unknow animationName: ${animationName}`)
                break
            }
        },

        actionSequence:[],
        async playActionAnimations(){
            while(this.actionSequence.length > 0){
                const action = this.actionSequence.shift()
                const animationName = action.name.charAt(0).toLowerCase() + action.name.slice(1)
                await this.playAnimation(animationName, action)
            }
            sendEvent('AnimationsFinished')
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
                                        
                    enableDiscussion: false,
                    discussionTime: 0.3,

                    enableTrial: false,
                    enableTrialDefense: true,
                    trialTime: 0.2,
                    pauseDayTimerDuringTrial: false,
                    
                    startAt: "night",
                    
                    nightType: "Classic",
                    nightLength: 0.3,
                    showMoreAttackDetailsAtNight:true,
                    
                    revealPlayerRoleOnDeath: true,
                    revealAttackAndProtectSource:true,
                    enableCustomName: true,
                    enableKillerMessage: true,
                    enableLastWill: true,
                    enablePrivateMessage: true,
                    
                    roleList: [
                        // "Citizen", "Citizen",
                        // "Escort",
                        // "Doctor",
                        "SerialKiller",
                        "Sheriff",
                        // "Consort",
                        // "AllRandom",
                    ],

                    roleModifyOptions: {
                        // Town
                        citizen:{
                            hasAbility_BulletProof_UsesLimit_1_Times:true,
                        },
                        doctor:{
                            knowsIfTargetIsAttacked:true,
                        },
                        escort:{
                            hasEffect_ImmuneToRoleBlock:false,
                            knowsIfTargetHasEffect_ImmuneToRoleBlock:false,
                            consecutiveAbilityUses_2_Cause_1_NightCooldown:true,
                        },
                        vigilante:{
                            hasAbilityUsesLimit_2_Times: true,
                            hasAbilityUsesLimit_3_Times: false,
                            hasAbilityUsesLimit_4_Times: false,
                        },
                        detective:{
                            IgnoreEffect_ImmuneToDetect:false,
                        },
                        // Mafia
                        consort:{
                            canBeTurnedIntoTeamExecutor:true,
                            hasEffect_ImmuneToRoleBlock:false,
                            knowsIfTargetHasEffect_ImmuneToRoleBlock:false,
                        },
                        godfather:{
                            hasEffect_ImmuneToAttack:true,
                            hasEffect_ImmuneToRoleBlock:false,
                            hasEffect_ImmuneToDetect:true,
                            canBeTeamActionExecutor:true,
                            canBeTurnedIntoTeamExecutor:false,
                        },
                        blackmailer:{
                            canBeTurnedIntoTeamExecutor:true,
                            hasAbilityForceDisableTurn_1_AtStart:false,
                        },
                        // Neutral
                        serialKiller:{
                            hasEffect_ImmuneToAttack:true,
                            fightBackAgainstRoleBlocker:false,
                            hasEffect_ImmuneToDetect:false,
                        }
                    }
                }
            },
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
            const randomFaction = this.factionSet.find(f => f.name === 'Random')
            this.roleSet.push(new RandomRole({factionTag:allTag, randomFaction, game:this}))

            // 然后剩下的标签与Faction标签排列组合
            const factionTags = this.factionSet.filter(f => f.name !== 'Random')
            const nonFactionTags = this.tagSet.filter(t => (t.isFaction !== true))
            for(const factionTag of factionTags){
                this.roleSet.push(new RandomRole({factionTag, randomFaction, game:this}))
                for(const nonFactionTag of nonFactionTags){
                    if(nonFactionTag.name !== 'Random'){
                        // 先看一下nonFactionTag.includeRoleNames和factionTag.includeRoleNames有没有交集
                        const roleNameIntersection = getIntersection(factionTag.includeRoleNames, nonFactionTag.includeRoleNames)
                        if(roleNameIntersection.length > 0){
                            // 如果有交集，再看一下交集是否和factionTag.includeRoleNames完全一致
                            if(arraysEqual(factionTag.includeRoleNames, roleNameIntersection) === false){
                                this.roleSet.push(new RandomRole({factionTag, nonFactionTag, randomFaction, game:this}))
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
            return  this.roleSet?.filter(r => (r.defaultAffiliationName ?? r.affiliationName) === categoryName)
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
                let role = this.roleSet.find(r => r.name === prd.name)
                role.expectation = prd.expectation
                role.probability = prd.probability

                return role
            })

            return possibleRoleDataArray.sort((a,b)=>{
                    return this.roleSet.indexOf(this.roleSet.find(r => r.name === a.name)) - this.roleSet.indexOf(this.roleSet.find(r => r.name === b.name))
                })
        },

        //开始信息及按钮
        startInfo:"",
        startButtonToggle:true,
        start(){
            if(this.myIndex === this.host.index){
                if(this.startButtonToggle === true){
                    if(this.setting.roleList.length === this.playerList.length){
                        this.settingWatchIgnore = true
                        this.setting.roleList = this.preprocessRandomRole(this.setting.roleList)
                        sendEvent("HostSetupGame", this.setting)
                    }else{
                        this.addSystemHintText(`玩家人数与角色数量不匹配, 玩家人数: ${this.playerList.length} ${this.playerList.length > this.setting.roleList.length ? '>':'<'} 角色数量: ${this.setting.roleList.length}`, 'yellow')
                    }
                }else{
                    sendEvent("HostCancelSetup")
                }
            }
            else{
                this.addSystemHintText(`抱歉，您不是主机，无法开始游戏`, 'yellow')
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
        },

        graveyardDetailCardToggle:false,
        getDeadPlayerDatas({includeDeathReason}){
            let deadPlayerList = this.playerList.filter(p => p.isAlive===false)
            return deadPlayerList.map(p => p.getDeathDataMagicStringAndDeathTime({includeDeathReason})).sort((a, b)=>{
                const a_deathDay = Number(a.deathTime.split('/')[0])
                const b_deathDay = Number(b.deathTime.split('/')[0])

                if(a_deathDay !== b_deathDay)
                    return a_deathDay - b_deathDay
                else{
                    if(a.deathTime.split('/')[1] === b.deathTime.split('/')[1])
                        return 0
                    else if(a.deathTime.split('/')[1] === 'Day')
                        return -1
                    else if(b.deathTime.split('/')[1] === 'Day')
                        return 1
                }
            })
        },
        openGraveyardDetailCard(event){
            if(this.playerList.filter(p => p.isAlive === false).length > 0){
                this.graveyardDetailCardToggle = true
                const graveyardDetailCardElement = document.getElementById("graveyardDetailCard")
                // roleCardElement本身会影响到鼠标移入移出的判定，所以要加上一个5px的偏差值
                graveyardDetailCardElement.style.top  = event.clientY + 5 + "px"
                graveyardDetailCardElement.style.left = event.clientX + 5 + "px"
            }
        },
        closeGraveyardDetailCard(){
            this.graveyardDetailCardToggle = false
        },

        gameSettingDetailCardToggle:false,
        getGameSettingDetails(){
            let gsdmss = []

            let dayTypeMS = new MagicString()
            dayTypeMS.addText(`白天类型: `)
            this.setting.dayVoteType === 'Majority' ? dayTypeMS.addText('实名过半数') :
                this.setting.dayVoteType === 'Ballot' ? dayTypeMS.addText('匿名最高票') : dayTypeMS.addText('白天类型设置错误')
            dayTypeMS.addText(`/`)
            this.setting.enableTrial ? dayTypeMS.addText('审判') : dayTypeMS.addText('处刑')
            gsdmss.push(dayTypeMS)

            let dayLengthMS =  new MagicString()
            dayLengthMS.addText(`白天时长: ${this.setting.dayLength}分钟`)
            gsdmss.push(dayLengthMS)

            let enableDiscussionMS = new MagicString({text:'投票前讨论阶段: '})
            this.setting.enableDiscussion ? enableDiscussionMS.addText('开启', 'green') : enableDiscussionMS.addText('关闭', 'red')
            gsdmss.push(enableDiscussionMS)

            if(this.setting.enableDiscussion){
                let discussionTimeMS =  new MagicString()
                discussionTimeMS.addText(`讨论时长: ${this.setting.discussionTime}分钟`)
                gsdmss.push(discussionTimeMS)
            }

            if(this.setting.enableTrial){
                let pauseDayTimerDuringTrialMS = new MagicString({text:'审判时暂停白天: '})
                this.setting.pauseDayTimerDuringTrial ? pauseDayTimerDuringTrialMS.addText('开启', 'green') : pauseDayTimerDuringTrialMS.addText('关闭', 'red')
                gsdmss.push(pauseDayTimerDuringTrialMS)

                let enableTrialDefenseMS = new MagicString({text:'审判辩护阶段: '})
                this.setting.enableTrialDefense ? enableTrialDefenseMS.addText('开启', 'green') : enableTrialDefenseMS.addText('关闭', 'red')
                gsdmss.push(enableTrialDefenseMS)

                let trialTimeMS =  new MagicString()
                trialTimeMS.addText(`审判时长: ${this.setting.trialTime}分钟`)
                gsdmss.push(trialTimeMS)
            }

            let nightTypeMS = new MagicString()
            nightTypeMS.addText(`夜晚类型: `)
            this.setting.nightType === 'Classic' ? nightTypeMS.addText('经典') : nightTypeMS.addText('夜晚类型设置错误')
            gsdmss.push(nightTypeMS)

            let nightLengthMS =  new MagicString()
            nightLengthMS.addText(`夜晚时长: ${this.setting.nightLength}分钟`)
            gsdmss.push(nightLengthMS)


            let revealPlayerRoleOnDeathMS = new MagicString({text:'死亡后揭示身份: '})
            this.setting.revealPlayerRoleOnDeath ? revealPlayerRoleOnDeathMS.addText('开启', 'green') : revealPlayerRoleOnDeathMS.addText('关闭', 'red')
            gsdmss.push(revealPlayerRoleOnDeathMS)
            let enableLastWillMS = new MagicString({text:'遗嘱: '})
            this.setting.enableLastWill ? enableLastWillMS.addText('开启', 'green') : enableLastWillMS.addText('关闭', 'red')
            gsdmss.push(enableLastWillMS)
            let enablePrivateMessageMS = new MagicString({text:'私密消息: '})
            this.setting.enablePrivateMessage ? enablePrivateMessageMS.addText('开启', 'green') : enablePrivateMessageMS.addText('关闭', 'red')
            gsdmss.push(enablePrivateMessageMS)
            let enableKillerMessageMS = new MagicString({text:'杀手留言: '})
            this.setting.enableKillerMessage ? enableKillerMessageMS.addText('开启', 'green') : enableKillerMessageMS.addText('关闭', 'red')
            gsdmss.push(enableKillerMessageMS)
            // let _MS = new MagicString({text:'死亡描述: '})
            // this.setting._ ? _MS.addText('开启', 'green') : _MS.addText('关闭', 'red')
            // gsdmss.push(_MS)
            // let enableCustomNameMS = new MagicString({text:'自定义名称: '})
            // this.setting.enableCustomName ? enableCustomNameMS.addText('开启', 'green') : enableCustomNameMS.addText('关闭', 'red')
            // gsdmss.push(enableCustomNameMS)

            if(this.setting.roleList?.filter(r => (r.name ?? r).endsWith('Random')).length > 0){
                let randomRoleModifyDescriptionTitle = new MagicString({text:'随机角色选项', style:'font-weight:bold;margin-top:0.2em'})
                gsdmss.push(randomRoleModifyDescriptionTitle)

                let randomRoleNoModification = true

                const roleModifyOptions = this.setting.roleModifyOptions
                const modifyRandomRoleNames = Object.keys(roleModifyOptions).filter(keyName => keyName.endsWith('Random'))
                for(const modifyRandomRoleName of modifyRandomRoleNames){
                    const randomRoleName = modifyRandomRoleName.charAt(0).toUpperCase() + modifyRandomRoleName.slice(1)

                    if(this.setting.roleList.find(r => r.name === randomRoleName)){
                        for(const modifyOptionKey of Object.keys(roleModifyOptions[modifyRandomRoleName])){
                            if(roleModifyOptions[modifyRandomRoleName][modifyOptionKey]){
                                const randomRoleObject = this.roleSet.find(r => r.name === randomRoleName)
                                let ms = new MagicString()
                                ms.append(randomRoleObject.getNameMagicString())
                                ms.addText(': ' + randomRoleObject.modifyDescriptionTranslate[modifyOptionKey])
                                ms.addText(' -- ')
                                ms.addText('开启', 'green')
                                gsdmss.push(ms)

                                randomRoleNoModification = false
                            }
                        }
                    }
                }

                if(randomRoleNoModification){
                    gsdmss.push(new MagicString({text:'所有随机角色均无排除选项'}))
                }
            }

            return gsdmss
        },
        openGameSettingDetailCard(event){
            this.gameSettingDetailCardToggle = true
            const cardElement = document.getElementById("gameSettingDetailCard")
            cardElement.style.top  = event.clientY + 5 + "px"
            cardElement.style.left = event.clientX + 5 + "px"
        },
        closeGameSettingDetailCard(){
            this.gameSettingDetailCardToggle = false
        },

        myLynchVoteTargetIndex : undefined,
        myTeamAbilityVoteTargetIndex:undefined,
        // 注意，因为commandHandler是为了可见的UI设计的，所以在输入target的Index要+1才符合逻辑
        // 我们不区分玩家究竟是输入了指令还是按下了按钮，那么这里就要解决一个index差一问题
        // 玩家输入指令的时候肯定是按照他看见的索引值输入的，所以我们模拟玩家这一行为的时候也得要参照他能看见的索引值
        // 所以这里要加一
        getPlayerListButtons(player){
            let buttons = []
            const game = this
            const targetIndex = player.index
            const voteTarget = targetIndex + 1
            const lynchVoteButton = {
                text:'投票',
                style:'padding: 0.1em 1.5em;text-shadow: 0 0 2px red;color: white;font-weight:bold;',
                class:'border',
                click(){game.commandHandler(`lynchVote ${voteTarget}`)}
            }
            const lynchVoteCancelButton = {
                text:'取消',
                style:'padding: 0.1em 1.5em;text-shadow: 0 0 2px white;color: LightGrey;font-weight:bold;',
                class:'border',
                click(){game.commandHandler(`lynchVoteCancel`)}
            }

            const teamVoteButton = {
                style:`padding: 0.1em 1.5em;background-color:${this.myTeam?.color};`,
                click(){game.commandHandler(`teamVote ${voteTarget}`)}
            }
            const teamVoteCancelButton = {
                style:'padding: 0.1em 1.5em;background-color: LightGrey;',
                click(){game.commandHandler(`teamVoteCancel`)}
            }

            if(this.status?.split('/').includes('lynchVote')){
                if(publicVoteVerify(this ,'LynchVote', {voterIndex:this.myIndex, targetIndex, previousTargetIndex:this.myLynchVoteTargetIndex}))
                    buttons.push(lynchVoteButton)
                else if(targetIndex === this.myLynchVoteTargetIndex)
                    buttons.push(lynchVoteCancelButton)
            }

            // 团队投票和技能随时都可以使用，只是这些个按钮只会在夜间显示罢了
            if(this.status === 'night/discussion'){
                // 只有角色没技能且团队有技能的时候，会显示团队投票按钮
                // 如果角色有技能，请使用'-target'投票
                // 以后再改进吧...
                const myRoleHasAbility = (this.myRole.abilityNames !== undefined && this.myRole.abilityNames?.length > 0)
                if(myRoleHasAbility === false && this.myTeam?.abilityNames?.length > 0){
                    const teamAbilityName = this.myTeam.abilityNames[0]
                    if(teamVoteVerify(this, this.myTeam, teamAbilityName, {voterIndex:this.myIndex, targetIndex, previousTargetIndex:this.myTeamAbilityVoteTargetIndex}))
                        buttons.push(teamVoteButton)
                    else if(targetIndex === this.myTeamAbilityVoteTargetIndex)
                        buttons.push(teamVoteCancelButton)
                }
                else if(this.myAbilities?.length > 0){
                    this.myAbilities.forEach(a => buttons = buttons.concat(a.generateButtons(player)))
                }
            }

            return buttons
        },

        generateRoleDetails(){
            for(const r of this.roleSet.filter(r => r.name.endsWith('Random') === false)){
                if(r.name === 'Citizen'){
                    if(this.setting.protectCitizensMode){
                        r.featureDetails.push("如果所有市民死亡，则城镇输掉这场游戏。")
                    }
                }

                const roleNameLowerCase = r.name.charAt(0).toLowerCase() + r.name.slice(1)
                const modifyObject = this.setting.roleModifyOptions[roleNameLowerCase]
                if(modifyObject !== undefined){
                    for(const keyName of Object.keys(modifyObject)){
                        if(this.setting.roleModifyOptions[roleNameLowerCase][keyName]){
                            const modifyFeatureDescription = frontendData.roleModifyDescriptions[keyName].featureDescription
                            r.featureDetails.push(modifyFeatureDescription)
                        }
                    }
                }

                if(r.abilityDetails.length === 0)
                    r.abilityDetails.push(`${r.nameTranslate??r.name}没有任何特殊能力。`)
                if(r.featureDetails.length === 0)
                    r.featureDetails.push(`${r.nameTranslate??r.name}没有任何特性。`)
            }
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
    constructor(game, playerData, color){
        this.game    = game
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

    getDeathDataMagicStringAndDeathTime({includeDeathReason}){
        if(this.isAlive === false){
            let ms = new MagicString()
            ms.addText(`${this.index + 1} - `)
            ms.append(this.getNameMagicString())
            ms.addText('(')
            ms.append(this.role?.getNameMagicString() ?? {text:'???'})
            ms.addText(')')

            if(includeDeathReason === true){
                ms.addText(': 死于')
                const deathReasonDescriptions = []
                while(this.deathReason?.length > 0 ){
                    const deathReason = this.deathReason.shift()
                    if(deathReason.endsWith('Attack')){
                        const attackSourceName = deathReason.split('Attack')[0]
                        const attackSource = this.game.factionSet.find(f => f.name === attackSourceName) ?? this.game.roleSet.find(r => r.name === attackSourceName)

                        if(attackSource === undefined){
                            console.error(`Unknow attackSourceName:${attackSourceName}`)
                        }else{
                            deathReasonDescriptions.push(`${attackSource.nameTranslate}的攻击`)
                        }
                    }
                    switch(deathReason){
                        case 'Execution':
                            deathReasonDescriptions.push('处刑')
                        break
                        case 'Suicide':
                            deathReasonDescriptions.push('自杀')
                        break
                    }
                }

                if(deathReasonDescriptions.length === 0){
                    deathReasonDescriptions.push('未知原因')
                }

                while(deathReasonDescriptions.length > 0 )
                    ms.addText(`${deathReasonDescriptions.shift()}${deathReasonDescriptions.length === 0 ? '':', '}`)
            }

            return {magicString:ms, deathTime:this.deathTime}
        }
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

    addText(text, colorString){
        const style = colorString ? `color:${colorString}` : undefined
        this.parts.push({text, style})
    }

    append(newPart){
        if('getFlattenParts' in newPart)
            this.parts = this.parts.concat(newPart.getFlattenParts())
        else
            this.parts.push(newPart)
    }

    getFlattenParts(){
        let flattenPartArray = []
        flattenPartArray.push(this)
        for(const part of this.parts){
            if('parts' in part)
                flattenPartArray = flattenPartArray.concat(part.getFlattenParts())
        }
        return flattenPartArray
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
            name: "Killing",
            nameTranslate:'致命',
        },
        {
            name: "Team",
            nameTranslate:'团队',
        },
        {
            name:"Evil",
            nameTranslate:'邪恶',
        },
        {
            name: "Protective",
            nameTranslate:'保护',
        },
    ],
    factions:[
        {
            name:'Town',
            nameTranslate:'城镇',
            color:"lime",
            goalDescriptionTranslate:"处死所有罪犯和恶人。"
        },
        {
            name:'Mafia',
            nameTranslate:'黑手党',
            color:"red",
            goalDescriptionTranslate:"杀光城镇以及所有想要对抗你们的人。"
        },
        {
            name:"Neutral",
            nameTranslate:'中立',
            color:"lightgray",
        },
        {
            name:"Random",
            nameTranslate:'随机',
            color:"#00ccff",
        },
    ],
    abilities:{
        targetedAbilities:{
            default:{
                use(targetIndex){
                    this.game.commandHandler(`useAbility ${this.name} ${targetIndex + 1}`)
                },

                useSuccess(data){
                    this.target = this.game.playerList[data.targetIndex]

                    const message = new MagicString()
                    message.addText(`你决定在今晚${this.actionWord} `, this.color ?? this.game.myRole.color)
                    message.append(this.target.getNameMagicString())
                    this.game.addMessage(message)
                },

                cancelSuccess(){
                    const message = new MagicString()
                    message.addText(`你放弃在今晚${this.actionWord} `, 'yellow')
                    message.append(this.target.getNameMagicString())
                    this.game.addMessage(message)

                    this.target = undefined
                },

                generateButtons(player){
                    const userIndex = this.game.myIndex
                    const newUseButton = this.createUseButton(()=>{
                        this.use(player.index)
                    })
                    const newCancelButton = this.createCancelButton(()=>{this.cancel()})
                    const buttons = []
                    if(player === this.target)
                        buttons.push(newCancelButton)
                    else if(player.index === userIndex && this.game.myRole.affiliation.name === 'Town' && this.name === 'Attack'){
                    }
                    else if(abilityUseVerify(this.game, this.name, userIndex, player.index, this.target?.index))
                        buttons.push(newUseButton)
                    return buttons
                },

                actionNotice(game, data){
                    const message = new MagicString()
                    message.addText(`你前去${this.actionWord} `, this.color ?? game.myRole.color)
                    message.append(game.playerList[data.targetIndex].getNameMagicString())
                    game.addMessage(message)
                }
            },
            "Attack":{
                actionWord:"袭击",
                color:"red",
            },
            "Heal":{
                actionWord:"治疗",
                color:"limegreen",
            },            
            "RoleBlock":{
                actionWord:"限制"
            },
            "Detect":{
                actionWord:"调查"
            },
            "Silence":{
                actionWord:"恐吓"
            },
            "Track":{
                actionWord:"追踪"
            },
            "CloseProtection":{
                actionWord:"保护"
            }
        },

        enabledAbilities:{
            default:{
                use(targetIndex){
                    this.game.commandHandler(`useAbility ${this.name}`)
                },

                useSuccess(data){
                    const message = new MagicString()
                    message.addText(`你决定在今晚${this.actionWord}`, this.color ?? this.game.myRole.color)
                    this.game.addMessage(message)

                    this.enabled = true
                },

                cancelSuccess(){
                    const message = new MagicString()
                    message.addText(`你放弃在今晚${this.actionWord}`, 'yellow')
                    this.game.addMessage(message)

                    this.enabled = false
                },

                generateButtons(player){
                    const buttons = []
                    if(player.index === this.game.myIndex){
                        const newUseButton = this.createUseButton(()=>{this.use()})
                        const newCancelButton = this.createCancelButton(()=>{this.cancel()})
                        buttons.push((this.enabled ? newCancelButton : newUseButton))
                    }
                    return buttons
                },

                actionNotice(game, data){
                    const message = new MagicString()
                    message.addText(`你${this.actionWord}`, this.color ?? game.myRole.color)
                    message.addText("。")
                    game.addMessage(message)
                }

            },
            "BulletProof":{
                actionWord:"穿上防弹衣"
            }
        }
    },
    roles:[
        // Town
        {
            name:"Citizen",
            nameTranslate:"市民",
            descriptionTranslate:"一个相信真理和正义的普通人",
            abilityDescriptionTranslate:"市民默认没有任何特殊能力",
            otherDescriptionTranslate:"市民在这个游戏中默认为最为普遍的角色",
        },
        {
            name:"Sheriff",
            nameTranslate:"警长",
            descriptionTranslate:"一个执法机构的成员，迫于谋杀的威胁而身处隐匿。",
            abilityDescriptionTranslate:"这个角色有每晚侦查一人有无犯罪活动的能力。",
            abilityDetails:["每晚调查一人的阵营。"],
            featureDetails:["警长可以查出所有邪恶角色"]
        },
        {
            name:"Detective",
            nameTranslate:"侦探",
            descriptionTranslate:"一个熟练的追踪者，为城镇的利益而获取重要信息。",
            abilityDescriptionTranslate:"这个角色有每晚对一人的活动进行跟踪的能力",
            abilityDetails:["每晚对一人进行跟踪，获知他的目标是谁。"],
            featureDetails:["即便行动没有访问目标，侦探仍会收到有活动的提示。"]
        },
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
                "调查结果全团可知，但如果调查人被杀或被限制，则没有结果。"
            ]
        },
        {
            name:"Doctor",
            nameTranslate:"医生",
            descriptionTranslate:"一个熟练于医治外伤的秘密外科医生。",
            abilityDescriptionTranslate:"这个角色有每晚救治一人，使其免受一次死亡的能力。",
            abilityDetails:["每晚救治一人，使其免受一次死亡。"],
        },
        {
            name:"Escort",
            nameTranslate:"舞娘",
            descriptionTranslate:"一个衣着稀少的舞娘，秘密地工作。",
            abilityDescriptionTranslate:"这个角色可以每晚限制一人，中断他的夜间能力。",
            abilityDetails:["在夜晚限制一人，中断其夜间能力。"],
        },
        {
            name:"Vigilante",
            nameTranslate:"义警",
            descriptionTranslate:"一个污点警察，无视法律规定而制定公正。",
            abilityDescriptionTranslate:"这个角色有每晚杀死某人的能力。",
            abilityDetails:["在夜晚杀死一人。"],
        },
        {
            name:"Crier",
            nameTranslate:"公告员",
            descriptionTranslate:"一个高嗓的传报人，为帮助城镇而做事。",
            abilityDescriptionTranslate:"这个角色有在晚上保持匿名的同时，让所有玩家听到其所说内容的能力。",
            abilityDetails:["可以在夜间发送广播消息。"],
            featureDetails:["你在夜间所说的话会被所有玩家听到。",
                            "你在夜间匿名交谈。"]

        },
        {
            name:"Bodyguard",
            nameTranslate:"保镖",
            descriptionTranslate:"",
            abilityDescriptionTranslate:"",
            abilityDetails:["每晚保护一人，使其免受一次死亡。"],
            featureDetails:["如果你的目标受到攻击，你将会反击攻击者。（同时你也会被攻击）"]

        },
        // Mafia
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
        {
            name:"Godfather",
            nameTranslate:"教父",
            descriptionTranslate:"犯罪组织的领袖。",
            abilityDescriptionTranslate:"这个角色有在夜晚投票杀死一人的能力，能推翻其它黑手党成员的投票。",
            abilityDetails:["每晚命令黑手党去杀死某人。"],
            featureDetails:[
                "在晚上你可以与其他黑手党成员交谈",
            ]
        },
        
        {
            name:"Consort",
            nameTranslate:"陪侍",
            descriptionTranslate:"一个为犯罪组织工作的舞者。",
            abilityDescriptionTranslate:"这个角色可以每晚限制一人，中断他的夜间能力。",
            abilityDetails:["在夜晚限制一人，中断其夜间能力。"],
        },
        {
            name:"Blackmailer",
            nameTranslate:"恐吓者",
            descriptionTranslate:"一个恐吓者...",
            abilityDescriptionTranslate:"每晚使一个人沉默",
            abilityDetails:["被沉默的玩家无法在次日说话。",
                "被沉默的玩家在到要说遗言时可以说话。",
                "被沉默的玩家被审判时全体玩家会收到提示。"
            ],
        },
        // Neutral
        {
            name:"SerialKiller",
            nameTranslate:"连环杀手",
            color:"fuchsia",
            descriptionTranslate:"一个疯狂的罪犯，一个憎恨世界的人。",
            abilityDescriptionTranslate:"这个角色有每晚杀死一人的能力",
            otherDescriptionTranslate:"连环杀手在成为最后活着的人时胜利",
            goalDescriptionTranslate:"成为最后一个活着的人",
            abilityDetails:["每晚杀死一人。"],

        }
    ],
    randomRoles:[
        {
            name:"AllRandom",
            descriptionTranslate:"可能是游戏中的任意角色",
        },
    ],
    roleModifyDescriptions:{
        'hasEffect_ImmuneToRoleBlock':{
            description:"无法被限制",
            featureDescription:"你不会被舞娘、陪侍和交际花限制。",
        },
        'hasEffect_ImmuneToAttack':{
            description:"在夜间无敌",
            featureDescription:"你拥有夜间无敌。（注意，攻击你的人会知道你有无敌）",
        },
        'hasEffect_ImmuneToDetect':{
            description:"免疫调查",
            featureDescription:"你在调查角色眼里像是不活跃的市民。",
        },

        'IgnoreEffect_ImmuneToAttack':{
            description:"无视夜间无敌",
            featureDescription:"对夜间无敌角色，你的攻击依然生效。",
        },
        'IgnoreEffect_ImmuneToDetect':{
            description:"无视调查免疫",
            featureDescription:"对免疫调查的角色，你的调查依然生效。",
        },

        'hasAbility_BulletProof_UsesLimit_1_Times':{
            description:"有可用一晚的防弹背心",
            featureDescription:"你可穿上防弹背心一次，防弹背心视作夜间无敌。",
        },

        'hasAbilityUsesLimit_2_Times':{
            description:"技能只有 2 次使用机会",
            featureDescription:"你的技能只能使用 2 次。",
        },
        'hasAbilityUsesLimit_3_Times':{
            description:"技能只有 3 次使用机会",
            featureDescription:"你的技能只能使用 3 次。",
        },
        'hasAbilityUsesLimit_4_Times':{
            description:"技能只有 4 次使用机会",
            featureDescription:"你的技能只能使用 4 次。",
        },

        'hasAbilityForceDisableTurn_1_AtStart':{
            description:"开局首夜技能不可用",
            featureDescription:"开局首夜技能不可用",
        },

        'knowsIfTargetIsAttacked':{
            description:"目标受到攻击时可获知",
            featureDescription:"你会获知你的目标是否被攻击。",
        },
        'knowsIfTargetHasEffect_ImmuneToRoleBlock':{
            description:"察觉目标是否免疫限制",
            featureDescription:"你会获知你的目标是否免疫限制。",
        },

        'consecutiveAbilityUses_2_Cause_1_NightCooldown':{
            description:"连续使用技能2次将产生1晚间隔",
            featureDescription:"连续使用技能2次将产生1晚间隔。",
        },

        'canNotBeHeal':{
            description:"无法被医治",
            featureDescription:"你无法被医治。",
        },

        'canBeTurnedIntoTeamExecutor':{
            description:"团队无可执行角色时转变为可执行角色（党徒）",
            featureDescription:"团队无可执行角色时转变为可执行角色（党徒）",
        },
        'canBeTeamActionExecutor':{
            description:"可作为团队执行角色行动",
            featureDescription:"可作为团队执行角色行动",
        },

        'fightBackAgainstRoleBlocker':{
            description:"反杀限制者",
            featureDescription:"如果有人试图限制你，你会转而攻击他。",
        }
    }

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

// 注意，尽管前端与后端采用了相同名称的数据结构，但是它们的作用完全不同，所以，不要搞混了！

class Faction{
    constructor(data){
        this.data = data
        this.includeRoleNames = []
        if(this.data.roleVariationList !== undefined)
            this.includeRoleNames = this.data.roleVariationList.map(rv => rv.name)

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

    addExtraRoleName(roleSet){
        for(const role of roleSet){
            if(role.defaultAffiliationName === this.name && this.includeRoleNames.includes(role.name) === false){
                this.includeRoleNames.push(role.name)
            }
        }
    }
}

class Tag{
    constructor(data){
        this.data = data

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

class Ability{
    constructor(game, abilityName){
        this.game = game
        this.name = abilityName
        for(const abilityTypeName in frontendData.abilities){
            this.data = frontendData.abilities[abilityTypeName][abilityName]
            if(this.data !== undefined){
                this.data = {...this.data, ...frontendData.abilities[abilityTypeName].default}
                break
            }
        }

        if(this.data === undefined) console.error(`Unknow Ability: ${abilityName}`);

        return new Proxy(this, {
            get(target, prop, receiver) {
                return prop in target.data  === false ? target[prop] : 
                    typeof target.data[prop] === 'function' ? target.data[prop].bind(receiver) : target.data[prop]
            }
        })
    }

    createUseButton(clickFunction){
        return {
            style:`padding: 0.1em 1.5em;background-color:${this.game.myRole?.color};`,
            click:clickFunction,
        }
    }

    createCancelButton(clickFunction){
        return {
            style:'padding: 0.1em 1.5em;background-color: LightGrey;',
            click:clickFunction,
        }
    }

    static generateActionNotice(game, relatedAbilityName, data){
        for(const abilityTypeName in frontendData.abilities){
            var ability = frontendData.abilities[abilityTypeName][relatedAbilityName]
            if(ability !== undefined){
                ability = {...ability, ...frontendData.abilities[abilityTypeName].default}
                break
            }
        }

        if(ability === undefined) console.error(`Unknow Ability: ${abilityName}`);

        ability.actionNotice(game, data)
    }

    cancel(){
        this.game.commandHandler(`useAbilityCancel ${this.name}`)
    }
}

class Role{
    constructor(data, tagSet, factionSet, gameSetting){
        this.data = data

        this.defaultAffiliation = factionSet.find(f => f.name === this.data.defaultAffiliationName)
        this.affiliation = this.defaultAffiliation
        this.gameSetting = gameSetting
        this.tagsTranslate = this.data.tags?.map(tName =>{
            return tagSet.find(t => t.name === tName).nameTranslate
        }) ?? []

        if(this.data.abilityDetails === undefined)
            this.abilityDetails = []
        if(this.data.featureDetails === undefined)
            this.featureDetails = []

        return new Proxy(this, {
            get(target, prop) {
                return prop in target ? target[prop] : target.data[prop]
            }
        })
    }

    get color(){
        return this.data.color ?? this.defaultAffiliation?.color
    }

    getNameMagicString(){
        const name = this.data.nameTranslate ?? this.name
        return new MagicString({text:name, style:`color:${this.color};`})
    }

    getModifyOptions(){
        const roleName = this.name.charAt(0).toLowerCase() + this.name.slice(1)
        const modifyObject = this.gameSetting.roleModifyOptions[roleName]

        if(modifyObject !== undefined)
            return Object.keys(modifyObject).map(keyName => {
                const description = frontendData.roleModifyDescriptions[keyName].description
                return {description, roleName, keyName}
            })
        else
            return []
    }
}

class RandomRole{
    constructor({factionTag, nonFactionTag, randomFaction, game}){
        this.factionTag = factionTag
        this.nonFactionTag = nonFactionTag ?? undefined
        this.randomFaction = randomFaction
        this.affiliationName = randomFaction.name
        this.affiliation = randomFaction
        this.game = game

        // 为随机角色添加角色数据里的数据...如果有的话
        const thisRandomRoleData = frontendData.randomRoles.find(r => r.name === this.name)
        for(const key in thisRandomRoleData){
            if(key in this === false){
                this[key] = thisRandomRoleData[key]
            }
        }

        if('descriptionTranslate' in this === false)
            this.descriptionTranslate = `可能是任意一个 ${this.factionTag.nameTranslate} ${this.nonFactionTag?.nameTranslate ?? ''} 角色`
        this.generateModifyOptions()
    }

    get name(){
        return this.factionTag.name + (this.nonFactionTag?.name ?? '') + this.randomFaction.name
    }

    get nameTranslate(){
        return this.factionTag.nameTranslate + (this.nonFactionTag?.nameTranslate ?? '') + this.randomFaction.nameTranslate
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
        ms.append(new MagicString({text:(this.nonFactionTag? this.nonFactionTag.nameTranslate : this.randomFaction.nameTranslate), style:`color:${this.randomFaction.color};`}))
        return ms
    }

    generateRandomObject(){
        const includeRoles = this.includeRoleNames.map(rName => this.game.roleSet.find(r => r.name === rName)).filter(r => r !== undefined)

        return {
            name:this.name,
            possibleRoleSet:includeRoles.map(r => {
                return {name:r.name, weight:r.weight ?? 1}
            })
        }
    }

    generateModifyOptions(){
        const roleNameLowerCase = this.name.charAt(0).toLowerCase() + this.name.slice(1)

        if(this.modifyDescriptionTranslate === undefined){
            this.modifyDescriptionTranslate = {}
        }

        if(this.name === 'AllRandom'){
            let modifyObject = {
                excludeTagKilling:false,
            }
            this.game.settingWatchIgnore = true
            this.game.setting.roleModifyOptions[roleNameLowerCase] = modifyObject
            this.modifyDescriptionTranslate={
                excludeTagKilling:"不包含 致命角色"
            }
        }
        else{
            // 如果是随机阵营
            if(this.nonFactionTag === undefined){
                const nonFactionTags = this.game.tagSet.filter(t => (t.isFaction !== true && t.name !=='Random'))
                let modifyObject = {}
                
                for(const nonFactionTag of nonFactionTags){
                    // 这玩意我怎么写了两遍啊...应该可以接受吧...
                    // 先看一下nonFactionTag.includeRoleNames和factionTag.includeRoleNames有没有交集
                    const roleNameIntersection = getIntersection(this.factionTag.includeRoleNames, nonFactionTag.includeRoleNames)
                    if(roleNameIntersection.length > 0){
                        // 如果有交集，再看一下交集是否和factionTag.includeRoleNames完全一致
                        if(arraysEqual(this.factionTag.includeRoleNames, roleNameIntersection) === false){
                            modifyObject[`excludeTag${nonFactionTag.name}`] = false
                            this.modifyDescriptionTranslate[`excludeTag${nonFactionTag.name}`] = `不包含 ${nonFactionTag.nameTranslate}角色`
                        }
                    }

                    if(this.factionTag.name === 'Town' && nonFactionTag.name === 'Team'){
                        modifyObject[`excludeTag${nonFactionTag.name}`] = true
                    }
                }
                this.game.settingWatchIgnore = true
                this.game.setting.roleModifyOptions[roleNameLowerCase] = modifyObject
            }
        }
    }

    getModifyOptions(){
        const roleName = this.name.charAt(0).toLowerCase() + this.name.slice(1)
        const modifyObject = this.game.setting.roleModifyOptions[roleName]

        if(modifyObject !== undefined)
            return Object.keys(modifyObject).map(keyName => {
                const description = this.modifyDescriptionTranslate[keyName]
                return {description, roleName, keyName}
            })
        else
            return []
    }
}

function getIntersection(arr1, arr2) {
    const set2 = new Set(arr2)
    return arr1.filter(item => set2.has(item))
}

function getComplement(arr1, arr2) {
    const set2 = new Set(arr2)
    return arr1.filter(item => !set2.has(item))
}

function disableElements(containerId) {
    const container = document.getElementById(containerId)
    const formElements = container.querySelectorAll('input, select, textarea, button')

    formElements.forEach(element => {element.disabled = true})
    container.disabled = true
}

function enableElements(containerId){
    const container = document.getElementById(containerId)
    const formElements = container.querySelectorAll('input, select, textarea, button')

    formElements.forEach(element => {element.disabled = false})
    container.disabled = false
}