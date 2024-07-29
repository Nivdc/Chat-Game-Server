const gameDataPath = import.meta.dir+'/'

if(require.main)
    await generateGameData()

export async function generateGameData(){
    let roleSet = await generateRoleSet()
    await Bun.write(gameDataPath+"roleData.json", JSON.stringify(roleSet, null, 4));

    async function readJsonFile(path){
        return await Bun.file(path).json()
    }

    async function generateRoleSet(){
        let originalRoleData = await readJsonFile(gameDataPath+"originalRoleData.json")
        let roleSet = []
        let roleData = originalRoleData.roles
        let categoriesData = originalRoleData.categories
        let majorFactions  = categoriesData.map(c => c.isFaction? c.name:undefined).filter(c => c !== undefined)

        for(let r of roleData){
            r.categories = categoriesData.map(c => c.includeRoles.includes(r.name)? c.name:undefined).filter(c => c !== undefined)

            // set affiliation
            // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
            r.affiliation = r.categories.find(cName => categoriesData.find(c => c.name === cName).isFaction) ?? "Neutral"
            if(r.affiliation === "Neutral")
                r.categories.unshift("Neutral")

            roleSet.push(r)
        }

        return roleSet
    }
}