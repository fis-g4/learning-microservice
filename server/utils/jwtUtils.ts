import { Request } from 'express'
import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongoose'

const JWT_SECRET: string = process.env.JWT_SECRET ?? ''

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

export { IUser, getPayloadFromToken }
