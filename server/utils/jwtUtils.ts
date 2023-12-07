import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongoose'
import { jwtErrors } from './errorMessages/jwt'

const JWT_SECRET: string = process.env.JWT_SECRET ?? ''
const JWT_EXPIRATION_TIME: string = process.env.JWT_EXPIRATION_TIME ?? ''

enum PlanType {
    FREE = 'FREE',
    PREMIUM = 'PREMIUM',
    PRO = 'PRO',
}

enum UserRole {
    USER = 'USER',
    ADMIN = 'ADMIN',
}

interface IUser {
    [key: string]: any
    _id?: ObjectId
    firstName: string
    lastName: string
    username: string
    password: string
    email: string
    plan: PlanType
    role: UserRole
}

interface IPayload {
    payload: IUser
    iat: number
    exp: number
}

if (JWT_SECRET === '') {
    console.error('JWT_SECRET environment variable not set!')
    process.exit(1)
}

function generateToken(payload: object, res: Response) {
    let token = jwt.sign({ payload }, JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: JWT_EXPIRATION_TIME,
    })

    if (token === '') {
        res.status(500).json({ error: jwtErrors.generatingTokenError })
    } else {
        return token
    }
}

function verifyToken(
    req: Request,
    res: Response,
    isAllowedUrl: boolean = false
): IPayload | undefined {
    let bearerHeader = req.headers['authorization']

    if (typeof bearerHeader === 'undefined') {
        if (!isAllowedUrl) {
            res.status(401).json({ error: jwtErrors.tokenNeededError })
        }
        return undefined
    } else {
        let bearer: string[] = bearerHeader.split(' ')
        let bearerToken: string = bearer[1]
        let token: string = bearerToken

        try {
            let payload: IPayload = jwt.verify(token, JWT_SECRET, {
                algorithms: ['HS256'],
            }) as IPayload

            return payload
        } catch (err) {
            if (err instanceof jwt.TokenExpiredError) {
                res.status(401).json({ error: jwtErrors.tokenExpiredError })
            } else if (err instanceof jwt.JsonWebTokenError) {
                res.status(401).json({ error: jwtErrors.invalidTokenError })
            } else {
                res.status(500).json({ error: jwtErrors.verifyTokenError })
            }
            return undefined
        }
    }
}

function getPayloadFromToken(req: Request): IUser {
    let bearerHeader = req.headers['authorization'] as string

    let bearer: string[] = bearerHeader.split(' ')
    let bearerToken: string = bearer[1]
    let token: string = bearerToken

    let payload: IPayload = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
    }) as IPayload

    return payload.payload
}

export { IUser, generateToken, verifyToken, getPayloadFromToken }
