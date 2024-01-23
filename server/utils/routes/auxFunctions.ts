import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { IUser, getPayloadFromToken, getTokenFromRequest } from '../jwtUtils'

const ERROR_SERVER = 'Internal Server Error'

const isValidObjectId = (id: string, res: Response): boolean => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid ID format' })
        return false
    }
    return true
}

const handleUnauthorizedError = (res: Response, message: string) => {
    return res.status(403).json({ error: message })
}

const handleError = (res: Response, error: any) => {
    console.error(error)
    return res.status(500).json({ error: ERROR_SERVER })
}

const getDecodedUser = async (req: Request, res: Response): Promise<IUser> => {
    const token = getTokenFromRequest(req) ?? ''

    return await getPayloadFromToken(token)
}

export { isValidObjectId, handleUnauthorizedError, handleError, getDecodedUser }
