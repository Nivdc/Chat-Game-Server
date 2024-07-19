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
            this.loading = false

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

            window.addEventListener('HostChangesGameSetting', (e) => {
                this.watchIgnore = true
                this.setting = e.detail
            })
            window.addEventListener('SetHost', (e) => {
                this.host = e.detail
            })
            window.addEventListener('SetPlayerList', (e) => {
                this.playerList = e.detail
            })
            window.addEventListener('ChatMessage', (e) => {
                this.messageList.push(e.detail)
                this.messageLog.push(e.detail)
                console.log(this.messageList);
            })
            window.addEventListener('HostSetupGame', (e) => {
                this.addMessageStringWithoutLog("游戏将在15秒后开始")
                this.startButtonToggle = false
            })
            window.addEventListener('HostCancelSetup', (e) => {
                this.addMessageStringWithoutLog("主机取消了开始")
                this.startButtonToggle = true
            })
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
                    enableCustomName: true,
                    enableKillMessage: true,
                    enableLastWord: true,
                    enablePrivateMessage: true,
                    
                    roleList: [
                        "Citizen", "Citizen", "Citizen", "Citizen", "Citizen",
                        "Citizen", "Citizen",
                        "Sheriff", "Sheriff", "Sheriff", "Sheriff",
                        "Mafioso", "Mafioso", "Mafioso", "Mafioso"
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
        addMessageStringWithoutLog(string){
            this.messageList.push({message:string})
        },

        playerList:[],
        //todo，别忘了还有接收函数
        submit(){
            if(/^\s*$/.test(this.inputString) === false){
                if(/^-/.test(this.inputString) === false){
                    sendEvent("ChatMessage", this.inputString)
                }
                else{
                    let str = this.inputString.substring(1);
                    [command, ...args] = str.split(" ")

                    switch(command){
                        case 'repick':
                            this.repickHost(args.shift())
                        break

                        default:
                            // sendEvent("rename", args.shift())
                    }
                }
            }
            this.inputString = ''
        },
        clearMssagesList(){
            this.messageList = []
        },

        //todo
        host:{},
        repickHost(playerIndex){
            sendEvent("RepickHost", playerIndex)
        },

        //角色目录与列表

        //开始信息及按钮
        startInfo:"",
        startButtonToggle:true,
        start(){
            if(this.startButtonToggle === true){
                sendEvent("HostSetupGame", this.setting)
            }else{
                sendEvent("HostCancelSetup")
            }
        }

    }))

    function cloneDeep(o){
        return JSON.parse(JSON.stringify(o))
    }

    function onMessage(e){
        const event = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent(event.type, { detail:event.data }))
        console.log(e)
    }

    function sendEvent(type, data){
        const event = {type,data}
        console.log(event)
        socket?.send(JSON.stringify(event))
    }
})