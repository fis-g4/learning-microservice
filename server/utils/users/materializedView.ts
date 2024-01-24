import { MaterializedUser } from '../../db/models/materializedUsers'

async function getUsersToRequest(usernames: string[]): Promise<string[]> {
    const usernamesStored = await MaterializedUser.find({
        username: { $in: usernames },
    }).then((users) => {
        return users.map((user) => user.toJSON())
    })

    const currentDate = new Date()
    const yesterdayDate = new Date(currentDate)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)

    const usernamesStoredFiltered = usernamesStored.filter(
        (user) => user.insertDate > yesterdayDate
    )

    return usernames.filter(
        (username) =>
            !usernamesStoredFiltered.some((user) => user.username === username)
    )
}

export { getUsersToRequest }
