import { IUser, getPayloadFromToken, getTokenFromRequest } from '../jwtUtils'
import { Request, Response, NextFunction } from 'express'

const ERROR_LOGIN = 'Unauthenticated: You are not logged in'

//Function middleware to check if user is logged in
async function authUser(req: Request, res: Response, next: NextFunction) {
    let decodedToken: IUser = await getPayloadFromToken(
        getTokenFromRequest(req) ?? ''
    )
    const username: string = decodedToken.username

    if (!username) {
        return res.status(401).json({ error: ERROR_LOGIN })
    }

    next()
}

export { authUser }
