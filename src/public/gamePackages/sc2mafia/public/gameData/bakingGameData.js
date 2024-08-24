const gameDataPath = import.meta.dir+'/'

if(require.main)
    await generateGameData()

export async function generateGameData(){
    let roleSet = await generateRoleSet()
    await Bun.write(gameDataPath+"gameData.json", JSON.stringify(roleSet, null, 4));

    async function readJsonFile(path){
        return await Bun.file(path).json()
    }

    async function generateRoleSet(){
        let originalGameData = await readJsonFile(gameDataPath+"originalGameData.json")
        let roleSet = []
        let roleData = originalGameData.roles
        let tagsData = originalGameData.tags
        let majorFactions  = tagsData.map(t => t.isFaction? t.name:undefined).filter(t => t !== undefined)

        for(let r of roleData){
            r.tags = tagsData.map(t => t.includeRoles.includes(r.name)? t.name:undefined).filter(t => t !== undefined)

            // set affiliation
            // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
            r.affiliation = r.tags.find(tName => tagsData.find(t => t.name === tName).isFaction) ?? "Neutral"
            if(r.affiliation === "Neutral")
                r.tags.unshift("Neutral")

            roleSet.push(r)
        }

        return roleSet
    }
}