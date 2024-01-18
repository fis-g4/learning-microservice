import { Request } from 'express'
import { ObjectId } from 'mongoose'
import { GoogleAuth } from 'google-auth-library'

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

const authCredentials = new GoogleAuth({
    keyFilename: '../GoogleCloudKey.json',
})

function getTokenFromRequest(req: Request): string | undefined {
    let bearerHeader = req.headers['authorization'] as string
    let bearer: string[] = bearerHeader.split(' ')
    let bearerToken: string = bearer[1]

    return bearerToken
}

function generateToken(user: IUser) {
    return new Promise((resolve, reject) => {
        authCredentials
            .getIdTokenClient(process.env.GCF_GENERATE_TOKEN_ENDPOINT ?? '')
            .then((client) => {
                client
                    .request({
                        method: 'POST',
                        url: process.env.GCF_GENERATE_TOKEN_ENDPOINT ?? '',
                        data: {
                            payload: {
                                firstName: user.firstName,
                                lastName: user.lastName,
                                username: user.username,
                                email: user.email,
                                profilePicture: user.profilePicture,
                                coinsAmount: user.coinsAmount,
                                role: user.role,
                                plan: user.plan,
                            },
                        },
                    })
                    .then((response) => {
                        let data: any = response.data
                        let token = data.data

                        resolve(token)
                    })
                    .catch((err) => {
                        reject(err)
                    })
            })
    })
}

function verifyToken(url: string, token: string): Promise<IUser> {
    return new Promise((resolve, reject) => {
        authCredentials
            .getIdTokenClient(process.env.GCF_VERIFY_TOKEN_ENDPOINT ?? '')
            .then((client) => {
                client
                    .request({
                        method: 'POST',
                        url: process.env.GCF_VERIFY_TOKEN_ENDPOINT ?? '',
                        data: {
                            url: url,
                            token: token,
                        },
                    })
                    .then((response) => {
                        let data: any = response.data
                        let payload = data.data

                        resolve(payload)
                    })
                    .catch((err) => {
                        let statusCode = err.response.status
                        let message = err.response.data.error

                        reject({ statusCode, message })
                    })
            })
    })
}

function getPayloadFromToken(token: string): Promise<IUser> {
    return new Promise((resolve, reject) => {
        authCredentials
            .getIdTokenClient(
                process.env.GCF_GET_PAYLOAD_FROM_TOKEN_ENDPOINT ?? ''
            )
            .then((client) => {
                client
                    .request({
                        method: 'POST',
                        url:
                            process.env.GCF_GET_PAYLOAD_FROM_TOKEN_ENDPOINT ??
                            '',
                        data: {
                            token: token,
                        },
                    })
                    .then((response) => {
                        let data: any = response.data
                        let payload = data.data

                        resolve(payload)
                    })
                    .catch((err) => {
                        reject(err)
                    })
            })
    })
}

export {
    IUser,
    IPayload,
    generateToken,
    verifyToken,
    getPayloadFromToken,
    getTokenFromRequest,
}
