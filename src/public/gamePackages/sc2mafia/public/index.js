let socket = undefined

document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        loading:true,
        watchIgnore:false,
        setting:{},

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
                    
                    roleSet: [
                        "Citizen", "Citizen", "Citizen", "Citizen", "Citizen",
                        "Citizen", "Citizen",
                        "Sheriff", "Sheriff", "Sheriff", "Sheriff",
                        "Mafioso", "Mafioso", "Mafioso", "Mafioso"
                    ],
                }
            }
        ],

        selectedPreset:undefined,

        async init() {
            // 这个注释掉的写法有一个bug，“游戏开始于”这个选项无法正确索引，姑且就先从服务器请求默认设置项吧。
            // this.setting = cloneDeep(this.presets[0].setting)
            this.setting = await (await fetch("./gameData/defaultSetting.json")).json()
            this.socketInit()
            this.loading = false

            this.$watch('setting', (value, oldValue)=>{
                if(this.watchIgnore === false){
                    const event = {type:"HostChangesGameSetting",data:value}
                    socket?.send(JSON.stringify(event))
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
        },
        selectPreset(preset){
            this.selectedPreset = preset
        },
        useSelectedPreset(){
            if(this.selectedPreset??false)
                this.setting = cloneDeep(this.selectedPreset.setting)
        },
        importSelectedPreset(){
            let importJsonString = prompt("请输入导出字符串: ")
            try{
                importJsonString ? this.setting = JSON.parse(window.atob(importJsonString)) : alert("导入错误，请重试。")
            }catch(e){
                alert("导入错误，请重试。")
            }
        },
        exportSelectedPreset(){
            let s = JSON.stringify(this.setting);
            let exportString = window.btoa(s)
            alert("导出结果为: \n\n" + exportString);
        }
    }))

    function cloneDeep(o){
        return JSON.parse(JSON.stringify(o))
    }

    function onMessage(e){
        const event = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent(event.type, { detail:event.data }))
    }
})