import { IUser, getPayloadFromToken } from "../jwtUtils"
import { Request, Response, NextFunction } from 'express';

const ERROR_LOGIN = 'Unauthenticated: You are not logged in'

//Function middleware to check if user is logged in
function authUser(req: Request, res: Response, next: NextFunction) {
    let decodedToken: IUser = getPayloadFromToken(req)
    const username: string = decodedToken.username

    if (!username) {
        return res
            .status(401)
            .json({ error: ERROR_LOGIN })
    }

    next()
}

export { authUser }